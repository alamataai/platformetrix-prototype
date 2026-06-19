import { describe, it, expect } from 'vitest'
import {
  enrichDetections,
  computeVideoExposures,
  computeProjectExposures,
  computeFinalisedExposures,
  defaultGlobalSettings,
} from './pipeline'
import type { PipelineInput } from './pipeline'
import type { Detection, TagCleaningRule, ResolvedVideoMedia } from '../types'
import { collectTimeslices } from './videos'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VIDEO_ID = 'Aquatics / Day 1 Swimming / Day 1'

function detection(over: Partial<Detection> = {}): Detection {
  return {
    video_id: VIDEO_ID,
    frame_number: 800,
    timestamp_s: 820, // inside the Final timeslice by default
    tag: 'Arena – LED',
    probability: 0.96,
    xmin: 310, xmax: 610, ymin: 880, ymax: 980,
    frame_width: 1920, frame_height: 1080,
    seconds: 0.04,
    ...over,
  }
}

const rules: TagCleaningRule[] = [
  { raw_tag: 'Arena – LED', status: 'mapped', partner: 'Arena', asset: 'Poolside LED', note: null },
  { raw_tag: 'BPER Banca – LED', status: 'mapped', partner: 'BPER: Banca', asset: 'Poolside LED', note: null },
  { raw_tag: 'Enel – LED', status: 'mapped', partner: 'Enel', asset: 'Poolside LED', note: null },
  { raw_tag: 'Buoy – Lane', status: 'excluded', partner: null, asset: null, note: 'lane buoy, not a sponsor' },
]

const video: ResolvedVideoMedia = {
  id: 'm1',
  sports_event_id: 'se1',
  type: 'video',
  label: 'Day 1',
  is_excluded: false,
  csv_file_id: null,
  competition_name: 'Aquatics',
  sports_event_name: 'Day 1 Swimming',
  video_id: VIDEO_ID,
  timeslices: [
    { media_id: 'm1', video_id: VIDEO_ID, label: 'Warm-up', start_s: 0, end_s: 599.99, duration_s: 599.99, is_excluded: true },
    { media_id: 'm1', video_id: VIDEO_ID, label: 'Final', start_s: 600, end_s: 3599.99, duration_s: 2999.99, is_excluded: false },
  ],
}

function input(over: Partial<PipelineInput> = {}): PipelineInput {
  return { videos: [video], timeslices: collectTimeslices([video]), tag_cleaning_rules: rules, ...over }
}

const enrichOne = (d: Detection, inp = input()) => enrichDetections([d], inp, defaultGlobalSettings)[0]

// ─── Steps 1–9: per-detection enrichment (primary example) ───────────────────

describe('Step 1 — bounding-box geometry', () => {
  it('computes width, height, size', () => {
    const e = enrichOne(detection())
    expect(e.width).toBe(300)
    expect(e.height).toBe(100)
    expect(e.size).toBe(30000)
  })
})

describe('Step 4 — share of screen', () => {
  it('is box area / frame area', () => {
    const e = enrichOne(detection())
    expect(e.share_of_screen).toBeCloseTo(0.0144676, 6)
  })
})

describe('Step 5 — balanced share', () => {
  it('applies the balanced-share exponent (40)', () => {
    const e = enrichOne(detection())
    expect(e.balanced_share).toBeCloseTo(0.441741, 5)
  })
})

describe('Step 6 — grid position', () => {
  it('maps the primary example to A4', () => {
    expect(enrichOne(detection()).screen_position).toBe('A4')
  })
  it('maps the Rolex scoreboard box to C1', () => {
    const e = enrichOne(detection({ tag: 'Rolex – Scoreboard', xmin: 860, xmax: 1060, ymin: 50, ymax: 150 }))
    expect(e.screen_position).toBe('C1')
  })
  it('clamps a box on the frame edge to D4 (no E5)', () => {
    const e = enrichOne(detection({ xmin: 1900, xmax: 1920, ymin: 1060, ymax: 1080 }))
    expect(e.screen_position).toBe('D4')
  })
})

describe('Step 7 — position score', () => {
  it('reads A4 from the position table', () => {
    expect(enrichOne(detection()).position_score).toBe(1.5)
  })
})

describe('Step 8 — clutter score', () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => detection({ frame_number: 820, tag: `Brand ${i}` }))

  it('1 tag (solus) → 1.12', () => {
    expect(enrichDetections(make(1), input(), defaultGlobalSettings)[0].clutter_score).toBe(1.12)
  })
  it('3 tags → 0.90', () => {
    expect(enrichDetections(make(3), input(), defaultGlobalSettings)[0].clutter_score).toBe(0.9)
  })
  it('6 tags → 0.72', () => {
    expect(enrichDetections(make(6), input(), defaultGlobalSettings)[0].clutter_score).toBe(0.72)
  })
  it('50 tags → 0.70 (floor)', () => {
    expect(enrichDetections(make(50), input(), defaultGlobalSettings)[0].clutter_score).toBe(0.7)
  })
})

describe('Step 9 — SIF (balanced_share × clutter × position)', () => {
  it('computes SIF for an Arena LED detection in a 3-brand frame at A4', () => {
    const frame = [
      detection({ frame_number: 820, tag: 'Arena – LED' }),
      detection({ frame_number: 820, tag: 'BPER Banca – LED', xmin: 640, xmax: 940 }),
      detection({ frame_number: 820, tag: 'Enel – LED', xmin: 970, xmax: 1270 }),
    ]
    const arena = enrichDetections(frame, input(), defaultGlobalSettings)[0]
    // 0.441741 × 0.90 × 1.50
    expect(arena.sif).toBeCloseTo(0.596351, 5)
  })
})

// ─── Step 10: exclusion rules (first match wins, in code order) ───────────────

describe('Step 10 — exclusion rules', () => {
  it('included detection (approved tag, Final timeslice) has no exclusion', () => {
    const e = enrichOne(detection())
    expect(e.exclusion_reason).toBeNull()
    expect(e.is_excluded).toBe(false)
  })
  it('tag "no_detection" → NO_DETECTION', () => {
    expect(enrichOne(detection({ tag: 'no_detection' })).exclusion_reason).toBe('NO_DETECTION')
  })
  it('tag dispositioned as excluded → EXCLUDED_BY_RULE', () => {
    const d = enrichOne(detection({ tag: 'Buoy – Lane' }))
    expect(d.exclusion_reason).toBe('EXCLUDED_BY_RULE')
    expect(d.tag_status).toBe('excluded')
  })
  it('detection on an excluded video → VIDEO_EXCLUDED', () => {
    const inp = input({ videos: [{ ...video, is_excluded: true }] })
    expect(enrichOne(detection(), inp).exclusion_reason).toBe('VIDEO_EXCLUDED')
  })
  it('detection in an excluded timeslice → TIMESLICE_EXCLUDED', () => {
    expect(enrichOne(detection({ timestamp_s: 32 })).exclusion_reason).toBe('TIMESLICE_EXCLUDED')
  })
  it('detection outside any timeslice → NO_TIMESLICE', () => {
    expect(enrichOne(detection({ timestamp_s: 5000 })).exclusion_reason).toBe('NO_TIMESLICE')
  })
  it('detection below the exposure threshold → BELOW_THRESHOLD', () => {
    expect(enrichOne(detection({ xmin: 0, xmax: 28, ymin: 0, ymax: 14 })).exclusion_reason).toBe('BELOW_THRESHOLD')
  })
  it('unknown tag (no cleaning rule) → TAG_PENDING', () => {
    const d = enrichOne(detection({ tag: 'BetMGM – Board' }))
    expect(d.exclusion_reason).toBe('TAG_PENDING')
    expect(d.tag_status).toBe('pending')
  })
})

// ─── Step 11: video exposure aggregation ──────────────────────────────────────

// Each detection in its own frame → solus (num_tags = 1, clutter 1.12).
const solusBlock = () => Array.from({ length: 7810 }, (_, i) => detection({ frame_number: i }))

describe('Step 11 — video exposure aggregation', () => {
  const block = solusBlock()
  const exposures = computeVideoExposures(
    enrichDetections(block, input(), defaultGlobalSettings),
    [video],
  )

  it('groups into a single exposure with an em-dash identifier', () => {
    expect(exposures).toHaveLength(1)
    expect(exposures[0].exposure_identifier).toBe('Arena – Poolside LED – Final')
  })
  it('sums gross_seconds and counts detections', () => {
    expect(exposures[0].gross_seconds).toBeCloseTo(312.4, 4)
    expect(exposures[0].detection_count).toBe(7810)
  })
  it('averages SIF across the group', () => {
    // solus block: balanced_share × 1.12 × 1.50
    expect(exposures[0].sif).toBeCloseTo(0.742125, 5)
  })
})

// ─── Step 11: qa_key is unique per video even when the display id collides ────

describe('Step 11 — qa_key uniqueness across videos', () => {
  const VIDEO_ID_2 = 'Aquatics / Day 1 Swimming / Day 2'
  const video2: ResolvedVideoMedia = {
    ...video,
    id: 'm2',
    label: 'Day 2',
    video_id: VIDEO_ID_2,
    timeslices: [
      { media_id: 'm2', video_id: VIDEO_ID_2, label: 'Final', start_s: 600, end_s: 3599.99, duration_s: 2999.99, is_excluded: false },
    ],
  }
  // Same partner/asset/timeslice on two different videos → identical display id.
  const inp: PipelineInput = { videos: [video, video2], timeslices: collectTimeslices([video, video2]), tag_cleaning_rules: rules }
  const exposures = computeVideoExposures(
    enrichDetections([detection(), detection({ video_id: VIDEO_ID_2 })], inp, defaultGlobalSettings),
    [video, video2],
  )

  it('produces one row per video', () => {
    expect(exposures).toHaveLength(2)
  })
  it('shares the (display-only) exposure_identifier', () => {
    expect(new Set(exposures.map(e => e.exposure_identifier))).toEqual(
      new Set(['Arena – Poolside LED – Final']),
    )
  })
  it('keeps qa_key distinct and scoped by video_id', () => {
    expect(exposures[0].qa_key).not.toBe(exposures[1].qa_key)
    expect([...exposures].map(e => e.qa_key).sort()).toEqual([
      `${VIDEO_ID}||Arena||Poolside LED||Final`,
      `${VIDEO_ID_2}||Arena||Poolside LED||Final`,
    ].sort())
  })
})

// ─── Steps 12–13: project exposure (new SIF, net seconds, EPH) ────────────────

describe('Steps 12–13 — project exposure', () => {
  const ve = computeVideoExposures(
    enrichDetections(solusBlock(), input(), defaultGlobalSettings),
    [video],
  )
  const pe = computeProjectExposures(ve, 0.33)[0]

  it('new_sif = sif_multiplier × sif', () => {
    expect(pe.new_sif).toBeCloseTo(0.33 * pe.sif, 8)
  })
  it('net_seconds = new_sif × gross_seconds', () => {
    expect(pe.net_seconds).toBeCloseTo(pe.new_sif * pe.gross_seconds, 6)
  })
  it('eph = (gross_seconds / timeslice_duration_s) × 3600 ≈ 375', () => {
    expect(pe.eph).toBeCloseTo(375.0, 0)
  })
})

// ─── Step 16: finalised exposure ──────────────────────────────────────────────

describe('Step 16 — finalised exposure', () => {
  const ve = computeVideoExposures(
    enrichDetections(solusBlock(), input(), defaultGlobalSettings),
    [video],
  )
  const base = computeProjectExposures(ve, 0.33)

  it('with no override (differential = 1) gross_seconds and eph are unchanged', () => {
    const out = computeFinalisedExposures(base, [video])
    expect(out[0].gross_seconds).toBeCloseTo(312.4, 4)
    expect(out[0].eph).toBeCloseTo(base[0].eph_current * 1, 6)
  })

  it('applies the differential to gross_seconds, net_seconds, and eph', () => {
    const overridden = base.map(pe => ({ ...pe, differential: 0.804 }))
    const out = computeFinalisedExposures(overridden, [video])
    expect(out[0].gross_seconds).toBeCloseTo(312.4 * 0.804, 3)
    expect(out[0].net_seconds).toBeCloseTo(out[0].gross_seconds * out[0].sif, 6)
    expect(out[0].eph).toBeCloseTo(base[0].eph_current * 0.804, 4)
  })

  it('excludes rows flagged is_audited_out', () => {
    const flagged = base.map(pe => ({ ...pe, is_audited_out: true, audit_flag_note: 'anomaly' }))
    expect(computeFinalisedExposures(flagged, [video])).toHaveLength(0)
  })
})
