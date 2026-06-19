import { useMemo, useState } from 'react'
import { Trophy, Activity, Download, ArrowLeft, Film, Music, Clock, FileText, Tag, Ban, ChevronDown, ChevronRight } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { fmt, downloadCSV } from '../../lib/utils'
import { countryName } from '../../lib/countries'
import { EventCharts, FinalisedTable } from './exposureViews'
import type { FinalisedExposure, SportsEvent, Media, VideoMedia, StoredCSV, Competition } from '../../types'
import type { Go } from './navTypes'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(epoch: number): string {
  const d = new Date(epoch)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function scheduleLabel(start: string | null, end: string | null): string {
  const s = fmtDateTime(start)
  const e = fmtDateTime(end)
  if (s && e) return `${s} – ${e}`
  return s ?? e ?? '—'
}

// Seconds → "H:MM:SS" (or "M:SS").
function fmtClock(s: number): string {
  if (!isFinite(s)) return '—'
  const total = Math.round(s)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

// ─── small stat + chip ──────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(t => (
          <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
        ))}
      </div>
    </div>
  )
}

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ''))].sort((a, b) => a.localeCompare(b))

// ─── event details ────────────────────────────────────────────────────────────

function EventInfo({ se, location }: { se: SportsEvent; location: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-gray-50 border border-gray-100 rounded-md p-3">
      <Stat label="Sport type" value={se.sport_type || '—'} />
      <Stat label="Discipline" value={se.discipline || '—'} />
      <Stat label="Location" value={location || '—'} />
      <Stat label="Scheduled" value={scheduleLabel(se.scheduled_start, se.scheduled_end)} />
      <Stat label="Created" value={fmtDate(se.created_at)} />
      <Stat label="Updated" value={fmtDate(se.updated_at)} />
      <Stat label="Media (incl. / excl.)" value={`${se.config.media_ids.length} / ${se.config.excluded_media_ids.length}`} />
    </div>
  )
}

// ─── media panel ──────────────────────────────────────────────────────────────

function MediaCard({ item, csv }: { item: Media; csv: StoredCSV | null }) {
  const isVideo = item.type === 'video'
  const slices = isVideo ? (item as VideoMedia).timeslices : []

  return (
    <div className="border border-gray-200 rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        {isVideo ? <Film size={14} className="flex-none text-gray-400" /> : <Music size={14} className="flex-none text-gray-400" />}
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{item.label || 'Untitled media'}</span>
        <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.type}</span>
        {item.is_excluded && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
            <Ban size={10} /> excluded
          </span>
        )}
      </div>

      {csv ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pl-5">
          <span className="flex items-center gap-1"><FileText size={11} /> {csv.filename}</span>
          <span>{csv.row_count.toLocaleString()} detections</span>
          <span>{csv.frame_count.toLocaleString()} frames</span>
          <span>{fmtClock(csv.duration_s)} duration</span>
          <span className="flex items-center gap-1"><Tag size={11} /> {csv.tags.length} tags</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic pl-5">No CSV attached</p>
      )}

      {isVideo && (
        <div className="pl-5">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Clock size={11} /> {slices.length} timeslice{slices.length === 1 ? '' : 's'}
          </p>
          {slices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {slices.map((t, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    t.is_excluded ? 'border-red-200 bg-red-50 text-red-500 line-through' : 'border-gray-200 bg-gray-50 text-gray-600'
                  }`}
                  title={`${fmtClock(t.start_s)} – ${fmtClock(t.end_s)} (${fmtClock(t.duration_s)})`}
                >
                  {t.label || 'Untitled'}: {fmtClock(t.start_s)}–{fmtClock(t.end_s)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MediaPanel({ items, csvLibrary }: { items: Media[]; csvLibrary: StoredCSV[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">No media attached to this event.</p>
  }
  const byId = new Map(csvLibrary.map(f => [f.id, f]))
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500">Media ({items.length})</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map(m => (
          <MediaCard key={m.id} item={m} csv={m.csv_file_id ? byId.get(m.csv_file_id) ?? null : null} />
        ))}
      </div>
    </div>
  )
}

// ─── event card (foldable; open by default) ───────────────────────────────────

function EventCard({
  projectId, comp, se, rows, eventMedia, csvLibrary, go,
}: {
  projectId: string
  comp: Competition
  se: SportsEvent
  rows: FinalisedExposure[]
  eventMedia: Media[]
  csvLibrary: StoredCSV[]
  go: Go
}) {
  const [open, setOpen] = useState(true)
  const meta = [se.sport_type, se.discipline].filter(Boolean).join(' · ')
  const mediaCount = eventMedia.length
  // Country/City inherit from the competition when blank on the event.
  const location = [se.city || comp.city, countryName(se.country || comp.country)].filter(Boolean).join(', ')

  function exportEvent() {
    const slug = (se.name || 'event').replace(/[^\w.-]+/g, '_').toLowerCase()
    downloadCSV(`${slug}_finalised.csv`, rows.map(f => ({
      event: f.event, video_id: f.video_id, timeslice: f.timeslice_label,
      partner: f.partner, asset: f.asset, exposure_identifier: f.exposure_identifier,
      detections: f.detection_count, sif: fmt(f.sif, 4), eph: fmt(f.eph, 1),
      gross_seconds: fmt(f.gross_seconds, 2), net_seconds: fmt(f.net_seconds, 2),
      differential: fmt(f.differential, 4), note: f.note ?? '',
    })))
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-none text-gray-400 hover:text-gray-600 p-0.5"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <Activity size={15} className="text-gray-300 flex-none" />
        <div className="flex-1 min-w-0">
          <button
            onClick={() => go.event(projectId, comp.id, se.id)}
            className="text-sm font-semibold text-gray-800 hover:text-brand-600 hover:underline truncate block max-w-full"
          >
            {se.name || 'Untitled event'}
          </button>
          <p className="text-xs text-gray-400 truncate">
            {[meta, `${mediaCount} media`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={exportEvent}
            className="flex-none flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md hover:bg-gray-50"
          >
            <Download size={13} /> CSV
          </button>
        )}
      </div>

      {open && (
        <>
          <EventInfo se={se} location={location} />
          <MediaPanel items={eventMedia} csvLibrary={csvLibrary} />
          <EventCharts rows={rows} />
          <FinalisedTable rows={rows} />
        </>
      )}
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function ProjectOverview({ projectId, go }: { projectId: string; go: Go }) {
  const { projects, clients, competitions, sportsEvents, media, csv_library, getEventFinalised } = useProject()

  const project = projects.find(p => p.id === projectId)

  const comps = useMemo(
    () => competitions
      .filter(c => c.project_id === projectId)
      .sort((a, b) => (a.date_start || '').localeCompare(b.date_start || '') || a.name.localeCompare(b.name)),
    [competitions, projectId],
  )
  const compIds = useMemo(() => new Set(comps.map(c => c.id)), [comps])

  const eventsByComp = useMemo(() => {
    const map: Record<string, typeof sportsEvents> = {}
    for (const se of sportsEvents) {
      if (!compIds.has(se.competition_id)) continue
      ;(map[se.competition_id] ??= []).push(se)
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => {
        const sa = a.scheduled_start ?? ''; const sb = b.scheduled_start ?? ''
        if (sa && sb) return sa.localeCompare(sb) || a.name.localeCompare(b.name)
        if (sa) return -1; if (sb) return 1
        return a.name.localeCompare(b.name)
      })
    }
    return map
  }, [sportsEvents, compIds])

  const finalisedByEvent = useMemo(() => {
    const map: Record<string, FinalisedExposure[]> = {}
    for (const se of sportsEvents) {
      if (compIds.has(se.competition_id)) map[se.id] = getEventFinalised(se.id)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportsEvents, media, competitions, compIds, getEventFinalised])

  if (!project) {
    return <p className="text-sm text-gray-400 italic">Project not found.</p>
  }

  const clientName = clients.find(c => c.id === project.client_id)?.name ?? null
  const allEvents = comps.flatMap(c => eventsByComp[c.id] ?? [])
  const eventIds = new Set(allEvents.map(se => se.id))
  const allRows = allEvents.flatMap(se => finalisedByEvent[se.id] ?? [])

  // Totals
  const totalEph = allRows.reduce((s, f) => s + f.eph, 0)
  const totalNet = allRows.reduce((s, f) => s + f.net_seconds, 0)
  const totalGross = allRows.reduce((s, f) => s + f.gross_seconds, 0)

  // Media / CSV stats
  const projectMedia = media.filter(m => eventIds.has(m.sports_event_id))
  const videoCount = projectMedia.filter(m => m.type === 'video').length
  const audioCount = projectMedia.filter(m => m.type === 'audio').length
  const csvIds = new Set(projectMedia.map(m => m.csv_file_id).filter(Boolean) as string[])
  const csvFiles = csv_library.filter(f => csvIds.has(f.id))
  const totalDetections = csvFiles.reduce((s, f) => s + f.row_count, 0)

  // Distinct dimensions
  const partners = uniq(allRows.map(r => r.partner))
  const assets = uniq(allRows.map(r => r.asset))
  const countries = uniq(comps.map(c => c.country))
  const cities = uniq(comps.map(c => c.city))
  const sportTypes = uniq(allEvents.map(se => se.sport_type))
  const disciplines = uniq(allEvents.map(se => se.discipline))

  // Date ranges
  const compStarts = uniq(comps.map(c => c.date_start))
  const compEnds = uniq(comps.map(c => c.date_end ?? c.date_start))
  const compRange = compStarts.length
    ? `${compStarts[0]}${compEnds.length ? ` – ${compEnds[compEnds.length - 1]}` : ''}`
    : '—'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button onClick={() => go.project(projectId)} className="flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
        <ArrowLeft size={15} /> Back to project
      </button>

      {/* Project header + descriptive stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">Project Overview</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">{project.name || 'Untitled project'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clientName ? <span>{clientName}</span> : <span className="italic">No client</span>}
          </p>
          {project.description && <p className="text-sm text-gray-600 mt-2">{project.description}</p>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
          <Stat label="Created" value={fmtDate(project.created_at)} />
          <Stat label="Competition dates" value={compRange} />
          <Stat label="Competitions" value={comps.length} />
          <Stat label="Sports events" value={allEvents.length} />
          <Stat label="Media (video / audio)" value={`${videoCount} / ${audioCount}`} />
          <Stat label="All Detections" value={totalDetections.toLocaleString()} />
          <Stat label="Partners" value={partners.length} />
          <Stat label="Assets" value={assets.length} />
          <Stat label="Total EPH" value={fmt(totalEph, 1)} />
          <Stat label="Total gross s" value={fmt(totalGross, 2)} />
          <Stat label="Total net s" value={fmt(totalNet, 2)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
          <Chips label="Partners" items={partners} />
          <Chips label="Assets" items={assets} />
          <Chips label="Sport types" items={sportTypes} />
          <Chips label="Disciplines" items={disciplines} />
          <Chips label="Countries" items={countries.map(countryName)} />
          <Chips label="Cities" items={cities} />
        </div>
      </div>

      {comps.length === 0 && (
        <p className="text-sm text-gray-400 italic">This project has no competitions yet.</p>
      )}

      {/* Per-competition → per-event sections with charts + table */}
      {comps.map(comp => {
        const evs = eventsByComp[comp.id] ?? []
        const venue = [comp.city, countryName(comp.country)].filter(Boolean).join(', ')
        return (
          <div key={comp.id} className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
              <Trophy size={16} className="text-gray-400 flex-none" />
              <h2 className="text-base font-semibold text-gray-800">{comp.name || 'Untitled competition'}</h2>
              <span className="text-xs text-gray-400">
                {[venue, comp.date_start && `${comp.date_start}${comp.date_end ? ` – ${comp.date_end}` : ''}`].filter(Boolean).join(' · ')}
              </span>
            </div>

            {evs.length === 0 ? (
              <p className="text-sm text-gray-400 italic pl-6">No sports events in this competition.</p>
            ) : (
              evs.map(se => (
                <EventCard
                  key={se.id}
                  projectId={projectId}
                  comp={comp}
                  se={se}
                  rows={finalisedByEvent[se.id] ?? []}
                  eventMedia={media.filter(m => m.sports_event_id === se.id)}
                  csvLibrary={csv_library}
                  go={go}
                />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
