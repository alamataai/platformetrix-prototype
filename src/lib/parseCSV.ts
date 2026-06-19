import type { Detection } from '../types'

const REQUIRED_COLUMNS = [
  'frame_number', 'timestamp_s', 'tag', 'probability',
  'xmin', 'xmax', 'ymin', 'ymax', 'frame_width', 'frame_height', 'seconds',
]

export interface ParseResult {
  detections: Detection[]
  skippedRows: number
  warnings: string[]
}

/** Distinct (video_id, frame_number) pairs across a set of detections. */
export function countFrames(detections: Detection[]): number {
  const frames = new Set<string>()
  for (const d of detections) frames.add(`${d.video_id}::${d.frame_number}`)
  return frames.size
}

/** Highest timestamp_s seen — a proxy for the duration covered by the file. */
export function maxDuration(detections: Detection[]): number {
  let max = 0
  for (const d of detections) if (d.timestamp_s > max) max = d.timestamp_s
  return max
}

/** Distinct video_id values across a set of detections, in first-seen order.
 *  (Parsed rows carry no video_id — it's assigned on combine — so this is empty
 *  for freshly-parsed CSVs and only meaningful on combined/enriched detections.) */
export function distinctVideoIds(detections: Detection[]): string[] {
  const ids = new Set<string>()
  for (const d of detections) if (d.video_id) ids.add(d.video_id)
  return [...ids]
}

/** Distinct raw tag values across a set of detections, in first-seen order. */
export function distinctTags(detections: Detection[]): string[] {
  const tags = new Set<string>()
  for (const d of detections) tags.add(d.tag)
  return [...tags]
}

export function parseCSV(raw: string): ParseResult {
  // Strip BOM
  const text = raw.replace(/^﻿/, '')
  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const warnings: string[] = []
  let skippedRows = 0

  const headerLine = lines[0]?.trim()
  if (!headerLine) throw new Error('CSV is empty — no header row found.')

  const headers = headerLine.split(',').map(h => h.trim())

  const missingCols = REQUIRED_COLUMNS.filter(c => !headers.includes(c))
  if (missingCols.length > 0) {
    // Detect Roboflow per-image summary format and give a specific message
    const isRoboflowSummary =
      headers.includes('Image') &&
      headers.includes('NumDetections') &&
      headers.includes('TopTag')
    if (isRoboflowSummary) {
      throw new Error(
        'This looks like the Roboflow "per-image summary" CSV (one row per frame, TopTag only). ' +
        'This app needs the per-detection CSV — one row per bounding box, with columns: ' +
        'frame_number, timestamp_s, tag, probability, xmin, xmax, ymin, ymax, frame_width, frame_height, seconds. ' +
        'In Roboflow, export using the "CSV" format under Dataset → Export, not the summary report.'
      )
    }
    throw new Error(
      `Wrong CSV format — missing columns: ${missingCols.join(', ')}.\n` +
      `Expected columns: ${REQUIRED_COLUMNS.join(', ')}.\n` +
      `Got: ${headers.join(', ')}`
    )
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))

  const detections: Detection[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(',').map(c => c.trim())

    const parseNum = (field: string): number | null => {
      const v = parseFloat(cols[idx[field]])
      return isNaN(v) ? null : v
    }

    const frame_number = parseNum('frame_number')
    const timestamp_s = parseNum('timestamp_s')
    const probability = parseNum('probability')
    const xmin = parseNum('xmin')
    const xmax = parseNum('xmax')
    const ymin = parseNum('ymin')
    const ymax = parseNum('ymax')
    const frame_width = parseNum('frame_width')
    const frame_height = parseNum('frame_height')
    const seconds = parseNum('seconds')

    if (
      frame_number === null || timestamp_s === null || probability === null ||
      xmin === null || xmax === null || ymin === null || ymax === null ||
      frame_width === null || frame_height === null || seconds === null
    ) {
      skippedRows++
      warnings.push(`Row ${i + 1}: non-numeric value in a numeric field — row skipped.`)
      continue
    }

    const tag = cols[idx['tag']]

    if (!tag) {
      skippedRows++
      warnings.push(`Row ${i + 1}: missing tag — row skipped.`)
      continue
    }

    detections.push({
      video_id: '',   // assigned from the owning video on combine
      frame_number,
      timestamp_s,
      tag,
      probability,
      xmin,
      xmax,
      ymin,
      ymax,
      frame_width,
      frame_height,
      seconds,
    })
  }

  return { detections, skippedRows, warnings }
}
