// Roboflow hosted-inference client. Calls go through the Vite dev proxy
// (`/roboflow/*` → https://serverless.roboflow.com/*) to avoid CORS.

export interface RoboflowConfig {
  apiKey: string
  modelId: string      // e.g. "my-first-project-6rjsc/4"
  confidence: number   // percent, 0–100
  fps: number          // frames per second, used to derive timestamps
}

export interface RoboflowPrediction {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  class?: string
  class_name?: string
}

export interface FrameResult {
  frame_number: number
  width: number
  height: number
  predictions: RoboflowPrediction[]
}

const IMAGE_EXT = ['.jpg', '.jpeg', '.png']

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXT.some(ext => lower.endsWith(ext))
}

/** Extract a frame number from a filename's trailing digits ("frame_000820.png" → 820). */
export function frameNumberFromName(filename: string, fallbackIndex: number): number {
  const base = filename.replace(/\.[^.]+$/, '')
  const m = base.match(/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : fallbackIndex
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

/** Run the model on a single image via the dev proxy. */
export async function runInferenceOnImage(
  file: File,
  cfg: RoboflowConfig,
): Promise<{ width: number; height: number; predictions: RoboflowPrediction[] }> {
  const base64 = await readAsBase64(file)
  const params = new URLSearchParams({
    api_key: cfg.apiKey,
    format: 'json',
    confidence: String(Math.round(cfg.confidence)),
  })
  const url = `/roboflow/${cfg.modelId}?${params.toString()}`

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: base64,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Roboflow ${resp.status}: ${text.slice(0, 200) || resp.statusText}`)
  }
  const data = await resp.json()
  const width = data?.image?.width
  const height = data?.image?.height
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('Roboflow response missing image dimensions')
  }
  return { width, height, predictions: Array.isArray(data.predictions) ? data.predictions : [] }
}

function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(Math.round(v), max))
}

/**
 * Build a CSV string in the exact column format the app's parser expects.
 * Mirrors the box-corner + clamp math of RoboflowMacTest.ps1.
 */
export function buildDetectionsCsv(frames: FrameResult[], cfg: RoboflowConfig): string {
  const header = [
    'frame_number', 'timestamp_s', 'tag', 'probability',
    'xmin', 'xmax', 'ymin', 'ymax', 'frame_width', 'frame_height', 'seconds',
  ]
  const seconds = cfg.fps > 0 ? 1 / cfg.fps : 0
  const lines = [header.join(',')]

  for (const fr of frames) {
    const timestamp_s = cfg.fps > 0 ? fr.frame_number / cfg.fps : 0
    for (const p of fr.predictions) {
      const xmin = clamp(p.x - p.width / 2, fr.width)
      const xmax = clamp(p.x + p.width / 2, fr.width)
      const ymin = clamp(p.y - p.height / 2, fr.height)
      const ymax = clamp(p.y + p.height / 2, fr.height)
      if (xmax - xmin <= 0 || ymax - ymin <= 0) continue
      const rawTag = (p.class ?? p.class_name ?? 'unknown')
      const tag = rawTag.replace(/,/g, ' ')   // parser splits naively on commas
      lines.push([
        fr.frame_number,
        timestamp_s.toFixed(3),
        tag,
        p.confidence.toFixed(4),
        xmin, xmax, ymin, ymax,
        fr.width, fr.height,
        seconds.toFixed(4),
      ].join(','))
    }
  }
  return lines.join('\n')
}
