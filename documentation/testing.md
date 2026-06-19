# Testing (manual UI checklist) — Platformetrix Prototype

The **pure pipeline (Steps 1–16) is covered by the automated suite** at
`src/lib/pipeline.test.ts` — run `npm test`. That suite owns every numeric value (geometry,
share, balanced share, SIF, exclusion reasons, aggregation, EPH, differential). The
regression baseline table lives in `CLAUDE.md`.

**This document covers only what unit tests cannot reach** — the UI and analyst behaviour:
file upload, the tag-cleaning workflow, QA flags, the override guard, CSV export, and error
states. Run it before a demo. (TC numbers are non-contiguous: the gaps are the numeric cases
that `pipeline.test.ts` owns.)

---

## Test dataset — `sample_aquatics.csv`

Create this once and reuse it. Three representative detections: the primary frame, a warm-up
frame (exclusion), and a solus-brand frame (clutter bonus).

```
frame_number,timestamp_s,tag,probability,xmin,xmax,ymin,ymax,frame_width,frame_height,seconds
800,32.00,Arena – LED,0.96,310,610,880,980,1920,1080,0.04
820,32.80,Arena – LED,0.97,310,610,880,980,1920,1080,0.04
820,32.80,BPER Banca – LED,0.91,640,940,880,980,1920,1080,0.04
820,32.80,Enel – LED,0.88,970,1270,880,980,1920,1080,0.04
1200,48.00,Rolex – Scoreboard,0.99,860,1060,50,150,1920,1080,0.04
```

All five rows above fall in the Warm-up timeslice → every one shows `TIMESLICE_EXCLUDED`.
To exercise aggregation / QA / override **in the UI**, add detections that survive exclusion
(timestamp 820s falls in the Final timeslice):

```
20500,820.00,Arena – LED,0.96,310,610,880,980,1920,1080,0.04
20500,820.00,BPER Banca – LED,0.91,640,940,880,980,1920,1080,0.04
20500,820.00,Enel – LED,0.88,970,1270,880,980,1920,1080,0.04
```

---

## Project config for testing

Use these exact values when setting up the project in the app.

**Parameters:** `sif_multiplier` = 0.33 · `exposure_threshold` = 0.001

**Video registration:** `event_name` = Aquatics Swimming Day 1 | `video_label` = Day 1
Swimming Final  (`video_id` auto-derives as `"Aquatics Swimming Day 1 / Day 1 Swimming Final"`).

**Timeslices:**

| label | start_s | end_s | is_excluded |
|-------|---------|-------|-------------|
| Warm-up | 0.00 | 599.99 | ✅ yes |
| Final | 600.00 | 3599.99 | no |
| Medal Ceremony | 3600.00 | 4200.00 | no |

**Tag cleaning rules:**

| raw_tag | partner | asset | approved |
|---------|---------|-------|----------|
| Arena – LED | Arena | Poolside LED | ✅ |
| BPER Banca – LED | BPER: Banca | Poolside LED | ✅ |
| Enel – LED | Enel | Poolside LED | ✅ |
| Rolex – Scoreboard | Rolex | Scoreboard | ✅ |

---

## TC-01 — CSV upload & parse

**Action:** upload `sample_aquatics.csv`

| Check | Expected |
|-------|----------|
| No parse error shown | ✅ |
| Row count shown in summary | matches the file |
| `frame_number` parsed as a number | 800 |
| `seconds` = 0.04 for all rows | ✅ |

**Failure mode:** upload a CSV with a BOM character prepended (`﻿`) and confirm it parses
cleanly — the header row must not show a BOM-prefixed `frame_number`.

---

## TC-10 — Tag cleaning workflow (Step 2)

**Action:** upload a CSV with an unrecognised tag (e.g. `"BetMGM – Board"`).

| Check | Expected |
|-------|----------|
| Unknown tag surfaced in the tag-cleaning UI (status **pending**) | ✅ |
| Detection rows for that tag show `TAG_PENDING` | ✅ |
| Analyst sets status **Map** (partner=BetMGM, asset=Perimeter Board) | rows now show partner/asset, exclusion cleared |
| Analyst ticks **Exclude** and writes a note (the reason) | rows show `EXCLUDED_BY_RULE` |

Tag matching is **case-sensitive** — `"Arena – LED"` and `"arena – led"` are different tags.

---

## TC-14 — QA flag (Step 14)

| Action | Expected |
|--------|----------|
| Flag a row (`is_audited_out = true`) with no note | Save blocked |
| Flag a row with a note | Row saved, greyed out in the table |
| Flagged row in EPH override table | does **not** appear |
| Flagged row in finalised exposure output | does **not** appear |
| Un-flag the row | Reappears in downstream tables |

---

## TC-15 — Differential Override guard (Step 15)

**Scenario:** a row with `eph_current` = 149.3.

| Action | Expected |
|--------|----------|
| Change `differential` to 0.804 with no note | Save button **disabled** |
| Add audit note, save | `eph_proposed` = 120.0 shown live (149.3 × 0.804) |
| Set `differential` back to 1.000 | `eph_proposed` = 149.3; note not required |
| `differential` < 0.70 (e.g. 0.535) | Red warning shown |

---

## TC-17 — CSV export (Step 16)

**Action:** click Export on the Finalised Exposure table.

| Check | Expected |
|-------|----------|
| File downloads as `.csv` | ✅ |
| Headers: event, exposure_identifier, eph, sif, gross_seconds, net_seconds, differential | ✅ |
| Values match what is displayed in the table | ✅ |
| em dash (–) in `exposure_identifier` preserved in the CSV | ✅ |

---

## TC-02 — Venue country & timezone (setup)

The venue timezone (audience track foundation) is resolved from a structured ISO country.

| Action | Expected |
|--------|----------|
| Competition → Country: pick **Italy** | Venue Timezone auto-shows `Europe/Rome` (single-zone) |
| Competition → Country: pick **United States of America** | Timezone shows a candidate dropdown (US zones); "Select the venue zone." hint until one is chosen |
| Competition timezone → click **Other zone…** | Dropdown expands to the full worldwide IANA list |
| SportsEvent: leave Country/Timezone blank | Inherits the competition's country & zone (Timezone shows `Inherit (…)`) |
| SportsEvent: override Country to a different one | Timezone candidates update to the new country; picking a zone overrides the inherited one |
| Project & Competition overviews | Country labels render **names** (e.g. "Italy"), not codes |
| Reload the app (localStorage) | A pre-existing free-text "Italy" competition migrates to code `IT` / `Europe/Rome`; an unmappable name blanks out for re-selection — no crash |

---

## TC-18 — Error states

| Scenario | Expected |
|----------|----------|
| Upload CSV missing the `frame_width` column | Clear error message; no crash |
| Upload CSV with a non-numeric `xmin` | Row skipped with a warning; rest of file processed |
| Attach a CSV to a video with no timeslices covering its timestamps | Detections shown but excluded as `NO_TIMESLICE` |
| All detections excluded (e.g. all below threshold) | "0 detections included" message; no empty-table crash |
| Large CSV (>10k rows) | Loading indicator shown; UI does not freeze |
