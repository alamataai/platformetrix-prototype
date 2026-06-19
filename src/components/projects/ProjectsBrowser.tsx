import { useMemo, lazy, Suspense } from 'react'
import { useProject } from '../../context/ProjectContext'
import AppShell from '../layout/AppShell'
import Breadcrumb from './Breadcrumb'
import ProjectList from './ProjectList'
import ProjectDetail from './ProjectDetail'
import CompetitionDetail from './CompetitionDetail'
import type { Nav, Go } from './navTypes'

// Lazy-loaded: pulls in recharts, so it stays out of the initial bundle.
const ProjectOverview = lazy(() => import('./ProjectOverview'))

export default function ProjectsBrowser({ nav, setNav }: { nav: Nav; setNav: (n: Nav) => void }) {
  const { setActiveSportsEvent } = useProject()

  const go: Go = useMemo(() => ({
    list: () => setNav({ view: 'list', projectId: null, competitionId: null }),
    project: (projectId) => setNav({ view: 'project', projectId, competitionId: null }),
    overview: (projectId) => setNav({ view: 'overview', projectId, competitionId: null }),
    competition: (projectId, competitionId) => setNav({ view: 'competition', projectId, competitionId }),
    event: (projectId, competitionId, eventId) => {
      setActiveSportsEvent(eventId)
      setNav({ view: 'event', projectId, competitionId })
    },
  }), [setNav, setActiveSportsEvent])

  return (
    <div className="min-h-full">
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <Breadcrumb nav={nav} go={go} />
      </div>

      {nav.view === 'event' ? (
        <AppShell />
      ) : (
        <div className="px-6 py-6">
          {nav.view === 'list' && <ProjectList go={go} />}
          {nav.view === 'project' && nav.projectId && <ProjectDetail projectId={nav.projectId} go={go} />}
          {nav.view === 'overview' && nav.projectId && (
            <Suspense fallback={
              <span className="flex items-center gap-2 text-sm text-gray-400 py-10">
                <svg className="w-4 h-4 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading overview…
              </span>
            }>
              <ProjectOverview projectId={nav.projectId} go={go} />
            </Suspense>
          )}
          {nav.view === 'competition' && nav.projectId && nav.competitionId && (
            <CompetitionDetail projectId={nav.projectId} competitionId={nav.competitionId} go={go} />
          )}
        </div>
      )}
    </div>
  )
}
