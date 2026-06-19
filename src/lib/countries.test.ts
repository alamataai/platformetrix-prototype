import { describe, it, expect } from 'vitest'
import { countryName, countryCodeFromName, countryOptions } from './countries'

describe('countryName', () => {
  it('maps ISO codes to display names', () => {
    expect(countryName('DE')).toBe('Germany')
    expect(countryName('IT')).toBe('Italy')
    expect(countryName('GB')).toBe('United Kingdom')
  })

  it('falls back to the raw code when unknown, and empty stays empty', () => {
    expect(countryName('ZZ')).toBe('ZZ')
    expect(countryName('')).toBe('')
  })
})

describe('countryCodeFromName — legacy free-text migration', () => {
  it('matches canonical names case-insensitively', () => {
    expect(countryCodeFromName('Germany')).toBe('DE')
    expect(countryCodeFromName('italy')).toBe('IT')
  })

  it('resolves common aliases', () => {
    expect(countryCodeFromName('UK')).toBe('GB')
    expect(countryCodeFromName('United Kingdom')).toBe('GB')
    expect(countryCodeFromName('USA')).toBe('US')
    expect(countryCodeFromName('United States')).toBe('US')
  })

  it('passes through an input that is already a valid code', () => {
    expect(countryCodeFromName('DE')).toBe('DE')
  })

  it('returns "" when unresolved or empty', () => {
    expect(countryCodeFromName('Atlantis')).toBe('')
    expect(countryCodeFromName('')).toBe('')
  })
})

describe('countryOptions', () => {
  it('returns a non-empty list sorted by name', () => {
    const opts = countryOptions()
    expect(opts.length).toBeGreaterThan(200)
    const names = opts.map(o => o.name)
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
    expect(opts.find(o => o.code === 'IT')?.name).toBe('Italy')
  })
})
