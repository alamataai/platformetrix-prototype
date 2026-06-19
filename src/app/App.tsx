import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { PanelLeft, Check, RefreshCw } from 'lucide-react'
import { ProjectProvider } from '../context/ProjectContext'
import { useProject } from '../context/ProjectContext'
import Sidebar from '../components/navigation/Sidebar'
import ProjectsBrowser from '../components/projects/ProjectsBrowser'
import GlobalSettingsEditor from '../components/settings/GlobalSettingsEditor'
import NamedListEditor from '../components/settings/NamedListEditor'
import SportDisciplineEditor from '../components/settings/SportDisciplineEditor'
const ChannelsBrowser = lazy(() => import('../components/settings/ChannelsBrowser'))
const SportInterestManager = lazy(() => import('../components/settings/SportInterestManager'))
const CountriesBrowser = lazy(() => import('../components/settings/CountriesBrowser'))
import { LIST_NAV } from '../components/projects/navTypes'
import type { Nav } from '../components/projects/navTypes'

type SettingsTab = 'clients' | 'classification' | 'parameters' | 'channels' | 'sport-interest' | 'countries' | 'epg'

// Remember where the user was (which Project / Competition / Event view) across reloads.
const NAV_KEY = 'platformetrix_nav'
function loadNav(): Nav {
  try {
    const raw = localStorage.getItem(NAV_KEY)
    if (raw) {
      const n = JSON.parse(raw) as Nav
      if (n && typeof n.view === 'string') return n
    }
  } catch { /* ignore */ }
  return LIST_NAV
}

const TV_CHANNELS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'channels', label: 'Channels' },
  { id: 'epg', label: 'EPG' },
]

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'clients', label: 'Clients' },
  { id: 'classification', label: 'Sport Types & Disciplines' },
  { id: 'sport-interest', label: 'Sport Interest' },
  { id: 'parameters', label: 'Video Exposure' },
  { id: 'countries', label: 'Countries' },
]

function LoadingSpinner({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2 text-sm text-gray-400 py-10">
      <svg className="w-4 h-4 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {label}…
    </span>
  )
}

function AppLayout() {
  const {
    saveConfig, activeSportsEvent, draftConfig, config, draftSettings,
    clients, addClient, renameClient, deleteClient,
  } = useProject()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tvChannelsOpen, setTvChannelsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('clients')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [saveLabel, setSaveLabel] = useState<'idle' | 'saved'>('idle')
  const [nav, setNav] = useState<Nav>(loadNav)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist the current view, and fall back to the project list if a restored
  // event view has no active event (e.g. it was deleted in another session).
  useEffect(() => {
    try { localStorage.setItem(NAV_KEY, JSON.stringify(nav)) } catch { /* ignore */ }
  }, [nav])
  useEffect(() => {
    if (nav.view === 'event' && !activeSportsEvent) setNav(LIST_NAV)
  }, [nav.view, activeSportsEvent])

  const inEventView = nav.view === 'event'

  // Spell out exactly what is unsaved so the Save & Re-run consequence is legible.
  const changes: string[] = []
  if (inEventView && activeSportsEvent != null && saveLabel !== 'saved') {
    const sameMedia =
      JSON.stringify(draftConfig.media_ids) === JSON.stringify(config.media_ids) &&
      JSON.stringify(draftConfig.excluded_media_ids) === JSON.stringify(config.excluded_media_ids)
    if (!sameMedia) changes.push('media')
    if (JSON.stringify(draftConfig.tag_cleaning_rules) !== JSON.stringify(config.tag_cleaning_rules)) changes.push('tag rules')
    if (JSON.stringify(draftSettings) !== JSON.stringify(activeSportsEvent.settings)) changes.push('parameters')
  }
  const hasUnsavedChanges = changes.length > 0
  const changeSummary = changes.join(', ')

  function handleSave() {
    saveConfig()
    setSaveLabel('saved')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setSaveLabel('idle'), 2000)
  }

  function handleToggleSettings() {
    const willOpen = !settingsOpen
    setSettingsOpen(willOpen)
    if (willOpen && !SETTINGS_TABS.some(t => t.id === settingsTab)) {
      setSettingsTab('clients')
    }
  }

  function handleToggleTvChannels() {
    const willOpen = !tvChannelsOpen
    setTvChannelsOpen(willOpen)
    if (willOpen && !TV_CHANNELS_TABS.some(t => t.id === settingsTab)) {
      setSettingsTab('channels')
    }
  }

  function handleOpenProjects() {
    setSettingsOpen(false)
    setTvChannelsOpen(false)
    setNav(LIST_NAV)
  }

  return (
    <div className="flex flex-col h-screen bg-canvas overflow-hidden">
      <header className="flex-none bg-surface border-b border-gray-200 shadow-card z-10">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Show sidebar"
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <PanelLeft size={18} />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Platformetrix</h1>
              <p className="text-xs text-gray-400">Sponsorship Measurement Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inEventView && activeSportsEvent && (
              <div className="flex items-center gap-2">
                {hasUnsavedChanges && (
                  <span className="text-xs text-amber-600 font-medium" title={`Unsaved: ${changeSummary}`}>
                    Unsaved: {changeSummary}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  title={
                    hasUnsavedChanges
                      ? `Commit ${changeSummary} and re-run the pipeline for this event`
                      : 'Re-run the pipeline for this event'
                  }
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    saveLabel === 'saved'
                      ? 'bg-green-600 text-white'
                      : hasUnsavedChanges
                      ? 'bg-brand-600 text-white hover:bg-brand-700 ring-2 ring-brand-500/30'
                      : 'border border-brand-300 text-brand-600 bg-white hover:bg-brand-50'
                  }`}
                >
                  {saveLabel === 'saved'
                    ? <><Check size={15} className="animate-check-pop" /> Saved</>
                    : <><RefreshCw size={15} /> Save & Re-run</>}
                  {hasUnsavedChanges && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex-none overflow-hidden transition-[width] duration-300 ease-in-out ${
            sidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          <Sidebar
            onCollapse={() => setSidebarOpen(false)}
            projectsActive={!settingsOpen && !tvChannelsOpen && nav.view !== 'event'}
            onOpenProjects={handleOpenProjects}
            tvChannelsOpen={tvChannelsOpen}
            onToggleTvChannels={handleToggleTvChannels}
            tvChannelsTabs={TV_CHANNELS_TABS}
            settingsOpen={settingsOpen}
            onToggleSettings={handleToggleSettings}
            settingsTabs={SETTINGS_TABS}
            activeSettingsTab={(settingsOpen || tvChannelsOpen) ? settingsTab : null}
            onSettingsTabChange={(id) => setSettingsTab(id as SettingsTab)}
          />
        </div>
        <main className="flex-1 overflow-auto">
          {(settingsOpen || tvChannelsOpen) ? (
            <div className="max-w-4xl mx-auto px-6 py-6">
              <div key={settingsTab} className="tab-fade-in">
                {settingsTab === 'clients' && (
                  <NamedListEditor
                    title="Clients"
                    noun="Client"
                    placeholder="e.g. International Swimming Federation"
                    items={clients}
                    onAdd={addClient}
                    onRename={renameClient}
                    onDelete={deleteClient}
                  />
                )}

                {settingsTab === 'classification' && <SportDisciplineEditor />}

                {settingsTab === 'parameters' && <GlobalSettingsEditor />}

                {settingsTab === 'channels' && (
                  <Suspense fallback={<LoadingSpinner label="Loading channels" />}>
                    <ChannelsBrowser />
                  </Suspense>
                )}

                {settingsTab === 'sport-interest' && (
                  <Suspense fallback={<LoadingSpinner label="Loading" />}>
                    <SportInterestManager />
                  </Suspense>
                )}

                {settingsTab === 'countries' && (
                  <Suspense fallback={<LoadingSpinner label="Loading countries" />}>
                    <CountriesBrowser />
                  </Suspense>
                )}

                {settingsTab === 'epg' && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <span className="text-sm">EPG — coming soon</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ProjectsBrowser nav={nav} setNav={setNav} />
          )}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ProjectProvider>
      <AppLayout />
    </ProjectProvider>
  )
}
