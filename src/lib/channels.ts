import channelsData from '../config/channels.json'
import { countryName } from './countries'
import type { Channel } from '../types'

const CHANNELS = channelsData as Channel[]

/** All channels, unfiltered. */
export function allChannels(): Channel[] {
  return CHANNELS
}

const QUERY_FIELDS: (keyof Channel)[] = ['name', 'network', 'owners']

/** Case-insensitive search across name, alt_names, network, owners. */
export function searchChannels(channels: Channel[], query: string): Channel[] {
  const q = query.toLowerCase().trim()
  if (!q) return channels
  return channels.filter(ch => {
    if (QUERY_FIELDS.some(f => (ch[f] as string | null)?.toLowerCase().includes(q))) return true
    return ch.alt_names.some(a => a.toLowerCase().includes(q))
  })
}

export interface ChannelCountry {
  code: string
  name: string
  count: number
}

/** Distinct countries that have at least one channel, sorted by name. */
export function channelCountries(): ChannelCountry[] {
  const map = new Map<string, { name: string; count: number }>()
  for (const ch of CHANNELS) {
    const existing = map.get(ch.country_code)
    if (existing) existing.count++
    else map.set(ch.country_code, { name: countryName(ch.country_code) || ch.country_name, count: 1 })
  }
  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({ code, name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface CountryGroup {
  country_code: string
  country_name: string
  channels: Channel[]
}

/** Groups channels by country, sorted alphabetically by country name. */
export function groupByCountry(channels: Channel[]): CountryGroup[] {
  const map = new Map<string, Channel[]>()
  for (const ch of channels) {
    const existing = map.get(ch.country_code)
    if (existing) existing.push(ch)
    else map.set(ch.country_code, [ch])
  }
  return Array.from(map.entries())
    .map(([code, chs]) => ({
      country_code: code,
      country_name: countryName(code) || ch_name(chs),
      channels: [...chs].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.country_name.localeCompare(b.country_name))
}

function ch_name(channels: Channel[]): string {
  return channels[0]?.country_name ?? ''
}
