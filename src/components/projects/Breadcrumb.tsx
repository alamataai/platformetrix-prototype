import { ChevronRight, FolderKanban } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import type { Nav, Go } from './navTypes'

interface Crumb {
  label: string
  onClick?: () => void   // omitted = current (non-clickable) crumb
}

export default function Breadcrumb({ nav, go }: { nav: Nav; go: Go }) {
  const { projects, competitions, activeSportsEvent } = useProject()

  const competition = nav.competitionId ? competitions.find(c => c.id === nav.competitionId) ?? null : null
  // Prefer the explicit nav projectId; fall back to the competition's parent (e.g. after import).
  const projectId = nav.projectId ?? competition?.project_id ?? null
  const project = projectId ? projects.find(p => p.id === projectId) ?? null : null

  const crumbs: Crumb[] = [
    { label: 'Projects', onClick: nav.view === 'list' ? undefined : go.list },
  ]

  if (project) {
    crumbs.push({
      label: project.name || 'Untitled project',
      onClick: nav.view === 'project' ? undefined : () => go.project(project.id),
    })
  }
  if (nav.view === 'overview') {
    crumbs.push({ label: 'Overview' })
  }
  if (competition) {
    crumbs.push({
      label: competition.name || 'Untitled competition',
      onClick: nav.view === 'competition' ? undefined : () => go.competition(competition.project_id, competition.id),
    })
  }
  if (nav.view === 'event' && activeSportsEvent) {
    crumbs.push({ label: activeSportsEvent.name || 'Untitled event' })
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
      <FolderKanban size={15} className="text-gray-400 flex-none" />
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={13} className="text-gray-300 flex-none" />}
          {c.onClick ? (
            <button onClick={c.onClick} className="hover:text-brand-600 hover:underline truncate max-w-[14rem]">
              {c.label}
            </button>
          ) : (
            <span className="font-medium text-gray-700 truncate max-w-[14rem]">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
