import { useState } from 'react'
import { Plus, Trash2, ChevronRight, Trophy, LayoutDashboard } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'
import { countryName } from '../../lib/countries'
import type { Go } from './navTypes'

export default function ProjectDetail({ projectId, go }: { projectId: string; go: Go }) {
  const {
    projects, clients, competitions, sportsEvents,
    updateProject, createCompetition, deleteCompetition,
  } = useProject()

  const [newComp, setNewComp] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const project = projects.find(p => p.id === projectId)
  if (!project) {
    return <p className="text-sm text-gray-400 italic">Project not found.</p>
  }

  const comps = competitions
    .filter(c => c.project_id === projectId)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  const eventCount = (compId: string) => sportsEvents.filter(se => se.competition_id === compId).length
  const target = deleteId ? competitions.find(c => c.id === deleteId) : null

  function addComp() {
    const name = newComp.trim()
    if (!name) return
    const created = createCompetition(name, projectId)
    setNewComp('')
    go.competition(projectId, created.id)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Project attributes */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">Project Details</h2>
          <button
            onClick={() => go.overview(projectId)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-md hover:bg-brand-100"
          >
            <LayoutDashboard size={15} /> Project Overview
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Project Name</span>
          <input
            type="text"
            value={project.name}
            onChange={e => updateProject(project.id, { name: e.target.value })}
            placeholder="e.g. Q1 2025 Aquatics"
            className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Client</span>
          <select
            value={project.client_id}
            onChange={e => updateProject(project.id, { client_id: e.target.value })}
            className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
          >
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="text-xs text-gray-400 mt-1 block">Manage clients in Global Settings → Clients.</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Description</span>
          <textarea
            value={project.description}
            onChange={e => updateProject(project.id, { description: e.target.value })}
            rows={6}
            placeholder="Optional notes about this engagement"
            className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500 resize-y min-h-[8rem]"
          />
        </label>
      </div>

      {/* Competitions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Competitions</h2>
          <span className="text-xs text-gray-400">{comps.length} total</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newComp}
            onChange={e => setNewComp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addComp() }}
            placeholder="New competition name, e.g. Euro Aquatics 2024"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            onClick={addComp}
            disabled={!newComp.trim()}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {comps.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Trophy size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-600">No competitions yet</p>
            <p className="text-sm text-gray-400 mt-0.5">Add one above to get started.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100 overflow-hidden">
            {comps.map(c => {
              const subtitle = [c.city, countryName(c.country)].filter(Boolean).join(', ')
              const n = eventCount(c.id)
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => go.competition(projectId, c.id)}
                >
                  <Trophy size={15} className="flex-none text-gray-300" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name || 'Untitled competition'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {subtitle || <span className="italic">No venue set</span>}
                      {c.date_start ? ` · ${c.date_start}${c.date_end ? ` – ${c.date_end}` : ''}` : ''}
                    </p>
                  </div>
                  <span className="flex-none text-xs text-gray-400">{n} event{n === 1 ? '' : 's'}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteId(c.id) }}
                    className="flex-none text-gray-300 hover:text-red-500 p-1"
                    title="Delete competition"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={16} className="flex-none text-gray-300 group-hover:text-gray-500" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {target && (
        <DeleteConfirmModal
          title="Delete competition?"
          message={`"${target.name || 'Untitled competition'}" will be removed. Its sports events become unassigned.`}
          confirmLabel="Delete competition"
          onConfirm={() => { deleteCompetition(target.id); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
