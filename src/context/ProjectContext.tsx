import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import type {
  Detection, EnrichedDetection, VideoExposure, ProjectExposure,
  FinalisedExposure, SportsEventConfig, SportsEvent, SportsEventId,
  QAState, QARowState, GlobalSettings, StoredCSV, ResolvedMedia,
  Client, Project, Competition, Media, VideoMedia, MediaType,
  SportDiscipline, SportsEventTimeslice, SportInterestEntry,
} from '../types'
import { makeDefaultSportDisciplines } from '../config/sportDisciplines'
import { makeDefaultSportInterestEntries, getDefaultInterestIdForDiscipline } from '../config/sportCountryInterest'
import {
  enrichDetections, computeVideoExposures, computeProjectExposures,
  computeFinalisedExposures, defaultGlobalSettings,
} from '../lib/pipeline'
import type { PipelineInput } from '../lib/pipeline'
import { resolveMediaList, collectTimeslices } from '../lib/videos'
import { parseCSV, countFrames, maxDuration, distinctVideoIds, distinctTags } from '../lib/parseCSV'
import {
  loadAppState, saveAppState,
  makeSportsEventId, makeProjectId, makeCompetitionId, makeMediaId, makeCSVId,
  saveCSVContent, loadCSVContent, deleteCSVContent,
} from '../lib/storage'
import type { PersistedAppState } from '../lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParseMeta {
  rowCount: number
  skippedRows: number
  warnings: string[]
}

export interface SessionState {
  rawDetections: Detection[]
  parseMeta: ParseMeta | null
  enriched: EnrichedDetection[]
  videoExposures: VideoExposure[]
  projectExposures: ProjectExposure[]
  finalised: FinalisedExposure[]
  stale: boolean
}

interface AppState {
  clients: Client[]
  projects: Project[]
  competitions: Competition[]
  sports_events: SportsEvent[]
  media: Media[]
  csv_library: StoredCSV[]
  activeSportsEventId: SportsEventId | null
  globalSettings: GlobalSettings
  sport_disciplines: SportDiscipline[]
  sport_interest_entries: SportInterestEntry[]
  sessions: Record<SportsEventId, SessionState>
}

interface ProjectContextValue {
  // Registry
  sportsEvents: SportsEvent[]
  csv_library: StoredCSV[]
  activeSportsEventId: SportsEventId | null
  activeSportsEvent: SportsEvent | null
  activeSession: SessionState | null

  // Shortcut accessors
  config: SportsEventConfig
  draftConfig: SportsEventConfig
  enriched: EnrichedDetection[]
  videoExposures: VideoExposure[]
  projectExposures: ProjectExposure[]
  finalised: FinalisedExposure[]
  parseMeta: ParseMeta | null
  globalSettings: GlobalSettings

  // Reference lists
  clients: Client[]
  projects: Project[]
  competitions: Competition[]
  media: Media[]
  sportDisciplines: SportDiscipline[]
  sportInterestEntries: SportInterestEntry[]

  // Client CRUD
  addClient: (name: string) => void
  renameClient: (id: string, name: string) => void
  deleteClient: (id: string) => void

  // Project CRUD
  createProject: (name: string, clientId: string) => Project
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'client_id' | 'description'>>) => void
  deleteProject: (id: string) => void

  // Competition CRUD
  createCompetition: (name: string, projectId: string) => Competition
  updateCompetition: (id: string, patch: Partial<Omit<Competition, 'id' | 'project_id'>>) => void
  deleteCompetition: (id: string) => void

  // Sport Type / Discipline taxonomy CRUD
  addSportDiscipline: (sport_type: string, discipline: string, interest_id?: string | null) => void
  updateSportDiscipline: (id: string, patch: Partial<Pick<SportDiscipline, 'sport_type' | 'discipline' | 'interest_id'>>) => void
  deleteSportDiscipline: (id: string) => void

  // Sport interest entries CRUD
  setSportInterestEntries: (entries: SportInterestEntry[]) => void

  // SportsEvent CRUD (was Project CRUD)
  createSportsEvent: (name: string, competitionId: string) => SportsEvent
  renameSportsEvent: (id: SportsEventId, name: string) => void
  updateSportsEventMeta: (id: SportsEventId, patch: Partial<Pick<SportsEvent, 'competition_id' | 'sport_type' | 'discipline' | 'country' | 'city' | 'scheduled_start' | 'scheduled_end' | 'timezone'>>) => void
  deleteSportsEvent: (id: SportsEventId) => void
  setActiveSportsEvent: (id: SportsEventId) => void

  // Media CRUD (owned by SportsEvent)
  addMedia: (sportsEventId: SportsEventId, label: string, type?: MediaType) => string
  updateMedia: (id: string, patch: Partial<Pick<Media, 'label' | 'is_excluded' | 'csv_file_id'>>) => void
  updateVideoTimeslices: (id: string, timeslices: SportsEventTimeslice[]) => void
  deleteMedia: (id: string) => void

  // Active-event actions
  // Read-only pipeline result for any event (used by the project overview).
  // Uses the live session when fresh, otherwise computes on demand from stored CSVs.
  getEventFinalised: (id: SportsEventId) => FinalisedExposure[]

  setDraftConfig: (cfg: SportsEventConfig) => void
  saveConfig: () => void
  setDraftProjectSettings: (s: GlobalSettings) => void
  draftSettings: GlobalSettings
  updateProjectExposure: (exposureId: string, patch: Partial<QARowState>) => void
  rerunPipeline: () => void
  setGlobalSettings: (s: GlobalSettings) => void

  // CSV file management
  uploadCSVFile: (filename: string, content: string) => string
  deleteCSVFile: (csvId: string) => void

  // Frame images (in-memory, per session)
  sessionFrames: Record<string, Record<number, File>>
  setVideoFrames: (mediaId: string, frames: Record<number, File>) => void
  clearVideoFrames: (mediaId: string) => void
  getFrame: (mediaId: string, frameNumber: number) => File | undefined
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const defaultSportsEventConfig: SportsEventConfig = {
  media_ids: [],
  excluded_media_ids: [],
  tag_cleaning_rules: [],
}

const emptySession = (): SessionState => ({
  rawDetections: [], parseMeta: null, enriched: [],
  videoExposures: [], projectExposures: [], finalised: [], stale: false,
})

const emptyQAState = (): QAState => ({ rows: {} })

function makeSportsEvent(
  name: string, competitionId: string, settings: GlobalSettings,
  country = '', city = '',
): SportsEvent {
  const cfg: SportsEventConfig = { ...defaultSportsEventConfig }
  return {
    id: makeSportsEventId(),
    competition_id: competitionId,
    name,
    sport_type: '',
    discipline: '',
    country,
    city,
    scheduled_start: null,
    scheduled_end: null,
    timezone: null, // null = inherit the competition's venue zone (effectiveTimezone)
    config: cfg,
    draft_config: cfg,
    settings,
    draft_settings: settings,
    qa_state: emptyQAState(),
    created_at: Date.now(),
    updated_at: Date.now(),
  }
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function combineMediaDetections(resolved: ResolvedMedia[]): { detections: Detection[]; meta: ParseMeta } {
  const allDetections: Detection[] = []
  const allWarnings: string[] = []
  let totalRows = 0
  let totalSkipped = 0

  for (const m of resolved) {
    if (!m.csv_file_id) continue
    const content = loadCSVContent(m.csv_file_id)
    if (!content) {
      allWarnings.push(`"${m.video_id || 'media'}": CSV content not found in storage.`)
      continue
    }
    try {
      const { detections, skippedRows, warnings } = parseCSV(content)
      for (const d of detections) allDetections.push({ ...d, video_id: m.video_id, media_id: m.id })
      allWarnings.push(...warnings)
      totalRows += detections.length + skippedRows
      totalSkipped += skippedRows
    } catch (e) {
      allWarnings.push(`Parse error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  return {
    detections: allDetections,
    meta: { rowCount: totalRows, skippedRows: totalSkipped, warnings: allWarnings },
  }
}

// ─── Pipeline helpers ─────────────────────────────────────────────────────────

function getCompetition(se: SportsEvent, competitions: Competition[]): Competition {
  return competitions.find(c => c.id === se.competition_id)
    ?? { id: '', project_id: '', name: '', date_start: '', date_end: null, country: '', city: '', timezone: null }
}

function resolvePipelineInput(
  cfg: SportsEventConfig,
  se: SportsEvent,
  competition: Competition,
  mediaLib: Media[],
): PipelineInput {
  const resolved = resolveMediaList(cfg.media_ids, cfg.excluded_media_ids, mediaLib, se, competition)
  const timeslices = collectTimeslices(resolved)
  return { videos: resolved, timeslices, tag_cleaning_rules: cfg.tag_cleaning_rules }
}

function runPipeline(
  detections: Detection[],
  input: PipelineInput,
  settings: GlobalSettings,
  qaState: QAState,
): Pick<SessionState, 'enriched' | 'videoExposures' | 'projectExposures' | 'finalised'> {
  const enriched = enrichDetections(detections, input, settings)
  const videoExposures = computeVideoExposures(enriched, input.videos)
  const rawProjectExposures = computeProjectExposures(videoExposures, settings.sif_multiplier)
  const projectExposures = mergeQAState(rawProjectExposures, qaState)
  const finalised = computeFinalisedExposures(projectExposures, input.videos)
  return { enriched, videoExposures, projectExposures, finalised }
}

function mergeQAState(exposures: ProjectExposure[], qa: QAState): ProjectExposure[] {
  return exposures.map(pe => {
    const saved = qa.rows[pe.qa_key] ?? qa.rows[pe.exposure_identifier]
    if (!saved) return pe
    return {
      ...pe,
      is_audited_out: saved.is_audited_out,
      audit_flag_note: saved.audit_flag_note,
      eph_proposed: saved.eph_proposed ?? pe.eph_current,
      differential: saved.differential,
      override_note: saved.override_note,
    }
  })
}

function pruneQAState(qa: QAState, exposures: ProjectExposure[]): QAState {
  const rows: Record<string, QARowState> = {}
  for (const pe of exposures) {
    const saved = qa.rows[pe.qa_key] ?? qa.rows[pe.exposure_identifier]
    if (saved) rows[pe.qa_key] = saved
  }
  return { rows }
}

// ─── Initial state ─────────────────────────────────────────────────────────────

function seedDisciplinesWithInterest() {
  const interestEntries = makeDefaultSportInterestEntries()
  const labelToId = new Map(interestEntries.map(e => [e.label, e.id]))
  const disciplines = makeDefaultSportDisciplines().map(d => ({
    ...d,
    interest_id: getDefaultInterestIdForDiscipline(d.sport_type, d.discipline, labelToId),
  }))
  return { interestEntries, disciplines }
}

// Fix entries seeded before the Winter sports CSV-quoting bug was corrected.
// The broken parser truncated the label to "Winter sports (e.g. skiing" and
// shifted all 53 country scores by one position. Patch in-place so any other
// user-edited entries are left untouched.
const BROKEN_WINTER_LABEL = 'Winter sports (e.g. skiing'
function repairInterestEntries(entries: SportInterestEntry[]): SportInterestEntry[] {
  if (!entries.some(e => e.label === BROKEN_WINTER_LABEL)) return entries
  const correctLabel = 'Winter sports (e.g. skiing, ice skating)'
  const freshScores = makeDefaultSportInterestEntries().find(e => e.label === correctLabel)?.scores ?? {}
  return entries.map(e =>
    e.label === BROKEN_WINTER_LABEL ? { ...e, label: correctLabel, scores: freshScores } : e
  )
}

function buildInitialState(): AppState {
  const persisted = loadAppState()
  if (persisted) {
    const seed = persisted.sport_disciplines == null || persisted.sport_interest_entries == null
      ? seedDisciplinesWithInterest()
      : null
    return {
      clients: persisted.clients ?? [],
      projects: persisted.projects ?? [],
      competitions: persisted.competitions ?? [],
      sports_events: persisted.sports_events ?? [],
      media: persisted.media ?? [],
      csv_library: persisted.csv_library ?? [],
      activeSportsEventId: persisted.activeSportsEventId ?? null,
      globalSettings: persisted.globalSettings,
      sport_disciplines: persisted.sport_disciplines ?? seed!.disciplines,
      sport_interest_entries: repairInterestEntries(persisted.sport_interest_entries ?? seed!.interestEntries),
      sessions: {},
    }
  }
  const seed = seedDisciplinesWithInterest()
  return {
    clients: [],
    projects: [],
    competitions: [],
    sports_events: [],
    media: [],
    csv_library: [],
    activeSportsEventId: null,
    globalSettings: defaultGlobalSettings,
    sport_disciplines: seed.disciplines,
    sport_interest_entries: seed.interestEntries,
    sessions: {},
  }
}

function persist(state: AppState) {
  const p: PersistedAppState = {
    version: 4,
    clients: state.clients,
    projects: state.projects,
    competitions: state.competitions,
    sports_events: state.sports_events,
    media: state.media,
    csv_library: state.csv_library,
    activeSportsEventId: state.activeSportsEventId,
    globalSettings: state.globalSettings,
    sport_disciplines: state.sport_disciplines,
    sport_interest_entries: state.sport_interest_entries,
  }
  saveAppState(p)
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(buildInitialState)

  const stateRef = useRef(state)
  stateRef.current = state

  const [sessionFrames, setSessionFramesState] = useState<Record<string, Record<number, File>>>({})
  const setVideoFrames = useCallback((mediaId: string, frames: Record<number, File>) => {
    setSessionFramesState(prev => ({ ...prev, [mediaId]: frames }))
  }, [])
  const clearVideoFrames = useCallback((mediaId: string) => {
    setSessionFramesState(prev => { const n = { ...prev }; delete n[mediaId]; return n })
  }, [])
  const getFrame = useCallback((mediaId: string, frameNumber: number): File | undefined => {
    return sessionFrames[mediaId]?.[frameNumber]
  }, [sessionFrames])

  // Auto-restore the active sports event's session from stored CSVs on first mount
  React.useEffect(() => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const se = prev.sports_events.find(s => s.id === prev.activeSportsEventId)
      if (!se) return prev
      const session = prev.sessions[prev.activeSportsEventId]
      if (session && session.rawDetections.length > 0) return prev
      const comp = getCompetition(se, prev.competitions)
      const input = resolvePipelineInput(se.config, se, comp, prev.media)
      const { detections, meta } = combineMediaDetections(input.videos)
      if (detections.length === 0) return prev
      const pipeline = runPipeline(detections, input, se.settings, se.qa_state)
      return {
        ...prev,
        sessions: {
          ...prev.sessions,
          [prev.activeSportsEventId]: { rawDetections: detections, parseMeta: meta, stale: false, ...pipeline },
        },
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived active shortcuts ───────────────────────────────────────────────
  const getActive = (s: AppState) => {
    const se = s.activeSportsEventId
      ? s.sports_events.find(e => e.id === s.activeSportsEventId) ?? null
      : null
    const session = s.activeSportsEventId ? (s.sessions[s.activeSportsEventId] ?? null) : null
    return { se, session }
  }

  // ── Client CRUD ───────────────────────────────────────────────────────────
  const addClient = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState(prev => {
      const cl: Client = { id: crypto.randomUUID(), name: trimmed, created_at: Date.now() }
      const next = { ...prev, clients: [...prev.clients, cl] }
      persist(next)
      return next
    })
  }, [])

  const renameClient = useCallback((id: string, name: string) => {
    setState(prev => {
      const next = { ...prev, clients: prev.clients.map(c => c.id === id ? { ...c, name } : c) }
      persist(next)
      return next
    })
  }, [])

  const deleteClient = useCallback((id: string) => {
    setState(prev => {
      const projects = prev.projects.map(a => a.client_id === id ? { ...a, client_id: '' } : a)
      const next = { ...prev, clients: prev.clients.filter(c => c.id !== id), projects }
      persist(next)
      return next
    })
  }, [])

  // ── Project CRUD ──────────────────────────────────────────────────────────
  const createProject = useCallback((name: string, clientId: string): Project => {
    let created!: Project
    setState(prev => {
      created = { id: makeProjectId(), name, client_id: clientId, description: '', created_at: Date.now() }
      const next = { ...prev, projects: [...prev.projects, created] }
      persist(next)
      return next
    })
    return created
  }, [])

  const updateProject = useCallback((id: string, patch: Partial<Pick<Project, 'name' | 'client_id' | 'description'>>) => {
    setState(prev => {
      const next = { ...prev, projects: prev.projects.map(a => a.id === id ? { ...a, ...patch } : a) }
      persist(next)
      return next
    })
  }, [])

  const deleteProject = useCallback((id: string) => {
    setState(prev => {
      // Cascade: unassign competitions (don't delete — let user manage)
      const competitions = prev.competitions.map(c => c.project_id === id ? { ...c, project_id: '' } : c)
      const next = { ...prev, projects: prev.projects.filter(a => a.id !== id), competitions }
      persist(next)
      return next
    })
  }, [])

  // ── Competition CRUD ──────────────────────────────────────────────────────
  const createCompetition = useCallback((name: string, projectId: string): Competition => {
    let created!: Competition
    setState(prev => {
      created = {
        id: makeCompetitionId(), project_id: projectId, name,
        date_start: '', date_end: null, country: '', city: '', timezone: null,
      }
      const next = { ...prev, competitions: [...prev.competitions, created] }
      persist(next)
      return next
    })
    return created
  }, [])

  const updateCompetition = useCallback((id: string, patch: Partial<Omit<Competition, 'id' | 'project_id'>>) => {
    setState(prev => {
      const competitions = prev.competitions.map(c => c.id === id ? { ...c, ...patch } : c)
      // Name change invalidates video_id in timeslices → mark sessions stale
      const nameChanged = patch.name !== undefined
      const affectedSeIds = nameChanged
        ? prev.sports_events.filter(se => se.competition_id === id).map(se => se.id)
        : []
      const sessions = { ...prev.sessions }
      for (const seId of affectedSeIds) {
        if (sessions[seId]) sessions[seId] = { ...sessions[seId], stale: true }
      }
      const next = { ...prev, competitions, sessions }
      persist(next)
      return next
    })
  }, [])

  const deleteCompetition = useCallback((id: string) => {
    setState(prev => {
      // Unassign sports events (don't cascade-delete them)
      const sports_events = prev.sports_events.map(se => se.competition_id === id ? { ...se, competition_id: '' } : se)
      const next = { ...prev, competitions: prev.competitions.filter(c => c.id !== id), sports_events }
      persist(next)
      return next
    })
  }, [])

  // ── SportsEvent CRUD ──────────────────────────────────────────────────────
  const createSportsEvent = useCallback((name: string, competitionId: string): SportsEvent => {
    let created!: SportsEvent
    setState(prev => {
      const comp = prev.competitions.find(c => c.id === competitionId)
      created = makeSportsEvent(name, competitionId, prev.globalSettings, comp?.country ?? '', comp?.city ?? '')
      const next = { ...prev, sports_events: [...prev.sports_events, created] }
      persist(next)
      return next
    })
    return created
  }, [])

  const renameSportsEvent = useCallback((id: SportsEventId, name: string) => {
    setState(prev => {
      const sports_events = prev.sports_events.map(se =>
        se.id !== id ? se : { ...se, name, updated_at: Date.now() }
      )
      // Name change → mark session stale (video_id prefix changes)
      const sessions = { ...prev.sessions }
      if (sessions[id]) sessions[id] = { ...sessions[id], stale: true }
      const next = { ...prev, sports_events, sessions }
      persist(next)
      return next
    })
  }, [])

  const updateSportsEventMeta = useCallback((
    id: SportsEventId,
    patch: Partial<Pick<SportsEvent, 'competition_id' | 'sport_type' | 'discipline' | 'country' | 'city' | 'scheduled_start' | 'scheduled_end' | 'timezone'>>,
  ) => {
    setState(prev => {
      const sports_events = prev.sports_events.map(se =>
        se.id === id ? { ...se, ...patch, updated_at: Date.now() } : se
      )
      const sessions = { ...prev.sessions }
      if (sessions[id] && patch.competition_id !== undefined) {
        sessions[id] = { ...sessions[id], stale: true }
      }
      const next = { ...prev, sports_events, sessions }
      persist(next)
      return next
    })
  }, [])

  const deleteSportsEvent = useCallback((id: SportsEventId) => {
    setState(prev => {
      const sports_events = prev.sports_events.filter(se => se.id !== id)
      // Remove owned media
      const media = prev.media.filter(m => m.sports_event_id !== id)
      const sessions = Object.fromEntries(Object.entries(prev.sessions).filter(([sid]) => sid !== id))
      const activeSportsEventId = prev.activeSportsEventId === id ? null : prev.activeSportsEventId
      const next = { ...prev, sports_events, media, sessions, activeSportsEventId }
      persist(next)
      return next
    })
  }, [])

  const setActiveSportsEvent = useCallback((id: SportsEventId) => {
    setState(prev => {
      const session = prev.sessions[id]
      const se = prev.sports_events.find(e => e.id === id)
      if (!se) {
        const next = { ...prev, activeSportsEventId: id }
        persist(next)
        return next
      }

      const comp = getCompetition(se, prev.competitions)

      if (!session || session.rawDetections.length === 0) {
        const input = resolvePipelineInput(se.config, se, comp, prev.media)
        const { detections, meta } = combineMediaDetections(input.videos)
        if (detections.length > 0) {
          const pipeline = runPipeline(detections, input, se.settings, se.qa_state)
          const next = {
            ...prev, activeSportsEventId: id,
            sessions: {
              ...prev.sessions,
              [id]: { rawDetections: detections, parseMeta: meta, stale: false, ...pipeline },
            },
          }
          persist(next)
          return next
        }
      }

      if (session?.stale && session.rawDetections.length > 0) {
        const input = resolvePipelineInput(se.config, se, comp, prev.media)
        const pipeline = runPipeline(session.rawDetections, input, se.settings, se.qa_state)
        const next = {
          ...prev, activeSportsEventId: id,
          sessions: { ...prev.sessions, [id]: { ...session, ...pipeline, stale: false } },
        }
        persist(next)
        return next
      }

      const next = { ...prev, activeSportsEventId: id }
      persist(next)
      return next
    })
  }, [])


  // ── Active-event actions ──────────────────────────────────────────────────
  const setDraftConfig = useCallback((cfg: SportsEventConfig) => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const sports_events = prev.sports_events.map(se =>
        se.id === prev.activeSportsEventId ? { ...se, draft_config: cfg } : se
      )
      return { ...prev, sports_events }
    })
  }, [])

  const saveConfig = useCallback(() => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const se = prev.sports_events.find(e => e.id === prev.activeSportsEventId)
      if (!se) return prev
      const cfg = se.draft_config
      const comp = getCompetition(se, prev.competitions)
      const session = prev.sessions[prev.activeSportsEventId] ?? emptySession()

      const input = resolvePipelineInput(cfg, se, comp, prev.media)
      const { detections, meta } = combineMediaDetections(input.videos)

      let pipeline = { enriched: session.enriched, videoExposures: session.videoExposures, projectExposures: session.projectExposures, finalised: session.finalised }
      if (detections.length > 0) {
        pipeline = runPipeline(detections, input, se.draft_settings, se.qa_state)
      } else {
        pipeline = { enriched: [], videoExposures: [], projectExposures: [], finalised: [] }
      }
      const prunedQA = pruneQAState(se.qa_state, pipeline.projectExposures)
      const savedSettings = se.draft_settings
      const sports_events = prev.sports_events.map(e =>
        e.id === prev.activeSportsEventId
          ? { ...e, config: cfg, settings: savedSettings, qa_state: prunedQA, updated_at: Date.now() }
          : e
      )
      const next = {
        ...prev,
        sports_events,
        sessions: {
          ...prev.sessions,
          [prev.activeSportsEventId]: { ...session, rawDetections: detections, parseMeta: meta, ...pipeline, stale: false },
        },
      }
      persist(next)
      return next
    })
  }, [])

  const updateProjectExposure = useCallback((qaKey: string, patch: Partial<QARowState>) => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const se = prev.sports_events.find(e => e.id === prev.activeSportsEventId)
      const session = prev.sessions[prev.activeSportsEventId]
      if (!se || !session) return prev

      const projectExposures = session.projectExposures.map(pe => {
        if (pe.qa_key !== qaKey) return pe
        return {
          ...pe,
          is_audited_out: patch.is_audited_out ?? pe.is_audited_out,
          audit_flag_note: patch.audit_flag_note !== undefined ? patch.audit_flag_note : pe.audit_flag_note,
          eph_proposed: patch.eph_proposed !== undefined ? (patch.eph_proposed ?? pe.eph_current) : pe.eph_proposed,
          differential: patch.differential ?? pe.differential,
          override_note: patch.override_note !== undefined ? patch.override_note : pe.override_note,
        }
      })
      const comp = getCompetition(se, prev.competitions)
      const resolvedMedia = resolveMediaList(se.config.media_ids, se.config.excluded_media_ids, prev.media, se, comp)
      const finalised = computeFinalisedExposures(projectExposures, resolvedMedia)

      const existing = se.qa_state.rows[qaKey] ?? {
        is_audited_out: false, audit_flag_note: null,
        eph_proposed: null, override_note: null, differential: 1,
      }
      const qa_state: QAState = {
        rows: { ...se.qa_state.rows, [qaKey]: { ...existing, ...patch } },
      }
      const sports_events = prev.sports_events.map(e =>
        e.id === prev.activeSportsEventId ? { ...e, qa_state, updated_at: Date.now() } : e
      )
      const next = {
        ...prev,
        sports_events,
        sessions: { ...prev.sessions, [prev.activeSportsEventId]: { ...session, projectExposures, finalised } },
      }
      persist(next)
      return next
    })
  }, [])

  const rerunPipeline = useCallback(() => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const se = prev.sports_events.find(e => e.id === prev.activeSportsEventId)
      if (!se) return prev
      const session = prev.sessions[prev.activeSportsEventId] ?? emptySession()
      const comp = getCompetition(se, prev.competitions)
      const input = resolvePipelineInput(se.config, se, comp, prev.media)
      const { detections, meta } = combineMediaDetections(input.videos)
      if (detections.length === 0) return prev
      const pipeline = runPipeline(detections, input, se.settings, se.qa_state)
      return {
        ...prev,
        sessions: { ...prev.sessions, [prev.activeSportsEventId]: { ...session, rawDetections: detections, parseMeta: meta, ...pipeline, stale: false } },
      }
    })
  }, [])

  const getEventFinalised = useCallback((id: SportsEventId): FinalisedExposure[] => {
    const s = stateRef.current
    const se = s.sports_events.find(e => e.id === id)
    if (!se) return []
    const session = s.sessions[id]
    if (session && !session.stale && session.rawDetections.length > 0) return session.finalised
    const comp = getCompetition(se, s.competitions)
    const input = resolvePipelineInput(se.config, se, comp, s.media)
    const { detections } = combineMediaDetections(input.videos)
    if (detections.length === 0) return []
    return runPipeline(detections, input, se.settings, se.qa_state).finalised
  }, [])

  const setGlobalSettings = useCallback((s: GlobalSettings) => {
    setState(prev => {
      const next = { ...prev, globalSettings: s }
      persist(next)
      return next
    })
  }, [])

  // ── Sport Type / Discipline CRUD ──────────────────────────────────────────
  const addSportDiscipline = useCallback((sport_type: string, discipline: string, interest_id?: string | null) => {
    const st = sport_type.trim(); const d = discipline.trim()
    if (!st || !d) return
    setState(prev => {
      const row: SportDiscipline = { id: crypto.randomUUID(), sport_type: st, discipline: d, interest_id: interest_id ?? null }
      const next = { ...prev, sport_disciplines: [row, ...prev.sport_disciplines] }
      persist(next)
      return next
    })
  }, [])

  const updateSportDiscipline = useCallback((id: string, patch: Partial<Pick<SportDiscipline, 'sport_type' | 'discipline'>>) => {
    setState(prev => {
      const next = { ...prev, sport_disciplines: prev.sport_disciplines.map(r => r.id === id ? { ...r, ...patch } : r) }
      persist(next)
      return next
    })
  }, [])

  const deleteSportDiscipline = useCallback((id: string) => {
    setState(prev => {
      const next = { ...prev, sport_disciplines: prev.sport_disciplines.filter(r => r.id !== id) }
      persist(next)
      return next
    })
  }, [])

  const setSportInterestEntries = useCallback((entries: SportInterestEntry[]) => {
    setState(prev => {
      const next = { ...prev, sport_interest_entries: entries }
      persist(next)
      return next
    })
  }, [])

  // ── Media CRUD ────────────────────────────────────────────────────────────
  const addMedia = useCallback((sportsEventId: SportsEventId, label: string, type: MediaType = 'video'): string => {
    const id = makeMediaId()
    setState(prev => {
      const base = { id, sports_event_id: sportsEventId, label, is_excluded: false, csv_file_id: null }
      const m: Media = type === 'video'
        ? { ...base, type: 'video', timeslices: [] } as VideoMedia
        : { ...base, type: 'audio' }
      // Add to draft_config only — the user must Save & Re-run to commit the change and
      // rebuild the session with the new media's detections included.
      const sports_events = prev.sports_events.map(se =>
        se.id !== sportsEventId ? se : {
          ...se,
          draft_config: { ...se.draft_config, media_ids: [...se.draft_config.media_ids, id] },
        }
      )
      const next = { ...prev, media: [...prev.media, m], sports_events }
      persist(next)
      return next
    })
    return id
  }, [])

  const updateMedia = useCallback((id: string, patch: Partial<Pick<Media, 'label' | 'is_excluded' | 'csv_file_id'>>) => {
    setState(prev => {
      const next = { ...prev, media: prev.media.map(m => m.id === id ? { ...m, ...patch } : m) }
      persist(next)
      return next
    })
  }, [])

  const updateVideoTimeslices = useCallback((id: string, timeslices: SportsEventTimeslice[]) => {
    setState(prev => {
      const media = prev.media.map(m => m.id === id && m.type === 'video' ? { ...m, timeslices } : m)
      const seId = prev.media.find(m => m.id === id)?.sports_event_id
      const sessions = { ...prev.sessions }
      if (seId && sessions[seId]) sessions[seId] = { ...sessions[seId], stale: true }
      const next = { ...prev, media, sessions }
      persist(next)
      return next
    })
  }, [])

  const deleteMedia = useCallback((id: string) => {
    setState(prev => {
      const targetMedia = prev.media.find(m => m.id === id)
      const media = prev.media.filter(m => m.id !== id)
      const dropFromConfig = (cfg: SportsEventConfig, tagsToKeep: Set<string>): SportsEventConfig => ({
        ...cfg,
        media_ids: cfg.media_ids.filter(mid => mid !== id),
        excluded_media_ids: cfg.excluded_media_ids.filter(mid => mid !== id),
        // Prune tag cleaning rules whose tags are no longer in any remaining media
        tag_cleaning_rules: cfg.tag_cleaning_rules.filter(r => tagsToKeep.has(r.raw_tag)),
      })

      // Compute surviving tags for the owning SportsEvent
      const sports_events = prev.sports_events.map(se => {
        if (se.id !== targetMedia?.sports_event_id) return se
        const remainingMediaIds = se.config.media_ids.filter(mid => mid !== id)
        const remainingMedia = prev.media.filter(m => remainingMediaIds.includes(m.id) && m.csv_file_id)
        const survivingTags = new Set<string>()
        for (const m of remainingMedia) {
          const content = m.csv_file_id ? loadCSVContent(m.csv_file_id) : null
          if (content) {
            try {
              const { detections } = parseCSV(content)
              for (const d of detections) survivingTags.add(d.tag)
            } catch { /* ignore */ }
          }
        }
        return {
          ...se,
          config: dropFromConfig(se.config, survivingTags),
          draft_config: dropFromConfig(se.draft_config, survivingTags),
        }
      })

      const sessions = { ...prev.sessions }
      if (targetMedia?.sports_event_id && sessions[targetMedia.sports_event_id]) {
        sessions[targetMedia.sports_event_id] = { ...sessions[targetMedia.sports_event_id], stale: true }
      }

      const next = { ...prev, media, sports_events, sessions }
      persist(next)
      return next
    })
  }, [])

  const setDraftProjectSettings = useCallback((s: GlobalSettings) => {
    setState(prev => {
      if (!prev.activeSportsEventId) return prev
      const sports_events = prev.sports_events.map(se =>
        se.id === prev.activeSportsEventId ? { ...se, draft_settings: s } : se
      )
      return { ...prev, sports_events }
    })
  }, [])

  // ── CSV file management ────────────────────────────────────────────────────
  const uploadCSVFile = useCallback((filename: string, content: string): string => {
    const id = makeCSVId()
    const stored = saveCSVContent(id, content)
    if (!stored) {
      // Content was NOT persisted — throw so the caller can show a clear error.
      // Don't add a dangling csv_library entry whose content can never be loaded.
      throw new Error(
        `CSV file could not be saved — browser storage is full.\n` +
        `File size: ${(content.length / 1024 / 1024).toFixed(1)} MB. ` +
        `Try clearing old events or using a smaller file.`
      )
    }
    let rowCount = 0, skippedRows = 0, frameCount = 0, durationS = 0, videoIds: string[] = [], tags: string[] = []
    try {
      const result = parseCSV(content)
      rowCount = result.detections.length
      skippedRows = result.skippedRows
      frameCount = countFrames(result.detections)
      durationS = maxDuration(result.detections)
      videoIds = distinctVideoIds(result.detections)
      tags = distinctTags(result.detections)
    } catch { /* metadata parse error — file is stored, still record the entry */ }

    const csvFile: StoredCSV = {
      id, filename, size_bytes: content.length,
      row_count: rowCount, skipped_rows: skippedRows,
      frame_count: frameCount, duration_s: durationS, video_ids: videoIds, tags,
      uploaded_at: Date.now(), stored: true,
    }

    setState(prev => {
      const next = { ...prev, csv_library: [...prev.csv_library, csvFile] }
      persist(next)
      return next
    })
    return id
  }, [])

  const deleteCSVFile = useCallback((csvId: string) => {
    deleteCSVContent(csvId)
    setState(prev => {
      const csv_library = prev.csv_library.filter(f => f.id !== csvId)
      const media = prev.media.map(m => m.csv_file_id === csvId ? { ...m, csv_file_id: null } : m)
      const next = { ...prev, csv_library, media }
      persist(next)
      return next
    })
  }, [])

  // ── Build context value ───────────────────────────────────────────────────
  const { se: activeSportsEvent, session: activeSession } = getActive(state)

  const value: ProjectContextValue = {
    sportsEvents: state.sports_events,
    csv_library: state.csv_library,
    activeSportsEventId: state.activeSportsEventId,
    activeSportsEvent,
    activeSession,

    config: activeSportsEvent?.config ?? defaultSportsEventConfig,
    draftConfig: activeSportsEvent?.draft_config ?? defaultSportsEventConfig,
    enriched: activeSession?.enriched ?? [],
    videoExposures: activeSession?.videoExposures ?? [],
    projectExposures: activeSession?.projectExposures ?? [],
    finalised: activeSession?.finalised ?? [],
    parseMeta: activeSession?.parseMeta ?? null,
    globalSettings: state.globalSettings,

    clients: state.clients,
    projects: state.projects,
    competitions: state.competitions,
    media: state.media,
    sportDisciplines: state.sport_disciplines,
    sportInterestEntries: state.sport_interest_entries,

    addClient, renameClient, deleteClient,
    createProject, updateProject, deleteProject,
    createCompetition, updateCompetition, deleteCompetition,
    addSportDiscipline, updateSportDiscipline, deleteSportDiscipline,
    setSportInterestEntries,
    addMedia, updateMedia, updateVideoTimeslices, deleteMedia,

    createSportsEvent,
    renameSportsEvent,
    updateSportsEventMeta,
    deleteSportsEvent,
    setActiveSportsEvent,

    getEventFinalised,
    setDraftConfig,
    saveConfig,
    setDraftProjectSettings,
    draftSettings: activeSportsEvent?.draft_settings ?? state.globalSettings,
    updateProjectExposure,
    rerunPipeline,
    setGlobalSettings,
    uploadCSVFile,
    deleteCSVFile,
    sessionFrames,
    setVideoFrames,
    clearVideoFrames,
    getFrame,
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
