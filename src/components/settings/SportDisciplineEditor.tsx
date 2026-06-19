import { useState, useMemo } from 'react'
import { Plus, Trash2, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'

// ─── Add Row Modal ────────────────────────────────────────────────────────────

interface AddRowModalProps {
  knownTypes: string[]
  sportInterestEntries: { id: string; label: string }[]
  onSave: (sport_type: string, discipline: string, interest_id: string | null) => void
  onClose: () => void
}

function AddRowModal({ knownTypes, sportInterestEntries, onSave, onClose }: AddRowModalProps) {
  const [newType, setNewType] = useState('')
  const [newDiscipline, setNewDiscipline] = useState('')
  const [newInterestId, setNewInterestId] = useState('')

  const canSave = newType.trim() !== '' && newDiscipline.trim() !== ''

  function handleSave() {
    if (!canSave) return
    onSave(newType.trim(), newDiscipline.trim(), newInterestId || null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[480px] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">Add Row</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sport Type <span className="text-red-500">*</span></label>
            <input
              autoFocus
              type="text"
              list="add-modal-sport-types"
              value={newType}
              onChange={e => setNewType(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g. Water Sports"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <datalist id="add-modal-sport-types">
              {knownTypes.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discipline <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={newDiscipline}
              onChange={e => setNewDiscipline(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g. Swimming"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Interest entry <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <select
              value={newInterestId}
              onChange={e => setNewInterestId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">— None —</option>
              {sportInterestEntries.map(e => (
                <option key={e.id} value={e.id}>{e.label || '(unnamed)'}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add row
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SportDisciplineEditor() {
  const {
    sportDisciplines, addSportDiscipline, updateSportDiscipline, deleteSportDiscipline,
    sportInterestEntries,
  } = useProject()

  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortKey, setSortKey] = useState<'sport_type' | 'discipline' | null>('sport_type')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function toggleSort(key: 'sport_type' | 'discipline') {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else { setSortKey(null); setSortDir('asc') }
  }

  const knownTypes = useMemo(
    () => [...new Set(sportDisciplines.map(r => r.sport_type))].sort((a, b) => a.localeCompare(b)),
    [sportDisciplines],
  )

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return [...sportDisciplines]
      .filter(r => {
        if (typeFilter && r.sport_type !== typeFilter) return false
        if (!q) return true
        return r.sport_type.toLowerCase().includes(q) || r.discipline.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (!sortKey) return 0
        const primary = sortKey === 'sport_type'
          ? a.sport_type.localeCompare(b.sport_type)
          : a.discipline.localeCompare(b.discipline)
        const result = sortDir === 'asc' ? primary : -primary
        if (result !== 0) return result
        return sortKey === 'sport_type'
          ? a.discipline.localeCompare(b.discipline)
          : a.sport_type.localeCompare(b.sport_type)
      })
  }, [sportDisciplines, filter, typeFilter, sortKey, sortDir])

  const target = deleteId ? sportDisciplines.find(r => r.id === deleteId) : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Sport Types &amp; Disciplines</h2>
          <p className="text-xs text-gray-500 mt-0.5">Each row is a Discipline under a Sport Type. Used to classify videos in the Video Library.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-400">{sportDisciplines.length} {sportDisciplines.length === 1 ? 'row' : 'rows'}</span>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-md hover:bg-brand-700"
          >
            <Plus size={12} /> Add row
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white text-gray-700"
        >
          <option value="">All sport types</option>
          {knownTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by discipline..."
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {sportDisciplines.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No sport types yet. Add one above.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No rows match &ldquo;{filter}&rdquo;.</p>
      ) : (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  {(['sport_type', 'discipline'] as const).map(key => {
                    const active = sortKey === key
                    const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
                    return (
                      <th key={key} className="px-3 py-2 font-medium">
                        <button
                          onClick={() => toggleSort(key)}
                          title={active ? (sortDir === 'asc' ? 'Sort descending' : 'Clear sort') : 'Sort ascending'}
                          className={`flex items-center gap-1 hover:text-gray-700 transition-colors ${active ? 'text-gray-700' : ''}`}
                        >
                          {key === 'sport_type' ? 'Sport Type' : 'Discipline'}
                          <Icon size={12} className="flex-none" />
                        </button>
                      </th>
                    )
                  })}
                  <th className="px-3 py-2 font-medium">Interest entry</th>
                  <th className="px-3 py-2 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={r.sport_type}
                        list="sport-type-options"
                        onChange={e => updateSportDiscipline(r.id, { sport_type: e.target.value })}
                        className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-400 rounded px-1 py-0.5"
                      />
                      <datalist id="sport-type-options">
                        {knownTypes.map(t => <option key={t} value={t} />)}
                      </datalist>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={r.discipline}
                        onChange={e => updateSportDiscipline(r.id, { discipline: e.target.value })}
                        className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-400 rounded px-1 py-0.5"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.interest_id ?? ''}
                        onChange={e => updateSportDiscipline(r.id, { interest_id: e.target.value || null })}
                        className={`w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-400 rounded px-1 py-0.5 ${r.interest_id ? 'text-brand-700 font-medium' : 'text-gray-600'}`}
                      >
                        <option value="">— none —</option>
                        {sportInterestEntries.map(e => (
                          <option key={e.id} value={e.id}>{e.label || '(unnamed)'}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => setDeleteId(r.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Delete row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddRowModal
          knownTypes={knownTypes}
          sportInterestEntries={sportInterestEntries}
          onSave={(sport_type, discipline, interest_id) => {
            addSportDiscipline(sport_type, discipline, interest_id)
            setSortKey(null)
            setShowAddModal(false)
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {target && (
        <DeleteConfirmModal
          title="Delete row?"
          message={`"${target.sport_type} · ${target.discipline}" will be removed.`}
          confirmLabel="Delete row"
          onConfirm={() => { deleteSportDiscipline(target.id); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
