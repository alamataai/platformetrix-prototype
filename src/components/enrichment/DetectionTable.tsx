import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Image as ImageIcon } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { fmtPct, fmt, videoName, splitRawTag } from '../../lib/utils'
import type { ExclusionReason, EnrichedDetection, ProjectExposure } from '../../types'
import { resolveMediaList } from '../../lib/videos'
import FrameViewer from '../output/FrameViewer'
import InfoTip from '../common/InfoTip'
import { GLOSSARY } from '../../lib/glossary'

const PAGE_SIZE = 50

// A selection is one of the three top-level filters ('all' | 'included' | 'excluded')
// or a specific status value (an included sub-status or an exclusion reason).
// Remembered across tab switches (the table unmounts when you leave the tab).
let lastSelection = 'all'

// Exclusion reasons in Step 10 evaluation order — orders the Excluded sub-items.
const EXCLUSION_ORDER: ExclusionReason[] = [
  'NO_DETECTION', 'EXCLUDED_BY_RULE', 'VIDEO_EXCLUDED', 'TIMESLICE_EXCLUDED',
  'NO_TIMESLICE', 'BELOW_PROBABILITY', 'BELOW_THRESHOLD', 'TAG_PENDING',
]
// QA-derived sub-statuses of included detections (still in the final output), in display
// order. ADJUSTED rows stay Included; AUDITED_OUT is bucketed under Excluded (see below).
const INCLUDED_SUBSTATUSES = ['ADJUSTED'] as const

const REASON_COLORS: Record<ExclusionReason, string> = {
  // Analyst decision
  EXCLUDED_BY_RULE: 'bg-red-100 text-red-700',
  // Config gap — something the analyst needs to configure
  NO_TIMESLICE: 'bg-amber-100 text-amber-700',
  TAG_PENDING: 'bg-amber-100 text-amber-700',
  // Threshold miss — detection didn't clear a numeric bar
  BELOW_PROBABILITY: 'bg-yellow-100 text-yellow-700',
  BELOW_THRESHOLD: 'bg-yellow-100 text-yellow-700',
  // Media/timeslice exclusion — set at the media level, not per-detection
  VIDEO_EXCLUDED: 'bg-gray-100 text-gray-600',
  TIMESLICE_EXCLUDED: 'bg-gray-100 text-gray-600',
  NO_DETECTION: 'bg-gray-100 text-gray-600',
}

// QA-derived statuses for included detections (reflect changes made in the QA tab).
type QaTag = 'AUDITED_OUT' | 'ADJUSTED'
const QA_COLORS: Record<QaTag, string> = {
  AUDITED_OUT: 'bg-red-100 text-red-700',
  ADJUSTED: 'bg-amber-100 text-amber-700',
}

// Human label for a status value (QA tag, exclusion reason, or "included").
function statusLabel(s: string): string {
  if (s === 'included') return 'Included'
  if (s === 'AUDITED_OUT') return 'Audited out'
  if (s === 'ADJUSTED') return 'Adjusted'
  return s
}

type SortKey =
  | 'video_id' | 'frame_number' | 'timestamp_s' | 'seconds' | 'probability'
  | 'partner' | 'asset' | 'timeslice_label'
  | 'share_of_screen' | 'balanced_share' | 'screen_position' | 'num_tags' | 'clutter_score' | 'sif'
  | 'differential' | 'status'
type SortDir = 'asc' | 'desc'

const NUMERIC_KEYS: SortKey[] = ['frame_number', 'timestamp_s', 'seconds', 'probability', 'share_of_screen', 'balanced_share', 'num_tags', 'clutter_score', 'sif']

// Partner/Asset to show: use the cleaned values if present, else derive from the raw tag
// (tolerant of hyphen/en-dash/em-dash separators — see splitRawTag).
function displayPartner(d: EnrichedDetection): string {
  return d.partner ?? splitRawTag(d.tag).partner ?? d.tag
}
function displayAsset(d: EnrichedDetection): string {
  return d.asset ?? splitRawTag(d.tag).asset ?? '—'
}

function sortValue(d: EnrichedDetection, key: SortKey): string | number {
  if (key === 'status') return d.exclusion_reason ?? 'included'
  if (key === 'partner') return displayPartner(d)
  if (key === 'asset') return displayAsset(d)
  const v = d[key as keyof EnrichedDetection]
  return (v ?? '') as string | number
}

export default function DetectionTable() {
  const { enriched, activeSportsEvent, getFrame, media, competitions, projectExposures } = useProject()
  const [page, setPage] = useState(0)
  const [selection, setSelectionState] = useState<string>(lastSelection)
  const setSelection = (s: string) => { lastSelection = s; setSelectionState(s) }
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [viewer, setViewer] = useState<{ current: EnrichedDetection; detections: EnrichedDetection[]; file: File } | null>(null)

  // Map a detection's generated video_id back to the media's stable id (frames are keyed by media.id).
  const comp = competitions.find(c => c.id === activeSportsEvent?.competition_id)
    ?? { id: '', project_id: '', name: '', date_start: '', date_end: null, country: '', city: '', timezone: null }
  const resolvedMedia = activeSportsEvent
    ? resolveMediaList(activeSportsEvent.config.media_ids, activeSportsEvent.config.excluded_media_ids, media, activeSportsEvent, comp)
    : []
  const videoIdToMediaId = new Map(resolvedMedia.map(m => [m.video_id, m.id]))
  // Lookup map for current media label. Uses media_id (stable) when available so that
  // renamed labels show correctly without needing a Save & Re-run first.
  const mediaById = new Map(media.map(m => [m.id, m]))
  function frameFor(d: EnrichedDetection): File | undefined {
    const mediaId = videoIdToMediaId.get(d.video_id)
    return mediaId ? getFrame(mediaId, d.frame_number) : undefined
  }

  // Link each included detection to its exposure row (same key the pipeline groups by),
  // so QA changes (flag-out / differential) made in the QA tab show up here.
  const peByKey = new Map(projectExposures.map(pe => [pe.qa_key, pe]))
  const qaFor = (d: EnrichedDetection): ProjectExposure | undefined =>
    d.is_excluded ? undefined : peByKey.get(`${d.video_id}||${d.partner}||${d.asset}||${d.timeslice_label}`)
  const statusOf = (d: EnrichedDetection): string => {
    if (d.is_excluded) return d.exclusion_reason ?? 'included'
    const pe = qaFor(d)
    if (pe?.is_audited_out) return 'AUDITED_OUT'
    if (pe && Math.abs(pe.differential - 1) > 1e-9) return 'ADJUSTED'
    return 'included'
  }
  const diffOf = (d: EnrichedDetection): number | null =>
    d.is_excluded ? null : (qaFor(d)?.differential ?? 1)
  const commentsOf = (d: EnrichedDetection): string => {
    const pe = qaFor(d)
    return pe?.override_note ?? pe?.audit_flag_note ?? ''
  }

  // Status counts for the dropdown sub-items, computed across all detections.
  const statusCounts = new Map<string, number>()
  for (const d of enriched) {
    const s = statusOf(d)
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
  }
  // Audited-out rows pass Step 10 (is_excluded === false) but the analyst flagged their
  // aggregated row out of the final exposure, so we bucket them as Excluded.
  const inExcludedBucket = (d: EnrichedDetection) => d.is_excluded || statusOf(d) === 'AUDITED_OUT'
  const excludedCount = enriched.filter(inExcludedBucket).length
  const includedCount = enriched.length - excludedCount
  // Sub-items actually present in the data, in canonical order. Audited out is listed
  // after the Step-10 exclusion reasons under Excluded.
  const includedSubs = INCLUDED_SUBSTATUSES.filter(s => statusCounts.has(s))
  const excludedSubs = [
    ...EXCLUSION_ORDER.filter(s => statusCounts.has(s)),
    ...(statusCounts.has('AUDITED_OUT') ? ['AUDITED_OUT'] : []),
  ]

  // Which top-level button is highlighted for the current selection: a specific
  // status keeps its parent ('Included'/'Excluded') active so buttons stay in sync.
  const isExclusionReason = (s: string): s is ExclusionReason => s in REASON_COLORS
  const includedSelected = selection === 'included'
    || (INCLUDED_SUBSTATUSES as readonly string[]).includes(selection)
  const excludedSelected = selection === 'excluded' || isExclusionReason(selection)
    || selection === 'AUDITED_OUT'

  const filtered = enriched.filter(d => {
    if (selection === 'all') return true
    if (selection === 'included') return !inExcludedBucket(d)
    if (selection === 'excluded') return inExcludedBucket(d)
    return statusOf(d) === selection
  })

  const sorted = [...filtered]
  if (sortKey) {
    sorted.sort((a, b) => {
      let cmp: number
      if (sortKey === 'status') {
        cmp = statusOf(a).localeCompare(statusOf(b))
      } else if (sortKey === 'differential') {
        cmp = (diffOf(a) ?? -1) - (diffOf(b) ?? -1)
      } else if (NUMERIC_KEYS.includes(sortKey)) {
        cmp = (sortValue(a, sortKey) as number) - (sortValue(b, sortKey) as number)
      } else {
        cmp = String(sortValue(a, sortKey)).toLowerCase().localeCompare(String(sortValue(b, sortKey)).toLowerCase())
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  if (enriched.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm font-medium text-gray-600">No detections yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Add media and attach a CSV in <strong>2. Media &amp; Tags</strong>, then press
          {' '}<strong>Save &amp; Re-run</strong> to enrich detections.
        </p>
      </div>
    )
  }

  function SortHeader({ label, sortKey: key, term }: { label: string; sortKey: SortKey; term?: keyof typeof GLOSSARY }) {
    const active = sortKey === key
    const SortIcon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
    return (
      <th className="px-3 py-2">
        <span className="flex items-center gap-1">
          <button
            onClick={() => toggleSort(key)}
            className={`flex items-center gap-1 uppercase tracking-wide hover:text-gray-700 ${active ? 'text-gray-700' : 'text-gray-500'}`}
          >
            {label}
            <SortIcon size={12} className="flex-none" />
          </button>
          {term && <InfoTip term={term} />}
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Enriched Detections (Steps 1–10)</h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
            Each raw detection is enriched per frame.{' '}
            <span className="text-gray-400">Showing {sorted.length.toLocaleString()} of {enriched.length.toLocaleString()} rows.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <select
            value={selection}
            onChange={e => { setSelection(e.target.value); setPage(0) }}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-600 outline-none focus:border-brand-500"
            title="Filter by status"
          >
            <option value="all">All detections ({enriched.length})</option>
            <option value="included">Included ({includedCount})</option>
            {includedSubs.map(s => (
              <option key={s} value={s}>{'  '}{statusLabel(s)} ({statusCounts.get(s)})</option>
            ))}
            <option value="excluded">Excluded ({excludedCount})</option>
            {excludedSubs.map(s => (
              <option key={s} value={s}>{'  '}{statusLabel(s)} ({statusCounts.get(s)})</option>
            ))}
          </select>
          {(['all', 'included', 'excluded'] as const).map(f => {
            const active = f === 'all' ? selection === 'all'
              : f === 'included' ? includedSelected
              : excludedSelected
            let cls: string
            if (f === 'included') {
              cls = active
                ? 'bg-green-600 text-white border border-green-600'
                : 'border border-green-400 text-green-700 hover:bg-green-50'
            } else if (f === 'excluded') {
              cls = active
                ? 'bg-red-600 text-white border border-red-600'
                : 'border border-red-400 text-red-700 hover:bg-red-50'
            } else {
              cls = active
                ? 'bg-brand-600 text-white border border-brand-600'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }
            return (
              <button
                key={f}
                onClick={() => { setSelection(f); setPage(0) }}
                className={`px-3 py-1 rounded ${cls}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({
                  f === 'all' ? enriched.length :
                  f === 'included' ? includedCount :
                  excludedCount
                })
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-2 py-2"></th>
              <SortHeader label="Video" sortKey="video_id" />
              <SortHeader label="Frame" sortKey="frame_number" />
              <SortHeader label="Time (s)" sortKey="timestamp_s" />
              <SortHeader label="Duration (s)" sortKey="seconds" />
              <SortHeader label="Timeslice" sortKey="timeslice_label" term="timeslice" />
              <SortHeader label="Partner" sortKey="partner" />
              <SortHeader label="Asset" sortKey="asset" />
              <SortHeader label="Prob" sortKey="probability" term="probability" />
              <SortHeader label="SoS%" sortKey="share_of_screen" term="share_of_screen" />
              <SortHeader label="BSoS%" sortKey="balanced_share" term="balanced_share" />
              <SortHeader label="Pos" sortKey="screen_position" term="screen_position" />
              <SortHeader label="numTags" sortKey="num_tags" term="num_tags" />
              <SortHeader label="Clutter" sortKey="clutter_score" term="clutter_score" />
              <SortHeader label="SIF" sortKey="sif" term="sif" />
              <SortHeader label="Diff" sortKey="differential" term="differential" />
              <th className="px-3 py-2"><span className="flex items-center gap-1">Comments <InfoTip term="qa_status" /></span></th>
              <SortHeader label="Status" sortKey="status" term="exclusion_reason" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageData.map((d, i) => {
              const frame = frameFor(d)
              const status = statusOf(d)
              const diff = diffOf(d)
              const comments = commentsOf(d)
              const rowCls = d.is_excluded
                ? 'opacity-50 bg-gray-50 hover:bg-gray-100'
                : status === 'AUDITED_OUT' ? 'bg-red-50 hover:bg-red-100'
                : status === 'ADJUSTED' ? 'bg-amber-50 hover:bg-amber-100'
                : 'bg-white hover:bg-brand-50/60'
              return (
              <tr key={i} className={`transition-colors ${rowCls}`}>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => frame && setViewer({
                      current: d,
                      detections: enriched.filter(x => x.video_id === d.video_id && x.frame_number === d.frame_number),
                      file: frame,
                    })}
                    disabled={!frame}
                    title={frame ? 'View frame' : 'No frame loaded for this row'}
                    className={frame ? 'text-gray-400 hover:text-brand-600' : 'text-gray-200 cursor-not-allowed'}
                  >
                    <ImageIcon size={14} />
                  </button>
                </td>
                <td className="px-3 py-1.5" title={d.video_id}>
                  {d.media_id ? (mediaById.get(d.media_id)?.label ?? videoName(d.video_id)) : videoName(d.video_id)}
                </td>
                <td className="px-3 py-1.5 font-mono">{d.frame_number}</td>
                <td className="px-3 py-1.5">{fmt(d.timestamp_s, 2)}</td>
                <td className="px-3 py-1.5">{fmt(d.seconds, 2)}</td>
                <td className="px-3 py-1.5">{d.timeslice_label ?? '—'}</td>
                <td className="px-3 py-1.5 max-w-48 truncate" title={d.tag}>{displayPartner(d)}</td>
                <td className="px-3 py-1.5 max-w-32 truncate" title={d.tag}>{displayAsset(d)}</td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    d.probability >= 0.7 ? 'bg-green-100 text-green-700'
                    : d.probability >= 0.4 ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    {fmtPct(d.probability, 0)}
                  </span>
                </td>
                <td className="px-3 py-1.5">{fmtPct(d.share_of_screen, 2)}</td>
                <td className="px-3 py-1.5">{fmtPct(d.balanced_share, 2)}</td>
                <td className="px-3 py-1.5 font-mono">{d.screen_position}</td>
                <td className="px-3 py-1.5">{d.num_tags}</td>
                <td className="px-3 py-1.5">{fmt(d.clutter_score, 2)}</td>
                <td className="px-3 py-1.5 font-medium">{fmt(d.sif, 4)}</td>
                <td className="px-3 py-1.5 text-right">
                  {diff === null ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={diff < 0.70 ? 'text-red-600 font-medium' : ''}>{fmt(diff, 2)}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 max-w-40 truncate text-xs text-gray-500" title={comments}>{comments}</td>
                <td className="px-3 py-1.5">
                  {d.exclusion_reason ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${REASON_COLORS[d.exclusion_reason]}`}>
                      {d.exclusion_reason}
                    </span>
                  ) : status === 'AUDITED_OUT' ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${QA_COLORS.AUDITED_OUT}`}>AUDITED_OUT</span>
                  ) : status === 'ADJUSTED' ? (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${QA_COLORS.ADJUSTED}`}>ADJUSTED</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">included</span>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewer && (
        <FrameViewer current={viewer.current} detections={viewer.detections} file={viewer.file} onClose={() => setViewer(null)} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /> Prev</button>
          <span>Page {page + 1} of {totalPages} ({sorted.length} rows)</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50">Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  )
}
