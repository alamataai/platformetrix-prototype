import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { TagCleaningRule, TagStatus } from '../../types'
import DeleteConfirmModal from '../navigation/DeleteConfirmModal'

interface Props {
  rules: TagCleaningRule[]
  onChange: (rules: TagCleaningRule[]) => void
  savedRules?: TagCleaningRule[]   // baseline to detect edited/new rows
  unknownTagCount?: number
  onAddAll?: () => void
  onRemoveAll?: () => void
}

type SortKey = 'partner' | 'asset'
type SortDir = 'asc' | 'desc'

// Status is derived: a row counts only when both partner and asset are filled and it
// isn't excluded.
function deriveStatus(partner: string | null, asset: string | null): TagStatus {
  return partner && asset ? 'mapped' : 'pending'
}

export default function TagCleaningEditor({ rules, onChange, savedRules, unknownTagCount = 0, onAddAll, onRemoveAll }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const [showRemoveAll, setShowRemoveAll] = useState(false)

  // A rule is "edited" (or new) if it doesn't exactly match any saved rule.
  const savedSet = savedRules ? new Set(savedRules.map(r => JSON.stringify(r))) : null
  const isEdited = (rule: TagCleaningRule) => savedSet ? !savedSet.has(JSON.stringify(rule)) : false

  function update(i: number, patch: Partial<TagCleaningRule>) {
    onChange(rules.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  // Editing partner/asset re-derives status (unless the row is excluded).
  function setField(i: number, patch: { partner?: string | null; asset?: string | null }) {
    const r = { ...rules[i], ...patch }
    const status = r.status === 'excluded' ? 'excluded' : deriveStatus(r.partner, r.asset)
    update(i, { ...patch, status })
  }

  function toggleExclude(i: number, excluded: boolean) {
    const r = rules[i]
    update(i, { status: excluded ? 'excluded' : deriveStatus(r.partner, r.asset) })
  }

  function remove(i: number) {
    onChange(rules.filter((_, idx) => idx !== i))
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const displayRows = rules.map((rule, i) => ({ rule, i }))
  if (sortKey) {
    displayRows.sort((a, b) => {
      const av = (a.rule[sortKey] ?? '').toLowerCase()
      const bv = (b.rule[sortKey] ?? '').toLowerCase()
      if (av === '' && bv !== '') return 1
      if (bv === '' && av !== '') return -1
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const pendingCount = rules.filter(r => r.status === 'pending').length

  function SortHeader({ label, sortKey: key }: { label: string; sortKey: SortKey }) {
    const active = sortKey === key
    const SortIcon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
    return (
      <th className="pb-2 pr-3">
        <button
          onClick={() => toggleSort(key)}
          className={`flex items-center gap-1 uppercase tracking-wide hover:text-gray-700 ${active ? 'text-gray-700' : 'text-gray-500'}`}
        >
          {label}
          <SortIcon size={12} className="flex-none" />
        </button>
      </th>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Tag Cleaning Rules</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Fill in <strong>Partner</strong> and <strong>Asset</strong> to count a tag, or tick{' '}
            <strong>Exclude</strong> and note why. Tags left blank are not counted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onAddAll && (
            <button
              onClick={onAddAll}
              disabled={unknownTagCount === 0}
              className="text-sm border border-brand-300 text-brand-700 px-3 py-1.5 rounded-md hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add All{unknownTagCount > 0 ? ` (${unknownTagCount})` : ''}
            </button>
          )}
          {onRemoveAll && (
            <button
              onClick={() => setShowRemoveAll(true)}
              disabled={rules.length === 0}
              className="text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Remove All
            </button>
          )}
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-red-500 flex-none" />
          <p className="text-xs font-medium text-red-700">
            {pendingCount} tag{pendingCount === 1 ? '' : 's'} not yet filled in (highlighted in red) — not counted until you map or exclude them.
          </p>
        </div>
      )}

      {rules.length === 0 && (
        <p className="text-sm text-gray-400 italic">No rules yet. Upload a CSV to auto-detect tags.</p>
      )}

      {rules.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-2 pr-3">Raw Tag</th>
                <SortHeader label="Partner" sortKey="partner" />
                <SortHeader label="Asset" sortKey="asset" />
                <th className="pb-2 pr-3 text-center">Exclude</th>
                <th className="pb-2 pr-3">Note</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayRows.map(({ rule, i }) => {
                const edited = isEdited(rule)
                const excluded = rule.status === 'excluded'
                const pending = rule.status === 'pending'
                // Pending (not yet mapped or excluded) is highlighted red so it's easy to spot.
                const rowCls = pending
                  ? 'bg-red-50'
                  : excluded
                    ? 'bg-rose-50/60'
                    : edited
                      ? 'bg-amber-50'
                      : ''
                return (
                  <tr key={i} className={rowCls}>
                    <td className="py-1.5 pr-3">
                      <input
                        type="text"
                        value={rule.raw_tag}
                        readOnly
                        title="Raw tag comes from the CSV and can't be edited"
                        className={`border rounded px-2 py-1.5 text-xs w-60 cursor-not-allowed ${pending ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-gray-200 bg-gray-50 text-gray-500'}`}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="text"
                        value={rule.partner ?? ''}
                        onChange={e => setField(i, { partner: e.target.value || null })}
                        disabled={excluded}
                        className="border border-gray-300 rounded px-2 py-1.5 text-xs w-44 disabled:bg-gray-50 disabled:text-gray-300"
                        placeholder={excluded ? '—' : 'Partner'}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="text"
                        value={rule.asset ?? ''}
                        onChange={e => setField(i, { asset: e.target.value || null })}
                        disabled={excluded}
                        className="border border-gray-300 rounded px-2 py-1.5 text-xs w-44 disabled:bg-gray-50 disabled:text-gray-300"
                        placeholder={excluded ? '—' : 'Asset'}
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={e => toggleExclude(i, e.target.checked)}
                        title="Exclude this tag from all counting"
                        className="rounded"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="text"
                        value={rule.note ?? ''}
                        onChange={e => update(i, { note: e.target.value || null })}
                        className="border border-gray-300 rounded px-2 py-1.5 text-xs w-56"
                        placeholder={excluded ? 'Reason for excluding (required)' : 'Note (optional)'}
                      />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => setRemoveIdx(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {removeIdx !== null && (
        <DeleteConfirmModal
          title="Remove rule?"
          message={`"${rules[removeIdx]?.raw_tag ?? 'This rule'}" will be removed. The tag will go back to pending.`}
          confirmLabel="Remove rule"
          onConfirm={() => { remove(removeIdx); setRemoveIdx(null) }}
          onCancel={() => setRemoveIdx(null)}
        />
      )}

      {showRemoveAll && (
        <DeleteConfirmModal
          title="Remove all rules?"
          message={`All ${rules.length} tag cleaning rules will be removed. This cannot be undone.`}
          confirmLabel="Remove all"
          onConfirm={() => { onRemoveAll?.(); setShowRemoveAll(false) }}
          onCancel={() => setShowRemoveAll(false)}
        />
      )}
    </div>
  )
}
