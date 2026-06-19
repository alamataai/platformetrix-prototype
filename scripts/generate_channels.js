// Converts public/sports_channels.csv → src/config/channels.json
// Run from project root: node scripts/generate_channels.js
//
// Source data: iptv-org/database - https://github.com/iptv-org/database
// Full channel list: https://raw.githubusercontent.com/iptv-org/database/master/data/channels.csv
// Filter to sports: keep rows where categories contains "sports", save as public/sports_channels.csv
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const csv = readFileSync(resolve(root, 'public/sports_channels.csv'), 'utf8')
const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

// Parse a CSV line respecting quoted fields
function parseLine(line) {
  const fields = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

const headers = parseLine(lines[0])
const channels = []

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim()
  if (!line) continue
  const raw = parseLine(line)
  const row = {}
  headers.forEach((h, idx) => { row[h] = (raw[idx] ?? '').trim() })

  if (!row.country_code) continue  // skip rows without a country

  const splitMulti = (val) => val ? val.split('; ').map(s => s.trim()).filter(Boolean) : []
  const strOrNull = (val) => val || null

  channels.push({
    id:             row.id,
    name:           row.name,
    alt_names:      splitMulti(row.alt_names),
    network:        strOrNull(row.network),
    owners:         strOrNull(row.owners),
    country_code:   row.country_code,
    country_name:   row.country_name,
    categories:     splitMulti(row.categories),
    is_nsfw:        row.is_nsfw === 'TRUE',
    launched:       strOrNull(row.launched),
    closed:         strOrNull(row.closed),
    replaced_by:    strOrNull(row.replaced_by),
    website:        strOrNull(row.website),
    languages:      splitMulti(row.languages),
    timezones:      strOrNull(row.timezones),
    broadcast_area: splitMulti(row.broadcast_area),
    logo_url:       strOrNull(row.logo_url),
    stream_count:   parseInt(row.stream_count, 10) || 0,
    stream_url:     strOrNull(row.stream_url),
    stream_quality: strOrNull(row.stream_quality),
  })
}

const out = resolve(root, 'src/config/channels.json')
writeFileSync(out, JSON.stringify(channels, null, 2), 'utf8')
console.log(`Wrote ${channels.length} channels to ${out}`)
