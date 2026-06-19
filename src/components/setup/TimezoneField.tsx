import { useRef, useState } from 'react'
import { defaultZonesForCountry, allZones, zoneOffsetLabel } from '../../lib/timezone'

const FIELD_CLASS =
  'mt-1 w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 outline-none bg-white focus:border-brand-500'

const INHERIT = '__inherit__'

interface Props {
  /** Effective country code used to derive candidate zones. */
  countryCode: string
  value: string | null
  onChange: (zone: string | null) => void
  /**
   * Event-level: when provided, adds a leading "Inherit (X)" option mapping to null.
   * Pass the parent's effective zone (may be null) to label it. Omit for competition level.
   */
  inheritFrom?: string | null
}

/**
 * Venue timezone picker. Single-zone country → the one zone (with an "other zones" escape);
 * multi-zone → that country's candidates first, with the full IANA list as a fallback.
 */
export default function TimezoneField({ countryCode, value, onChange, inheritFrom }: Props) {
  const candidates = defaultZonesForCountry(countryCode)
  const isEventLevel = inheritFrom !== undefined
  // Unknown country with no candidates → there is nothing to narrow by, so show the full list.
  const [showAll, setShowAll] = useState(candidates.length === 0)
  const selectRef = useRef<HTMLSelectElement>(null)

  // Switch to the full IANA list. Focus the select (without opening it) so keyboard
  // users land on the control; the new options are revealed when they open it.
  function expandToAllZones() {
    setShowAll(true)
    selectRef.current?.focus()
  }

  const base = showAll || candidates.length === 0 ? allZones() : candidates
  // Keep an out-of-list current value (e.g. a prior override) selectable.
  const zones = value && !base.includes(value) ? [value, ...base] : base

  const selectValue = value ?? (isEventLevel ? INHERIT : '')
  const needsPick = !value && !isEventLevel && candidates.length > 1

  return (
    <div>
      <select
        ref={selectRef}
        value={selectValue}
        onChange={e => {
          const raw = e.target.value
          onChange(raw === INHERIT || raw === '' ? null : raw)
        }}
        className={FIELD_CLASS}
      >
        {isEventLevel && (
          <option value={INHERIT}>
            Inherit{inheritFrom ? ` (${inheritFrom})` : ''}
          </option>
        )}
        {!isEventLevel && <option value="">Select zone…</option>}
        {zones.map(z => {
          const offset = zoneOffsetLabel(z)
          return (
            <option key={z} value={z}>
              {offset ? `${z} (${offset})` : z}
            </option>
          )
        })}
      </select>
      <div className="mt-1 flex items-center justify-between">
        {needsPick
          ? <span className="text-xs text-amber-600">Select the venue zone.</span>
          : <span />}
        {candidates.length > 0 && (
          showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-xs text-brand-700 hover:underline"
            >
              Show country zones only
            </button>
          ) : (
            <button
              type="button"
              onClick={expandToAllZones}
              className="text-xs text-brand-700 hover:underline"
            >
              Other zone…
            </button>
          )
        )}
      </div>
    </div>
  )
}
