import type {
  SportsEvent, SportsEventConfig, SportsEventTimeslice,
  StoredCSV, SportsEventId,
  Client, Project, Competition, Media, VideoMedia,
  SportDiscipline, TagCleaningRule, QAState, SportInterestEntry,
} from '../types'
import { makeDefaultSportDisciplines } from '../config/sportDisciplines'
import { makeDefaultSportInterestEntries } from '../config/sportCountryInterest'
import { defaultGlobalSettings } from './pipeline'
import type { GlobalSettings } from './pipeline'
import { parseCSV, countFrames, maxDuration, distinctVideoIds, distinctTags } from './parseCSV'
import { countryCodeFromName } from './countries'
import { defaultZonesForCountry } from './timezone'

// Normalise a venue-bearing row: migrate free-text `country` → ISO code, and resolve a
// single-zone venue `timezone` when one isn't already set. Idempotent (a value that is
// already a code/zone is preserved). Unmappable country names become '' for re-selection.
function resolveVenue<T extends { country?: string; timezone?: string | null }>(row: T): T {
  const country = countryCodeFromName(row.country ?? '')
  let timezone = row.timezone ?? null
  if (!timezone && country) {
    const zones = defaultZonesForCountry(country)
    if (zones.length === 1) timezone = zones[0]
  }
  return { ...row, country, timezone }
}

const STORAGE_KEY = 'platformetrix_v1'
const CSV_KEY_PREFIX = 'platformetrix_csv_'
const SCHEMA_VERSION = 5

export interface PersistedAppState {
  version: number
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
}

// ─── v1 legacy types (only used during migration) ────────────────────────────

interface LegacySponsor { id: string; name: string; created_at: number }
interface LegacySportEvent { id: string; name: string; created_at: number }
interface LegacyStoredVideo {
  uid: string; csv_file_id: string | null; sport_event_id: string
  video_label: string; is_excluded?: boolean
  country?: string; city?: string; sport_type?: string; discipline?: string
  local_start?: string; local_end?: string
}
interface LegacyTimeslice {
  video_uid: string; video_id: string; label: string
  start_s: number; end_s: number; duration_s: number; is_excluded: boolean
}
interface LegacyProjectConfig {
  project_name: string
  video_uids: string[]; excluded_video_uids: string[]
  timeslices: LegacyTimeslice[]
  tag_cleaning_rules: TagCleaningRule[]
}
interface LegacyProject {
  id: string; sponsor_id: string; sport_event_id: string
  config: LegacyProjectConfig; draft_config: LegacyProjectConfig
  settings: GlobalSettings; draft_settings: GlobalSettings
  qa_state: { rows: Record<string, unknown> }
  created_at: number; updated_at: number
}
interface LegacyPersistedAppState {
  version: number
  projects: LegacyProject[]
  csv_library: StoredCSV[]
  activeProjectId: string | null
  globalSettings: GlobalSettings
  sport_events: LegacySportEvent[]
  sponsors: LegacySponsor[]
  videos: LegacyStoredVideo[]
  sport_disciplines?: SportDiscipline[]
}

// ─── migration helpers ────────────────────────────────────────────────────────

function migrateV1ToV3(v1: LegacyPersistedAppState): PersistedAppState {
  const mergeSettings = (s: unknown): GlobalSettings =>
    ({ ...defaultGlobalSettings, ...((s as Partial<GlobalSettings>) ?? {}) })

  // 1. Clients (was Sponsors)
  const clients: Client[] = (v1.sponsors ?? []).map(s => ({
    id: s.id, name: s.name, created_at: s.created_at,
  }))
  // Also handle pre-v1 "partner/client" data that may have been stored
  const legacyClientMap: Record<string, string> = {}
  const anyV1 = v1 as unknown as Record<string, unknown>
  const legacyClients = (anyV1['clients'] as { id: string; name: string }[] | undefined)
    ?? (anyV1['partners'] as { id: string; name: string }[] | undefined)
    ?? []
  for (const c of legacyClients) {
    const existing = clients.find(cl => cl.name.toLowerCase() === c.name.toLowerCase())
    if (existing) { legacyClientMap[c.id] = existing.id }
    else {
      const nc: Client = { id: crypto.randomUUID(), name: c.name, created_at: Date.now() }
      clients.push(nc)
      legacyClientMap[c.id] = nc.id
    }
  }

  const sportEvents: LegacySportEvent[] = v1.sport_events ?? []
  const projects: LegacyProject[] = (v1.projects ?? []).map(p => {
    const ap = p as unknown as Record<string, unknown>
    const legacyClientId =
      (ap['client_id'] as string | undefined) ?? (ap['partner_id'] as string | undefined) ?? ''
    return {
      ...p,
      sponsor_id: (ap['sponsor_id'] as string | undefined) ?? legacyClientMap[legacyClientId] ?? '',
      sport_event_id: (ap['sport_event_id'] as string | undefined) ?? '',
    } as LegacyProject
  })

  // 2. Projects — one per unique sponsor_id
  const projectsArr: Project[] = []
  const sponsorToProject: Record<string, string> = {}
  const uniqueSponsorIds = [...new Set(projects.map(p => p.sponsor_id))]
  for (const sponsorId of uniqueSponsorIds) {
    const clientId = sponsorId
    const client = clients.find(c => c.id === clientId)
    const pId = crypto.randomUUID()
    projectsArr.push({
      id: pId,
      name: client ? `${client.name} Research` : 'Unassigned',
      client_id: clientId,
      description: '',
      created_at: Date.now(),
    })
    sponsorToProject[sponsorId] = pId
  }

  // 3. Competitions — one per unique (projectId, sport_event_id)
  const competitions: Competition[] = []
  const keyToCompetition: Record<string, string> = {}
  for (const p of projects) {
    const projectId = sponsorToProject[p.sponsor_id] ?? ''
    const key = `${projectId}::${p.sport_event_id}`
    if (keyToCompetition[key]) continue
    const sportEvent = sportEvents.find(e => e.id === p.sport_event_id)
    // Best-effort: take country/city from first video referenced by a project with this sport_event_id
    const firstVideoUid = p.config.video_uids[0]
    const firstVideo = firstVideoUid
      ? (v1.videos ?? []).find(v => v.uid === firstVideoUid)
      : undefined
    const cId = crypto.randomUUID()
    competitions.push(resolveVenue({
      id: cId,
      project_id: projectId,
      name: sportEvent?.name ?? (p.sport_event_id ? 'Unknown Competition' : 'Unassigned'),
      date_start: '',
      date_end: null,
      country: firstVideo?.country ?? '',
      city: firstVideo?.city ?? '',
      timezone: null,
    }))
    keyToCompetition[key] = cId
  }

  // 4. SportsEvents (was Projects)
  const legacyTimeslicesBySeId: Record<string, SportsEventTimeslice[]> = {}
  const sports_events: SportsEvent[] = projects.map(p => {
    const projectId = sponsorToProject[p.sponsor_id] ?? ''
    const key = `${projectId}::${p.sport_event_id}`
    const competitionId = keyToCompetition[key] ?? ''
    // Best-effort sport_type/discipline from first referenced video
    const firstVideoUid = p.config.video_uids[0]
    const firstVideo = firstVideoUid
      ? (v1.videos ?? []).find(v => v.uid === firstVideoUid)
      : undefined
    const cfg: SportsEventConfig = {
      media_ids: p.config.video_uids,
      excluded_media_ids: p.config.excluded_video_uids ?? [],
      tag_cleaning_rules: p.config.tag_cleaning_rules ?? [],
    }
    const draftCfg: SportsEventConfig = {
      media_ids: p.draft_config.video_uids,
      excluded_media_ids: p.draft_config.excluded_video_uids ?? [],
      tag_cleaning_rules: p.draft_config.tag_cleaning_rules ?? [],
    }
    // Collect timeslices (used when distributing to VideoMedia below)
    legacyTimeslicesBySeId[p.id] = (p.draft_config.timeslices ?? p.config.timeslices ?? []).map(
      (t): SportsEventTimeslice => ({
        media_id: t.video_uid,
        video_id: t.video_id,
        label: t.label,
        start_s: t.start_s,
        end_s: t.end_s,
        duration_s: t.duration_s,
        is_excluded: t.is_excluded,
      }),
    )
    return {
      id: p.id,
      competition_id: competitionId,
      name: p.config.project_name ?? '',
      sport_type: firstVideo?.sport_type ?? '',
      discipline: firstVideo?.discipline ?? '',
      country: '',
      city: '',
      scheduled_start: firstVideo?.local_start ?? null,
      scheduled_end: firstVideo?.local_end ?? null,
      timezone: null,   // legacy data predates the venue-zone field

      config: cfg,
      draft_config: draftCfg,
      settings: mergeSettings(p.settings),
      draft_settings: mergeSettings(p.draft_settings ?? p.settings),
      qa_state: (p.qa_state ?? { rows: {} }) as QAState,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
  })

  // 5. Media (was StoredVideo) — VideoMedia with timeslices: [] initially
  const uidToSportsEvents: Record<string, string[]> = {}
  for (const se of sports_events) {
    for (const uid of se.config.media_ids) {
      if (!uidToSportsEvents[uid]) uidToSportsEvents[uid] = []
      uidToSportsEvents[uid].push(se.id)
    }
  }
  const makeVideoMedia = (id: string, seId: string, v: LegacyStoredVideo): VideoMedia => ({
    id, sports_event_id: seId, type: 'video',
    label: v.video_label, is_excluded: v.is_excluded ?? false,
    csv_file_id: v.csv_file_id, timeslices: [],
  })
  const media: Media[] = []
  const uidToNewIds: Record<string, string[]> = {}
  for (const v of (v1.videos ?? [])) {
    const seIds = uidToSportsEvents[v.uid] ?? []
    if (seIds.length === 0) {
      media.push(makeVideoMedia(v.uid, '', v))
      uidToNewIds[v.uid] = [v.uid]
    } else if (seIds.length === 1) {
      media.push(makeVideoMedia(v.uid, seIds[0], v))
      uidToNewIds[v.uid] = [v.uid]
    } else {
      const newIds: string[] = []
      for (let i = 0; i < seIds.length; i++) {
        const newId = i === 0 ? v.uid : crypto.randomUUID()
        media.push(makeVideoMedia(newId, seIds[i], v))
        newIds.push(newId)
      }
      uidToNewIds[v.uid] = newIds
    }
  }

  // Fix up media_ids and distribute timeslices to VideoMedia
  for (const se of sports_events) {
    const remapped = (ids: string[]): string[] =>
      ids.flatMap(uid => {
        const newIds = uidToNewIds[uid]
        if (!newIds) return [uid]
        const match = newIds.find(nid => media.find(m => m.id === nid && m.sports_event_id === se.id))
        return match ? [match] : newIds.slice(0, 1)
      })
    se.config.media_ids = remapped(se.config.media_ids)
    se.draft_config.media_ids = remapped(se.draft_config.media_ids)

    // Distribute timeslices (remapping media_id first) to the owning VideoMedia
    const slices = legacyTimeslicesBySeId[se.id] ?? []
    for (const t of slices) {
      const newIds = uidToNewIds[t.media_id]
      const resolvedId = newIds
        ? (newIds.find(nid => media.find(m => m.id === nid && m.sports_event_id === se.id)) ?? t.media_id)
        : t.media_id
      const vm = media.find(m => m.id === resolvedId && m.type === 'video') as VideoMedia | undefined
      if (vm) {
        if (!vm.timeslices) vm.timeslices = []
        vm.timeslices.push({ ...t, media_id: resolvedId })
      }
    }
  }

  return {
    version: 4,
    clients,
    projects: projectsArr,
    competitions,
    sports_events,
    media,
    csv_library: v1.csv_library ?? [],
    activeSportsEventId: v1.activeProjectId ?? null,
    globalSettings: mergeSettings(v1.globalSettings),
    sport_disciplines: v1.sport_disciplines ?? makeDefaultSportDisciplines(),
    sport_interest_entries: makeDefaultSportInterestEntries(),
  }
}

// ─── v2 → v3 migration: move timeslices from SportsEventConfig to VideoMedia ──

function migrateV2ToV3(v2raw: unknown): PersistedAppState {
  const v2any = v2raw as Record<string, unknown>
  const v2 = v2raw as PersistedAppState
  const mediaById = new Map(v2.media.map(m => [m.id, m]))

  const sports_events = v2.sports_events.map(se => {
    // v2 config objects still have a timeslices field (typed as unknown here)
    const v2cfg = se.config as unknown as Record<string, unknown>
    const v2draft = se.draft_config as unknown as Record<string, unknown>
    const slices = (v2draft['timeslices'] ?? v2cfg['timeslices'] ?? []) as SportsEventTimeslice[]

    // Distribute timeslices to the owning VideoMedia
    for (const t of slices) {
      const m = mediaById.get(t.media_id)
      if (m && m.type === 'video') {
        const vm = m as VideoMedia
        if (!vm.timeslices) vm.timeslices = []
        const already = vm.timeslices.some(
          x => x.media_id === t.media_id && x.label === t.label && x.start_s === t.start_s,
        )
        if (!already) vm.timeslices.push(t)
      }
    }

    // Return config without timeslices
    const { timeslices: _c, ...cleanCfg } = v2cfg
    const { timeslices: _d, ...cleanDraft } = v2draft
    void _c; void _d
    return { ...se, config: cleanCfg as unknown as SportsEventConfig, draft_config: cleanDraft as unknown as SportsEventConfig }
  })

  // Also rename assignments→projects and assignment_id→project_id
  const projects = ((v2any['assignments'] ?? v2any['projects'] ?? []) as unknown[]).map(a => a as Project)
  const competitions = v2.competitions.map(c => {
    const ca = c as unknown as Record<string, unknown>
    if ('assignment_id' in ca) {
      const { assignment_id, ...rest } = ca
      return { ...rest, project_id: (assignment_id as string) ?? '' } as Competition
    }
    return c
  })

  return { ...v2, version: 4, sports_events, media: [...mediaById.values()], projects, competitions }
}

// ─── v3 → v4 migration: rename assignments→projects, assignment_id→project_id ─

function migrateV3ToV4(v3raw: unknown): PersistedAppState {
  const v3 = v3raw as Record<string, unknown>
  const base = v3raw as PersistedAppState

  const projects = ((v3['assignments'] ?? v3['projects'] ?? []) as unknown[]).map(a => a as Project)
  const competitions = ((v3['competitions'] ?? []) as unknown[]).map(c => {
    const ca = c as Record<string, unknown>
    if ('assignment_id' in ca) {
      const { assignment_id, ...rest } = ca
      return { ...rest, project_id: (assignment_id as string) ?? '' } as Competition
    }
    return c as Competition
  })

  return { ...base, version: 4, projects, competitions }
}

// ─── v4 → v5: tag-cleaning rules move from {cleaning_partner/asset, approved}
//              (with the magic 'DELETE' string) to the {status, exclude_reason} model ──

function convertTagRule(raw: unknown): TagCleaningRule {
  const o = (raw ?? {}) as Record<string, unknown>
  if (typeof o.status === 'string') return o as unknown as TagCleaningRule  // already v5
  const raw_tag = String(o.raw_tag ?? '')
  const cp = (o.cleaning_partner ?? null) as string | null
  const ca = (o.cleaning_asset ?? null) as string | null
  if (cp === 'DELETE' || ca === 'DELETE') {
    return { raw_tag, status: 'excluded', partner: null, asset: null, note: 'Migrated from DELETE rule' }
  }
  if (o.approved === true && (cp || ca)) {
    return { raw_tag, status: 'mapped', partner: cp, asset: ca, note: null }
  }
  return { raw_tag, status: 'pending', partner: cp, asset: ca, note: null }
}

function backfillTagRules(events: SportsEvent[]): SportsEvent[] {
  const conv = (rules: unknown): TagCleaningRule[] => (Array.isArray(rules) ? rules.map(convertTagRule) : [])
  return events.map(se => ({
    ...se,
    config: { ...se.config, tag_cleaning_rules: conv(se.config?.tag_cleaning_rules) },
    draft_config: { ...se.draft_config, tag_cleaning_rules: conv(se.draft_config?.tag_cleaning_rules) },
  }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadAppState(): PersistedAppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number }

    if (parsed.version === 1) {
      const migrated = migrateV1ToV3(parsed as unknown as LegacyPersistedAppState)
      migrated.version = SCHEMA_VERSION
      migrated.csv_library = backfillCsvStats(migrated.csv_library)
      migrated.media = backfillVideoTimeslices(migrated.media)
      migrated.sports_events = backfillTagRules(backfillSportsEventVenue(migrated.sports_events))
      return migrated
    }

    if (parsed.version === 2) {
      const migrated = migrateV2ToV3(parsed)
      migrated.version = SCHEMA_VERSION
      migrated.csv_library = backfillCsvStats(migrated.csv_library)
      migrated.media = backfillVideoTimeslices(migrated.media)
      migrated.sports_events = backfillTagRules(backfillSportsEventVenue(migrated.sports_events))
      return migrated
    }

    if (parsed.version === 3) {
      const migrated = migrateV3ToV4(parsed)
      migrated.version = SCHEMA_VERSION
      migrated.csv_library = backfillCsvStats(migrated.csv_library)
      migrated.media = backfillVideoTimeslices(migrated.media)
      migrated.sports_events = backfillTagRules(backfillSportsEventVenue(migrated.sports_events))
      return migrated
    }

    // v4 → v5: bump version and let the generic backfill below convert the tag rules.
    if (parsed.version === 4) {
      ;(parsed as { version: number }).version = SCHEMA_VERSION
    }

    if (parsed.version !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    const state = parsed as unknown as PersistedAppState
    const mergeSettings = (s: unknown): GlobalSettings =>
      ({ ...defaultGlobalSettings, ...((s as Partial<GlobalSettings>) ?? {}) })
    state.globalSettings = mergeSettings(state.globalSettings)
    // Migrate venue location (free-text country → ISO code, resolve single-zone timezone).
    state.competitions = (state.competitions ?? []).map(resolveVenue)
    // Backfill new settings keys into per-event settings
    state.sports_events = backfillTagRules((state.sports_events ?? []).map(se => ({
      ...resolveVenue(se),
      city: se.city ?? '',
      settings: mergeSettings(se.settings),
      draft_settings: mergeSettings(se.draft_settings ?? se.settings),
    })))
    // Migrate interest entries: strip old `mapped_to` field, keep other fields
    const rawEntries: any[] = (state as any).sport_interest_entries ?? makeDefaultSportInterestEntries()
    state.sport_interest_entries = rawEntries.map(e => ({
      id: e.id,
      label: e.label,
      scores: e.scores ?? {},
      // If last_updated was never set but scores exist (seed data), backfill with the seed date.
      last_updated: e.last_updated ?? (Object.keys(e.scores ?? {}).length > 0 ? '2026-06-18' : null),
    }))
    // Backfill interest_id on disciplines from old mapped_to data (first-match wins)
    state.sport_disciplines = ((state.sport_disciplines as SportDiscipline[] | undefined) ?? makeDefaultSportDisciplines())
      .map((d: any) => {
        if ('interest_id' in d) return d as SportDiscipline  // already migrated
        const linked = rawEntries.find((e: any) =>
          (e.mapped_to ?? []).some((m: any) =>
            m.sport_type === d.sport_type &&
            (m.discipline === d.discipline || m.discipline === null)
          )
        )
        return { ...d, interest_id: linked?.id ?? null } as SportDiscipline
      })
    // Ensure every VideoMedia has the timeslices array (handles partial saves)
    state.media = (state.media ?? []).map(m =>
      m.type === 'video' && !Array.isArray((m as VideoMedia).timeslices)
        ? { ...m, timeslices: [] } as VideoMedia
        : m
    )
    state.csv_library = backfillCsvStats(state.csv_library ?? [])
    return state
  } catch {
    return null
  }
}

function backfillSportsEventVenue(events: SportsEvent[]): SportsEvent[] {
  return events.map(se =>
    se.country === undefined || se.city === undefined
      ? { ...se, country: se.country ?? '', city: se.city ?? '' }
      : se
  )
}

function backfillVideoTimeslices(media: Media[]): Media[] {
  return media.map(m =>
    m.type === 'video' && !Array.isArray((m as VideoMedia).timeslices)
      ? { ...m, timeslices: [] } as VideoMedia
      : m
  )
}

function backfillCsvStats(library: StoredCSV[]): StoredCSV[] {
  return library.map(f => {
    const anyF = f as unknown as Record<string, unknown>
    if (anyF['frame_count'] !== undefined && anyF['duration_s'] !== undefined
      && anyF['video_ids'] !== undefined && anyF['tags'] !== undefined) return f
    let frame_count = (anyF['frame_count'] as number | undefined) ?? 0
    let duration_s = (anyF['duration_s'] as number | undefined) ?? 0
    let video_ids = (anyF['video_ids'] as string[] | undefined) ?? []
    let tags = (anyF['tags'] as string[] | undefined) ?? []
    const content = localStorage.getItem(`${CSV_KEY_PREFIX}${f.id}`)
    if (content) {
      try {
        const { detections } = parseCSV(content)
        frame_count = countFrames(detections)
        duration_s = maxDuration(detections)
        video_ids = distinctVideoIds(detections)
        tags = distinctTags(detections)
      } catch { /* leave defaults */ }
    }
    return { ...f, frame_count, duration_s, video_ids, tags }
  })
}

export function saveAppState(state: PersistedAppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}

export function clearAppState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── CSV content storage ──────────────────────────────────────────────────────

export function saveCSVContent(id: string, content: string): boolean {
  try {
    localStorage.setItem(`${CSV_KEY_PREFIX}${id}`, content)
    return true
  } catch {
    return false
  }
}

export function loadCSVContent(id: string): string | null {
  return localStorage.getItem(`${CSV_KEY_PREFIX}${id}`)
}

export function deleteCSVContent(id: string): void {
  localStorage.removeItem(`${CSV_KEY_PREFIX}${id}`)
}

// ─── Roboflow defaults ────────────────────────────────────────────────────────

const ROBOFLOW_KEY = 'platformetrix_roboflow'

export interface RoboflowDefaults {
  modelId: string
  confidence: number
  fps: number
}

export function loadRoboflowDefaults(): RoboflowDefaults {
  try {
    const raw = localStorage.getItem(ROBOFLOW_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<RoboflowDefaults>
      return {
        modelId: d.modelId ?? '',
        confidence: typeof d.confidence === 'number' ? d.confidence : 25,
        fps: typeof d.fps === 'number' ? d.fps : 25,
      }
    }
  } catch { /* fall through */ }
  return { modelId: '', confidence: 25, fps: 25 }
}

export function saveRoboflowDefaults(d: RoboflowDefaults): void {
  try {
    localStorage.setItem(ROBOFLOW_KEY, JSON.stringify(d))
  } catch { /* ignore */ }
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

export function makeSportsEventId(): SportsEventId { return crypto.randomUUID() }
export function makeProjectId(): string { return crypto.randomUUID() }
export function makeCompetitionId(): string { return crypto.randomUUID() }
export function makeMediaId(): string { return crypto.randomUUID() }
export function makeCSVId(): string { return crypto.randomUUID() }
