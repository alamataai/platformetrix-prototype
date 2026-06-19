import { useState } from 'react'
import { Plus, Trash2, ChevronRight, FolderKanban } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'
import type { Go } from './navTypes'

export default function ProjectList({ go }: { go: Go }) {
  const { projects, clients, competitions, createProject, deleteProject } = useProject()
  const [draft, setDraft] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function submit() {
    const name = draft.trim()
    if (!name) return
    const created = createProject(name, '')
    setDraft('')
    go.project(created.id)
  }

  const sorted = [...projects].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? null
  const compCount = (projectId: string) => competitions.filter(c => c.project_id === projectId).length
  const target = deleteId ? projects.find(p => p.id === deleteId) : null

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          A project groups the competitions and sports events for one research engagement.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="New project name, e.g. Q1 2025 Aquatics"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={15} /> Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center">
          <FolderKanban size={28} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No projects yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your first project above to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
          {sorted.map(p => {
            const cn = clientName(p.client_id)
            const n = compCount(p.id)
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                onClick={() => go.project(p.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name || 'Untitled project'}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {cn ? <span className="text-gray-500">{cn}</span> : <span className="italic">No client</span>}
                    {p.description ? ` · ${p.description}` : ''}
                  </p>
                </div>
                <span className="flex-none text-xs text-gray-400">{n} competition{n === 1 ? '' : 's'}</span>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteId(p.id) }}
                  className="flex-none text-gray-300 hover:text-red-500 p-1"
                  title="Delete project"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight size={16} className="flex-none text-gray-300 group-hover:text-gray-500" />
              </div>
            )
          })}
        </div>
      )}

      {target && (
        <DeleteConfirmModal
          title="Delete project?"
          message={`"${target.name || 'Untitled project'}" will be removed. Its competitions become unassigned.`}
          confirmLabel="Delete project"
          onConfirm={() => { deleteProject(target.id); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
