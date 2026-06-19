# CLAUDE.md — Platformetrix Prototype

**Product:** Platformetrix — Sponsorship Measurement Platform  
**Scope of this prototype:** CSV upload → Steps 1–16 → Finalised Exposure table  
**Stack:** React + Vite, TypeScript, Tailwind CSS, Vitest, React Testing Library, Luxon (DST/timezone)  
**Reference documents:** `documentation/01-exposure-calculation.md` (Part 1, Steps 1–16), `documentation/02-audience-valuation.md` (Part 2, Steps 17–24), `documentation/architecture.md`

---

## What this app does

Platformetrix converts raw AI video detections of brand logos into a quality-adjusted
exposure metric (EPH + SIF) with a fully auditable analyst review step.

The user flow for this prototype is:

```
1. Configure project      Set project params, timeslices, tag cleaning rules
         ↓
2. Upload AI CSV          Raw detections: frame, bbox, tag, timestamp, seconds
         ↓
3. Enrich detections      Steps 1–10: geometry → share → grid → SIF → exclusion
         ↓
4. Review & approve tags  Analyst maps raw_tag → partner/asset, flags DELETEs
         ↓
5. Video aggregation      Step 11: SUM(seconds), AVG(sif) per exposure_identifier
         ↓
6. Project exposure       Steps 12–13: apply SIF multiplier, compute EPH
         ↓
7. QA & audit             Step 14: analyst reviews aggregated rows, flags anomalies
         ↓
8. Differential override   Step 15: analyst proposes differential + mandatory audit_note
         ↓
9. Finalised exposure     Step 16: apply differential, output final gross/net seconds
```

---

## Data model (in-memory for prototype)

The prototype holds all state in React context. No backend, no persistence between
sessions. State shape mirrors the eventual DB schema so migration is straightforward.

### Core types

```typescript
// Raw CSV row from AI provider. One CSV = one video, so video_id is NOT a CSV column —
// it's assigned from the owning video on combine.
interface Detection {
  video_id: string
  frame_number: number
  timestamp_s: number
  tag: string                // raw AI label e.g. "Arena – LED"
  probability: number
  xmin: number; xmax: number
  ymin: number; ymax: number
  frame_width: number; frame_height: number
  seconds: number            // duration of this frame (1/fps)
}

// Enriched detection (Steps 1–10 applied)
interface EnrichedDetection extends Detection {
  // Step 1
  width: number; height: number; size: number
  // Step 2
  partner: string | null
  asset: string | null
  tag_status: TagStatus              // 'mapped' | 'excluded' | 'pending'
  // Step 3
  timeslice_label: string | null
  timeslice_duration_s: number | null
  is_excluded_timeslice: boolean
  // Step 4
  share_of_screen: number
  // Step 5
  balanced_share: number
  // Step 6
  xmean: number; ymean: number
  screen_position: string    // e.g. "A4"
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

type ExclusionReason =
  | 'NO_DETECTION'
  | 'EXCLUDED_BY_RULE'      // analyst dispositioned the raw tag as not a countable asset
  | 'VIDEO_EXCLUDED'
  | 'TIMESLICE_EXCLUDED'
  | 'NO_TIMESLICE'
  | 'BELOW_PROBABILITY'
  | 'BELOW_THRESHOLD'
  | 'TAG_PENDING'          // raw tag has no disposition yet

// Tag disposition (decided once per project in tag cleaning)
type TagStatus = 'mapped' | 'excluded' | 'pending'

// Tag cleaning rule (one per distinct raw_tag; case-sensitive match)
interface TagCleaningRule {
  raw_tag: string
  status: TagStatus       // 'mapped' (partner+asset) | 'excluded' | 'pending'
  partner: string | null  // required when status === 'mapped'
  asset: string | null
  note: string | null     // free-text; the analyst's reason when excluded
}

// Step 11 output
interface VideoExposure {
  exposure_identifier: string   // "{partner} – {asset} – {timeslice}"
  video_id: string
  partner: string
  asset: string
  timeslice_label: string
  timeslice_duration_s: number
  gross_seconds: number
  sif: number                   // AVG of per-detection SIF
  detection_count: number
}

// Steps 12–13 output
interface ProjectExposure extends VideoExposure {
  sif_multiplier: number        // from project config (default 0.33)
  new_sif: number               // sif_multiplier × sif
  net_seconds: number           // new_sif × gross_seconds
  eph: number                   // (gross_seconds / timeslice_duration_s) × 3600
  // Step 14
  is_audited_out: boolean
  audit_flag_note: string | null
  // Step 15
  eph_current: number           // = eph (system calculated)
  differential: number          // analyst input (default 1.0)
  eph_proposed: number          // derived: eph_current × differential
  override_note: string | null  // mandatory when differential ≠ 1
}

// Step 16 output
interface FinalisedExposure {
  event: string
  exposure_identifier: string
  eph: number                   // = eph_current × differential
  sif: number                   // = new_sif
  gross_seconds: number         // VideoExposure.gross_seconds × differential
  net_seconds: number           // gross_seconds × new_sif
  differential: number
}
```

### Global config (loaded from JSON files)

```typescript
interface GlobalConfig {
  parameters: {
    balanced_share_exponent: 40      // CONSTANT — never changes
    ad_slot_seconds: 30              // CONSTANT — never changes
    exposure_threshold: 0.001        // default, overridable per project
    sif_multiplier: 0.33             // default, overridable per project
    peak_multiplier: 1.5
    reach_multiplier: 3.5
    currency: 'USD'
  }
  clutter_scores: Record<number, number>   // num_tags 1–100 → score
  position_scores: Record<string, number>  // "A1"…"D4" → score
}
```

### Project / domain schema

The pipeline value types above are the source of truth for Steps 1–16 (authoritative copy:
`src/types/index.ts`). The analyst-facing setup data — projects, competitions, events, media,
timeslices, tag-cleaning rules — follows the **v4 entity hierarchy**
(`Client → Project → Competition → SportsEvent → Media`), documented in
`documentation/architecture.md` (§1–2). The flat `ProjectConfig { videos[] }` shape this file
used to list was superseded by that schema.

---

## Formulas — exact implementation reference

These are the canonical formulas. The testing procedure is written against these numbers.

### Step 1 — Bounding box geometry
```
width  = xmax - xmin
height = ymax - ymin
size   = width * height
```

### Step 4 — Share of Screen
```
share_of_screen = (width * height) / (frame_width * frame_height)
```
Primary example: (300 × 100) / (1920 × 1080) = 0.014467...  
**Expected:** 0.01447 (4 d.p.)

### Step 5 — Balanced Share
```
balanced_share = 1 - Math.pow(1 - share_of_screen, 40)
```
Primary example: 1 - (0.98553)^40 = 0.4406  
**Do not round intermediate values. Only round final display output.**

### Step 6 — Grid position
```
xmean = (xmin + xmax) / 2
ymean = (ymin + ymax) / 2
col_index = Math.min(Math.floor(xmean / (frame_width / 4)), 3)   // 0–3
row_index = Math.min(Math.floor(ymean / (frame_height / 4)), 3)  // 0–3
column    = ['A','B','C','D'][col_index]
row       = row_index + 1                                         // 1–4
screen_position = column + row   // e.g. "A4"
```
Primary example: xmean=460, ymean=930 → col_index=0 → A, row_index=3 → 4 → **"A4"**  
Edge case: `Math.min(..., 3)` prevents index 4 when centre falls exactly on frame edge.

### Step 7 — Position Score
```
position_score = positionScores[screen_position]
// loaded from global_position_score_default JSON
// "A4" → 1.50
```

### Step 8 — Clutter Score
```
num_tags = count of all detections sharing the same (video_id, frame_number)
clutter_score = clutterScores[Math.min(num_tags, 100)]
// loaded from global_clutter_score_default JSON
// scores[7..100] all equal 0.70 (floor)
```

### Step 9 — SIF (per detection)
```
sif = balanced_share * clutter_score * position_score
```
Primary example: 0.4406 × 0.90 × 1.50 = **0.5948**

### Step 10 — Exclusion rules (evaluated in order; first match wins)
```
1. tag === 'no_detection'                          → NO_DETECTION
2. tag_status === 'excluded'                        → EXCLUDED_BY_RULE
3. video.is_excluded === true                      → VIDEO_EXCLUDED
4. timeslice.is_excluded === true                  → TIMESLICE_EXCLUDED
5. timeslice_label === null (no matching slice)    → NO_TIMESLICE
6. probability < probability_threshold             → BELOW_PROBABILITY
7. share_of_screen < exposure_threshold            → BELOW_THRESHOLD
8. tag_status === 'pending'                         → TAG_PENDING
→ null (detection is included)
```
`tag_status` comes from Step 2: a `TagCleaningRule` with `status: 'mapped'` (partner+asset filled),
`'excluded'` (analyst ticked Exclude; `note` holds the reason), or `'pending'`. No rule for a raw
tag ⇒ `pending`.

### Step 11 — Video Exposure aggregation
```
Group included detections by (video_id, partner, asset, timeslice_label)
exposure_identifier = `${partner} – ${asset} – ${timeslice_label}`
gross_seconds = SUM(detection.seconds)
sif           = AVG(detection.sif)
```

### Step 12 — New SIF & Net Seconds
```
new_sif     = project.sif_multiplier * videoExposure.sif
net_seconds = new_sif * videoExposure.gross_seconds
```

### Step 13 — EPH
```
eph = (gross_seconds / timeslice_duration_s) * 3600
```
Primary example: (312.4 / 2999.99) × 3600 = **375.1**

### Step 14 — QA flag (analyst action)
```
is_audited_out = analyst sets to true
audit_flag_note = required string when is_audited_out = true
Flagged rows are excluded from Steps 15–16 output.
```

### Step 15 — Differential Override
```
differential  = analyst input (default = 1.0)
eph_proposed  = eph_current × differential
override_note = required when differential !== 1
```
Save is blocked (button disabled) if `differential !== 1 && override_note.trim() === ''`.

### Step 16 — Finalised Exposure
```
final_gross_seconds = videoExposure.gross_seconds * differential
final_net_seconds   = final_gross_seconds * new_sif
final_eph           = eph_current * differential
```

---

## CSV input format

The AI provider CSV has these columns (header row required):

```
frame_number, timestamp_s, tag, probability,
xmin, xmax, ymin, ymax, frame_width, frame_height, seconds
```

All numeric fields are floating point. `tag` is a raw string, may contain dashes and spaces.  
The app must tolerate: BOM characters, Windows line endings, extra whitespace in values.

There is **no `video_id` column**: one CSV = one video, so each detection's `video_id` is
assigned from the Video Library entry the CSV is attached to (on combine), not read from the file.

---

## Project structure

Full file/entity map: `documentation/architecture.md` (§7 key source locations; §1–2 entities).
Config and types live in `src/config/*.json` and `src/types/index.ts`.

**Pipeline is one file.** `pipeline.ts` contains all Steps 1–16 as named functions, with a
`runPipeline()` entry point. Keep functions pure (no React imports, no context access inside
`lib/`). Steps 14 and 15 are analyst actions handled in context, not in the pipeline — it
accepts the analyst's override values as input rather than computing them.

---

## JSON config files

Live in `src/config/`, imported directly by the pipeline (values are the source of truth there):
- `global_parameters.json` — scalar params (shown in **Global config** type above)
- `clutter_scores.json` — `num_tags → score`; keys 7–100 all resolve to `0.70` (floor).
  Implement as `scores[Math.min(num_tags, 7)] ?? 0.70`.
- `position_scores.json` — `"A1"…"D4" → score`

Venue **timezone/country reference data** (also in `src/config/`, but consumed by the
`src/lib/timezone.ts` / `src/lib/countries.ts` helpers — the audience-track foundation, not the
Steps 1–16 pipeline). Both are **generated** from the `countries-and-timezones` dev dependency
(canonical IANA / ISO-3166); the regenerate command is in each file's loader comment:
- `country_timezones.json` — ISO country code → candidate IANA zones (single-zone auto-fills;
  multi-zone the analyst picks). DST is resolved from the IANA id via Luxon, never a static offset.
- `countries.json` — ISO code → display name, for the `CountrySelect` picker and legacy migration.

---

## Testing

Pure-pipeline regression suite: **`src/lib/pipeline.test.ts`** (covers Steps 1–16). Run it
after any change to `pipeline.ts`.

```bash
npm test                                  # full suite once (vitest run)
npx vitest run src/lib/pipeline.test.ts   # just the pipeline tests
```

The **manual UI checklist** — file upload, tag-cleaning workflow, QA flags, override guard,
CSV export, error states (the behaviour unit tests can't reach) — plus the `sample_aquatics.csv`
dataset and project config live in **`documentation/testing.md`**. Run it before a demo.

**Regression baseline** — `pipeline.test.ts` pins these; check after any `pipeline.ts` change:

| Step | Key value | Expected |
|------|-----------|----------|
| 4 | share_of_screen | 0.01447 |
| 5 | balanced_share | 0.4406 |
| 6 | screen_position | A4 |
| 9 | sif | 0.5948 |
| 11 | gross_seconds | 312.4 |
| 11 | sif (avg) | 0.221 |
| 12 | new_sif | 0.073 |
| 12 | net_seconds | 22.8 |
| 13 | eph | 375.1 |
| 16 | final gross (no override) | 312.4 |
| 16 | final gross (0.804 override) | 140.1 |

---

## Rules for Claude Code

1. **Never hard-code formula constants.** Always read from `global_parameters.json`.
   The only exception: `['A','B','C','D']` and `[1,2,3,4]` for grid labels are structural,
   not configurable.

2. **Pipeline functions are pure.** `pipeline.ts` functions take typed inputs and return
   typed outputs. No side effects, no React imports, no context access inside `lib/`.

3. **Do not round intermediate values.** Only round for display (2–4 d.p. in table cells).
   All calculations carry full floating-point precision through the pipeline.

4. **Exclusion check order matters.** Step 10 rules must fire in the order listed in this
   document: `NO_DETECTION` → `EXCLUDED_BY_RULE` → `VIDEO_EXCLUDED` → `TIMESLICE_EXCLUDED`
   → `NO_TIMESLICE` → `BELOW_PROBABILITY` → `BELOW_THRESHOLD` → `TAG_PENDING`.
   The Vitest suite (`src/lib/pipeline.test.ts`) locks this order in.

5. **Differential override guard.** The save button for Step 15 must be disabled (not just warned)
   when `differential !== 1 && override_note.trim() === ''`.

6. **Step 14 flagged rows are excluded from Steps 15 and 16.** They still appear in the
   QA table (greyed out) but do not flow to the finalised output.

7. **exposure_identifier format:** always `"{partner} – {asset} – {timeslice_label}"`.
   Use an em dash (–), not a hyphen. This string is a display key, not a DB key; it is
   not used for joins — always use the structured fields for grouping.

8. **Tag cleaning is case-sensitive.** `"Arena – LED"` and `"arena – led"` are different
   raw tags. Do not normalise case when matching.

9. **Audit the calculation docs after any methodology change.** Part 1 (Steps 1–16):
   `documentation/01-exposure-calculation.md`. Part 2 (Steps 17–24, audience & valuation):
   `documentation/02-audience-valuation.md`. The domain/entity reference is
   `documentation/architecture.md`.
   Whenever a calculation formula, exclusion rule, step definition, or analyst workflow is
   changed in `pipeline.ts`, `CLAUDE.md`, or the UI components, you must:
   1. Read the relevant calculation doc(s) in full.
   2. Identify every section whose description, formula, example values, or table no longer
      matches the application.
   3. Report all discrepancies to the user before making any edits — show exactly what is
      wrong and what you propose to change, as a diff-style list.
   4. Apply the changes only after the user confirms.

   Sections most likely to need updating after a methodology change:
   - The overview flow diagram (Steps 1–17)
   - The relevant Step's formula block and worked example
   - The cross-step comparison tables that carry the same value forward
   - The summary table at the end (Steps 1–17)
