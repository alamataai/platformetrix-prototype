// Country code ↔ name helpers for the structured country picker and legacy migration.
//
// countries.json holds the ISO-3166 code+name list (originally generated from the
// `countries-and-timezones` dev dependency) enriched with population and TV-ownership
// reference data. The code+name backbone is regenerated with:
//   node -e "const ct=require('countries-and-timezones'),fs=require('fs');
//   const l=Object.values(ct.getAllCountries()).map(c=>({code:c.id,name:c.name}))
//   .sort((a,b)=>a.name.localeCompare(b.name));
//   fs.writeFileSync('src/config/countries.json',JSON.stringify(l,null,2)+'\n');"
// region (UN M49 subregion) is derived from the alpha-2 code.
// Population / TV-ownership enrichment is merged in from public/countries.csv (keyed by
// alpha-2 code); countries absent from that CSV carry null enrichment. Each metric has
// its own *_last_update UTC timestamp, null when that metric has no value.

import countriesData from '../config/countries.json'

export interface CountryOption {
  code: string
  name: string
  region?: string
  // Enrichment (null when the country is absent from the source CSV). Each metric carries
  // its own *_last_update UTC timestamp (null when that metric has no value).
  population?: number | null
  population_year?: number | null
  population_source?: string | null
  population_last_update?: string | null
  tv_ownership?: number | null
  tv_ownership_year?: number | null
  tv_ownership_source?: string | null
  tv_ownership_last_update?: string | null
}

const COUNTRIES = countriesData as CountryOption[]

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COUNTRIES.map(c => [c.code, c.name]),
)

// Lowercased name → code, for best-effort migration of free-text country values.
const CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  COUNTRIES.map(c => [c.name.toLowerCase(), c.code]),
)

// Common free-text spellings that don't match the canonical name verbatim.
const NAME_ALIASES: Record<string, string> = {
  uk: 'GB',
  'united kingdom': 'GB',
  'great britain': 'GB',
  england: 'GB',
  usa: 'US',
  'u.s.a.': 'US',
  'united states': 'US',
  america: 'US',
  uae: 'AE',
  russia: 'RU',
  'south korea': 'KR',
  'north korea': 'KP',
}

/** ISO code → display name; falls back to the raw code when unknown. */
export function countryName(code: string): string {
  if (!code) return ''
  return NAME_BY_CODE[code] ?? code
}

/**
 * Best-effort free-text name → ISO code, for migrating legacy free-text country values.
 * Exact (case-insensitive) canonical-name match, then common aliases. '' when unresolved.
 * An input that is already a known ISO code is returned as-is.
 */
export function countryCodeFromName(name: string): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (NAME_BY_CODE[trimmed]) return trimmed // already a valid code
  const key = trimmed.toLowerCase()
  return CODE_BY_NAME[key] ?? NAME_ALIASES[key] ?? ''
}

/** Options for the country `<select>`, sorted by name. */
export function countryOptions(): CountryOption[] {
  return COUNTRIES
}
