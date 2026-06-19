import { useState } from 'react'
import { useProject } from '../../context/ProjectContext'
import EventDetails from '../setup/ProjectSetup'
import CSVUploader from '../upload/CSVUploader'
import DetectionTable from '../enrichment/DetectionTable'
import ProjectExposureTable from '../exposure/ProjectExposureTable'
import FinalisedExposureTable from '../output/FinalisedExposureTable'

type Tab = 'setup' | 'upload' | 'detections' | 'project-exposure' | 'finalised'

const TABS: { id: Tab; label: string }[] = [
  { id: 'setup', label: '1. Event Details' },
  { id: 'upload', label: '2. Media & Tags' },
  { id: 'detections', label: '3. Detections' },
  { id: 'project-exposure', label: '4. Project Exposure & QA' },
  { id: 'finalised', label: '5. Finalised' },
]

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('setup')
  const {
    activeSportsEvent, parseMeta, enriched, projectExposures,
    config, draftConfig, draftSettings,
  } = useProject()

  if (!activeSportsEvent) return null

  const includedCount = enriched.filter(d => !d.is_excluded).length
  const excludedCount = enriched.length - includedCount

  // Per-tab unsaved-changes badges: Event Details edits draft_settings; Media & Tags edits draft_config.
  const settingsDirty = JSON.stringify(draftSettings) !== JSON.stringify(activeSportsEvent.settings)
  const configDirty = JSON.stringify(draftConfig) !== JSON.stringify(config)
  const dirtyTabs: Partial<Record<Tab, boolean>> = { setup: settingsDirty, upload: configDirty }

  return (
    <div className="min-h-full bg-gray-50">
      <nav className="px-6 pt-3 bg-gray-50">
        {/* Parse stats — integrated into the gray tab area, no separate white band */}
        {parseMeta && (
          <div className="flex flex-wrap gap-5 text-xs text-brand-700 pb-2">
            <span><strong>{parseMeta.rowCount}</strong> rows parsed</span>
            <span className="text-green-700"><strong>{includedCount}</strong> included</span>
            <span className="text-gray-500"><strong>{excludedCount}</strong> excluded</span>
            {parseMeta.skippedRows > 0 && (
              <span className="text-amber-600"><strong>{parseMeta.skippedRows}</strong> skipped</span>
            )}
            <span><strong>{projectExposures.length}</strong> exposure rows</span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={dirtyTabs[tab.id] ? 'Unsaved changes — use Save & Re-run' : undefined}
              className={`relative px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white border border-b-white border-gray-200 text-brand-700 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {dirtyTabs[tab.id] && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full" title="Unsaved changes" />
              )}
            </button>
          ))}
        </div>

        {/* Pipeline warnings — below tab bar, collapsed by default */}
        {parseMeta && parseMeta.warnings.length > 0 && (
          <details className="text-xs text-amber-700 py-1.5">
            <summary className="cursor-pointer hover:text-amber-900 select-none">
              {parseMeta.warnings.length} pipeline warning{parseMeta.warnings.length > 1 ? 's' : ''} — click to expand
            </summary>
            <ul className="mt-1 space-y-0.5 pl-3 list-disc text-amber-600 pb-1">
              {parseMeta.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
              {parseMeta.warnings.length > 20 && (
                <li className="text-amber-500">…and {parseMeta.warnings.length - 20} more</li>
              )}
            </ul>
          </details>
        )}
      </nav>

      {/* Tab content */}
      <div key={activeTab} className="px-6 py-6 tab-fade-in">
        {activeTab === 'setup' && <EventDetails />}
        {activeTab === 'upload' && <CSVUploader />}
        {activeTab === 'detections' && <DetectionTable />}
        {activeTab === 'project-exposure' && <ProjectExposureTable />}
        {activeTab === 'finalised' && <FinalisedExposureTable />}
      </div>
    </div>
  )
}
