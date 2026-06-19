export function round(value: number, dp: number): number {
  const factor = Math.pow(10, dp)
  return Math.round(value * factor) / factor
}

export function fmt(value: number, dp: number): string {
  return value.toFixed(dp)
}

export function fmtPct(value: number, dp = 2): string {
  return `${(value * 100).toFixed(dp)}%`
}

/** Split a raw AI tag like "Arena – LED" into partner/asset. Tolerant of the separator being a
 *  hyphen, en-dash, or em-dash surrounded by spaces. Returns nulls unless it splits into exactly
 *  two parts (callers treat null as "no rule / needs manual entry"). */
export function splitRawTag(tag: string): { partner: string | null; asset: string | null } {
  const parts = tag.split(/\s+[-–—]\s+/)
  if (parts.length === 2) return { partner: parts[0].trim(), asset: parts[1].trim() }
  return { partner: null, asset: null }
}

/** Generate a video_id from competition, sports event, and media label: "Comp / Event / Label". */
export function makeVideoId(competition_name: string, sports_event_name: string, label: string): string {
  return [competition_name.trim(), sports_event_name.trim(), label.trim()].filter(Boolean).join(' / ')
}

/** The media (video) name from a video_id: "Comp / Event / Label" → "Label". */
export function videoName(video_id: string): string {
  const i = video_id.lastIndexOf(' / ')
  return i >= 0 ? video_id.slice(i + 3) : video_id
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const v = row[h]
        const s = v === null || v === undefined ? '' : String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    ),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
