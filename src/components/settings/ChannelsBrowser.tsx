import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Search, ExternalLink, Tv, X, Globe, Radio, Calendar, Languages, MapPin } from 'lucide-react'
import { allChannels, searchChannels, groupByCountry, channelCountries } from '../../lib/channels'
import { countryName } from '../../lib/countries'
import type { Channel } from '../../types'

type SortMode = 'alpha' | 'country'

const ALPHA_PAGE = 100
const COUNTRY_PAGE = 20

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1F1E6 - 0x41
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0),
    base + code.toUpperCase().charCodeAt(1),
  )
}

// Decode broadcast_area codes to human-readable labels
const REGION_NAMES: Record<string, string> = {
  ARAB: 'Arab World', MAGHREB: 'Maghreb', ASIA: 'Asia', EUROPE: 'Europe',
  AFRICA: 'Africa', AMERICAS: 'Americas', MIDEAST: 'Middle East',
  LATAM: 'Latin America', CARIB: 'Caribbean', NAFR: 'North Africa',
  SAFR: 'Sub-Saharan Africa', EAFRICA: 'East Africa', WAFRICA: 'West Africa',
  SEASIA: 'Southeast Asia', SASIA: 'South Asia', EASIA: 'East Asia',
  CASIA: 'Central Asia', MENA: 'Middle East & North Africa',
  EX_YU: 'Former Yugoslavia', BENELUX: 'Benelux', DACH: 'DACH',
  SCANDINAVIA: 'Scandinavia', BALTICS: 'Baltics', EEU: 'Eastern Europe',
  OCEANIA: 'Oceania', NORTH_AM: 'North America', SOUTH_AM: 'South America',
}

function decodeBroadcastArea(codes: string[]): string[] {
  return codes.map(code => {
    if (code === 'w') return 'Worldwide'
    if (code.startsWith('c/')) {
      const iso = code.slice(2)
      return countryName(iso) || iso
    }
    if (code.startsWith('r/')) {
      const key = code.slice(2)
      return REGION_NAMES[key] ?? key
    }
    return code
  })
}

// ─── Detail modal ────────────────────────────────────────────────────────────

function ChannelModal({ ch, onClose }: { ch: Channel; onClose: () => void }) {
  const isClosed = Boolean(ch.closed)
  const areas = decodeBroadcastArea(ch.broadcast_area)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
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
          <div className="flex-none flex items-center justify-center bg-gray-50 border rounded-lg w-20 h-20">
            {ch.logo_url ? (
              <img
                src={ch.logo_url}
                alt={ch.name}
                className="max-h-16 max-w-full object-contain p-1"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <Tv size={32} className="text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{ch.name}</h2>
            {ch.alt_names.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                {ch.alt_names.join(' · ')}
              </p>
            )}
            <span className={`inline-flex mt-2 items-center px-2 py-0.5 rounded text-xs font-medium ${
              isClosed ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'
            }`}>
              {isClosed ? 'Closed' : 'Active'}
            </span>
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
          <Row icon={<Globe size={14} />} label="Country">
            <span>{flagEmoji(ch.country_code)} {ch.country_name}</span>
          </Row>

          {ch.network && (
            <Row icon={<Radio size={14} />} label="Network">
              {ch.network}
            </Row>
          )}

          {ch.owners && ch.owners !== ch.network && (
            <Row icon={<Radio size={14} />} label="Owner">
              {ch.owners}
            </Row>
          )}

          {areas.length > 0 && (
            <Row icon={<MapPin size={14} />} label="Broadcast area">
              <div className="flex flex-wrap gap-1 mt-0.5">
                {areas.map(a => (
                  <span key={a} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    {a}
                  </span>
                ))}
              </div>
            </Row>
          )}

          {ch.languages.length > 0 && (
            <Row icon={<Languages size={14} />} label="Languages">
              <span className="uppercase tracking-wide">{ch.languages.join(' · ')}</span>
            </Row>
          )}

          {ch.timezones && (
            <Row icon={<Globe size={14} />} label="Timezone">
              {ch.timezones}
            </Row>
          )}

          {(ch.launched || ch.closed) && (
            <Row icon={<Calendar size={14} />} label={ch.closed ? 'Launched / Closed' : 'Launched'}>
              {ch.launched ?? 'unknown'}
              {ch.closed && ` → ${ch.closed}`}
            </Row>
          )}

          {ch.website && (
            <Row icon={<ExternalLink size={14} />} label="Website">
              <a
                href={ch.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline break-all"
              >
                {ch.website}
              </a>
            </Row>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Channel card ────────────────────────────────────────────────────────────

function ChannelCard({ ch, onClick }: { ch: Channel; onClick: () => void }) {
  const isClosed = Boolean(ch.closed)
  return (
    <div
      onClick={onClick}
      className={`flex flex-col bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer ${
        isClosed ? 'opacity-50' : ''
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-center bg-gray-50 border-b h-20 px-3">
        {ch.logo_url ? (
          <img
            src={ch.logo_url}
            alt={ch.name}
            loading="lazy"
            className="max-h-14 max-w-full object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <Tv size={28} className="text-gray-300" />
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2" title={ch.name}>
          {ch.name}
          {isClosed && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">(closed)</span>
          )}
        </p>

        <p className="text-xs text-gray-500">
          {flagEmoji(ch.country_code)} {ch.country_name}
        </p>

        {ch.network && (
          <p className="text-xs text-gray-500 truncate" title={ch.network}>
            {ch.network}
          </p>
        )}

        {ch.owners && ch.owners !== ch.network && (
          <p className="text-xs text-gray-400 truncate" title={ch.owners}>
            {ch.owners}
          </p>
        )}

        {ch.languages.length > 0 && (
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            {ch.languages.join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main browser ─────────────────────────────────────────────────────────────

export default function ChannelsBrowser() {
  const [query, setQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('country')
  const [showClosed, setShowClosed] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Channel | null>(null)

  const countries = useMemo(() => channelCountries(), [])

  // Debounce search
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 150)
  }, [])

  const base = useMemo(() => {
    let all = allChannels()
    if (!showClosed) all = all.filter(ch => !ch.closed)
    if (countryFilter) all = all.filter(ch => ch.country_code === countryFilter)
    return all
  }, [showClosed, countryFilter])

  const filtered = useMemo(() => searchChannels(base, debouncedQuery), [base, debouncedQuery])

  const sorted = useMemo(() =>
    sortMode === 'alpha'
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
      : filtered,
    [filtered, sortMode],
  )

  const groups = useMemo(() =>
    sortMode === 'country' ? groupByCountry(sorted) : null,
    [sorted, sortMode],
  )

  useEffect(() => { setPage(1) }, [debouncedQuery, showClosed, countryFilter, sortMode])

  const visibleChannels = sortMode === 'alpha' ? sorted.slice(0, page * ALPHA_PAGE) : []
  const visibleGroups   = groups ? groups.slice(0, page * COUNTRY_PAGE) : []

  const hasMore = sortMode === 'alpha'
    ? visibleChannels.length < sorted.length
    : visibleGroups.length < (groups?.length ?? 0)

  const loadedCount = sortMode === 'alpha'
    ? visibleChannels.length
    : visibleGroups.reduce((n, g) => n + g.channels.length, 0)

  return (
    <>
      {selected && <ChannelModal ch={selected} onClose={() => setSelected(null)} />}

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Channels</h2>
          <p className="text-xs text-gray-500 mt-0.5">Browse television channels by name, country, or network.</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleSearch}
              placeholder="Search channels, networks, owners..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            className="py-1.5 pl-2.5 pr-7 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white text-gray-700"
          >
            <option value="">All countries</option>
            {countries.map(c => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>

          <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
            {(['alpha', 'country'] as SortMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-3 py-1.5 transition-colors ${
                  sortMode === mode
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mode === 'alpha' ? 'A-Z' : 'By Country'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={e => setShowClosed(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show closed
          </label>

          <span className="text-sm text-gray-400 ml-auto">
            {loadedCount < filtered.length
              ? `${loadedCount.toLocaleString()} of ${filtered.length.toLocaleString()} channels`
              : `${filtered.length.toLocaleString()} channel${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Channel cards */}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No channels match your search.</p>
        ) : groups ? (
          <div className="space-y-6">
            {visibleGroups.map(group => (
              <section key={group.country_code}>
                <h3 className="sticky top-0 z-10 bg-canvas py-1 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-100">
                  {flagEmoji(group.country_code)} {group.country_name}
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-400">
                    ({group.channels.length})
                  </span>
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {group.channels.map(ch => (
                    <ChannelCard key={ch.id} ch={ch} onClick={() => setSelected(ch)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {visibleChannels.map(ch => (
              <ChannelCard key={ch.id} ch={ch} onClick={() => setSelected(ch)} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-5 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {sortMode === 'alpha'
                ? `Load ${Math.min(ALPHA_PAGE, sorted.length - visibleChannels.length)} more channels`
                : `Load ${Math.min(COUNTRY_PAGE, (groups?.length ?? 0) - visibleGroups.length)} more countries`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
