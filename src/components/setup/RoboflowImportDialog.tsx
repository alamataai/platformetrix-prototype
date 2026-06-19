import { useState, useRef, useEffect } from 'react'
import { useProject } from '../../context/ProjectContext'
import { loadRoboflowDefaults, saveRoboflowDefaults } from '../../lib/storage'
import {
  runInferenceOnImage, buildDetectionsCsv, frameNumberFromName, isImageFile,
  type RoboflowConfig, type FrameResult,
} from '../../lib/roboflow'

interface Props {
  videoLabel: string
  onComplete: (csvId: string) => void
  onCancel: () => void
}

export default function RoboflowImportDialog({ videoLabel, onComplete, onCancel }: Props) {
  const { uploadCSVFile } = useProject()
  const defaults = loadRoboflowDefaults()

  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState(defaults.modelId)
  const [confidence, setConfidence] = useState(String(defaults.confidence))
  const [fps, setFps] = useState(String(defaults.fps))
  const [files, setFiles] = useState<File[]>([])

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)
  const folderRef = useRef<HTMLInputElement>(null)

  // webkitdirectory isn't a standard React prop — set it imperatively.
  useEffect(() => {
    const el = folderRef.current
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    }
  }, [])

  function onFolderPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
      .filter(f => isImageFile(f.name))
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name))
    setFiles(picked)
    setError(null)
  }

  async function run() {
    const fpsNum = parseFloat(fps)
    const confNum = parseFloat(confidence)
    if (!apiKey.trim()) return setError('API key is required.')
    if (!modelId.trim()) return setError('Model ID is required.')
    if (!(fpsNum > 0)) return setError('FPS must be greater than 0.')
    if (files.length === 0) return setError('Choose a frames folder first.')

    const cfg: RoboflowConfig = { apiKey: apiKey.trim(), modelId: modelId.trim(), confidence: confNum, fps: fpsNum }
    setRunning(true)
    setError(null)
    setWarnings([])
    cancelRef.current = false
    setProgress({ done: 0, total: files.length })

    const frames: FrameResult[] = []
    const warns: string[] = []
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break
      const file = files[i]
      try {
        const { width, height, predictions } = await runInferenceOnImage(file, cfg)
        frames.push({ frame_number: frameNumberFromName(file.name, i), width, height, predictions })
      } catch (e) {
        warns.push(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`)
      }
      setProgress({ done: i + 1, total: files.length })
    }

    if (cancelRef.current) {
      setRunning(false)
      setWarnings(['Cancelled.'])
      return
    }

    const detCount = frames.reduce((s, f) => s + f.predictions.length, 0)
    if (detCount === 0) {
      setRunning(false)
      setWarnings([...warns, 'No detections produced — check the model, confidence, and that these are the right frames.'])
      return
    }

    saveRoboflowDefaults({ modelId: cfg.modelId, confidence: cfg.confidence, fps: cfg.fps })
    const csv = buildDetectionsCsv(frames, cfg)
    const slug = cfg.modelId.replace(/[^\w]+/g, '_')
    const id = uploadCSVFile(`roboflow_${slug}_${Date.now()}.csv`, csv)
    setRunning(false)
    onComplete(id)
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Run from Roboflow</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Run your Roboflow model on a folder of frames for “{videoLabel || 'this video'}” and attach the resulting CSV.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">API Key (not saved)</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={running}
              placeholder="Roboflow API key"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Model ID</label>
            <input
              type="text"
              value={modelId}
              onChange={e => setModelId(e.target.value)}
              disabled={running}
              placeholder="my-first-project-6rjsc/4"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confidence (%)</label>
            <input
              type="number" step="1" min="0" max="100"
              value={confidence}
              onChange={e => setConfidence(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">FPS</label>
            <input
              type="number" step="0.01" min="0"
              value={fps}
              onChange={e => setFps(e.target.value)}
              disabled={running}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Frames folder</label>
          <input ref={folderRef} type="file" multiple onChange={onFolderPicked} disabled={running}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
          {files.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{files.length.toLocaleString()} image{files.length === 1 ? '' : 's'} selected</p>
          )}
        </div>

        {running && (
          <div className="space-y-1">
            <div className="h-2 w-full bg-gray-100 rounded overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-500">Processing {progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-700">{error}</div>
        )}

        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-800 space-y-0.5 max-h-32 overflow-auto">
            <strong>{warnings.length} note{warnings.length === 1 ? '' : 's'}:</strong>
            <ul className="list-disc ml-4">
              {warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
              {warnings.length > 30 && <li>…and {warnings.length - 30} more</li>}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          {running ? (
            <button
              onClick={() => { cancelRef.current = true }}
              className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Cancel run
            </button>
          ) : (
            <>
              <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50">
                Close
              </button>
              <button onClick={run} className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 font-medium">
                Run model
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
