import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, BarChart2, Edit3, X } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import { INTEREST_COUNTRIES } from '../../config/sportCountryInterest'
import { rankCountriesForEntry, rankEntriesForCountry, nonZeroCountryCount } from '../../lib/sportInterest'
import type { SportDiscipline, SportInterestEntry } from '../../types'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1F1E6 - 0x41
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0),
    base + code.toUpperCase().charCodeAt(1),
  )
}

function disciplineLabel(d: SportDiscipline): string {
  return `${d.sport_type} / ${d.discipline}`
}

// ─── Add Entry Modal ──────────────────────────────────────────────────────────

interface AddEntryModalProps {
  onSave: (label: string) => void
  onClose: () => void
}

function AddEntryModal({ onSave, onClose }: AddEntryModalProps) {
  const [label, setLabel] = useState('')

  const handleSave = () => {
    if (!label.trim()) return
    onSave(label.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[420px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">Add Interest Entry</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label <span className="text-red-500">*</span></label>
            <input
              autoFocus
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && label.trim()) handleSave() }}
              placeholder="e.g. E-sports"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <p className="text-xs text-gray-400">
            Link disciplines via <span className="font-medium text-gray-600">Sport Types &amp; Disciplines</span>. Country interest can be added via &ldquo;Edit Interest&rdquo;.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!label.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Scores Modal ────────────────────────────────────────────────────────

interface EditScoresModalProps {
  entry: SportInterestEntry
  onSave: (scores: Record<string, number>, last_updated: string) => void
  onClose: () => void
}

function EditScoresModal({ entry, onSave, onClose }: EditScoresModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const c of INTEREST_COUNTRIES) {
      d[c.code] = entry.scores[c.code] !== undefined ? (entry.scores[c.code] * 100).toFixed(1) : ''
    }
    return d
  })

  const handleSave = () => {
    const scores: Record<string, number> = {}
    for (const [code, val] of Object.entries(draft)) {
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) scores[code] = Math.min(1, Math.max(0, n / 100))
    }
    onSave(scores, new Date().toISOString().slice(0, 10))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Edit Interest</h3>
            <p className="text-xs text-gray-500 mt-0.5">{entry.label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-2 py-1.5 font-medium">Country</th>
                <th className="px-2 py-1.5 font-medium w-32">Interest</th>
              </tr>
            </thead>
            <tbody>
              {INTEREST_COUNTRIES.map(c => (
                <tr key={c.code} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-2 py-1">{flagEmoji(c.code)} {c.name}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={draft[c.code] ?? ''}
                        onChange={e => setDraft(prev => ({ ...prev, [c.code]: e.target.value }))}
                        placeholder="0.0"
                        className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Manage view ──────────────────────────────────────────────────────────────

interface ManageViewProps {
  entries: SportInterestEntry[]
  onChange: (entries: SportInterestEntry[]) => void
  disciplinesByEntry: Map<string, SportDiscipline[]>
  unmappedCount: number
}

function ManageView({ entries, onChange, disciplinesByEntry, unmappedCount }: ManageViewProps) {
  const [editScoresFor, setEditScoresFor] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const update = useCallback((id: string, patch: Partial<SportInterestEntry>) => {
    onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [entries, onChange])

  const deleteEntry = useCallback((id: string) => {
    onChange(entries.filter(e => e.id !== id))
  }, [entries, onChange])

  const handleAdd = (label: string) => {
    const newEntry: SportInterestEntry = {
      id: crypto.randomUUID(),
      label,
      scores: {},
      last_updated: null,
    }
    onChange([newEntry, ...entries])
    setShowAddModal(false)
  }

  const entryForModal = editScoresFor ? entries.find(e => e.id === editScoresFor) ?? null : null

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          {unmappedCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
              {unmappedCount} unmapped
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-md hover:bg-brand-700"
        >
          <Plus size={12} /> Add entry
        </button>
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="px-3 py-2 font-medium w-44">Label</th>
              <th className="px-3 py-2 font-medium w-24">Countries</th>
              <th className="px-3 py-2 font-medium">Disciplines</th>
              <th className="px-3 py-2 font-medium w-28">Last updated</th>
              <th className="px-3 py-2 font-medium w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map(entry => {
              const count = nonZeroCountryCount(entry)
              const linked = disciplinesByEntry.get(entry.id) ?? []
              return (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      value={entry.label}
                      onChange={e => update(entry.id, { label: e.target.value })}
                      placeholder="Sport label..."
                      className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${count > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {count} {count === 1 ? 'country' : 'countries'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {linked.length === 0 ? (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        Unmapped
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {linked.map(d => (
                          <span key={d.id} title={disciplineLabel(d)} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs whitespace-nowrap">
                            {disciplineLabel(d)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {entry.last_updated ?? <span className="italic">never</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditScoresFor(entry.id)}
                        title="Edit interest"
                        className="p-1 text-gray-400 hover:text-blue-600 rounded"
                      >
                        <BarChart2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(entry.id)}
                        title="Delete"
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {showAddModal && (
        <AddEntryModal
          onSave={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {deleteTargetId && (
        <DeleteConfirmModal
          title="Delete interest entry?"
          message={`"${entries.find(e => e.id === deleteTargetId)?.label ?? 'This entry'}" and all its country scores will be removed.`}
          confirmLabel="Delete entry"
          onConfirm={() => { deleteEntry(deleteTargetId); setDeleteTargetId(null) }}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}

      {entryForModal && (
        <EditScoresModal
          entry={entryForModal}
          onSave={(scores, last_updated) => {
            update(editScoresFor!, { scores, last_updated })
            setEditScoresFor(null)
          }}
          onClose={() => setEditScoresFor(null)}
        />
      )}
    </>
  )
}

// ─── Explore view ─────────────────────────────────────────────────────────────

interface ExploreViewProps {
  entries: SportInterestEntry[]
  disciplinesByEntry: Map<string, SportDiscipline[]>
}

function ExploreView({ entries, disciplinesByEntry }: ExploreViewProps) {
  const [mode, setMode] = useState<'country' | 'sport'>('country')
  const [selectedCountry, setSelectedCountry] = useState(INTEREST_COUNTRIES[0]?.code ?? '')
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '')

  const byCountry = useMemo(
    () => rankEntriesForCountry(entries, selectedCountry),
    [entries, selectedCountry],
  )

  const selectedEntry = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const byLabel = useMemo(
    () => selectedEntry ? rankCountriesForEntry(selectedEntry, INTEREST_COUNTRIES) : [],
    [selectedEntry],
  )

  const maxScore = mode === 'country' ? (byCountry[0]?.score ?? 1) : (byLabel[0]?.score ?? 1)

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
        {(['country', 'sport'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-md transition-colors ${mode === m ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {m === 'country' ? 'By Country' : 'By Sport'}
          </button>
        ))}
      </div>

      {mode === 'country' && (
        <>
          <select
            value={selectedCountry}
            onChange={e => setSelectedCountry(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {INTEREST_COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
            ))}
          </select>
          {byCountry.length === 0 ? (
            <p className="text-sm text-gray-400">No interest data for this country.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 font-medium w-6">#</th>
                  <th className="py-1.5 font-medium">Sport</th>
                  <th className="py-1.5 font-medium">Disciplines</th>
                  <th className="py-1.5 font-medium w-48">Interest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byCountry.map(({ entry, score }, i) => {
                  const linked = disciplinesByEntry.get(entry.id) ?? []
                  return (
                    <tr key={entry.id}>
                      <td className="py-1.5 text-xs text-gray-400">{i + 1}</td>
                      <td className="py-1.5 font-medium text-gray-800">{entry.label}</td>
                      <td className="py-1.5">
                        {linked.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {linked.map(d => (
                              <span key={d.id} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{disciplineLabel(d)}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600">Unmapped</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round((score / maxScore) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-600 tabular-nums w-10 text-right">{(score * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {mode === 'sport' && (
        <>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {entries.map(e => (
              <option key={e.id} value={e.id}>{e.label || '(unnamed)'}</option>
            ))}
          </select>
          {selectedEntry && (() => {
            const linked = disciplinesByEntry.get(selectedEntry.id) ?? []
            return linked.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {linked.map(d => (
                  <span key={d.id} className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{disciplineLabel(d)}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">No disciplines linked. Set links in Sport Types &amp; Disciplines.</p>
            )
          })()}
          {byLabel.length === 0 ? (
            <p className="text-sm text-gray-400">No interest data for this sport.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 font-medium w-6">#</th>
                  <th className="py-1.5 font-medium">Country</th>
                  <th className="py-1.5 font-medium w-48">Interest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byLabel.map(({ code, name, score }, i) => (
                  <tr key={code}>
                    <td className="py-1.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="py-1.5">{flagEmoji(code)} <span className="font-medium text-gray-800">{name}</span></td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round((score / maxScore) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 tabular-nums w-10 text-right">{(score * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SportInterestManager() {
  const { sportInterestEntries, setSportInterestEntries, sportDisciplines } = useProject()
  const [view, setView] = useState<'manage' | 'explore'>('manage')

  const disciplinesByEntry = useMemo(() => {
    const map = new Map<string, SportDiscipline[]>()
    for (const d of sportDisciplines) {
      if (!d.interest_id) continue
      if (!map.has(d.interest_id)) map.set(d.interest_id, [])
      map.get(d.interest_id)!.push(d)
    }
    return map
  }, [sportDisciplines])

  const unmappedCount = sportInterestEntries.filter(e => !disciplinesByEntry.has(e.id) || disciplinesByEntry.get(e.id)!.length === 0).length

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Sport Interest by Country</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Audience interest (0–1) per sport and country. Link disciplines via Sport Types &amp; Disciplines.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs flex-shrink-0">
          {(['manage', 'explore'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v === 'manage' ? (
                <span className="flex items-center gap-1.5"><Edit3 size={11} /> Manage</span>
              ) : (
                <span className="flex items-center gap-1.5"><BarChart2 size={11} /> Explore</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {view === 'manage' ? (
        <ManageView
          entries={sportInterestEntries}
          onChange={setSportInterestEntries}
          disciplinesByEntry={disciplinesByEntry}
          unmappedCount={unmappedCount}
        />
      ) : (
        <ExploreView
          entries={sportInterestEntries}
          disciplinesByEntry={disciplinesByEntry}
        />
      )}
    </div>
  )
}
