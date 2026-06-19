import type {
  Detection,
  EnrichedDetection,
  ExclusionReason,
  TagStatus,
  Timeslice,
  TagCleaningRule,
  VideoExposure,
  ProjectExposure,
  FinalisedExposure,
  ResolvedMedia,
  GlobalSettings,
} from '../types'
export type { GlobalSettings }

// What the enrichment pipeline needs — decoupled from the persisted SportsEventConfig.
// Media items are resolved (with video_id) before the pipeline runs.
export interface PipelineInput {
  videos: ResolvedMedia[]
  timeslices: Timeslice[]
  tag_cleaning_rules: TagCleaningRule[]
}
import globalParamsDefault from '../config/global_parameters.json'
import clutterScoresDefault from '../config/clutter_scores.json'
import positionScoresDefault from '../config/position_scores.json'

export const defaultGlobalSettings: GlobalSettings = {
  ...globalParamsDefault,
  clutter_scores: clutterScoresDefault as Record<string, number>,
  position_scores: positionScoresDefault as Record<string, number>,
}

// ─── Step 1: Bounding box geometry ───────────────────────────────────────────

function step1Geometry(d: Detection) {
  const width = d.xmax - d.xmin
  const height = d.ymax - d.ymin
  const size = width * height
  return { width, height, size }
}

// ─── Step 2: Tag cleaning ─────────────────────────────────────────────────────

function step2TagCleaning(tag: string, rules: TagCleaningRule[]) {
  const rule = rules.find(r => r.raw_tag === tag)
  if (!rule) {
    // No rule yet → pending (excluded as TAG_PENDING until the analyst dispositions it).
    return { partner: null, asset: null, tag_status: 'pending' as const }
  }
  return {
    partner: rule.partner,
    asset: rule.asset,
    tag_status: rule.status,
  }
}

// ─── Step 3: Timeslice assignment ─────────────────────────────────────────────

function step3Timeslice(video_id: string, timestamp_s: number, timeslices: Timeslice[]) {
  const slice = timeslices.find(
    t => t.video_id === video_id && timestamp_s >= t.start_s && timestamp_s <= t.end_s
  )
  if (!slice) {
    return { timeslice_label: null, timeslice_duration_s: null, is_excluded_timeslice: false }
  }
  return {
    timeslice_label: slice.label,
    timeslice_duration_s: slice.duration_s,
    is_excluded_timeslice: slice.is_excluded,
  }
}

// ─── Step 4: Share of screen ──────────────────────────────────────────────────

function step4ShareOfScreen(width: number, height: number, frame_width: number, frame_height: number) {
  return (width * height) / (frame_width * frame_height)
}

// ─── Step 5: Balanced share ───────────────────────────────────────────────────

function step5BalancedShare(share_of_screen: number, exponent: number) {
  return 1 - Math.pow(1 - share_of_screen, exponent)
}

// ─── Step 6: Grid position ────────────────────────────────────────────────────

function step6GridPosition(xmin: number, xmax: number, ymin: number, ymax: number, frame_width: number, frame_height: number) {
  const xmean = (xmin + xmax) / 2
  const ymean = (ymin + ymax) / 2
  const col_index = Math.min(Math.floor(xmean / (frame_width / 4)), 3)
  const row_index = Math.min(Math.floor(ymean / (frame_height / 4)), 3)
  const column = ['A', 'B', 'C', 'D'][col_index]
  const row = row_index + 1
  return { xmean, ymean, screen_position: `${column}${row}` }
}

// ─── Step 7: Position score ───────────────────────────────────────────────────

function step7PositionScore(screen_position: string, positionScores: Record<string, number>) {
  return positionScores[screen_position] ?? 1.0
}

// ─── Step 8: Clutter score ────────────────────────────────────────────────────

function step8ClutterScore(num_tags: number, clutterScores: Record<string, number>) {
  const key = String(Math.min(num_tags, 7))
  return clutterScores[key] ?? clutterScores['default'] ?? 0.70
}

// ─── Step 9: SIF ─────────────────────────────────────────────────────────────

function step9SIF(balanced_share: number, clutter_score: number, position_score: number) {
  return balanced_share * clutter_score * position_score
}

// ─── Step 10: Exclusion ───────────────────────────────────────────────────────

function step10Exclusion(
  tag: string,
  tag_status: TagStatus,
  is_excluded_video: boolean,
  is_excluded_timeslice: boolean,
  timeslice_label: string | null,
  probability: number,
  probability_threshold: number,
  share_of_screen: number,
  exposure_threshold: number
): ExclusionReason | null {
  if (tag === 'no_detection') return 'NO_DETECTION'
  if (tag_status === 'excluded') return 'EXCLUDED_BY_RULE'
  if (is_excluded_video) return 'VIDEO_EXCLUDED'
  if (is_excluded_timeslice) return 'TIMESLICE_EXCLUDED'
  if (timeslice_label === null) return 'NO_TIMESLICE'
  if (probability < probability_threshold) return 'BELOW_PROBABILITY'
  if (share_of_screen < exposure_threshold) return 'BELOW_THRESHOLD'
  if (tag_status === 'pending') return 'TAG_PENDING'
  return null
}

// ─── Steps 1–10: Enrich all detections ───────────────────────────────────────

export function enrichDetections(
  detections: Detection[],
  input: PipelineInput,
  settings: GlobalSettings = defaultGlobalSettings
): EnrichedDetection[] {
  const frameTagCount = new Map<string, number>()
  for (const d of detections) {
    const key = `${d.video_id}::${d.frame_number}`
    frameTagCount.set(key, (frameTagCount.get(key) ?? 0) + 1)
  }

  const excludedVideoIds = new Set(
    input.videos.filter(v => v.is_excluded).map(v => v.video_id)
  )

  return detections.map(d => {
    const geo = step1Geometry(d)
    const cleaning = step2TagCleaning(d.tag, input.tag_cleaning_rules)
    const timeslice = step3Timeslice(d.video_id, d.timestamp_s, input.timeslices)
    const share_of_screen = step4ShareOfScreen(geo.width, geo.height, d.frame_width, d.frame_height)
    const balanced_share = step5BalancedShare(share_of_screen, settings.balanced_share_exponent)
    const grid = step6GridPosition(d.xmin, d.xmax, d.ymin, d.ymax, d.frame_width, d.frame_height)
    const position_score = step7PositionScore(grid.screen_position, settings.position_scores)
    const frameKey = `${d.video_id}::${d.frame_number}`
    const num_tags = frameTagCount.get(frameKey) ?? 1
    const clutter_score = step8ClutterScore(num_tags, settings.clutter_scores)
    const sif = step9SIF(balanced_share, clutter_score, position_score)
    const exclusion_reason = step10Exclusion(
      d.tag,
      cleaning.tag_status,
      excludedVideoIds.has(d.video_id),
      timeslice.is_excluded_timeslice,
      timeslice.timeslice_label,
      d.probability,
      settings.probability_threshold,
      share_of_screen,
      settings.exposure_threshold
    )

    return {
      ...d,
      ...geo,
      ...cleaning,
      ...timeslice,
      share_of_screen,
      balanced_share,
      ...grid,
      position_score,
      num_tags,
      clutter_score,
      sif,
      is_excluded: exclusion_reason !== null,
      exclusion_reason,
    }
  })
}

// ─── Step 11: Video exposure aggregation ─────────────────────────────────────

export function computeVideoExposures(
  enriched: EnrichedDetection[],
  videos: ResolvedMedia[]
): VideoExposure[] {
  const included = enriched.filter(d => !d.is_excluded && d.partner && d.asset && d.timeslice_label)

  const groups = new Map<string, EnrichedDetection[]>()
  for (const d of included) {
    const key = `${d.video_id}||${d.partner}||${d.asset}||${d.timeslice_label}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(d)
  }

  const videoMap = new Map(videos.map(v => [v.video_id, v]))

  const result: VideoExposure[] = []
  for (const [key, rows] of groups) {
    const first = rows[0]
    const partner = first.partner!
    const asset = first.asset!
    const timeslice_label = first.timeslice_label!
    const timeslice_duration_s = first.timeslice_duration_s ?? 0
    const gross_seconds = rows.reduce((s, r) => s + r.seconds, 0)
    const sif = rows.reduce((s, r) => s + r.sif, 0) / rows.length
    const avg_probability = rows.reduce((s, r) => s + r.probability, 0) / rows.length
    const _video = videoMap.get(first.video_id)

    result.push({
      qa_key: key,   // `${video_id}||${partner}||${asset}||${timeslice_label}` — unique per video
      exposure_identifier: `${partner} – ${asset} – ${timeslice_label}`,
      video_id: first.video_id,
      partner,
      asset,
      timeslice_label,
      timeslice_duration_s,
      gross_seconds,
      sif,
      avg_probability,
      detection_count: rows.length,
    })

    void _video
  }

  return result
}

// ─── Steps 12–13: Project exposure ───────────────────────────────────────────

export function computeProjectExposures(
  videoExposures: VideoExposure[],
  sif_multiplier: number  // passed explicitly from settings
): ProjectExposure[] {
  return videoExposures.map(ve => {
    const new_sif = sif_multiplier * ve.sif
    const net_seconds = new_sif * ve.gross_seconds
    const eph = (ve.gross_seconds / ve.timeslice_duration_s) * 3600

    return {
      ...ve,
      sif_multiplier,
      new_sif,
      net_seconds,
      eph,
      is_audited_out: false,
      audit_flag_note: null,
      eph_current: eph,
      eph_proposed: eph,
      differential: 1,
      override_note: null,
    }
  })
}

// ─── Step 16: Finalised exposure ─────────────────────────────────────────────

export function computeFinalisedExposures(
  projectExposures: ProjectExposure[],
  videoRegistrations: ResolvedMedia[]
): FinalisedExposure[] {
  const videoMap = new Map(videoRegistrations.map(v => [v.video_id, v]))

  return projectExposures
    .filter(pe => !pe.is_audited_out)
    .map(pe => {
      const gross_seconds = pe.gross_seconds * pe.differential
      const net_seconds = gross_seconds * pe.new_sif
      const video = videoMap.get(pe.video_id)

      return {
        event: video?.competition_name ?? pe.video_id,
        exposure_identifier: pe.exposure_identifier,
        video_id: pe.video_id,
        timeslice_label: pe.timeslice_label,
        partner: pe.partner,
        asset: pe.asset,
        detection_count: pe.detection_count,
        eph: pe.eph_current * pe.differential,
        sif: pe.new_sif,
        gross_seconds,
        net_seconds,
        differential: pe.differential,
        note: pe.override_note ?? pe.audit_flag_note ?? null,
      }
    })
}
