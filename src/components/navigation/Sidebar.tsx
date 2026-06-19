import { ChevronDown, ChevronLeft, FolderKanban, Settings, Tv } from 'lucide-react'

interface Props {
  onCollapse?: () => void
  projectsActive: boolean
  onOpenProjects: () => void
  tvChannelsOpen: boolean
  onToggleTvChannels: () => void
  tvChannelsTabs: readonly { id: string; label: string }[]
  settingsOpen: boolean
  onToggleSettings: () => void
  settingsTabs: readonly { id: string; label: string }[]
  activeSettingsTab: string | null
  onSettingsTabChange: (id: string) => void
}

export default function Sidebar({
  onCollapse,
  projectsActive,
  onOpenProjects,
  tvChannelsOpen,
  onToggleTvChannels,
  tvChannelsTabs,
  settingsOpen,
  onToggleSettings,
  settingsTabs,
  activeSettingsTab,
  onSettingsTabChange,
}: Props) {
  return (
    <aside className="w-64 h-full bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {onCollapse && (
          <div className="flex justify-end mb-1">
            <button
              onClick={onCollapse}
              title="Collapse sidebar"
              className="p-1 rounded text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
          </div>
        )}
        <button
          onClick={onOpenProjects}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            projectsActive ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <FolderKanban size={16} className="flex-none" />
          Projects
        </button>
      </div>

      <div className="flex-none px-2 py-3 border-t border-gray-100 space-y-1 overflow-y-auto">
        {/* TV Channels section */}
        <button
          onClick={onToggleTvChannels}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            tvChannelsOpen ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Tv size={16} className="flex-none" />
          TV Channels
          <ChevronDown
            size={14}
            className={`ml-auto transition-transform duration-200 ${tvChannelsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {tvChannelsOpen && (
          <div className="mb-1 space-y-0.5">
            {tvChannelsTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onSettingsTabChange(tab.id)}
                className={`w-full flex items-center pl-7 pr-3 py-1.5 rounded-md text-sm transition-colors ${
                  activeSettingsTab === tab.id
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Global Settings section */}
        <button
          onClick={onToggleSettings}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            settingsOpen ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Settings size={16} className="flex-none" />
          Global Settings
          <ChevronDown
            size={14}
            className={`ml-auto transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {settingsOpen && (
          <div className="space-y-0.5">
            {settingsTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onSettingsTabChange(tab.id)}
                className={`w-full flex items-center pl-7 pr-3 py-1.5 rounded-md text-sm transition-colors ${
                  activeSettingsTab === tab.id
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
