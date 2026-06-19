// DST-correct timezone resolution for the audience track.
//
// The audience model needs the broadcaster's local wall-clock time at two points:
//   • §4.4 quality_of_timeslot — the `day_hour` (e.g. "Saturday20") at the event midpoint,
//     read in the broadcaster's local time.
//   • §6 start_time_utc — broadcast rows are entered in local time; we persist the UTC instant.
//
// DST is resolved from the IANA zone id via Luxon (which wraps the platform tz database),
// NOT from any static utc_offset — Rome is +01:00 in winter but +02:00 in summer.
//
// Pure module (no React, no context) — mirrors pipeline.ts conventions.

import { DateTime } from 'luxon'
import countryTimezones from '../config/country_timezones.json'

// country_timezones.json is GENERATED, not hand-edited. Source: the `countries-and-timezones`
// dev dependency (canonical IANA zone1970.tab; ISO-3166 country codes). Regenerate with:
//   node -e "const ct=require('countries-and-timezones'),fs=require('fs');const c=ct.getAllCountries();
//   const m={};for(const k of Object.keys(c)){const z=c[k].timezones||[];if(z.length)m[k]=z;}
//   const o={};for(const k of Object.keys(m).sort())o[k]=m[k];
//   fs.writeFileSync('src/config/country_timezones.json',JSON.stringify(o,null,2)+'\n');"
const COUNTRY_TIMEZONES = countryTimezones as Record<string, string[]>

/** True when `zone` is a resolvable IANA id (e.g. "Europe/Rome"). */
export function isValidZone(zone: string): boolean {
  return !!zone && DateTime.now().setZone(zone).isValid
}

/**
 * Parse a naive local ISO string ("YYYY-MM-DDTHH:mm") as wall-clock time in `zone`
 * and return the absolute instant in UTC. DST-correct (the reverse direction).
 * Returns null on empty/invalid input or unknown zone.
 */
export function localToUtc(naiveLocalISO: string, zone: string): DateTime | null {
  if (!naiveLocalISO || !zone) return null
  const dt = DateTime.fromISO(naiveLocalISO, { zone })
  return dt.isValid ? dt.toUTC() : null
}

/**
 * The §4.4 lookup key: the weekday + hour-of-day of `instant` read in `zone`,
 * formatted to match the 168-cell quality table keys (e.g. "Saturday20").
 * Weekday is always English, independent of host locale. Returns null if invalid.
 */
export function utcToZonedDayHour(instant: DateTime | null, zone: string): string | null {
  if (!instant?.isValid || !isValidZone(zone)) return null
  const z = instant.setZone(zone).setLocale('en')
  return `${z.toFormat('cccc')}${z.hour}` // "Saturday" + 20 → "Saturday20"
}

/**
 * Anchor the venue-local scheduled start/end (naive ISO) to UTC and return their midpoint
 * instant (UTC). Used to drive the broadcaster-local day_hour lookup. Returns null if either
 * bound is missing/invalid.
 */
export function eventMidpointUtc(
  startNaiveISO: string,
  endNaiveISO: string,
  venueZone: string,
): DateTime | null {
  const start = startNaiveISO ? DateTime.fromISO(startNaiveISO, { zone: venueZone }) : null
  const end = endNaiveISO ? DateTime.fromISO(endNaiveISO, { zone: venueZone }) : null
  if (!start?.isValid || !end?.isValid) return null
  const midMillis = (start.toMillis() + end.toMillis()) / 2
  return DateTime.fromMillis(midMillis, { zone: 'utc' })
}

/**
 * §6 start_time_utc: convert a broadcast's naive local start to a UTC ISO string.
 * Returns null on invalid input.
 */
export function startTimeUtc(localNaiveISO: string, broadcastZone: string): string | null {
  return localToUtc(localNaiveISO, broadcastZone)?.toISO() ?? null
}

/**
 * Current UTC offset of `zone` as a short label, e.g. "UTC+09:00" or "UTC-05:00".
 * DST-dependent: reflects the offset *now*, so a zone shows its summer/winter offset
 * depending on today's date — it is a picker hint, not the offset at any event instant.
 * Returns '' for an unresolvable zone.
 */
export function zoneOffsetLabel(zone: string): string {
  const dt = DateTime.now().setZone(zone)
  return dt.isValid ? `UTC${dt.toFormat('ZZ')}` : ''
}

/** Complete worldwide list of IANA zone ids for a picker (native, always current). */
export function allZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
  return typeof supported === 'function' ? supported('timeZone') : []
}

/**
 * Candidate IANA zones for an ISO-3166 country code (canonical IANA data).
 * The country only *narrows the picker* — it never determines the zone:
 *   • single-zone country (IT, GB, FR, IN…) → one entry → the UI auto-fills it.
 *   • multi-zone country (US, AU, RU…)      → multiple entries → the analyst picks explicitly.
 *   • unknown code                          → [] → the UI falls back to allZones().
 * Whatever the analyst confirms is stored as the explicit zone; DST is resolved from it.
 */
export function defaultZonesForCountry(code: string): string[] {
  return code ? (COUNTRY_TIMEZONES[code.toUpperCase()] ?? []) : []
}

/**
 * The venue zone an event actually uses: its own override if set, else the parent
 * competition's. Mirrors the existing `se.country || comp.country` inheritance rule.
 * Returns null when neither is set.
 */
export function effectiveTimezone(
  event: { timezone: string | null },
  competition: { timezone: string | null } | null | undefined,
): string | null {
  return event.timezone || competition?.timezone || null
}
