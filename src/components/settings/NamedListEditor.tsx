import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'

interface Item { id: string; name: string }

interface Props {
  title: string
  noun: string                 // singular, e.g. "Sport Event"
  placeholder: string
  items: Item[]
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export default function NamedListEditor({ title, noun, placeholder, items, onAdd, onRename, onDelete }: Props) {
  const [draft, setDraft] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function submit() {
    const name = draft.trim()
    if (!name) return
    onAdd(name)
    setDraft('')
  }

  const sorted = [...items].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  const target = deleteId ? items.find(i => i.id === deleteId) : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-400">{items.length} {items.length === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`}</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <button onClick={submit} disabled={!draft.trim()} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-2 rounded-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={15} /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No {noun.toLowerCase()}s yet.</p>
      ) : (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-96 overflow-auto">
          {sorted.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50">
              <input
                type="text"
                value={item.name}
                onChange={e => onRename(item.id, e.target.value)}
                className="flex-1 border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-2 py-1 text-sm bg-transparent"
              />
              <button onClick={() => setDeleteId(item.id)} className="text-gray-400 hover:text-red-600 flex-none" title={`Delete ${noun.toLowerCase()}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {target && (
        <DeleteConfirmModal
          title={`Delete ${noun.toLowerCase()}?`}
          message={`"${target.name}" will be removed.`}
          confirmLabel={`Delete ${noun.toLowerCase()}`}
          onConfirm={() => { onDelete(target.id); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
