import { useState } from 'react'
import { Plus, Trash2, ChevronRight, Activity, Clock, Film, MapPin } from 'lucide-react'
import { useProject } from '../../context/ProjectContext'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'
import CountrySelect from '../setup/CountrySelect'
import TimezoneField from '../setup/TimezoneField'
import { countryName } from '../../lib/countries'
import { defaultZonesForCountry } from '../../lib/timezone'
import type { Go } from './navTypes'

// Format a "YYYY-MM-DDTHH:mm" datetime-local string for display, e.g. "15 Jul 2024, 14:30".
function fmtDateTime(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function scheduleLabel(start: string | null, end: string | null): string | null {
  const s = fmtDateTime(start)
  const e = fmtDateTime(end)
  if (s && e) return `${s} – ${e}`
  return s ?? e ?? null
}

// "3 media · 2 video, 1 audio" — counts owned media and breaks it down by type.
function mediaLabel(items: { type: string }[]): string {
  const total = items.length
  if (total === 0) return 'No media'
  const byType = items.reduce<Record<string, number>>((acc, m) => {
    acc[m.type] = (acc[m.type] ?? 0) + 1
    return acc
  }, {})
  const breakdown = Object.entries(byType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${n} ${type}`)
    .join(', ')
  return `${total} media · ${breakdown}`
}

export default function CompetitionDetail({
  projectId, competitionId, go,
}: {
  projectId: string
  competitionId: string
  go: Go
}) {
  const {
    competitions, sportsEvents, media,
    updateCompetition, createSportsEvent, deleteSportsEvent,
  } = useProject()

  const [newEvent, setNewEvent] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const competition = competitions.find(c => c.id === competitionId)
  if (!competition) {
    return <p className="text-sm text-gray-400 italic">Competition not found.</p>
  }

  // Sort by Scheduled Start (earliest first); events without a start go last, ties broken by name.
  const events = sportsEvents
    .filter(se => se.competition_id === competitionId)
    .sort((a, b) => {
      const sa = a.scheduled_start ?? ''
      const sb = b.scheduled_start ?? ''
      if (sa && sb) return sa.localeCompare(sb) || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      if (sa) return -1
      if (sb) return 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
  const target = deleteId ? sportsEvents.find(se => se.id === deleteId) : null

  function addEvent() {
    const name = newEvent.trim()
    if (!name) return
    const created = createSportsEvent(name, competitionId)
    setNewEvent('')
    go.event(projectId, competitionId, created.id)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Competition attributes */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Competition Details</h2>

        <label className="block">
          <span className="text-xs font-medium text-gray-500">Competition Name</span>
          <input
            type="text"
            value={competition.name}
            onChange={e => updateCompetition(competition.id, { name: e.target.value })}
            placeholder="e.g. Euro Aquatics 2024"
            className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Start Date</span>
            <input
              type="date"
              value={competition.date_start}
              onChange={e => updateCompetition(competition.id, { date_start: e.target.value })}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">End Date</span>
            <input
              type="date"
              value={competition.date_end ?? ''}
              onChange={e => updateCompetition(competition.id, { date_end: e.target.value || null })}
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Country</span>
            <CountrySelect
              value={competition.country}
              onChange={code => {
                // On country change, auto-resolve a single-zone venue timezone; force a
                // re-pick (null) for multi-zone or unknown countries.
                const zones = defaultZonesForCountry(code)
                updateCompetition(competition.id, {
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
              value={competition.city}
              onChange={e => updateCompetition(competition.id, { city: e.target.value })}
              placeholder="e.g. Berlin"
              className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
        </div>

        <label className="block max-w-md">
          <span className="text-xs font-medium text-gray-500">Venue Timezone</span>
          <TimezoneField
            countryCode={competition.country}
            value={competition.timezone}
            onChange={tz => updateCompetition(competition.id, { timezone: tz })}
          />
        </label>
      </div>

      {/* Sports events */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Sports Events</h2>
          <span className="text-xs text-gray-400">{events.length} total</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newEvent}
            onChange={e => setNewEvent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addEvent() }}
            placeholder="New sports event, e.g. 100m Freestyle Final"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            onClick={addEvent}
            disabled={!newEvent.trim()}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {events.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Activity size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-600">No sports events yet</p>
            <p className="text-sm text-gray-400 mt-0.5">Add one above to open its workspace.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100 overflow-hidden">
            {events.map(se => {
              const meta = [se.sport_type, se.discipline].filter(Boolean).join(' · ')
              const schedule = scheduleLabel(se.scheduled_start, se.scheduled_end)
              const eventMedia = media.filter(m => m.sports_event_id === se.id)
              // Country/City fall back to the competition when blank on the event.
              const location = [se.city || competition.city, countryName(se.country || competition.country)].filter(Boolean).join(', ')
              return (
                <div
                  key={se.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => go.event(projectId, competitionId, se.id)}
                >
                  <Activity size={15} className="flex-none text-gray-300" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{se.name || 'Untitled event'}</p>
                    {meta && <p className="text-xs text-gray-400 truncate">{meta}</p>}
                    {location && (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        <MapPin size={11} className="flex-none" /> {location}
                      </p>
                    )}
                    {schedule && (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        <Clock size={11} className="flex-none" /> {schedule}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                      <Film size={11} className="flex-none" /> {mediaLabel(eventMedia)}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteId(se.id) }}
                    className="flex-none text-gray-300 hover:text-red-500 p-1"
                    title="Delete event"
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
          title="Delete sports event?"
          message={`"${target.name || 'Untitled event'}" and all its media will be permanently removed.`}
          confirmLabel="Delete event"
          onConfirm={() => { deleteSportsEvent(target.id); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
