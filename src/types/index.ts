export type ExclusionReason =
  | 'NO_DETECTION'
  | 'EXCLUDED_BY_RULE'   // analyst marked the raw tag as not a countable sponsor asset
  | 'VIDEO_EXCLUDED'
  | 'TIMESLICE_EXCLUDED'
  | 'NO_TIMESLICE'
  | 'BELOW_PROBABILITY'
  | 'BELOW_THRESHOLD'
  | 'TAG_PENDING'        // raw tag has no disposition yet (awaiting analyst review)

// Disposition of a raw AI tag, decided once per project in the Tag Cleaning step.
export type TagStatus = 'mapped' | 'excluded' | 'pending'

export interface Detection {
  video_id: string        // assigned from the owning Media on combine — not a CSV column
  media_id?: string       // stable Media.id — used to look up the current label even after renames
  frame_number: number
  timestamp_s: number
  tag: string
  probability: number
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  frame_width: number
  frame_height: number
  seconds: number
}

export interface EnrichedDetection extends Detection {
  // Step 1
  width: number
  height: number
  size: number
  // Step 2
  partner: string | null
  asset: string | null
  tag_status: TagStatus
  // Step 3
  timeslice_label: string | null
  timeslice_duration_s: number | null
  is_excluded_timeslice: boolean
  // Step 4
  share_of_screen: number
  // Step 5
  balanced_share: number
  // Step 6
  xmean: number
  ymean: number
  screen_position: string
  // Step 7
  position_score: number
  // Step 8
  num_tags: number
  clutter_score: number
  // Step 9
  sif: number
  // Step 10
  is_excluded: boolean
  exclusion_reason: ExclusionReason | null
}

export interface VideoExposure {
  qa_key: string                // unique per (video_id, partner, asset, timeslice) — QA/grouping key
  exposure_identifier: string   // display + CSV id only ("{partner} – {asset} – {timeslice}"); NOT unique across videos
  video_id: string
  partner: string
  asset: string
  timeslice_label: string
  timeslice_duration_s: number
  gross_seconds: number
  sif: number                   // AVG of per-detection SIF
  avg_probability: number       // AVG of per-detection probability
  detection_count: number
}

export interface ProjectExposure extends VideoExposure {
  sif_multiplier: number
  new_sif: number
  net_seconds: number
  eph: number
  // Step 14
  is_audited_out: boolean
  audit_flag_note: string | null
  // Step 15
  eph_current: number
  eph_proposed: number
  differential: number
  override_note: string | null
}

export interface FinalisedExposure {
  event: string               // Competition.name
  exposure_identifier: string
  video_id: string
  timeslice_label: string
  partner: string
  asset: string
  detection_count: number
  eph: number
  sif: number
  gross_seconds: number
  net_seconds: number
  differential: number
  note: string | null
}

// ─── App-wide reference: Clients ─────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  created_at: number
}

// ─── Project hierarchy ───────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  client_id: string   // references Client.id; '' = Unassigned
  description: string
  created_at: number
}

export interface Competition {
  id: string
  project_id: string
  name: string
  date_start: string        // ISO date "YYYY-MM-DD" or ''
  date_end: string | null
  country: string           // ISO-3166 alpha-2 code (e.g. "DE"); '' = unset
  city: string
  timezone: string | null   // IANA venue zone; auto from `country` when single-zone,
                            // else analyst-picked. Inherited by child SportsEvents.
}

// ─── Sports Event (was "Project") ────────────────────────────────────────────

export type SportsEventId = string

export interface SportsEventConfig {
  media_ids: string[]
  excluded_media_ids: string[]
  // timeslices live on VideoMedia, not here
  tag_cleaning_rules: TagCleaningRule[]
}

export interface SportsEvent {
  id: SportsEventId
  competition_id: string    // references Competition.id; '' = Unassigned
  name: string
  sport_type: string
  discipline: string
  country: string                  // ISO-3166 alpha-2 code; '' = inherit from the parent Competition
  city: string                     // '' = inherit from the parent Competition
  scheduled_start: string | null   // "YYYY-MM-DDTHH:mm" — naive local (venue) wall-clock
  scheduled_end: string | null
  timezone: string | null          // IANA venue zone OVERRIDE; null = inherit the Competition's.
                                   // The effective zone (se.timezone || comp.timezone) anchors
                                   // scheduled_start/end to an instant. See effectiveTimezone().
  config: SportsEventConfig      // committed; pipeline re-runs on Save & Re-run
  draft_config: SportsEventConfig
  settings: GlobalSettings
  draft_settings: GlobalSettings
  qa_state: QAState
  created_at: number
  updated_at: number
}

// ─── Media (owned by SportsEvent) ────────────────────────────────────────────

export type MediaType = 'video' | 'audio'

// Timeslice belongs to VideoMedia only
export interface SportsEventTimeslice {
  media_id: string             // stable id of owning VideoMedia
  video_id: string             // derived at resolve time; not persisted raw
  label: string
  start_s: number
  end_s: number
  duration_s: number
  is_excluded: boolean
}

// Keep Timeslice as alias so pipeline.ts needs only a type-import update
export type Timeslice = SportsEventTimeslice

interface MediaBase {
  id: string                   // stable internal id
  sports_event_id: string      // owner
  label: string
  is_excluded: boolean
  csv_file_id: string | null
}

export interface VideoMedia extends MediaBase {
  type: 'video'
  timeslices: SportsEventTimeslice[]   // intrinsic to the video; committed immediately (not in draft)
}

export interface AudioMedia extends MediaBase {
  type: 'audio'
  // audio-specific exposure fields can be added here as the model evolves
}

export type Media = VideoMedia | AudioMedia

export function isVideoMedia(m: Media): m is VideoMedia { return m.type === 'video' }
export function isAudioMedia(m: Media): m is AudioMedia { return m.type === 'audio' }

// Pipeline-facing resolved Media — carries derived identifiers from the parent chain
interface ResolvedMediaBase {
  competition_name: string
  sports_event_name: string
  video_id: string             // "{competition_name} / {sports_event_name} / {label}"
}

export interface ResolvedVideoMedia extends VideoMedia, ResolvedMediaBase {}
export interface ResolvedAudioMedia extends AudioMedia, ResolvedMediaBase {}
export type ResolvedMedia = ResolvedVideoMedia | ResolvedAudioMedia

export interface TagCleaningRule {
  raw_tag: string
  status: TagStatus       // 'mapped' (partner/asset) | 'excluded' | 'pending'
  partner: string | null  // required when status === 'mapped'
  asset: string | null    //   "
  note: string | null     // free-text; the analyst's reason when excluded
}

// ─── Global settings ──────────────────────────────────────────────────────────

export interface GlobalConfig {
  balanced_share_exponent: number
  ad_slot_seconds: number
  exposure_threshold: number
  sif_multiplier: number
  peak_multiplier: number
  reach_multiplier: number
  currency: string
}

export interface GlobalSettings {
  balanced_share_exponent: number
  ad_slot_seconds: number
  exposure_threshold: number
  probability_threshold: number
  sif_multiplier: number
  peak_multiplier: number
  reach_multiplier: number
  currency: string
  clutter_scores: Record<string, number>
  position_scores: Record<string, number>
}

// ─── Sport taxonomy ───────────────────────────────────────────────────────────

export interface SportDiscipline {
  id: string
  sport_type: string
  discipline: string
  interest_id: string | null
}

// ─── Sport interest per country ───────────────────────────────────────────────

export interface SportInterestEntry {
  id: string
  label: string                                          // editable display label
  scores: Record<string, number>                         // ISO-3166 α-2 → interest score (0–1)
  last_updated: string | null                            // ISO date "YYYY-MM-DD"; set when scores are saved
}

// ─── CSV file metadata ────────────────────────────────────────────────────────

export interface StoredCSV {
  id: string
  filename: string
  size_bytes: number
  row_count: number
  skipped_rows: number
  frame_count: number
  duration_s: number
  video_ids: string[]
  tags: string[]
  uploaded_at: number
  stored: boolean
}

// ─── Sports channel (from src/config/channels.json) ───────────────────────────

export interface Channel {
  id: string
  name: string
  alt_names: string[]
  network: string | null
  owners: string | null
  country_code: string
  country_name: string
  categories: string[]
  is_nsfw: boolean
  launched: string | null
  closed: string | null
  replaced_by: string | null
  website: string | null
  languages: string[]
  timezones: string | null
  broadcast_area: string[]
  logo_url: string | null
  stream_count: number
  stream_url: string | null
  stream_quality: string | null
}

// ─── QA state ─────────────────────────────────────────────────────────────────

export interface QAState {
  rows: Record<string, QARowState>
}

export interface QARowState {
  is_audited_out: boolean
  audit_flag_note: string | null
  eph_proposed: number | null
  override_note: string | null
  differential: number
}
