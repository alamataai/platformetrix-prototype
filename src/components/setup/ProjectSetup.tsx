import { useState, useEffect, lazy, Suspense } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import GlobalSettingsEditor from '../settings/GlobalSettingsEditor'
import CountrySelect from './CountrySelect'
import TimezoneField from './TimezoneField'
import { defaultZonesForCountry } from '../../lib/timezone'

// Charts pull in recharts — load lazily so it stays out of the initial bundle.
const EventStats = lazy(() => import('../projects/exposureViews'))

export default function EventDetails() {
  const {
    draftSettings, setDraftProjectSettings, globalSettings,
    activeSportsEvent, updateSportsEventMeta, renameSportsEvent,
    sportDisciplines, competitions, finalised,
  } = useProject()

  const [showParams, setShowParams] = useState(false)

  useEffect(() => {
    if (!showParams) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowParams(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showParams])

  if (!activeSportsEvent) return null

  const sportTypes = [...new Set(sportDisciplines.map(d => d.sport_type))].sort()
  const disciplines = sportDisciplines
    .filter(d => d.sport_type === activeSportsEvent.sport_type)
    .map(d => d.discipline)
    .sort()

  const competition = competitions.find(c => c.id === activeSportsEvent.competition_id) ?? null
  const inheritedCountry = competition?.country ?? ''
  const inheritedCity = competition?.city ?? ''

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-800">Event Details</h3>
          <button
            onClick={() => setShowParams(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-md hover:bg-brand-100"
            title="Edit exposure parameters, clutter & position scores for this event"
          >
            <SlidersHorizontal size={15} /> Event Parameters
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Event Name</span>
          <input
            type="text"
            value={activeSportsEvent.name}
            onChange={e => renameSportsEvent(activeSportsEvent.id, e.target.value)}
            placeholder="e.g. 100m Freestyle Final"
            className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Sport Type</span>
            <select
              value={activeSportsEvent.sport_type}
              onChange={e => updateSportsEventMeta(activeSportsEvent.id, {
                sport_type: e.target.value,
                discipline: '',
              })}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
            >
              <option value="">Select sport type</option>
              {sportTypes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Discipline</span>
            <select
              value={activeSportsEvent.discipline}
              onChange={e => updateSportsEventMeta(activeSportsEvent.id, { discipline: e.target.value })}
              disabled={!activeSportsEvent.sport_type || disciplines.length === 0}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 outline-none bg-white focus:border-brand-500 disabled:opacity-50"
            >
              <option value="">Select discipline</option>
              {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Scheduled Start</span>
            <input
              type="datetime-local"
              value={activeSportsEvent.scheduled_start ?? ''}
              onChange={e => updateSportsEventMeta(activeSportsEvent.id, { scheduled_start: e.target.value || null })}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Scheduled End</span>
            <input
              type="datetime-local"
              value={activeSportsEvent.scheduled_end ?? ''}
              onChange={e => updateSportsEventMeta(activeSportsEvent.id, { scheduled_end: e.target.value || null })}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Country</span>
            <CountrySelect
              value={activeSportsEvent.country}
              inheritFrom={inheritedCountry}
              onChange={code => {
                // Setting an event country auto-resolves a single-zone override; '' = inherit.
                const zones = code ? defaultZonesForCountry(code) : []
                updateSportsEventMeta(activeSportsEvent.id, {
                  country: code,
                  timezone: zones.length === 1 ? zones[0] : null,
                })
              }}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">City</span>
            <input
              type="text"
              value={activeSportsEvent.city}
              onChange={e => updateSportsEventMeta(activeSportsEvent.id, { city: e.target.value })}
              placeholder={inheritedCity ? `Inherited: ${inheritedCity}` : 'e.g. Berlin'}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none bg-white focus:border-brand-500"
            />
          </label>
        </div>

        <label className="block max-w-md">
          <span className="text-xs font-medium text-gray-500">Venue Timezone</span>
          <TimezoneField
            countryCode={activeSportsEvent.country || inheritedCountry}
            value={activeSportsEvent.timezone}
            inheritFrom={competition?.timezone ?? null}
            onChange={tz => updateSportsEventMeta(activeSportsEvent.id, { timezone: tz })}
          />
        </label>
        <p className="text-xs text-gray-400">Leave Country / City / Timezone blank to inherit from the competition.</p>
      </div>

      {/* Event statistics (same charts + finalised table as Project Overview) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-800">Event Statistics</h3>
        <Suspense fallback={<p className="text-sm text-gray-400">Loading charts…</p>}>
          <EventStats rows={finalised} />
        </Suspense>
      </div>

      {/* Event parameters modal */}
      {showParams && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-auto"
          onMouseDown={() => setShowParams(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
              <h2 className="text-base font-semibold text-gray-800">Event Parameters</h2>
              <button onClick={() => setShowParams(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-400">
                Changes apply when you press <strong>Save &amp; Re-run</strong> in the header.
              </p>
              <GlobalSettingsEditor
                value={draftSettings}
                onChangeDraft={setDraftProjectSettings}
                heading="Event Parameters & Tables"
                resetLabel="Reset to global defaults"
                resetTo={globalSettings}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
