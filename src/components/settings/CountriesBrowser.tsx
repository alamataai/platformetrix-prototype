import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Search, Users, Tv, Trophy, X, Info } from 'lucide-react'
import { countryOptions } from '../../lib/countries'
import type { CountryOption } from '../../lib/countries'
import { rankEntriesForCountry } from '../../lib/sportInterest'
import { useProject } from '../../context/ProjectContext'
import type { SportInterestEntry } from '../../types'

type SortMode = 'alpha' | 'region' | 'population'

const PAGE = 50
const REGION_PAGE = 10

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1F1E6 - 0x41
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0),
    base + code.toUpperCase().charCodeAt(1),
  )
}

function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString()
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Detail modal ────────────────────────────────────────────────────────────

function CountryModal({ country, sportEntries, onClose }: {
  country: CountryOption
  sportEntries: SportInterestEntry[]
  onClose: () => void
}) {
  const topSports = useMemo(
    () => rankEntriesForCountry(sportEntries, country.code).slice(0, 5),
    [sportEntries, country.code],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return (
      <div className="flex gap-3">
        <div className="flex-none w-5 mt-0.5 text-gray-400">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
          <div className="text-sm text-gray-800">{children}</div>
        </div>
      </div>
    )
  }

  const hasSources = country.population_source || country.tv_ownership_source

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-gray-100">
          <div className="flex-none flex items-center justify-center text-5xl w-20 h-20 leading-none">
            {flagEmoji(country.code)}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{country.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-mono">
                {country.code}
              </span>
              {country.region && (
                <span className="text-xs text-gray-400">{country.region}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-none p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <Row icon={<Users size={14} />} label="Population">
            {country.population != null
              ? fmtPop(country.population)
              : <span className="text-gray-400">—</span>}
          </Row>

          <Row icon={<Tv size={14} />} label="TV Penetration">
            {country.tv_ownership != null
              ? `${(country.tv_ownership * 100).toFixed(1)}%`
              : <span className="text-gray-400">—</span>}
          </Row>

          {topSports.length > 0 && (
            <Row icon={<Trophy size={14} />} label="Top Sports">
              <div className="space-y-2 mt-1">
                {topSports.map(({ entry, score }) => (
                  <div key={entry.id}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span>{entry.label}</span>
                      <span className="text-gray-400">{(score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${(score * 100).toFixed(0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Row>
          )}

          {hasSources && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex gap-3">
                <div className="flex-none w-5 mt-0.5 text-gray-400">
                  <Info size={14} />
                </div>
                <div className="flex-1 space-y-1.5">
                  <p className="text-xs text-gray-400 mb-1">Data sources</p>
                  {country.population_source && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-600">Population</span>
                      {' · '}{country.population_source}
                      {country.population_year != null && ` (${country.population_year})`}
                      {country.population_last_update && (
                        <span className="text-gray-400"> · updated {fmtDate(country.population_last_update)}</span>
                      )}
                    </p>
                  )}
                  {country.tv_ownership_source && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-600">TV ownership</span>
                      {' · '}{country.tv_ownership_source}
                      {country.tv_ownership_year != null && ` (${country.tv_ownership_year})`}
                      {country.tv_ownership_last_update && (
                        <span className="text-gray-400"> · updated {fmtDate(country.tv_ownership_last_update)}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Country card ─────────────────────────────────────────────────────────────

function CountryCard({ country, onClick }: { country: CountryOption; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col bg-white border rounded-lg shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer p-4 gap-2"
    >
      <div className="text-4xl leading-none">{flagEmoji(country.code)}</div>
      <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{country.name}</p>
      {country.region && (
        <p className="text-xs text-gray-400 line-clamp-1">{country.region}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-auto pt-1">
        {country.population != null && (
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
            {fmtPop(country.population)}
          </span>
        )}
        {country.tv_ownership != null && (
          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
            TV {(country.tv_ownership * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main browser ─────────────────────────────────────────────────────────────

export default function CountriesBrowser() {
  const { sportInterestEntries } = useProject()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('population')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<CountryOption | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const allCountries = useMemo(() => countryOptions(), [])

  const regions = useMemo(() =>
    [...new Set(allCountries.map(c => c.region).filter((r): r is string => Boolean(r)))].sort()
  , [allCountries])

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 150)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return allCountries.filter(c => {
      if (regionFilter && c.region !== regionFilter) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    })
  }, [allCountries, debouncedQuery, regionFilter])

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  , [filtered])

  const sortedByPop = useMemo(() =>
    [...filtered].sort((a, b) => {
      if (a.population == null && b.population == null) return 0
      if (a.population == null) return 1
      if (b.population == null) return -1
      return b.population - a.population
    })
  , [filtered])

  const displayList = sortMode === 'population' ? sortedByPop : sorted

  const groups = useMemo(() => {
    if (sortMode !== 'region') return null
    const map = new Map<string, CountryOption[]>()
    for (const c of sorted) {
      const key = c.region ?? 'Other'
      const existing = map.get(key) ?? []
      existing.push(c)
      map.set(key, existing)
    }
    return [...map.entries()].map(([region, countries]) => ({ region, countries }))
  }, [sorted, sortMode])

  useEffect(() => { setPage(1) }, [debouncedQuery, regionFilter, sortMode])

  const visibleCountries = sortMode !== 'region' ? displayList.slice(0, page * PAGE) : []
  const visibleGroups = groups ? groups.slice(0, page * REGION_PAGE) : []

  const hasMore = sortMode !== 'region'
    ? visibleCountries.length < displayList.length
    : visibleGroups.length < (groups?.length ?? 0)

  const loadedCount = sortMode !== 'region'
    ? visibleCountries.length
    : visibleGroups.reduce((n, g) => n + g.countries.length, 0)

  return (
    <>
      {selected && (
        <CountryModal
          country={selected}
          sportEntries={sportInterestEntries}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Countries</h2>
          <p className="text-xs text-gray-500 mt-0.5">Browse countries with population, TV penetration, and sport interest data.</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleSearch}
              placeholder="Search by country name or code..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="py-1.5 pl-2.5 pr-7 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white text-gray-700"
          >
            <option value="">All regions</option>
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
            {([['population', 'Population'], ['alpha', 'A–Z'], ['region', 'By Region']] as [SortMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-3 py-1.5 transition-colors ${
                  sortMode === mode
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-sm text-gray-400 ml-auto">
            {loadedCount < filtered.length
              ? `${loadedCount.toLocaleString()} of ${filtered.length.toLocaleString()} countries`
              : `${filtered.length.toLocaleString()} countr${filtered.length !== 1 ? 'ies' : 'y'}`}
          </span>
        </div>

        {/* Cards */}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No countries match your search.</p>
        ) : groups ? (
          <div className="space-y-6">
            {visibleGroups.map(({ region, countries }) => (
              <section key={region}>
                <h3 className="sticky top-0 z-10 bg-canvas py-1 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-100">
                  {region}
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-400">
                    ({countries.length})
                  </span>
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {countries.map(c => (
                    <CountryCard key={c.code} country={c} onClick={() => setSelected(c)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {visibleCountries.map(c => (
              <CountryCard key={c.code} country={c} onClick={() => setSelected(c)} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-5 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {sortMode !== 'region'
                ? `Load ${Math.min(PAGE, displayList.length - visibleCountries.length)} more countries`
                : `Load ${Math.min(REGION_PAGE, (groups?.length ?? 0) - visibleGroups.length)} more regions`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
