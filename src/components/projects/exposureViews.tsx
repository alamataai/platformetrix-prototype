import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { fmt, videoName } from '../../lib/utils'
import InfoTip from '../common/InfoTip'
import type { FinalisedExposure } from '../../types'

interface ExposureAgg {
  label: string
  gross: number
  net: number
}

function aggregateByKey(rows: FinalisedExposure[], key: 'partner' | 'asset'): ExposureAgg[] {
  const map = new Map<string, ExposureAgg>()
  for (const r of rows) {
    const k = r[key]
    const cur = map.get(k) ?? { label: k, gross: 0, net: 0 }
    cur.gross += r.gross_seconds
    cur.net += r.net_seconds
    map.set(k, cur)
  }
  return [...map.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 10)
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-md p-3">
      <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
      {children}
    </div>
  )
}

const AXIS = { tick: { fontSize: 10, fill: '#6b7280' } }

const tipFmt = (decimals: number) => (v: unknown) =>
  typeof v === 'number' ? fmt(v, decimals) : String(v ?? '')

function ExposureBarChart({ data }: { data: ExposureAgg[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={72} {...AXIS} />
        <YAxis {...AXIS} />
        <Tooltip formatter={tipFmt(2)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="gross" name="Gross s" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
        <Bar dataKey="net" name="Net s" fill="#22c55e" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EventCharts({ rows }: { rows: FinalisedExposure[] }) {
  const byPartner = useMemo(() => aggregateByKey(rows, 'partner'), [rows])
  const byAsset = useMemo(() => aggregateByKey(rows, 'asset'), [rows])
  if (byPartner.length === 0 && byAsset.length === 0) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Top 10 Total Exposure per Partner">
        <ExposureBarChart data={byPartner} />
      </ChartCard>
      <ChartCard title="Top 10 Total Exposure per Asset">
        <ExposureBarChart data={byAsset} />
      </ChartCard>
    </div>
  )
}

type SortKey = 'video_id' | 'timeslice_label' | 'partner' | 'asset'
  | 'detection_count' | 'sif' | 'eph' | 'gross_seconds' | 'net_seconds' | 'differential'
type SortDir = 'asc' | 'desc'

const NUMERIC: SortKey[] = ['detection_count', 'sif', 'eph', 'gross_seconds', 'net_seconds', 'differential']

export function FinalisedTable({ rows }: { rows: FinalisedExposure[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('gross_seconds')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 italic px-1 py-2">No finalised data yet — complete the event pipeline to populate this table.</p>
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] as string | number
    const bv = b[sortKey] as string | number
    const cmp = NUMERIC.includes(sortKey)
      ? (av as number) - (bv as number)
      : String(av).toLowerCase().localeCompare(String(bv).toLowerCase())
    return sortDir === 'asc' ? cmp : -cmp
  })

  function Th({ label, sk, right, tip }: { label: string; sk: SortKey; right?: boolean; tip?: React.ReactNode }) {
    const active = sortKey === sk
    const icon = active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'
    return (
      <th className={`px-3 py-2 ${right ? 'text-right' : ''}`}>
        <button
          onClick={() => toggleSort(sk)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide text-xs hover:text-gray-700 ${active ? 'text-gray-700 font-semibold' : 'text-gray-500'}`}
        >
          {label} <span className="text-[10px]">{icon}</span>
        </button>
        {tip}
      </th>
    )
  }

  const totalGross = rows.reduce((s, f) => s + f.gross_seconds, 0)
  const totalNet = rows.reduce((s, f) => s + f.net_seconds, 0)
  const totalEph = rows.reduce((s, f) => s + f.eph, 0)
  const totalDetections = rows.reduce((s, f) => s + f.detection_count, 0)

  return (
    <div className="overflow-auto max-h-[70vh] rounded-md border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr className="text-left text-xs">
            <Th label="Video" sk="video_id" />
            <Th label="Timeslice" sk="timeslice_label" />
            <Th label="Partner" sk="partner" />
            <Th label="Asset" sk="asset" />
            <Th label="Detect" sk="detection_count" right tip={<InfoTip term="sif" />} />
            <Th label="SIF" sk="sif" right tip={<InfoTip term="new_sif" />} />
            <Th label="EPH" sk="eph" right tip={<InfoTip term="eph" />} />
            <Th label="Gross s" sk="gross_seconds" right tip={<InfoTip term="gross_seconds" />} />
            <Th label="Net s" sk="net_seconds" right tip={<InfoTip term="net_seconds" />} />
            <Th label="Diff" sk="differential" right tip={<InfoTip term="differential" />} />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((f, i) => (
            <tr key={i} className="bg-white hover:bg-gray-50">
              <td className="px-3 py-2" title={f.video_id}>{videoName(f.video_id)}</td>
              <td className="px-3 py-2">{f.timeslice_label}</td>
              <td className="px-3 py-2">{f.partner}</td>
              <td className="px-3 py-2">{f.asset}</td>
              <td className="px-3 py-2 text-right">{f.detection_count.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{fmt(f.sif, 4)}</td>
              <td className="px-3 py-2 text-right">{fmt(f.eph, 1)}</td>
              <td className="px-3 py-2 text-right">{fmt(f.gross_seconds, 2)}</td>
              <td className="px-3 py-2 text-right">{fmt(f.net_seconds, 2)}</td>
              <td className="px-3 py-2 text-right">{fmt(f.differential, 4)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr className="font-semibold text-gray-700">
            <td className="px-3 py-2" colSpan={4}>Total</td>
            <td className="px-3 py-2 text-right">{totalDetections.toLocaleString()}</td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 text-right">{fmt(totalEph, 1)}</td>
            <td className="px-3 py-2 text-right">{fmt(totalGross, 2)}</td>
            <td className="px-3 py-2 text-right">{fmt(totalNet, 2)}</td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// Combined "statistics with charts" block: charts above the finalised table.
// Default export so it can be React.lazy-loaded (keeps recharts out of the initial bundle).
export default function EventStats({ rows }: { rows: FinalisedExposure[] }) {
  return (
    <div className="space-y-4">
      <EventCharts rows={rows} />
      <FinalisedTable rows={rows} />
    </div>
  )
}
