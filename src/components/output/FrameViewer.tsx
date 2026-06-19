import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { EnrichedDetection } from '../../types'
import { fmt, fmtPct } from '../../lib/utils'

interface Props {
  current: EnrichedDetection           // the row that was clicked (highlighted)
  detections: EnrichedDetection[]      // all detections on the same frame
  file: File
  onClose: () => void
}

// Derive partner/asset from the raw tag when no cleaning rule has set them.
function tagParts(tag: string): { partner: string | null; asset: string | null } {
  const parts = tag.split(' - ')
  if (parts.length === 2) return { partner: parts[0].trim(), asset: parts[1].trim() }
  return { partner: null, asset: null }
}
function detPartner(d: EnrichedDetection): string {
  return d.partner ?? tagParts(d.tag).partner ?? d.tag
}
function detAsset(d: EnrichedDetection): string {
  return d.asset ?? tagParts(d.tag).asset ?? '—'
}

export default function FrameViewer({ current, detections, file, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const pct = (v: number, total: number) => `${(v / total) * 100}%`

  // Render the current detection last so its box + label sit on top.
  const ordered = [...detections].sort((a, b) => (a === current ? 1 : 0) - (b === current ? 1 : 0))

  const partner = detPartner(current)
  const asset = detAsset(current)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {partner} <span className="text-gray-400 font-normal">/</span> {asset}
            </p>
            <p className="text-xs text-gray-500">
              Frame {current.frame_number} · {fmt(current.timestamp_s, 2)}s · prob {fmtPct(current.probability, 0)} · {current.frame_width}×{current.frame_height}
              <span className="ml-2 text-gray-400">· {detections.length} detection{detections.length === 1 ? '' : 's'} on this frame</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 flex-none">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-3">
          {url && (
            <div className="relative inline-block max-w-full">
              <img src={url} alt={`Frame ${current.frame_number}`} className="block max-w-full max-h-[75vh] object-contain" />
              {ordered.map((d, i) => {
                const isCurrent = d === current
                const style: React.CSSProperties = {
                  left: pct(d.xmin, d.frame_width),
                  top: pct(d.ymin, d.frame_height),
                  width: pct(d.xmax - d.xmin, d.frame_width),
                  height: pct(d.ymax - d.ymin, d.frame_height),
                }
                const onRightHalf = (d.xmin + d.xmax) / 2 / d.frame_width > 0.5
                // Sit the label just above the box's top edge; drop it just below
                // only when the box is at the very top (so it doesn't clip off-screen).
                const nearTop = d.ymin / d.frame_height < 0.06
                const vert = nearTop ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                const boxColor = isCurrent
                  ? 'border-yellow-400 bg-yellow-400/10'
                  : 'border-brand-500 bg-brand-500/10 hover:border-green-500 hover:bg-green-500/10'
                const labelColor = isCurrent
                  ? 'bg-yellow-500'
                  : 'bg-brand-600 group-hover:bg-green-600'
                const labelText = `${detPartner(d)}${detAsset(d) !== '—' ? ` / ${detAsset(d)}` : ''} · prob: ${fmtPct(d.probability, 0)}`
                return (
                  <div
                    key={i}
                    title={labelText}
                    className={`group absolute border-2 hover:border-4 ${boxColor} pointer-events-auto cursor-default ${isCurrent ? 'z-20' : 'z-10'} hover:z-30`}
                    style={style}
                  >
                    {/* label sits just outside the box's top edge (no overlap) */}
                    <span
                      className={`absolute ${vert} ${onRightHalf ? 'right-0 text-right' : 'left-0'} text-[10px] group-hover:text-[11px] font-medium group-hover:font-bold text-white ${labelColor} px-1 rounded whitespace-nowrap`}
                    >
                      {labelText}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
