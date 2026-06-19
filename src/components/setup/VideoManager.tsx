import { useState, useRef } from 'react'
import { Film, Music, ChevronRight, ChevronDown, Trash2, Upload, Plus, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'
import type { SportsEventTimeslice, MediaType, VideoMedia } from '../../types'
import { useProject } from '../../context/ProjectContext'
import { resolveMediaList } from '../../lib/videos'
import { parseCSV } from '../../lib/parseCSV'
import { fmt } from '../../lib/utils'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'

function estimateStorageUsedBytes(): number {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) total += (localStorage.getItem(key) ?? '').length
    }
    return total
  } catch {
    return 0
  }
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  mediaIds: string[]
  excludedIds: string[]
  onChange: (mediaIds: string[], excludedIds: string[]) => void
}

function emptyTimeslice(media_id: string, video_id: string, start_s: number): SportsEventTimeslice {
  return { media_id, video_id, label: '', start_s, end_s: 0, duration_s: 0, is_excluded: false }
}

function MediaLabelInput({
  currentLabel, onCommit,
}: { currentLabel: string; onCommit: (label: string) => void }) {
  const [draft, setDraft] = useState(currentLabel)
  const [focused, setFocused] = useState(false)
  // Sync draft if the persisted label changes while the field isn't focused
  if (!focused && draft !== currentLabel) setDraft(currentLabel)

  function commit() { onCommit(draft.trim() || currentLabel) }

  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={e => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() } }}
      className="w-full text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand-500"
    />
  )
}

interface CsvValidation {
  type: 'ok' | 'warn' | 'error'
  rowCount: number
  skippedRows: number
  issues: string[]
}

function deriveCsvValidation(csv: { row_count: number; skipped_rows: number }): CsvValidation {
  const issues: string[] = []
  if (csv.skipped_rows > 0)
    issues.push(`${csv.skipped_rows} row${csv.skipped_rows > 1 ? 's' : ''} were skipped when this file was originally uploaded.`)
  return {
    type: csv.row_count === 0 ? 'error' : issues.length > 0 ? 'warn' : 'ok',
    rowCount: csv.row_count,
    skippedRows: csv.skipped_rows,
    issues,
  }
}

function CsvStatusPanel({ validation }: { validation: CsvValidation }) {
  const { type, rowCount, issues } = validation
  if (type === 'ok') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-700">
        <CheckCircle2 size={13} className="flex-none" />
        <span>{rowCount.toLocaleString()} detections — OK</span>
      </div>
    )
  }
  if (type === 'warn') {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle size={13} className="flex-none" />
          <span>{rowCount.toLocaleString()} detections — {issues.length} warning{issues.length > 1 ? 's' : ''}</span>
        </div>
        {issues.map((msg, i) => (
          <p key={i} className="text-xs text-amber-600 pl-5">{msg}</p>
        ))}
      </div>
    )
  }
  const usedBytes = estimateStorageUsedBytes()
  const usedMB = (usedBytes / 1024 / 1024).toFixed(1)
  return (
    <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
        <XCircle size={13} className="flex-none" />
        <span>Failed to process CSV</span>
      </div>
      {issues.map((msg, i) => (
        <p key={i} className="text-xs text-red-600 pl-5">{msg}</p>
      ))}
      {usedBytes > 0 && (
        <p className="text-xs text-red-500 pl-5">Current browser storage used: ~{usedMB} MB (limit is typically 5 MB). Remove old CSVs below to free space.</p>
      )}
    </div>
  )
}

export default function VideoManager({ mediaIds, excludedIds, onChange }: Props) {
  const {
    media, addMedia, updateMedia, updateVideoTimeslices, deleteMedia,
    uploadCSVFile, deleteCSVFile, activeSportsEvent, competitions, csv_library,
  } = useProject()

  const comp = competitions.find(c => c.id === activeSportsEvent?.competition_id)
    ?? { id: '', project_id: '', name: '', date_start: '', date_end: null, country: '', city: '', timezone: null }

  const resolved = activeSportsEvent
    ? resolveMediaList(mediaIds, excludedIds, media, activeSportsEvent, comp)
    : []
  const resolvedById = new Map(resolved.map(m => [m.id, m]))

  const excluded = new Set(excludedIds)
  const [openMediaIds, setOpenMediaIds] = useState<Set<string>>(new Set())
  const [deleteSlice, setDeleteSlice] = useState<{ mediaId: string; idx: number } | null>(null)
  const [removeMediaId, setRemoveMediaId] = useState<string | null>(null)
  const [deleteCsvId, setDeleteCsvId] = useState<string | null>(null)
  const [addingLabel, setAddingLabel] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<MediaType>('video')
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [csvValidations, setCsvValidations] = useState<Record<string, CsvValidation>>({})
  const newLabelRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  function togglePanel(id: string) {
    setOpenMediaIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function commitAddMedia() {
    const label = newLabel.trim()
    if (label && activeSportsEvent) {
      addMedia(activeSportsEvent.id, label, newType)
    }
    setNewLabel('')
    setNewType('video')
    setAddingLabel(false)
  }

  function handleRemoveMedia(id: string) {
    onChange(mediaIds.filter(mid => mid !== id), excludedIds.filter(mid => mid !== id))
    deleteMedia(id)
  }

  function setExcluded(id: string, on: boolean) {
    onChange(mediaIds, on ? [...excludedIds, id] : excludedIds.filter(mid => mid !== id))
  }

  function getVideoTimeslices(mediaId: string): SportsEventTimeslice[] {
    const m = media.find(x => x.id === mediaId)
    return m?.type === 'video' ? (m as VideoMedia).timeslices : []
  }

  function addTimeslice(id: string) {
    const existing = getVideoTimeslices(id)
    const lastEnd = existing.length > 0 ? existing[existing.length - 1].end_s : 0
    const start_s = existing.length > 0 ? lastEnd + 1 : 0
    const video_id = resolvedById.get(id)?.video_id ?? ''
    updateVideoTimeslices(id, [...existing, emptyTimeslice(id, video_id, start_s)])
  }

  function removeTimeslice(mediaId: string, idx: number) {
    const existing = getVideoTimeslices(mediaId)
    updateVideoTimeslices(mediaId, existing.filter((_, i) => i !== idx))
  }

  function updateTimeslice(mediaId: string, idx: number, patch: Partial<SportsEventTimeslice>) {
    const existing = getVideoTimeslices(mediaId)
    const updated = existing.map((t, i) => {
      if (i !== idx) return t
      const merged = { ...t, ...patch }
      merged.duration_s = merged.end_s - merged.start_s
      return merged
    })
    updateVideoTimeslices(mediaId, updated)
  }

  function handleCSVUpload(mediaId: string, file: File) {
    setUploadingFor(mediaId)
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target?.result as string
      let validation: CsvValidation

      try {
        const parsed = parseCSV(content)
        const issues: string[] = []

        if (parsed.detections.length === 0) {
          issues.push('No detections found — the file parsed successfully but contains zero data rows.')
        }
        if (parsed.skippedRows > 0) {
          const sample = parsed.warnings.slice(0, 3)
          issues.push(`${parsed.skippedRows} row${parsed.skippedRows > 1 ? 's' : ''} skipped due to invalid data.`)
          issues.push(...sample)
          if (parsed.warnings.length > 3) issues.push(`…and ${parsed.warnings.length - 3} more skipped-row warnings.`)
        }

        // Sanity checks on the parsed data
        const allZeroSec = parsed.detections.length > 0 && parsed.detections.every(d => d.seconds === 0)
        if (allZeroSec) issues.push('All rows have seconds = 0 — gross exposure will be zero. Check the "seconds" column.')

        const badDims = parsed.detections.some(d => d.frame_width <= 0 || d.frame_height <= 0)
        if (badDims) issues.push('Some rows have zero or negative frame dimensions — share-of-screen will be incorrect.')

        const badBbox = parsed.detections.some(d => d.xmin >= d.xmax || d.ymin >= d.ymax)
        if (badBbox) issues.push('Some rows have degenerate bounding boxes (xmin ≥ xmax or ymin ≥ ymax).')

        const badProb = parsed.detections.filter(d => d.probability < 0 || d.probability > 1).length
        if (badProb > 0) issues.push(`${badProb} row${badProb > 1 ? 's' : ''} have probability outside [0, 1].`)

        validation = {
          type: parsed.detections.length === 0 ? 'error' : issues.length > 0 ? 'warn' : 'ok',
          rowCount: parsed.detections.length,
          skippedRows: parsed.skippedRows,
          issues,
        }
      } catch (e) {
        validation = {
          type: 'error',
          rowCount: 0,
          skippedRows: 0,
          issues: [e instanceof Error ? e.message : 'Unknown parse error.'],
        }
      }

      setCsvValidations(prev => ({ ...prev, [mediaId]: validation }))

      // Only store the file if it has at least one usable detection
      if (validation.rowCount > 0) {
        try {
          const csvId = uploadCSVFile(file.name, content)
          updateMedia(mediaId, { csv_file_id: csvId })
        } catch {
          setCsvValidations(prev => ({
            ...prev,
            [mediaId]: { ...validation, type: 'error', issues: ['Failed to store CSV — localStorage may be full.'] },
          }))
        }
      }

      setUploadingFor(null)
    }
    reader.onerror = () => {
      setCsvValidations(prev => ({
        ...prev,
        [mediaId]: { type: 'error', rowCount: 0, skippedRows: 0, issues: ['Could not read file.'] },
      }))
      setUploadingFor(null)
    }
    reader.readAsText(file)
  }

  function triggerCSVUpload(mediaId: string) {
    if (!csvInputRef.current) return
    csvInputRef.current.dataset.mediaId = mediaId
    csvInputRef.current.click()
  }

  function onCSVInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const mediaId = e.target.dataset.mediaId ?? ''
    e.target.value = ''
    if (file && mediaId) handleCSVUpload(mediaId, file)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Media & Timeslices</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Add media items for this event, attach CSV detections, then define timeslices.
          </p>
        </div>
        {!addingLabel && (
          <button
            onClick={() => { setAddingLabel(true); setTimeout(() => newLabelRef.current?.focus(), 0) }}
            className="flex-none flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-md hover:bg-brand-50 transition-colors"
          >
            <Plus size={15} /> Add Media
          </button>
        )}
      </div>

      {addingLabel && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          {newType === 'video'
            ? <Film size={15} className="text-gray-400 flex-none" />
            : <Music size={15} className="text-gray-400 flex-none" />}
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as MediaType)}
            className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-brand-500 bg-white"
          >
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
          <input
            ref={newLabelRef}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitAddMedia()
              if (e.key === 'Escape') { setNewLabel(''); setNewType('video'); setAddingLabel(false) }
            }}
            placeholder={newType === 'video' ? 'e.g. Day 1 Swimming Final' : 'e.g. Radio Broadcast Day 1'}
            className="flex-1 text-sm border border-brand-500 rounded px-2 py-1 outline-none"
          />
          <button
            onClick={commitAddMedia}
            disabled={!newLabel.trim()}
            className="text-sm font-medium text-white bg-brand-600 px-3 py-1 rounded-md hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setNewLabel(''); setNewType('video'); setAddingLabel(false) }}
            className="text-sm text-gray-500 border border-gray-200 px-3 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hidden CSV input shared across all media items */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={onCSVInputChange}
      />

      {mediaIds.length === 0 && !addingLabel && (
        <p className="text-sm text-gray-400 italic">No media added yet. Click "Add Media" to start.</p>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2">
          {resolved.map(m => {
            const isVideo = m.type === 'video'
            const slices = isVideo ? getVideoTimeslices(m.id) : []
            const isOpen = openMediaIds.has(m.id)
            const isExcluded = excluded.has(m.id)
            const csv = m.csv_file_id ? csv_library.find(f => f.id === m.csv_file_id) : null
            const isUploading = uploadingFor === m.id
            const MediaIcon = isVideo ? Film : Music

            return (
              <div key={m.id} className={`border rounded-md overflow-hidden ${isExcluded ? 'border-rose-200' : 'border-gray-200'}`}>
                {/* Media header row */}
                <div className={`flex items-center gap-2 px-3 py-2 ${isExcluded ? 'bg-rose-50/60' : 'bg-gray-50'}`}>
                  <button onClick={() => togglePanel(m.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    {isOpen
                      ? <ChevronDown size={15} className="text-gray-400 flex-none" />
                      : <ChevronRight size={15} className="text-gray-400 flex-none" />}
                    <MediaIcon size={14} className={`flex-none ${isExcluded ? 'text-rose-400' : 'text-brand-500'}`} />
                    <span className={`text-sm font-medium truncate ${isExcluded ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {m.label || 'Untitled media'}
                    </span>
                    <span className="text-xs text-gray-400 flex-none ml-1">{m.type}</span>
                    {isExcluded
                      ? <span className="text-xs text-rose-500 font-medium flex-none ml-1">Excluded</span>
                      : isVideo
                        ? <span className="text-xs text-gray-400 flex-none ml-1">{slices.length} timeslice{slices.length === 1 ? '' : 's'}</span>
                        : null}
                  </button>
                  <label className="flex items-center gap-1 text-xs flex-none cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={e => setExcluded(m.id, !e.target.checked)}
                      className="rounded"
                    />
                    <span className={isExcluded ? 'text-rose-500' : 'text-green-700'}>
                      {isExcluded ? 'Excluded' : 'Included'}
                    </span>
                  </label>
                  <button
                    onClick={() => setRemoveMediaId(m.id)}
                    className="flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 rounded px-2 py-1 hover:bg-red-50 flex-none"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>

                {isOpen && (
                  <div className="p-3 space-y-3 border-t border-gray-200">
                    {/* Label edit — local buffer; commits on blur/Enter to avoid stale video_ids */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-0.5">Label</label>
                      <MediaLabelInput
                        currentLabel={m.label}
                        onCommit={label => { if (label !== m.label) updateMedia(m.id, { label }) }}
                      />
                    </div>

                    {/* CSV section */}
                    {csv ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-500 flex-1 min-w-0">
                            <span className="font-medium text-gray-600">{csv.filename}</span>
                            <span className="text-gray-400"> &middot; {csv.row_count.toLocaleString()} rows &middot; {csv.frame_count.toLocaleString()} frames &middot; {fmt(csv.duration_s, 1)}s &middot; {fmtBytes(csv.size_bytes)}</span>
                          </p>
                          <div className="flex items-center gap-1.5 flex-none">
                            <button
                              onClick={() => triggerCSVUpload(m.id)}
                              className="text-xs text-brand-600 hover:underline"
                            >
                              Replace
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => setDeleteCsvId(csv.id)}
                              className="flex items-center gap-0.5 text-xs text-red-500 hover:text-red-700"
                              title="Remove CSV and free storage"
                            >
                              <X size={11} /> Remove
                            </button>
                          </div>
                        </div>
                        <CsvStatusPanel validation={csvValidations[m.id] ?? deriveCsvValidation(csv)} />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => triggerCSVUpload(m.id)}
                          disabled={isUploading}
                          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-md px-3 py-1.5 hover:bg-brand-50 transition-colors disabled:opacity-50"
                        >
                          {isUploading ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Processing…
                            </>
                          ) : (
                            <><Upload size={13} /> Attach CSV</>
                          )}
                        </button>
                        {csvValidations[m.id] && <CsvStatusPanel validation={csvValidations[m.id]} />}
                      </div>
                    )}

                    {/* Video ID (read-only, for reference) */}
                    <p className="text-xs text-gray-400">
                      {isVideo ? 'Video' : 'Media'} ID: <span className="font-mono text-gray-500">{m.video_id}</span>
                    </p>

                    {/* Timeslices — video only */}
                    {isVideo && (
                      <div className="rounded-md border border-gray-300 bg-gray-100 p-3 space-y-2 shadow-sm">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Timeslices</p>
                        {slices.length === 0 && <p className="text-xs text-gray-400 italic">No timeslices yet.</p>}
                        {slices.map((t, ti) => (
                          <div key={ti} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Label</label>
                              <input
                                type="text"
                                value={t.label}
                                onChange={e => updateTimeslice(m.id, ti, { label: e.target.value })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                placeholder="Final"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Start (s)</label>
                              <input
                                type="number"
                                value={t.start_s}
                                onChange={e => updateTimeslice(m.id, ti, { start_s: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">End (s)</label>
                              <input
                                type="number"
                                value={t.end_s}
                                onChange={e => updateTimeslice(m.id, ti, { end_s: parseFloat(e.target.value) || 0 })}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Duration (s)</label>
                              <input
                                type="number"
                                value={t.duration_s}
                                readOnly
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-gray-50"
                              />
                            </div>
                            <div className="flex items-center gap-2 pb-1">
                              <input
                                type="checkbox"
                                id={`incl-${m.id}-${ti}`}
                                checked={!t.is_excluded}
                                onChange={e => updateTimeslice(m.id, ti, { is_excluded: !e.target.checked })}
                                className="rounded"
                              />
                              <label htmlFor={`incl-${m.id}-${ti}`} className="text-xs text-gray-600">Included</label>
                            </div>
                            <button
                              onClick={() => setDeleteSlice({ mediaId: m.id, idx: ti })}
                              className="text-red-400 hover:text-red-600 text-xs pb-1"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addTimeslice(m.id)}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          + Add Timeslice
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {deleteCsvId && (
        <DeleteConfirmModal
          title="Remove CSV file?"
          message="The detection CSV will be permanently deleted and all its data will be lost."
          confirmLabel="Remove CSV"
          onConfirm={() => { deleteCSVFile(deleteCsvId); setDeleteCsvId(null) }}
          onCancel={() => setDeleteCsvId(null)}
        />
      )}

      {removeMediaId && resolvedById.get(removeMediaId) && (
        <DeleteConfirmModal
          title="Remove media?"
          message={`"${resolvedById.get(removeMediaId)!.label || 'This media'}" and its timeslices will be permanently removed.`}
          confirmLabel="Remove"
          onConfirm={() => { handleRemoveMedia(removeMediaId); setRemoveMediaId(null) }}
          onCancel={() => setRemoveMediaId(null)}
        />
      )}

      {deleteSlice !== null && (() => {
        const slices = getVideoTimeslices(deleteSlice.mediaId)
        const t = slices[deleteSlice.idx]
        return t ? (
          <DeleteConfirmModal
            title="Delete timeslice?"
            message={`"${t.label || 'this timeslice'}" will be removed.`}
            confirmLabel="Delete timeslice"
            onConfirm={() => { removeTimeslice(deleteSlice.mediaId, deleteSlice.idx); setDeleteSlice(null) }}
            onCancel={() => setDeleteSlice(null)}
          />
        ) : null
      })()}
    </div>
  )
}
