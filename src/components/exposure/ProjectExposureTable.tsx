import { useState } from 'react'
import { AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { fmt, fmtPct, videoName } from '../../lib/utils'
import type { ProjectExposure } from '../../types'
import InfoTip from '../common/InfoTip'
import { GLOSSARY } from '../../lib/glossary'

function EmptyState() {
  const { enriched, activeSportsEvent, media } = useProject()
  const mediaIds = new Set(activeSportsEvent?.config.media_ids ?? [])
  const hasCsvs = media.some(m => mediaIds.has(m.id) && m.csv_file_id)
  const hasDetections = enriched.length > 0

  const byReason = enriched.reduce<Record<string, number>>((acc, d) => {
    const key = d.exclusion_reason ?? 'included'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const includedCount = byReason['included'] ?? 0

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3">
      <p className="text-sm font-semibold text-amber-800">No exposure generated yet.</p>
      <ul className="text-sm text-amber-700 space-y-1 list-disc ml-4">
        {!hasCsvs && <li>No CSV files linked to this event — go to <strong>2. Media &amp; Tags</strong> and upload a file.</li>}
        {hasCsvs && !hasDetections && <li>CSV is linked but no detections loaded — try <strong>Save &amp; Re-run</strong>.</li>}
        {hasDetections && includedCount === 0 && (
          <>
            <li>All {enriched.length} detections are excluded. Breakdown:</li>
            <ul className="ml-4 list-disc space-y-0.5 text-xs">
              {byReason['NO_TIMESLICE'] ? <li><strong>{byReason['NO_TIMESLICE']}</strong> have no matching timeslice — add timeslices in <strong>2. Media &amp; Tags</strong> that cover your video timestamps.</li> : null}
              {byReason['TAG_PENDING'] ? <li><strong>{byReason['TAG_PENDING']}</strong> have pending tags — map them in tag cleaning rules in <strong>2. Media &amp; Tags</strong>.</li> : null}
              {byReason['VIDEO_EXCLUDED'] ? <li><strong>{byReason['VIDEO_EXCLUDED']}</strong> belong to a video excluded from this project.</li> : null}
              {byReason['TIMESLICE_EXCLUDED'] ? <li><strong>{byReason['TIMESLICE_EXCLUDED']}</strong> fall in an excluded timeslice.</li> : null}
              {byReason['BELOW_PROBABILITY'] ? <li><strong>{byReason['BELOW_PROBABILITY']}</strong> are below the detection probability threshold.</li> : null}
              {byReason['BELOW_THRESHOLD'] ? <li><strong>{byReason['BELOW_THRESHOLD']}</strong> are below the exposure threshold.</li> : null}
              {byReason['EXCLUDED_BY_RULE'] ? <li><strong>{byReason['EXCLUDED_BY_RULE']}</strong> are excluded by a tag cleaning rule.</li> : null}
            </ul>
          </>
        )}
        {hasDetections && includedCount > 0 && (
          <li>{includedCount} detections are included — press <strong>Save &amp; Re-run</strong> in the header.</li>
        )}
      </ul>
    </div>
  )
}

type SortKey =
  | 'video_id' | 'timeslice_label' | 'partner' | 'asset'
  | 'detection_count' | 'avg_probability' | 'sif' | 'sif_multiplier' | 'new_sif' | 'gross_seconds' | 'net_seconds' | 'eph'
type SortDir = 'asc' | 'desc'

const NUMERIC_KEYS: SortKey[] = ['detection_count', 'avg_probability', 'sif', 'sif_multiplier', 'new_sif', 'gross_seconds', 'net_seconds', 'eph']

interface DraftRow {
  differential: string
  note: string
}

export default function ProjectExposureTable() {
  const { projectExposures, updateProjectExposure } = useProject()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({})

  if (projectExposures.length === 0) return <EmptyState />

  // ── note + EPH override helpers (single Audit Note = override_note) ──────────
  const savedNote = (pe: ProjectExposure) => pe.override_note ?? pe.audit_flag_note ?? ''
  const roundedCurrent = (pe: ProjectExposure) => parseFloat(fmt(pe.eph_current, 1))

  function getDraft(pe: ProjectExposure): DraftRow {
    return drafts[pe.qa_key] ?? {
      differential: fmt(pe.differential, 2),
      note: savedNote(pe),
    }
  }
  function setDraft(pe: ProjectExposure, patch: Partial<DraftRow>) {
    setDrafts(d => ({ ...d, [pe.qa_key]: { ...getDraft(pe), ...patch } }))
  }
  function clearDraft(id: string) {
    setDrafts(d => { const n = { ...d }; delete n[id]; return n })
  }

  // The analyst now drives Differential; EPH Proposed is derived from it.
  function liveDiff(pe: ProjectExposure): number | null {
    const diff = parseFloat(getDraft(pe).differential)
    return isNaN(diff) ? null : diff
  }
  function liveProposed(pe: ProjectExposure): number | null {
    const diff = liveDiff(pe)
    return diff === null ? null : diff * roundedCurrent(pe)
  }

  function diffChanged(pe: ProjectExposure): boolean {
    const diff = parseFloat(getDraft(pe).differential)
    return !isNaN(diff) && Math.abs(diff - 1) > 0.001
  }
  function isDirty(pe: ProjectExposure): boolean {
    const d = getDraft(pe)
    return d.differential !== fmt(pe.differential, 2) || d.note.trim() !== savedNote(pe)
  }
  function canSave(pe: ProjectExposure): boolean {
    const diff = parseFloat(getDraft(pe).differential)
    if (isNaN(diff)) return false
    if (diffChanged(pe) && !getDraft(pe).note.trim()) return false   // note required when differential changes
    return true
  }

  function save(pe: ProjectExposure) {
    const d = getDraft(pe)
    const diff = parseFloat(d.differential)
    if (isNaN(diff)) return
    const base = roundedCurrent(pe)
    updateProjectExposure(pe.qa_key, {
      differential: diff,
      eph_proposed: diff * base,
      override_note: d.note.trim() || null,
    })
    clearDraft(pe.qa_key)
  }

  function resetRow(pe: ProjectExposure) {
    updateProjectExposure(pe.qa_key, { eph_proposed: null, differential: 1, override_note: null })
    clearDraft(pe.qa_key)
  }
  function canReset(pe: ProjectExposure): boolean {
    return Math.abs(pe.differential - 1) > 0.0001 || !!savedNote(pe)
  }

  function flagOut(pe: ProjectExposure) {
    const note = getDraft(pe).note.trim()
    if (!note) return   // a note is required before flagging
    updateProjectExposure(pe.qa_key, { is_audited_out: true, audit_flag_note: note, override_note: note })
    clearDraft(pe.qa_key)
  }
  function unflag(pe: ProjectExposure) {
    updateProjectExposure(pe.qa_key, { is_audited_out: false, audit_flag_note: null })
  }

  // ── sorting ──────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const q = query.trim().toLowerCase()
  const visible = q
    ? projectExposures.filter(pe =>
        pe.partner.toLowerCase().includes(q) || pe.asset.toLowerCase().includes(q) ||
        pe.video_id.toLowerCase().includes(q) || pe.timeslice_label.toLowerCase().includes(q))
    : projectExposures
  const sorted = [...visible]
  if (sortKey) {
    const numeric = NUMERIC_KEYS.includes(sortKey)
    sorted.sort((a, b) => {
      const cmp = numeric
        ? (a[sortKey] as number) - (b[sortKey] as number)
        : String(a[sortKey]).toLowerCase().localeCompare(String(b[sortKey]).toLowerCase())
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  function SortHeader({ label, sortKey: key, align = 'left', term }: { label: string; sortKey: SortKey; align?: 'left' | 'right'; term?: keyof typeof GLOSSARY }) {
    const active = sortKey === key
    const SortIcon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
    return (
      <th className="px-4 py-2">
        <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
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

  const dim = (out: boolean) => (out ? 'text-gray-400' : '')

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Project Exposure & QA (Steps 11–15)</h2>
      <p className="text-sm text-gray-500">
        Computed exposure per identifier. Set a Differential (default 1.000) to scale EPH — EPH Proposed is derived as Differential × EPH (System). You may also flag a row out of the finalised output. An audit note is required for either change.
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by partner, asset, video or timeslice…"
          className="flex-1 min-w-56 max-w-md border border-gray-300 rounded-md px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-400">
          {sorted.length.toLocaleString()} of {projectExposures.length.toLocaleString()} rows
        </span>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
              <SortHeader label="Video" sortKey="video_id" />
              <SortHeader label="Timeslice" sortKey="timeslice_label" />
              <SortHeader label="Partner" sortKey="partner" />
              <SortHeader label="Asset" sortKey="asset" />
              <SortHeader label="Detect" sortKey="detection_count" align="right" />
              <SortHeader label="Avg Prob" sortKey="avg_probability" align="right" term="probability" />
              <SortHeader label="Avg SIF" sortKey="sif" align="right" term="avg_sif" />
              <SortHeader label="New SIF" sortKey="new_sif" align="right" term="new_sif" />
              <SortHeader label="Gross Seconds" sortKey="gross_seconds" align="right" term="gross_seconds" />
              <SortHeader label="Net Seconds" sortKey="net_seconds" align="right" term="net_seconds" />
              <SortHeader label="EPH (System)" sortKey="eph" align="right" term="eph_current" />
              <th className="px-4 py-2"><span className="flex items-center gap-1">EPH Proposed <InfoTip term="eph_proposed" /></span></th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">Diff <InfoTip term="differential" /></span></th>
              <th className="px-4 py-2">Audit Note</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(pe => {
              const out = pe.is_audited_out
              const draft = getDraft(pe)
              const diff = out ? pe.differential : liveDiff(pe)
              const proposed = out ? pe.eph_proposed : liveProposed(pe)
              const lowDiff = diff !== null && diff < 0.70
              const noteRequired = diffChanged(pe)

              return (
                <tr key={pe.qa_key} className={out ? 'bg-red-50/60' : 'bg-white hover:bg-gray-50'}>
                  <td className={`px-4 py-2 ${dim(out)}`} title={pe.video_id}>{videoName(pe.video_id)}</td>
                  <td className={`px-4 py-2 ${dim(out)}`}>{pe.timeslice_label}</td>
                  <td className={`px-4 py-2 ${dim(out)}`}>{pe.partner}</td>
                  <td className={`px-4 py-2 ${dim(out)}`}>{pe.asset}</td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{pe.detection_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      out ? 'bg-gray-100 text-gray-400'
                      : pe.avg_probability >= 0.7 ? 'bg-green-100 text-green-700'
                      : pe.avg_probability >= 0.4 ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                    }`}>
                      {fmtPct(pe.avg_probability, 1)}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{fmt(pe.sif, 3)}</td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{fmt(pe.new_sif, 3)}</td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{fmt(pe.gross_seconds, 2)}</td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{fmt(pe.net_seconds, 2)}</td>
                  <td className={`px-4 py-2 text-right ${dim(out)}`}>{fmt(pe.eph_current, 1)}</td>

                  {/* EPH Proposed (derived from Differential) */}
                  <td className={`px-4 py-2 text-right font-medium ${dim(out)}`}>
                    {proposed !== null ? fmt(proposed, 1) : '—'}
                  </td>

                  {/* Differential (analyst-editable) */}
                  <td className="px-4 py-2">
                    {out ? (
                      <span className={`block text-right ${lowDiff ? 'text-red-600' : pe.differential !== 1 ? 'text-amber-600' : 'text-gray-400'}`}>{fmt(pe.differential, 2)}</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number" step="0.01"
                          value={draft.differential}
                          onChange={e => setDraft(pe, { differential: e.target.value })}
                          onBlur={e => {
                            const n = parseFloat(e.target.value)
                            if (!isNaN(n)) setDraft(pe, { differential: fmt(n, 2) })
                          }}
                          className={`border rounded px-2 py-1 text-sm w-24 text-right ${lowDiff ? 'border-red-400 text-red-600' : 'border-gray-300'}`}
                        />
                        {lowDiff && <AlertTriangle size={12} className="text-red-500 flex-none" />}
                      </div>
                    )}
                  </td>

                  {/* Single Audit Note */}
                  <td className="px-4 py-2">
                    {out ? (
                      <span className="text-xs text-gray-500 italic">{savedNote(pe)}</span>
                    ) : (
                      <input
                        type="text"
                        value={draft.note}
                        onChange={e => setDraft(pe, { note: e.target.value })}
                        placeholder={noteRequired ? 'Required' : 'Note (required to flag)'}
                        className={`border rounded px-2 py-1 text-xs w-52 ${noteRequired && !draft.note.trim() ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2">
                    {out ? (
                      <button
                        onClick={() => unflag(pe)}
                        className="px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Unflag
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => save(pe)}
                          disabled={!isDirty(pe) || !canSave(pe)}
                          className={`px-3 py-1 rounded text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                            isDirty(pe)
                              ? 'bg-brand-600 text-white hover:bg-brand-700'
                              : 'bg-gray-100 text-gray-400 border border-gray-200'
                          }`}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => resetRow(pe)}
                          disabled={!canReset(pe)}
                          className="px-3 py-1 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Reset Differential back to 1.000 (EPH Proposed = EPH System)"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => flagOut(pe)}
                          disabled={!draft.note.trim()}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Flag this row out of the finalised output (requires a note)"
                        >
                          Flag Out
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-6 text-center text-sm text-gray-400">
                  No rows match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
