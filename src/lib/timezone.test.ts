import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import {
  isValidZone,
  localToUtc,
  utcToZonedDayHour,
  eventMidpointUtc,
  startTimeUtc,
  allZones,
  defaultZonesForCountry,
} from './timezone'

describe('localToUtc — DST resolved from the IANA id, not a static offset', () => {
  it('uses +02:00 in summer and +01:00 in winter for Europe/Rome', () => {
    const summer = localToUtc('2026-07-25T20:00', 'Europe/Rome')
    const winter = localToUtc('2026-01-25T20:00', 'Europe/Rome')
    // Same 20:00 wall-clock → different UTC instants because the offset shifts with DST.
    expect(summer?.hour).toBe(18) // +02:00
    expect(winter?.hour).toBe(19) // +01:00
    expect(summer?.hour).not.toBe(winter?.hour)
  })

  it('returns null on empty input, malformed ISO, or unknown zone', () => {
    expect(localToUtc('', 'Europe/Rome')).toBeNull()
    expect(localToUtc('2026-07-25T20:00', 'Not/AZone')).toBeNull()
    expect(localToUtc('nonsense', 'Europe/Rome')).toBeNull()
  })
})

describe('utcToZonedDayHour — §4.4 quality lookup key', () => {
  const instant = DateTime.fromISO('2026-07-25T18:00', { zone: 'utc' }) // 20:00 Rome / 14:00 Toronto

  it('reads the broadcaster-local weekday+hour, so different zones give different keys', () => {
    expect(utcToZonedDayHour(instant, 'Europe/Rome')).toBe('Saturday20')
    expect(utcToZonedDayHour(instant, 'America/Toronto')).toBe('Saturday14')
  })

  it('weekday name is English regardless of host locale', () => {
    expect(utcToZonedDayHour(instant, 'Europe/Rome')).toMatch(/^Saturday/)
  })

  it('returns null for an invalid instant or zone', () => {
    expect(utcToZonedDayHour(null, 'Europe/Rome')).toBeNull()
    expect(utcToZonedDayHour(instant, 'Not/AZone')).toBeNull()
  })
})

describe('eventMidpointUtc', () => {
  it('averages the venue-local bounds into a UTC instant', () => {
    const mid = eventMidpointUtc('2026-07-25T19:00', '2026-07-25T21:00', 'Europe/Rome')
    // 19:00–21:00 Rome (summer, +02:00) → midpoint 20:00 Rome = 18:00 UTC
    expect(mid?.toISO()).toBe('2026-07-25T18:00:00.000Z')
  })

  it('returns null if either bound is missing or invalid', () => {
    expect(eventMidpointUtc('', '2026-07-25T21:00', 'Europe/Rome')).toBeNull()
    expect(eventMidpointUtc('2026-07-25T19:00', 'bad', 'Europe/Rome')).toBeNull()
  })
})

describe('startTimeUtc — §6 field', () => {
  it('converts a naive local start to a UTC ISO string', () => {
    expect(startTimeUtc('2026-07-25T20:00', 'Europe/Rome')).toBe('2026-07-25T18:00:00.000Z')
  })

  it('returns null on invalid input', () => {
    expect(startTimeUtc('2026-07-25T20:00', 'Not/AZone')).toBeNull()
  })
})

describe('defaultZonesForCountry — country narrows the picker, never determines it', () => {
  it('single-zone country resolves to exactly one zone (auto-fill case)', () => {
    expect(defaultZonesForCountry('IT')).toEqual(['Europe/Rome'])
    expect(defaultZonesForCountry('GB')).toEqual(['Europe/London'])
    expect(defaultZonesForCountry('FR')).toEqual(['Europe/Paris'])
    expect(defaultZonesForCountry('IN')).toEqual(['Asia/Kolkata'])
  })

  it('is case-insensitive on the ISO code', () => {
    expect(defaultZonesForCountry('it')).toEqual(['Europe/Rome'])
  })

  it('multi-zone country returns multiple candidates (analyst picks)', () => {
    const us = defaultZonesForCountry('US')
    expect(us.length).toBeGreaterThan(1)
    expect(us).toContain('America/New_York')
  })

  it('unknown or empty code returns [] (picker falls back to allZones)', () => {
    expect(defaultZonesForCountry('ZZ')).toEqual([])
    expect(defaultZonesForCountry('')).toEqual([])
  })
})

describe('zone helpers', () => {
  it('isValidZone accepts real IANA ids and rejects junk', () => {
    expect(isValidZone('Europe/Rome')).toBe(true)
    expect(isValidZone('Not/AZone')).toBe(false)
    expect(isValidZone('')).toBe(false)
  })

  it('allZones returns the worldwide IANA list', () => {
    const zones = allZones()
    expect(Array.isArray(zones)).toBe(true)
    expect(zones).toContain('Europe/Rome')
  })
})
