# Part 1 - Calculation Model - Exposure
## Overview: what gets calculated, in what order

```
RAW INPUT (from AI provider)
  frame dimensions, bounding box, tag, timestamp
        │
        ▼
STEP 1  Bounding box geometry
        width, height, size
        │
        ▼
STEP 2  Tag identity & disposition
        raw_tag → disposition (map / exclude / pending) → partner / asset
        │
        ▼
STEP 3  Timeslice assignment
        timestamp_s → timeslice label + duration
        │
        ▼
STEP 4  Share of Screen
        (width × height) / (frame_width × frame_height)
        │
        ▼
STEP 5  Balanced Share
        1 − (1 − share_of_screen) ^ 40
        │
        ▼
STEP 6  Grid position
        xmean, ymean → column (A–D) + row (1–4) → screen_position
        │
        ▼
STEP 7  Position Score lookup
        screen_position → score from PositionConfig
        │
        ▼
STEP 8  NumTags + Clutter Score lookup
        count of detections in same frame → clutter_score from ClutterConfig
        │
        ▼
STEP 9  SIF (per detection)
        balanced_share × clutter_score × position_score
        │
        ▼
STEP 10 Exclusion check
        share_of_screen vs threshold / timeslice.is_excluded / tag excluded or pending
        │
        ▼
STEP 11 Video Exposure aggregation
        SUM(seconds) and AVG(sif) across all valid detections
        grouped by (video, exposure_identifier)
        │
        ▼
STEP 12 Project Exposure: New SIF + Net Seconds
        new_sif = sif_multiplier × sif
        net_seconds = new_sif × gross_seconds
        │
        ▼
STEP 13 EPH
        (gross_seconds / timeslice_duration_s) × 3600
        │
        ▼
STEP 14 QA & Audit
        analyst review → rows flagged or kept
        │
        ▼
STEP 15 Differential Override
        analyst inputs differential → eph_proposed = eph_current × differential
        │
        ▼
STEP 16 Finalised Exposure
        gross_seconds × differential → final gross_seconds
        final gross_seconds × new_sif → final net_seconds
        eph_current × differential → final EPH
        output: event, exposure_identifier, EPH, SIF, gross_seconds, net_seconds, differential
```

---

## Input data

Before any calculation begins, the following values come in from the AI provider and the registered video setup.

### From the AI detection file

| Field          | Value         | Notes                          |
| -------------- | ------------- | ------------------------------ |
| `video_id`     | `vid-001`     | Registered as "Day 1 Swimming" |
| `frame_number` | 800           |                                |
| `timestamp_s`  | 32.00         | 32 seconds into the video      |
| `tag`          | `Arena – LED` | Raw AI label                   |
| `probability`  | 0.96          | Model confidence               |
| `xmin`         | 310           | Left edge of bounding box      |
| `xmax`         | 610           | Right edge                     |
| `ymin`         | 880           | Top edge                       |
| `ymax`         | 980           | Bottom edge                    |
| `frame_width`  | 1920          | Full frame width in pixels     |
| `frame_height` | 1080          | Full frame height in pixels    |
| `seconds`      | 0.04          | Duration: 1 frame at 25fps     |

### From the registered timeslices (vid-001)

| label          | start_s | end_s   | duration_s | is_excluded |
| -------------- | ------- | ------- | ---------- | ----------- |
| Warm-up        | 0.00    | 599.99  | 599.99     | **true**    |
| Final          | 600.00  | 3599.99 | 2999.99    | false       |
| Medal Ceremony | 3600.00 | 4200.00 | 600.00     | false       |

### Project configuration

| Config             | Value        |
| ------------------ | ------------ |
| Exposure threshold | 0.001 (0.1%) |
| SIF Multiplier     | 0.33         |

---

## Step 1 — Bounding box geometry

From the raw coordinates, compute the dimensions of the detection bounding box.

```
width  = xmax − xmin  =  610 − 310  =  300 px
height = ymax − ymin  =  980 − 880  =  100 px
size   = width × height  =  300 × 100  =  30,000 px²
```

| Field    | Value      |
| -------- | ---------- |
| `width`  | 300 px     |
| `height` | 100 px     |
| `size`   | 30,000 px² |

---

## Step 2 — Tag identity & disposition

The raw AI tag `"Arena – LED"` is looked up against the project's Tag Cleaning Rules. Each
distinct raw tag carries one **disposition**: **mapped** to a partner/asset, **excluded** with
an auditable reason, or **pending** (awaiting review). Only `mapped` tags are counted.

**Lookup (mapped):**

| raw_tag     | status | partner | asset        |
| ----------- | ------ | ------- | ------------ |
| Arena – LED | mapped | Arena   | Poolside LED |

The analyst mapped this tag once (per project, not per detection); the partner/asset are copied
onto every matching detection.

| Field        | Value        |
| ------------ | ------------ |
| `tag_status` | mapped       |
| `partner`    | Arena        |
| `asset`      | Poolside LED |

### What is automatic and what is manual

Tag Cleaning Rules are **scoped to a single project**. Rules from one project do not carry over to another automatically.

**Within a project — fully automatic:**
Once a rule is added for a tag, it applies instantly to every subsequent import in that same project. The analyst does not touch it again. If 50 videos are imported over the course of a project, the rules created on the first import silently handle all the matching tags in videos 2 through 50.

**New project — manual work required:**
Every new project starts with an empty TagCleaningRules table. When the first video is imported, all tags are new and require the analyst to map them. This is a one-time setup cost per project. In practice it takes the analyst 15–30 minutes depending on the number of distinct tags the AI produces.

**New tag mid-project — one small action:**
If a new sponsor joins a competition halfway through a season, their tag will appear in a new import as pending. The analyst maps it once, and all subsequent imports handle it automatically.

**The lifecycle looks like this:**

| situation                                                  | analyst action required                      | subsequent imports            |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| First import of a new project                              | Map all tags — typically 10–30 distinct tags | Automatic                     |
| Second and later imports, same project                     | Only new/unknown tags (usually 0–2)          | Automatic                     |
| New project of same type (e.g. next aquatics championship) | Full mapping again — starts from zero        | Automatic within that project |
| *(Future — Presets)*                                       | Select a preset template to pre-fill rules   | Automatic from first import   |

> **Presets** — a planned future feature that would allow saving a TagCleaningRules template from one project and applying it as a starting point for a new one. Not yet implemented. Until then, each project begins with an empty rules table.

### What approval looks like for a full project

For a Premier League season broadcast project, the Tag Cleaning table might look like this after the first video import:

| raw_tag             | status   | partner        | asset           | note                              |
| ------------------- | -------- | -------------- | --------------- | --------------------------------- |
| Emirates – Board    | mapped   | Emirates       | Perimeter Board |                                   |
| Adidas – Sleeve     | mapped   | Adidas         | Shirt Sleeve    |                                   |
| Adidas – Shorts     | mapped   | Adidas         | Shorts          |                                   |
| EA Sports – Pitch   | mapped   | EA Sports      | Pitch-side LED  |                                   |
| Carabao – Cup Badge | mapped   | Carabao Energy | Cup Badge       |                                   |
| BetMGM – Board      | pending  | —              | —               | new sponsor, awaiting mapping     |
| Referee – Badge     | excluded | —              | —               | ref badge, not a sponsor          |

> The analyst maps BetMGM and ticks **Exclude** on "Referee – Badge" with the note "ref badge, not a commercial sponsor". All future imports within this project handle these tags automatically — no further action needed on any of the 38 remaining match videos.

### What happens when a tag has no rule at all

A cricket broadcast picks up a tag `"Duckworth Lewis – Scoreboard"` — the AI confused a statistical overlay with a brand. No rule exists, so it defaults to **pending**.

```
tag_status = pending   (no rule yet)
```

The detection is stored but excluded as `TAG_PENDING` until dispositioned. It appears in the post-import summary: *"1 unknown tag — 847 rows pending"*. The analyst ticks **Exclude** and notes the reason, and the rows stay out of all calculations with an auditable note.

---

## Step 3 — Timeslice assignment

The detection's timestamp (`32.00s`) is compared against all timeslice windows for this video.

```
Warm-up:        0.00 ≤ 32.00 < 599.99   ✅  match
Final:          600.00 ≤ 32.00 < 3599.99  ✗
Medal Ceremony: 3600.00 ≤ 32.00 < 4200.00  ✗
```

Assigned timeslice: **Warm-up** (`ts-001`), `duration_s = 599.99`, `is_excluded = true`.

| Field                  | Value    |
| ---------------------- | -------- |
| `timeslice_id`         | `ts-001` |
| `timeslice_label`      | Warm-up  |
| `timeslice_duration_s` | 599.99   |
| `is_excluded`          | **true** |

> This detection will be **excluded** at Step 10 because it falls in an excluded timeslice. All enrichment steps still run to completion — the full record is available for audit. We continue the calculation using a detection at timestamp 820.00s (within the Final) to show all steps.

---

## Step 3 (continued) — same detection, timestamp 820s

```
Warm-up:        0.00 ≤ 820.00 < 599.99   ✗
Final:          600.00 ≤ 820.00 < 3599.99  ✅  match
Medal Ceremony: 3600.00 ≤ 820.00 < 4200.00  ✗
```

| Field                  | Value    |
| ---------------------- | -------- |
| `timeslice_id`         | `ts-002` |
| `timeslice_label`      | Final    |
| `timeslice_duration_s` | 2999.99  |
| `is_excluded`          | false    |

---

## Step 4 — Share of Screen

What fraction of the total frame area does this detection occupy?

```
share_of_screen = (width × height) / (frame_width × frame_height)
               = (300 × 100) / (1920 × 1080)
               = 30,000 / 2,073,600
               = 0.01447   (1.45%)
```

| Field             | Value           |
| ----------------- | --------------- |
| `share_of_screen` | 0.01447 (1.45%) |

> **Threshold check (preview):** The project threshold is 0.001 (0.1%). This detection at 1.45% is well above threshold — it passes.

---

## Step 5 — Balanced Share

Share of Screen is put through a diminishing-returns curve. This prevents a very large detection (e.g. a full-screen close-up of a shirt) from scoring disproportionately higher than a moderately-sized one.

```
balanced_share = 1 − (1 − share_of_screen) ^ 40
               = 1 − (1 − 0.01447) ^ 40
               = 1 − (0.98553) ^ 40
               = 1 − 0.5594
               = 0.4406
```

| Field            | Value  |
| ---------------- | ------ |
| `balanced_share` | 0.4406 |

> **Why the curve matters:** without it, a 5.56% detection would score ~18× a 0.31% one on
> size alone; the curve compresses that to about 7.7× — closer to the real difference in
> viewer attention.

---

## Step 6 — Grid position

The frame is divided into a 4×4 grid (columns A–D left to right, rows 1–4 top to bottom). We find the centre point of the bounding box, then map it to a grid cell.

**Centre point:**
```
xmean = (xmin + xmax) / 2  =  (310 + 610) / 2  =  460
ymean = (ymin + ymax) / 2  =  (880 + 980) / 2  =  930
```

**Column assignment:**
```
frame_width / 4  =  1920 / 4  =  480

column_index = floor(460 / 480) = floor(0.958) = 0  →  column A
```

**Row assignment:**
```
frame_height / 4  =  1080 / 4  =  270

row_index = floor(930 / 270) = floor(3.444) = 3  →  row 4
```

```
screen_position = "A4"
```

| Field             | Value |
| ----------------- | ----- |
| `xmean`           | 460   |
| `ymean`           | 930   |
| `screen_position` | A4    |

---

## Step 7 — Position Score lookup

`screen_position = "A4"` is looked up in the Position on Screen Config table.

|           | Col A   | Col B | Col C   | Col D |
| --------- | ------- | ----- | ------- | ----- |
| **Row 1** | 1.0     | 1.3   | 1.5     | 1.3   |
| **Row 2** | 1.2     | 1.8   | 2.0     | 1.7   |
| **Row 3** | 1.3     | 2.2   | **2.3** | 2.0   |
| **Row 4** | **1.5** | 1.7   | 1.8     | 1.5   |

**A4 = 1.5**

> The grid rewards central, eye-level positions: C3 (2.3) is the peak, the corners and
> top-row cells score lowest. This reflects where viewers actually look during live sport.

---

## Step 8 — NumTags & Clutter Score

**NumTags** — count every detection in the same frame, regardless of brand or asset type.

In frame 800 (our aquatics example), three brands are simultaneously visible:

| frame_number | tag              | partner     |
| ------------ | ---------------- | ----------- |
| 800          | Arena – LED      | Arena       |
| 800          | BPER Banca – LED | BPER: Banca |
| 800          | Enel – LED       | Enel        |

```
num_tags = 3  →  clutter_score = 0.90
```

> **Value provenance.** Where the PRD and the parameter reference disagree, the prototype uses
> the **PRD** values: `num_tags=2 → 1.00` (not 1.05) and `num_tags=4 → 0.82` (not 0.84). These
> live in `src/config/clutter_scores.json` (strict JSON — the rationale is recorded here, not
> as a comment in the file). Pinned by the Vitest suite.

### NumTags comparison across different scenarios

**Football match — corner kick close-up:**

| frame  | tag                 |
| ------ | ------------------- |
| 14,220 | Emirates – Board    |
| 14,220 | Adidas – Sleeve     |
| 14,220 | Adidas – Shorts     |
| 14,220 | EA Sports – Pitch   |
| 14,220 | BetMGM – Board      |
| 14,220 | Carabao – Cup Badge |

```
num_tags = 6  →  clutter_score = 0.72
```

> Six brands visible at once during a corner kick — player in close-up showing shirt, shorts, and cup badge, with multiple perimeter boards visible behind.

**Tennis — baseline rally, clean background:**

| frame | tag                |
| ----- | ------------------ |
| 8,450 | Rolex – Scoreboard |

```
num_tags = 1  →  clutter_score = 1.12
```

> Rolex has the screen entirely to itself — the scoreboard clock is the only brand visible. It gets a 12% bonus.

**Swimming — podium shot:**

| frame  | tag                       |
| ------ | ------------------------- |
| 91,200 | Arena – Swimsuit          |
| 91,200 | Arena – Cap               |
| 91,200 | World Aquatics – Backdrop |
| 91,200 | Toyota – Backdrop         |
| 91,200 | Omega – Scoreboard        |

```
num_tags = 5  →  clutter_score = 0.76
```

---

## Step 9 — SIF (Sponsorship Impact Factor)

Combines balanced share, clutter, and position into a single quality score for this detection.

```
sif = balanced_share × clutter_score × position_score
    = 0.4406 × 0.90 × 1.5
    = 0.5948
```

| Field | Value  |
| ----- | ------ |
| `sif` | 0.5948 |

> SIF balances the three factors: a large but cluttered board, a tiny logo in a premium
> position, and a small solus logo can all land at similar scores — size alone never decides it.

---

## Step 10 — Exclusion check

Before contributing to Video Exposure, a detection must pass all exclusion rules.

**Our Arena LED detection at 820s:**

| Rule                          | Check                          | Result |
| ----------------------------- | ------------------------------ | ------ |
| `tag = 'no_detection'`        | `Arena – LED` ≠ `no_detection` | ✅ Pass |
| `tag_status = 'excluded'`     | status is `mapped`             | ✅ Pass |
| `video.is_excluded = true`    | video not excluded             | ✅ Pass |
| `timeslice.is_excluded = true`| Final → `is_excluded = false`  | ✅ Pass |
| `timeslice_label = null`      | timeslice assigned             | ✅ Pass |
| `probability < threshold`     | `0.96 > threshold`             | ✅ Pass |
| `share_of_screen < 0.001`     | `0.01447 > 0.001`              | ✅ Pass |
| `tag_status = 'pending'`      | status is `mapped`             | ✅ Pass |

`exclusion_reason = null` → **included**

### Exclusion examples — what gets caught and why

| detection                                              | which rule fires              | exclusion_reason                 |
| ------------------------------------------------------ | ----------------------------- | -------------------------------- |
| Frame 0, `no_detection` tag                            | tag = no_detection            | `NO_DETECTION`                   |
| Buoy in lane — `Buoy` tag marked Excluded              | tag_status = excluded         | `EXCLUDED_BY_RULE`               |
| Any detection on a video the analyst has flagged out   | video.is_excluded = true      | `VIDEO_EXCLUDED`                 |
| Arena LED at timestamp 200s (Warm-up period)           | timeslice.is_excluded = true  | `TIMESLICE_EXCLUDED`             |
| Detection at timestamp 5000s — no timeslice covers it  | no matching timeslice         | `NO_TIMESLICE`                   |
| Detection with probability 0.45, threshold set to 0.50 | probability < threshold       | `BELOW_PROBABILITY`              |
| Tiny distant hoarding, 28×14 pixels, share = 0.00019%  | share_of_screen < threshold   | `BELOW_THRESHOLD`                |
| `BetMGM – Board` — imported, not yet mapped            | tag_status = pending          | `TAG_PENDING`                    |
| Referee badge — marked Excluded after import           | tag_status = excluded         | `EXCLUDED_BY_RULE`               |

---

## Step 11 — Video Exposure aggregation

All valid detections for Arena's Poolside LED during the Final of "Day 1 Swimming" are now grouped together.

Arena's LED board was detected in 7,810 frames during the Final, each with `seconds = 0.04`:

```
gross_seconds = SUM(seconds)  =  7,810 × 0.04  =  312.4s
sif           = AVG(sif)      =  average of 7,810 individual SIF values  =  0.221
```

> The per-detection SIF we calculated in Step 9 was 0.595. The video-level average of 0.221 is lower because many frames had smaller bounding boxes, more clutter, or less favourable positions.

**Video Exposure output for "Day 1 Swimming" — all sponsors:**

| exposure_identifier                   | partner     | asset        | timeslice      | gross_seconds | sif   |
| ------------------------------------- | ----------- | ------------ | -------------- | ------------- | ----- |
| Arena – Poolside LED – Final          | Arena       | Poolside LED | Final          | 312.4         | 0.221 |
| Arena – Poolside LED – Medal Ceremony | Arena       | Poolside LED | Medal Ceremony | 45.1          | 0.318 |
| Arena – Lane Panels – Final           | Arena       | Lane Panels  | Final          | 87.2          | 0.176 |
| BPER: Banca – Poolside LED – Final    | BPER: Banca | Poolside LED | Final          | 298.7         | 0.215 |
| Enel – Poolside LED – Final           | Enel        | Poolside LED | Final          | 267.3         | 0.209 |

> Arena's SIF is higher in the Medal Ceremony (0.318 vs 0.221) because during the ceremony the camera holds wider, steadier shots — the LED board appears more prominently and the clutter drops as fewer brands compete in-frame.

---

## Step 12 — Project Exposure: New SIF & Net Seconds

### Two different adjustments — important to keep them separate

By this point in the document, "30 seconds" has appeared in the context of TV advertising. It is important to be clear that **the number 30 does not appear in Step 12**. It appears later in Step 17 as part of the money formula. These are two completely different adjustments:

|                           | What it does                                                                                                       | Where it lives              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **SIF Multiplier (0.33)** | Quality adjustment — a sponsorship impression is less impactful than a dedicated ad. How much less? About a third. | Step 12                     |
| **Divide by 30**          | Unit conversion — converts seconds of exposure into the number of 30-second ad slots, so we can apply a CPT price. | Step 17 (valuation formula) |

Step 12 is **not about money yet**. It is purely about quality. The question it answers is: "given that this is sponsorship exposure and not a TV ad, how do we adjust the raw SIF to reflect that reality?"

The SIF from Step 11 (0.221) was calculated entirely within the context of the video frame — size, position, clutter. It does not yet account for the fundamental difference between a logo briefly visible on a poolside board and a brand buying 30 seconds of undivided viewer attention. The SIF Multiplier (0.33) is the industry-agreed factor that bridges that gap. It is set per project based on research and client agreement.

The result — `new_sif = 0.073` and `net_seconds = 22.8s` — is a quality-adjusted exposure measure. Think of it as: "Arena had 312.4 seconds of screen time, but quality-adjusted, that is worth the equivalent of 22.8 seconds of premium, undistracted exposure." Still no money yet — that happens in Step 17.

```
sif_multiplier = 0.33

new_sif     = sif_multiplier × sif  =  0.33 × 0.221  =  0.073
net_seconds = new_sif × gross_seconds  =  0.073 × 312.4  =  22.8s
```

### The same calculation for all three videos (project level)

| video          | event                   | gross_seconds | raw_sif | sif_multiplier | new_sif | net_seconds |
| -------------- | ----------------------- | ------------- | ------- | -------------- | ------- | ----------- |
| Day 1 Swimming | Aquatics Swimming Day 1 | 312.4         | 0.221   | 0.33           | 0.073   | 22.8        |
| Day 1 Diving   | Aquatics Diving Day 1   | 174.2         | 0.198   | 0.33           | 0.065   | 11.3        |
| Day 2 Swimming | Aquatics Swimming Day 2 | 289.1         | 0.219   | 0.33           | 0.072   | 20.8        |

### Where does 0.33 come from?

**0.33 is an industry benchmark, not a mathematically derived number.**

The sponsorship research industry — firms like Nielsen, Repucom, and others — has spent decades studying a core question: how does a logo on a perimeter board or a shirt sleeve compare to a dedicated 30-second TV ad in terms of actual viewer impact? They measure this through eye-tracking studies, brand recall tests, and audience attention research across thousands of broadcasts.

Their consistent finding is that sponsorship exposure is worth roughly **25–40% of an equivalent TV ad**, depending on the sport, broadcast format, and asset type. 0.33 is the middle of that range — one third.

**Crucially, this number is not something the system calculates.** It is an input that the analyst sets at the start of a project, based on:

1. **Industry benchmarks** — published research for the relevant sport and market
2. **Client agreement** — what the client and their agency have accepted as the appropriate factor
3. **Historical precedent** — what was used on previous similar projects

The system simply applies whatever value is set. If the client challenges it, the analyst can change it and re-run. This is why it is a project-level configuration, not a hardcoded constant.

> The multiplier varies by broadcast context (roughly 0.20–0.45: higher for high-dwell,
> high-attention coverage like football or F1; lower for erratic or second-screen contexts like
> cycling or esports). It is agreed with the client before the project and fixed for its life.

---

## Step 13 — EPH (Exposure Per Hour)

EPH normalises exposure across events of different durations.

```
EPH = (gross_seconds / timeslice_duration_s) × 3600
    = (312.4 / 2999.99) × 3600
    = 375.1
```

### Why EPH is needed — comparison without it

Imagine comparing two events without EPH:

| event                                | gross_seconds | timeslice_duration_s |
| ------------------------------------ | ------------- | -------------------- |
| 50m Freestyle Final (short, 4 min)   | 18.2          | 240                  |
| 1500m Freestyle Final (long, 20 min) | 75.6          | 1200                 |

In raw seconds, the 1500m looks 4× better for Arena. But when normalised:

```
EPH (50m)   = (18.2 / 240) × 3600   = 273.0
EPH (1500m) = (75.6 / 1200) × 3600  = 226.8
```

The 50m Final is actually *denser* exposure per hour — the poolside LED is more frequently in shot during shorter, faster events. Without EPH you would incorrectly conclude the 1500m was the better placement.

### EPH for all three videos — Arena Poolside LED:

| video          | event                   | gross_seconds | timeslice_duration_s | eph   |
| -------------- | ----------------------- | ------------- | -------------------- | ----- |
| Day 1 Swimming | Aquatics Swimming Day 1 | 312.4         | 2999.99              | 375.1 |
| Day 1 Diving   | Aquatics Diving Day 1   | 174.2         | 4199.99              | 149.3 |
| Day 2 Swimming | Aquatics Swimming Day 2 | 289.1         | 2999.99              | 346.9 |

> The Diving event has a lower EPH (149.3) because diving coverage frequently cuts away from poolside to follow the diver mid-air — the LED board is out of shot for long stretches.

---

## Step 14 — QA & Audit

### Why Step 14 is not a duplicate of Step 2

Step 2 (tag disposition) happens **per video** — the analyst confirms whether each tag in a single import file should count. Every mapped tag is correct in isolation.

Step 14 is the **first time the analyst sees all videos in the project together, in aggregated form**. This creates a different class of review:

| What Step 14 catches                                                                                     | Why Step 2 misses it                                                   |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A brand's EPH is anomalously high (e.g. 4000 — physically impossible)                                    | EPH does not exist until aggregation runs across all videos            |
| A timeslice boundary was set 10 seconds off, leaking detections into a wrong window                      | Visible only in the aggregate, not in per-frame data                   |
| On a large project with 50 videos, approved by multiple analysts, something inconsistent slipped through | Step 2 is done video-by-video — no one sees the full picture until now |
| Cross-event consistency issues only visible at project level                                             | Each Step 2 approval sees one video at a time                          |

**Step 2 is a technical gate** ("do we know what this tag is?"). **Step 14 is a sanity check on the numbers** ("do the results make sense when viewed as a whole?").

### Example 1 — anomalous EPH detected

| event                   | exposure_identifier                | gross_seconds | timeslice_duration_s | eph          |
| ----------------------- | ---------------------------------- | ------------- | -------------------- | ------------ |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Final       | 312.4         | 2999.99              | 375.1        |
| Aquatics Swimming Day 1 | BPER: Banca – Poolside LED – Final | 298.7         | 2999.99              | 358.6        |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Final       | **9,200.0**   | 2999.99              | **11,040.0** |

The third row is a duplicate with corrupted data — `gross_seconds = 9,200` for a 3,000-second timeslice is physically impossible. Flagged:

```
is_audited_out = true
audit_note     = "Corrupt aggregation — gross_seconds exceeds timeslice duration"
```

### Example 2 — timeslice boundary error

| event                   | exposure_identifier            | gross_seconds | eph   |
| ----------------------- | ------------------------------ | ------------- | ----- |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Warm-up | 28.3          | 169.8 |

The Warm-up timeslice is marked `is_excluded = true` — no detections from it should appear. This row exists because the excluded window ended at 599.99s on two videos but was accidentally set to 560.00s on the third. The 40-second gap was not excluded. The analyst flags the row, corrects the timeslice, and re-runs.

### Example 3 — implausible sponsor presence

A Formula 1 project. After aggregation, the analyst sees:

| event                  | exposure_identifier                | gross_seconds | eph   |
| ---------------------- | ---------------------------------- | ------------- | ----- |
| Monaco Grand Prix      | RedBull – Car Livery – Race        | 1,840.2       | 662.5 |
| Monaco Grand Prix      | Ferrari – Car Livery – Race        | 1,620.4       | 583.3 |
| Monaco Grand Prix      | **Pirelli – Tyre Wall – Race**     | 8.1           | 2.9   |
| **Bahrain Grand Prix** | **Shell – Trackside Board – Race** | 142.7         | 51.4  |

The last row is suspicious — Shell was not a trackside advertiser at Bahrain this season. The analyst checks the source video and finds the wrong video file was imported against the Bahrain event registration. Flagged and source corrected.

---

## Step 15 — Differential Override

### Why does this step exist?

EPH is calculated entirely automatically by the system based on what the AI detected in the video. In the vast majority of cases, the calculated value is correct and the analyst accepts it without change.

However, there are specific real-world situations where the analyst knows — from professional experience or from reviewing the footage — that the calculated EPH does not accurately reflect what viewers actually saw during the broadcast. This is not a technical error in the system. It is a gap between what AI can measure from a video file and what actually happened in a broadcast context.

**The three situations where an override is legitimate:**

**1. The broadcaster did not air the full event.**
The AI processed a complete 90-minute match video, so EPH is calculated over 90 minutes. But a particular TV channel purchased rights to show only the second half — their viewers saw 45 minutes, not 90. The calculated EPH for that event is double the reality for that broadcaster. The analyst knows this from the rights and scheduling data, which the AI cannot access.

**2. Systematic camera behaviour reduces effective exposure.**
In our Diving example: the AI correctly detected every frame where the poolside LED was visible. But during diving events, the camera follows the athlete off the board and into the air — away from the pool perimeter — for extended stretches. The AI counts frames honestly, but the analyst knows from watching diving coverage that this pattern is consistent and predictable, making the raw EPH higher than what viewers experienced as effective exposure.

**3. A known physical obstruction not captured in the detection.**
A temporary structure, a cameraman, or another sponsor's banner partially blocked the asset for a known portion of the broadcast. The AI detected the logo when it was visible, but the analyst has confirmed from footage review that it was occluded for a significant period that did not produce detections — meaning the real total was lower than the AI measured.

**What is not a legitimate reason for an override:**
- The EPH is lower than the client hoped for
- The analyst personally feels the asset deserved more value
- Any reason that cannot be documented factually

### The audit requirement

Every override is permanently recorded alongside:
- The original calculated value (`eph_current`)
- The differential (`analyst input — the scaling factor applied to EPH, gross seconds, and net seconds`)
- The derived proposed value (`eph_proposed = eph_current × differential`)
- A mandatory written justification (`audit_note`) — the override cannot be saved without one

This means every change is visible, traceable, and can be reviewed by the client. The differential shows the magnitude of the adjustment at a glance — a differential of 0.80 is a 20% reduction; a differential of 0.50 would be a 50% reduction and would immediately invite scrutiny.

### Our example

For Day 1 Diving, the broadcast frequently cut away from poolside during dives. The analyst enters a differential, documents the reason, and the system derives the proposed EPH:

```
eph_current  = 149.3   (calculated by system)
differential = 0.804   (analyst input)
audit_note   = "Broadcast director consistently cut to aerial diver shot during
                dive execution. Estimated 20% of timeslice duration had camera
                away from poolside. Confirmed by manual footage review."

eph_proposed = eph_current × differential
             = 149.3 × 0.804
             = 120.0
```

| Field          | Value                        |
| -------------- | ---------------------------- |
| `eph_current`  | 149.3                        |
| `differential` | 0.804                        |
| `eph_proposed` | 120.0                        |
| `audit_note`   | documented reason (required) |

For Day 1 Swimming and Day 2 Swimming, the analyst accepts the calculated values — no change, no documentation required:

```
differential = 1.000  →  eph_proposed = eph_current
```

### More override examples with audit notes

> The analyst enters `differential` directly. `eph_proposed` is derived: `eph_current × differential`.

| situation                         | eph_current | differential | eph_proposed | audit_note                                                                  |
| --------------------------------- | ----------- | ------------ | ------------ | --------------------------------------------------------------------------- |
| Swimming Day 1 — accepted         | 375.1       | 1.000        | 375.1        | —                                                                           |
| Diving — camera cutaway           | 149.3       | 0.804        | 120.0        | Aerial dive shots consistently removed poolside from frame                  |
| Swimming Day 2 — accepted         | 346.9       | 1.000        | 346.9        | —                                                                           |
| Football — referee blocking board | 280.0       | 0.696        | 195.0        | Referee stationed in front of board for approx. 30% of match                |
| Cycling — partial jersey logo     | 520.0       | 0.750        | 390.0        | Only 3 of 4 team jerseys carried the logo; confirmed with team kit supplier |

> A differential below 1.0 means the analyst is reducing EPH — the system measured more exposure than was effectively broadcast. A differential of 1.0 means the calculated value is accepted. Every override is documented and visible to the client.

---

## Step 16 — Finalised Exposure

The differential is applied uniformly to `gross_seconds`, `net_seconds`, and `EPH`.

**Day 1 Diving (overridden, differential = 0.804):**

```
gross_seconds = 174.2 × 0.804         =  140.1s
net_seconds   = 140.1 × 0.065         =  9.1s
eph           = 149.3 × 0.804         =  120.0
              = eph_current × differential
```

**Day 1 Swimming (no override, differential = 1.0):**

```
gross_seconds = 312.4 × 1.0  =  312.4s
net_seconds   = 312.4 × 0.073  =  22.8s
eph           = 375.1
```

**Final output — Arena Poolside LED, all events:**

| event                   | exposure_identifier          | eph   | sif   | gross_seconds | net_seconds | differential |
| ----------------------- | ---------------------------- | ----- | ----- | ------------- | ----------- | ------------ |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Final | 375.1 | 0.073 | 312.4         | 22.8        | 1.000        |
| Aquatics Diving Day 1   | Arena – Poolside LED – Final | 120.0 | 0.065 | 140.1         | 9.1         | 0.804        |
| Aquatics Swimming Day 2 | Arena – Poolside LED – Final | 346.9 | 0.072 | 289.1         | 20.8        | 1.000        |

### Full project output — all sponsors, all events

In practice, the Finalised Exposure table for the full Aquatics Championships project covers every sponsor across every event:

| event                   | exposure_identifier                | eph   | sif   | gross_seconds | net_seconds |
| ----------------------- | ---------------------------------- | ----- | ----- | ------------- | ----------- |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Final       | 375.1 | 0.073 | 312.4         | 22.8        |
| Aquatics Swimming Day 1 | Arena – Lane Panels – Final        | 104.6 | 0.058 | 87.2          | 5.1         |
| Aquatics Swimming Day 1 | BPER: Banca – Poolside LED – Final | 358.6 | 0.071 | 298.7         | 21.2        |
| Aquatics Swimming Day 1 | Enel – Poolside LED – Final        | 320.8 | 0.069 | 267.3         | 18.4        |
| Aquatics Diving Day 1   | Arena – Poolside LED – Final       | 120.0 | 0.065 | 140.1         | 9.1         |
| Aquatics Diving Day 1   | BPER: Banca – Poolside LED – Final | 98.4  | 0.061 | 115.3         | 7.0         |
| Aquatics Swimming Day 2 | Arena – Poolside LED – Final       | 346.9 | 0.072 | 289.1         | 20.8        |
| Aquatics Swimming Day 2 | Enel – Poolside LED – Final        | 301.4 | 0.068 | 251.2         | 17.1        |

---

## Step 17 — Output to Section 1 (Valuation)

A slim four-column view is passed to Section 1:

| event                   | exposure_identifier                | eph   | sif   |
| ----------------------- | ---------------------------------- | ----- | ----- |
| Aquatics Swimming Day 1 | Arena – Poolside LED – Final       | 375.1 | 0.073 |
| Aquatics Diving Day 1   | Arena – Poolside LED – Final       | 120.0 | 0.065 |
| Aquatics Swimming Day 2 | Arena – Poolside LED – Final       | 346.9 | 0.072 |
| Aquatics Swimming Day 1 | BPER: Banca – Poolside LED – Final | 358.6 | 0.071 |
| …                       | …                                  | …     | …     |

From here the exposure track is complete. Section 1 joins these rows to broadcast audience
records — on the structured `sports_event_id`, not the `event` name — and computes media value:

```
Gross Media Value = (EPH × numerical_hours / ad_slot_seconds) × (audience / 1000) × CPT
Net Media Value   = Gross Media Value × SIF
```

The audience model, CPT lookup, the full valuation formulas, and the multi-market worked
example (Arena × RAI / ARD / Eurosport / L'Équipe) all live in **`02-audience-valuation.md`**
(Part 2) — they are not duplicated here.

---

## Steps 1–17 calculation summary

This table covers the exposure pipeline only (Steps 1–17). For the complete pipeline including audience, modelling, and valuation see the **Complete pipeline summary** at the end of `02-audience-valuation.md` (Part 2).

| Step | What is calculated    | Formula                                                                                                                | Result                   |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1    | Width                 | `xmax − xmin` → `610 − 310`                                                                                            | 300 px                   |
| 1    | Height                | `ymax − ymin` → `980 − 880`                                                                                            | 100 px                   |
| 1    | Size                  | `width × height` → `300 × 100`                                                                                         | 30,000 px²               |
| 2    | Partner               | Tag cleaning lookup on `Arena – LED`                                                                                   | Arena                    |
| 2    | Asset                 | Tag cleaning lookup on `Arena – LED`                                                                                   | Poolside LED             |
| 3    | Timeslice             | Range lookup: `timestamp_s` falls within `Final` window                                                                | Final (2999.99s)         |
| 4    | Share of Screen       | `(width × height) / (frame_width × frame_height)` → `(300 × 100) / (1920 × 1080)`                                      | 0.01447 (1.45%)          |
| 5    | Balanced Share        | `1 − (1 − share_of_screen) ^ 40` → `1 − (1 − 0.01447) ^ 40`                                                            | 0.4406                   |
| 6    | Xmean                 | `(xmin + xmax) / 2` → `(310 + 610) / 2`                                                                                | 460                      |
| 6    | Ymean                 | `(ymin + ymax) / 2` → `(880 + 980) / 2`                                                                                | 930                      |
| 6    | Screen Position       | Grid assignment: `xmean / (frame_width / 4)` → `460 / 480` = col A; `ymean / (frame_height / 4)` → `930 / 270` = row 4 | A4                       |
| 7    | Position Score        | PositionConfig lookup on `screen_position = A4`                                                                        | 1.5                      |
| 8    | NumTags               | Count of all detections in `frame_number = 800`                                                                        | 3                        |
| 8    | Clutter Score         | ClutterConfig lookup on `num_tags = 3`                                                                                 | 0.90                     |
| 9    | SIF (per detection)   | `balanced_share × clutter_score × position_score` → `0.4406 × 0.90 × 1.5`                                              | 0.595                    |
| 10   | Exclusion check       | All 8 rules checked in order (first match wins)                                                                        | ✅ Included               |
| 11   | Gross Seconds (video) | `SUM(seconds)` across all valid detections in group → `7,810 frames × 0.04s`                                           | 312.4s                   |
| 11   | SIF (video average)   | `AVG(sif)` across all valid detections in group → average of 7,810 values                                              | 0.221                    |
| 12   | New SIF               | `sif_multiplier × sif` → `0.33 × 0.221`                                                                                | 0.073                    |
| 12   | Net Seconds           | `new_sif × gross_seconds` → `0.073 × 312.4`                                                                            | 22.8s                    |
| 13   | EPH                   | `(gross_seconds / timeslice_duration_s) × 3600` → `(312.4 / 2999.99) × 3600`                                           | 375.1                    |
| 14   | QA                    | Analyst reviews all project-level rows                                                                                 | ✅ Row kept               |
| 15   | Differential          | analyst input (default 1.0)                                                                                             | 1.000 (no change)        |
| 15   | EPH Proposed          | `eph_current × differential` → `375.1 × 1.000`                                                                         | 375.1                    |
| 16   | Final Gross Seconds   | `gross_seconds × differential` → `312.4 × 1.000`                                                                       | 312.4s                   |
| 16   | Final Net Seconds     | `final_gross_seconds × new_sif` → `312.4 × 0.073`                                                                      | 22.8s                    |
| 16   | Final EPH             | `eph_current × differential` → `375.1 × 1.000`                                                                         | 375.1                    |
| 17   | Output to Section 1   | `event`, `exposure_identifier`, `EPH`, `SIF` passed to valuation                                                       | EPH = 375.1, SIF = 0.073 |




