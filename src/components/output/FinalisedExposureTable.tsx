import { useProject } from '../../context/ProjectContext'
import { fmt, downloadCSV, videoName } from '../../lib/utils'
import InfoTip from '../common/InfoTip'

export default function FinalisedExposureTable() {
  const { finalised } = useProject()

  function handleExport() {
    downloadCSV('finalised_exposure.csv', finalised.map(f => ({
      event: f.event,
      video_id: f.video_id,
      timeslice: f.timeslice_label,
      partner: f.partner,
      asset: f.asset,
      exposure_identifier: f.exposure_identifier,
      detections: f.detection_count,
      sif: fmt(f.sif, 4),
      eph: fmt(f.eph, 1),
      gross_seconds: fmt(f.gross_seconds, 2),
      net_seconds: fmt(f.net_seconds, 2),
      differential: fmt(f.differential, 4),
      note: f.note ?? '',
    })))
  }

  const totalGross = finalised.reduce((s, f) => s + f.gross_seconds, 0)
  const totalNet = finalised.reduce((s, f) => s + f.net_seconds, 0)
  const totalEph = finalised.reduce((s, f) => s + f.eph, 0)
  const totalDetections = finalised.reduce((s, f) => s + f.detection_count, 0)

  if (finalised.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm font-medium text-gray-600">No finalised data yet</p>
        <p className="text-sm text-gray-400 mt-1">
          Generate exposure in <strong>4. Project Exposure &amp; QA</strong> first. Rows flagged
          out there are excluded from this final output.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Finalised Exposure (Step 16)</h2>
          <p className="text-xs text-gray-400 mt-0.5">{finalised.length.toLocaleString()} rows</p>
        </div>
        <button
          onClick={handleExport}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-auto max-h-[70vh] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Video</th>
              <th className="px-4 py-2">Timeslice</th>
              <th className="px-4 py-2">Partner</th>
              <th className="px-4 py-2">Asset</th>
              <th className="px-4 py-2 text-right">Detect</th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">SIF <InfoTip term="new_sif" /></span></th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">EPH <InfoTip term="eph" /></span></th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">Gross Seconds <InfoTip term="gross_seconds" /></span></th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">Net Seconds <InfoTip term="net_seconds" /></span></th>
              <th className="px-4 py-2"><span className="flex items-center gap-1">Diff <InfoTip term="differential" /></span></th>
              <th className="px-4 py-2">Comments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {finalised.map((f, i) => (
              <tr key={i} className="bg-white hover:bg-gray-50">
                <td className="px-4 py-2" title={f.video_id}>{videoName(f.video_id)}</td>
                <td className="px-4 py-2">{f.timeslice_label}</td>
                <td className="px-4 py-2">{f.partner}</td>
                <td className="px-4 py-2">{f.asset}</td>
                <td className="px-4 py-2 text-right">{f.detection_count.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{fmt(f.sif, 4)}</td>
                <td className="px-4 py-2 text-right">{fmt(f.eph, 1)}</td>
                <td className="px-4 py-2 text-right">{fmt(f.gross_seconds, 2)}</td>
                <td className="px-4 py-2 text-right">{fmt(f.net_seconds, 2)}</td>
                <td className="px-4 py-2 text-right">{fmt(f.differential, 4)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{f.note}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr className="font-semibold text-gray-700">
              <td className="px-4 py-2" colSpan={4}>Total</td>
              <td className="px-4 py-2 text-right">{totalDetections.toLocaleString()}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right">{fmt(totalEph, 1)}</td>
              <td className="px-4 py-2 text-right">{fmt(totalGross, 2)}</td>
              <td className="px-4 py-2 text-right">{fmt(totalNet, 2)}</td>
              <td className="px-4 py-2" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
