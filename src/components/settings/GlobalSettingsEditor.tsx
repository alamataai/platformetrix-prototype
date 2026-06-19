import { useState, useEffect } from 'react'
import { useProject } from '../../context/ProjectContext'
import { defaultGlobalSettings } from '../../lib/pipeline'
import type { GlobalSettings } from '../../types'
import { fmt } from '../../lib/utils'

const COLUMNS = ['A', 'B', 'C', 'D'] as const
const ROWS = [1, 2, 3, 4] as const
const CLUTTER_KEYS = ['1', '2', '3', '4', '5', '6', '7'] as const

interface Props {
  // Controlled mode: project-level settings
  value?: GlobalSettings
  onChangeDraft?: (s: GlobalSettings) => void
  resetLabel?: string
  resetTo?: GlobalSettings
  heading?: string
}

export default function GlobalSettingsEditor({
  value,
  onChangeDraft,
  resetLabel = 'Reset to defaults',
  resetTo = defaultGlobalSettings,
  heading,
}: Props) {
  const { globalSettings, setGlobalSettings } = useProject()

  const isControlled = value !== undefined
  const initialValue = isControlled ? value : globalSettings

  const [draft, setDraft] = useState<GlobalSettings>(initialValue)

  // Keep draft in sync when controlled value changes externally (e.g. switching projects)
  useEffect(() => {
    if (isControlled && value) {
      setDraft(value)
    }
  }, [isControlled, value])

  function update(patch: Partial<GlobalSettings>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (isControlled) {
      onChangeDraft?.(next)
    } else {
      // Global settings: apply immediately (no pipeline re-run)
      setGlobalSettings(next)
    }
  }

  function updateClutter(key: string, val: number) {
    update({ clutter_scores: { ...draft.clutter_scores, [key]: val } })
  }

  function updatePosition(pos: string, val: number) {
    update({ position_scores: { ...draft.position_scores, [pos]: val } })
  }

  function reset() {
    setDraft(resetTo)
    if (isControlled) {
      onChangeDraft?.(resetTo)
    } else {
      setGlobalSettings(resetTo)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Parameters ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">{heading ?? 'Exposure Parameters'}</h2>
          <button onClick={reset} className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">
            {resetLabel}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Balanced Share Exponent
              <span className="ml-1 text-gray-400 font-normal">(constant)</span>
            </label>
            <input
              type="number"
              value={draft.balanced_share_exponent}
              readOnly
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ad Slot Seconds</label>
            <input type="number" step="1" value={draft.ad_slot_seconds}
              onChange={e => update({ ad_slot_seconds: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="block text-xs font-medium text-gray-500 mb-1">Exposure Threshold (%)</label>
            <div className="relative">
              <input type="number" step="0.01"
                value={parseFloat((draft.exposure_threshold * 100).toFixed(6))}
                onChange={e => update({ exposure_threshold: (parseFloat(e.target.value) || 0) / 100 })}
                className="w-full border border-gray-300 rounded px-3 py-2 pr-7 text-sm" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
            </div>
          </div>
          <div className="flex flex-col">
            <label className="block text-xs font-medium text-gray-500 mb-1">Detection Probability Threshold (%)</label>
            <div className="relative">
              <input type="number" step="1"
                value={parseFloat((draft.probability_threshold * 100).toFixed(6))}
                onChange={e => update({ probability_threshold: (parseFloat(e.target.value) || 0) / 100 })}
                className="w-full border border-gray-300 rounded px-3 py-2 pr-7 text-sm" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
            </div>
          </div>
          <div className="flex flex-col">
            <label className="block text-xs font-medium text-gray-500 mb-1">SIF Multiplier</label>
            <input type="number" step="0.01" value={draft.sif_multiplier}
              onChange={e => update({ sif_multiplier: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
          {/* Peak Multiplier, Reach Multiplier and Currency hidden at this stage */}
        </div>
      </div>

      {/* ── Clutter Scores ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Clutter Scores</h2>
        <p className="text-xs text-gray-400">Score applied based on number of detected tags in the same frame. Tags 7+ all use the last row.</p>
        <div className="flex flex-wrap gap-3">
          {CLUTTER_KEYS.map(k => (
            <div key={k} className="flex flex-col items-center gap-1">
              <label className="text-xs text-gray-500 font-medium">{k === '7' ? '7+' : `${k} tag${k === '1' ? '' : 's'}`}</label>
              <input type="number" step="0.01"
                value={fmt(draft.clutter_scores[k] ?? 0.70, 2)}
                onChange={e => updateClutter(k, parseFloat(e.target.value) || 0)}
                className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-center" />
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <label className="text-xs text-gray-500 font-medium">Default</label>
            <input type="number" step="0.01"
              value={fmt(draft.clutter_scores['default'] ?? 0.70, 2)}
              onChange={e => updateClutter('default', parseFloat(e.target.value) || 0)}
              className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-center" />
          </div>
        </div>
      </div>

      {/* ── Position Scores ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Position Scores</h2>
        <p className="text-xs text-gray-400">Columns A–D = left to right. Rows 1–4 = top to bottom.</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-8"></th>
                {COLUMNS.map(col => (
                  <th key={col} className="w-24 pb-2 text-center text-xs font-semibold text-gray-500 uppercase">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row}>
                  <td className="pr-3 text-xs font-semibold text-gray-500 text-right align-middle">{row}</td>
                  {COLUMNS.map(col => {
                    const pos = `${col}${row}`
                    const val = draft.position_scores[pos] ?? 1.0
                    const isHighest = val >= 2.20
                    const isHigh = val >= 1.70 && val < 2.20
                    return (
                      <td key={col} className="p-1">
                        <input type="number" step="0.05"
                          value={fmt(val, 2)}
                          onChange={e => updatePosition(pos, parseFloat(e.target.value) || 0)}
                          className={`w-20 border rounded px-2 py-1.5 text-sm text-center font-medium transition-colors ${
                            isHighest ? 'border-green-400 bg-green-50 text-green-800' :
                            isHigh ? 'border-blue-300 bg-blue-50 text-blue-800' :
                            'border-gray-300'
                          }`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
