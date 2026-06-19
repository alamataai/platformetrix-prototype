import type { SportInterestEntry } from '../types'
import type { INTEREST_COUNTRIES } from '../config/sportCountryInterest'

type Country = (typeof INTEREST_COUNTRIES)[number]

/** Count countries with a non-zero score. */
export function nonZeroCountryCount(entry: SportInterestEntry): number {
  return Object.values(entry.scores).filter(s => s > 0).length
}

/** Countries ranked descending by interest score for a given entry (zero scores excluded). */
export function rankCountriesForEntry(
  entry: SportInterestEntry,
  countries: Country[],
): { code: string; name: string; score: number }[] {
  return countries
    .map(c => ({ code: c.code, name: c.name, score: entry.scores[c.code] ?? 0 }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

/** Entries ranked descending by interest score for a given country ISO code (zero scores excluded). */
export function rankEntriesForCountry(
  entries: SportInterestEntry[],
  isoCode: string,
): { entry: SportInterestEntry; score: number }[] {
  return entries
    .map(e => ({ entry: e, score: e.scores[isoCode] ?? 0 }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
}
