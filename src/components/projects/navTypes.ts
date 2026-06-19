export type NavView = 'list' | 'project' | 'overview' | 'competition' | 'event'

export interface Nav {
  view: NavView
  projectId: string | null
  competitionId: string | null
}

export const LIST_NAV: Nav = { view: 'list', projectId: null, competitionId: null }

// Navigation helpers passed down to the browser sub-views.
export interface Go {
  list: () => void
  project: (projectId: string) => void
  overview: (projectId: string) => void
  competition: (projectId: string, competitionId: string) => void
  event: (projectId: string, competitionId: string, eventId: string) => void
}
