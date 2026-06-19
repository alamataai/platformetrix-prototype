# Part 2 — Calculation Model: Audience, Modelling & Valuation (Sections 4, 5, 6)

> **This is the canonical Part 2 spec.** It leads with the streamlined calculation model
> (the implementation source of truth), then retains the reference tables, data-source rules,
> and worked examples beneath it. It supersedes the earlier step-by-step Excel write-up — the
> *structure* is simplified (intermediate Excel columns collapsed), but all reference data and
> rationale are preserved. Numeric results are unchanged except where noted as rounding fixes.

The Exposure track (Part 1, Steps 1–16) produced four numbers per sponsor asset per event:
`event`, `exposure_identifier`, `EPH`, `SIF`. This document covers the **Audience track** and
the **Valuation** join that turns exposure into media value.

```
EXPOSURE TRACK (Part 1, Steps 1–16)            AUDIENCE TRACK (this document)
   → EPH, SIF per (event, exposure_identifier)    → audience, hours, CPT per broadcast
                        │                                       │
                        └───────────────┬───────────────────────┘
                                        ▼
                            VALUATION  (join on `sports_event_id`)
                            → gross_media_value, net_media_value
                                        │
                                        ▼
                            INSIGHTS (GROUP BY partner / market / asset / event)
```

---

## 1. The whole audience → valuation path

This is the entire computation. Everything after it is definitions, reference data, and
rationale. Five expressions:

```
# ── Audience (per broadcast row) ─────────────────────────────────────────────
modelled_audience  = population × tv_penetration          # TV universe
                   × sport_interest × channel_size        # market & channel share
                   × quality_of_timeslot                  # 168-cell day×hour lookup
                   × event_quality × interest_factor      # event importance & home interest

finalised_audience = audited_audience                     # use real figure if available …
                     ?? modelled_audience × audience_adjustment   # … else model × one knob

row_audience       = finalised_audience × program_type_multiplier   # Live / Highlight / News …

# ── Valuation (per Exposure × Broadcast combination) ─────────────────────────
gross_media_value  = (EPH × numerical_hours / ad_slot_seconds) × (row_audience / 1000) × CPT
net_media_value    = gross_media_value × SIF
```

> **`ad_slot_seconds`** (= 30) is a **named parameter** read from `global_parameters.json` —
> do not hard-code it (CLAUDE.md Rule 1). The two divisors are distinct and stay visible:
> `/ ad_slot_seconds` converts exposure seconds into equivalent ad slots; `/ 1000` pairs with
> CPT, which is quoted *per thousand* viewers.

> **Join key.** The Exposure × Broadcast join is on the structured **`sports_event_id`**
> (→ `SportsEvent.id` in the schema), never the `event` display name. Matching on display
> strings is fragile — `"Swimming Day 1"` vs `"Day 1 Swimming"` silently drops rows. Carry
> `event` (= `Competition.name`) and `exposure_identifier` only as labels for reporting. Same
> rule as Part 1 Rule 7: display strings are never join keys.

---

## 2. Field definitions

### 2.1 Audience model inputs

| field | scope | source | default |
| --- | --- | --- | --- |
| `population` | market | reference table, updated periodically | — |
| `tv_penetration` | market | reference table | — |
| `sport_interest` | project (per sport) | analyst sets per project | — |
| `channel_size` | channel | reference / analyst | — |
| `quality_of_timeslot` | broadcast | full **168-cell** config table (7 days × 24 hours), analyst-maintained; looked up on `day_hour` at the event midpoint in **broadcaster local time** | — |
| `event_quality` | event | analyst | — |
| `interest_factor` | market × event/team/athlete | structured lookup; when several keys match, take the **single highest** (max) — factors are **never** multiplied together | 1.0 |
| **`audience_adjustment`** | **broadcast (channel default)** | **single analyst knob — see §2.2** | **1.0** |

### 2.2 `audience_adjustment` — the single analyst input

Replaces the original **two** inputs (`fixed_multiplier` and `analyst_discount`). Those were
mathematically identical — both scalar multipliers on the same modelled product — so they
collapse to one factor:

- Applied **only on the modelled fallback path**. When `audited_audience` exists, the model
  (and this factor) is ignored entirely.
- **Default sourced from channel config.** A channel may carry a standing default (e.g. "this
  channel consistently underperforms its share → 0.8"), which pre-fills the per-broadcast
  field. The analyst sees and edits **one number**; the config just gives it a smart start.
- **Calibration signal.** If `audience_adjustment` is routinely far from 1.0, the base
  parameters (`sport_interest`, `channel_size`) are mis-calibrated and should be fixed at
  source rather than corrected per row. A single knob makes this visible; two knobs hid it by
  splitting the correction.

### 2.3 Broadcast / valuation fields

| field | definition |
| --- | --- |
| `sports_event_id` | structured join key linking an Exposure row to its Broadcast rows (→ `SportsEvent.id`). The `event` name is a display label only. |
| `data_type` | provenance tier: `Audited` (1) / `ProgrammeLog` (2) / `Modelled` (3). Metadata only — does not change the formula, only which branch supplies `finalised_audience`. |
| `program_type_multiplier` | Lookup from a **config table** (`program_type_multipliers.json`), editable per project: Live 1.0, Highlight 0.40, News 0.10, …. Not hard-coded (CLAUDE.md Rule 1), same pattern as `clutter_scores.json` / `position_scores.json`. |
| `numerical_hours` | broadcast duration in decimal hours (0h50m → 0.833) |
| `ad_slot_seconds` | named global parameter (= 30); divisor that converts exposure seconds into equivalent ad slots. Read from `global_parameters.json`, never hard-coded. |
| `CPT` | cost per 1,000 viewers of an `ad_slot_seconds`-length ad, looked up by market |
| `EPH`, `SIF` | from the Exposure track (Part 1, Step 16 output) |
| `peak` / `reach` | `finalised_audience × peak_multiplier (1.5)` / `× reach_multiplier (3.5)` — side outputs for premium-slot and brand-awareness reporting; not in the value path |

> If a broadcast-level seconds figure is ever needed for reporting, name it
> **`broadcast_gross_seconds`** / **`broadcast_net_seconds`** so it never clashes with the
> per-timeslice `gross_seconds` / `net_seconds` from Part 1 Step 16 (different scope).

---

## 3. Audience data sources (Section 4)

Three tiers, used top-down — each only when the one above is unavailable. All three live in
the same `Broadcast` table, distinguished by `data_type`. When a higher tier arrives for a
broadcast that held a lower one, the lower row is superseded but both are retained for audit.

| tier | data_type | what it is | when used |
| ---- | --------- | ---------- | --------- |
| 1 | **Audited** | Real viewership from official agencies (BARB UK, Auditel Italy, Médiamétrie France). Full programme structure **and** audience, often with demographics. The gold standard → sets `audited_audience`. | 1–4 weeks after broadcast. |
| 2 | **Programme Log** | EPG-scraped structure (country, broadcaster, channel, programme name/type, start/end/duration) but **no audience**. Structure is known; only the audience is modelled. | Where audited figures are unavailable but an EPG can be scraped. |
| 3 | **Modelled** | Fully estimated — both structure and audience — from known data points about broadcaster, market, and event. | Worst case: neither real data nor an EPG obtainable. |

This three-tier hierarchy is what the coalesce in §1 expresses:
`finalised_audience = audited_audience ?? (modelled_audience × audience_adjustment)`.
The tier is metadata; the formula is the same.

> **Demographics** (age/gender) are part of the standard Audited feed and are captured on the
> Broadcast row where supplied (see §6). For Programme Log and Modelled tiers they can be
> calculated on request but are usually skipped.

---

## 4. Reference data (Section 5 building blocks)

The modelled audience is built from market-, channel-, and event-level reference values.

### 4.1 TV Universe — `population × tv_penetration`

The TV-owning population, *not* total population (which would inflate the ceiling in markets
with low penetration such as India).

| market | population | tv_penetration | tv_universe |
| ------ | ---------- | -------------- | ----------- |
| Italy | 59,240,000 | 0.98 | 58,055,200 |
| Germany | 84,360,000 | 0.97 | 81,829,200 |
| UK | 67,730,000 | 0.95 | 64,343,500 |
| France | 68,170,000 | 0.97 | 66,124,900 |
| India | 1,441,720,000 | 0.69 | 994,786,800 |

### 4.2 Sport Interest

Fraction of the population that actively watches this sport on TV. Set per project per sport.

| market | sport_interest | meaning |
| ------ | -------------- | ------- |
| Italy | 0.35 | 35% of Italians watch aquatics on TV |
| Germany | 0.28 | 28% of Germans watch aquatics |
| UK | 0.22 | 22% of British viewers watch aquatics |
| India | 0.05 | 5% of India's population watch aquatics |

> A cricket project would invert these — India 0.70+, Italy ~0.01.

### 4.3 Channel Size

Fraction of the sport-interested audience this channel reaches, relative to all channels in
that market carrying the sport.

| channel | channel_size | meaning |
| ------- | ------------ | ------- |
| RAI Sport (Italy) | 0.45 | reaches 45% of Italy's aquatics viewers |
| ARD (Germany) | 0.60 | dominates German aquatics coverage |
| Eurosport UK | 0.30 | reaches 30% of UK aquatics viewers |
| Canal+ Sport (France) | 0.40 | reaches 40% of French aquatics viewers |

### 4.4 Quality of Time (168-cell table, Saturday extract)

A score for every hour of every weekday (Mon 00:00 … Sun 23:00). Looked up on the event
**midpoint hour in the broadcaster's local timezone**.

| day_hour | quality | meaning |
| -------- | ------- | ------- |
| Saturday6 | 0.05 | 6am — almost no one watching |
| Saturday12 | 0.40 | noon — decent daytime audience |
| Saturday17 | 0.70 | 5pm — strong pre-primetime |
| Saturday19 | 0.85 | 7pm — peak sport window |
| Saturday20 | **1.00** | 8pm — maximum primetime |
| Saturday22 | 0.55 | 10pm — declining |
| Saturday0 | 0.12 | midnight — very low |

> A broadcaster in another timezone airing the same final sees a different midpoint hour —
> e.g. a Canadian channel at 2pm Saturday (quality 0.50), reducing the modelled audience.

### 4.5 Event Quality

How important is this specific event?

| event | event_quality |
| ----- | ------------- |
| 50m Freestyle Final | 0.90 |
| 200m Backstroke Heat 3 | 0.35 |
| 4×100m Medley Relay Final | 0.95 |
| Day 1 Swimming Final (our example) | 0.75 |

### 4.6 Interest Factor (structured lookup, max wins)

Keyed by `market × event / team / athlete`. When several keys match a broadcast, take the
**single highest** factor — never the product. Combinations not listed default to 1.0.

| market | key_type | key | interest_factor |
| ------ | -------- | --- | --------------- |
| Italy | event | Aquatics Swimming Day 1 | 1.0 |
| Italy | team | Italy (Water Polo) | 1.8 |
| Italy | athlete | Thomas Ceccon | 1.6 |
| Australia | event | Aquatics Swimming Day 1 | 1.0 |
| Australia | team | Australia (Swimming) | 2.2 |

### 4.7 Program Type Multipliers (`program_type_multipliers.json`)

| program_type | multiplier | duration |
| ------------ | ---------- | -------- |
| Live | 1.0 | same as event duration |
| Delayed | (config) | as aired |
| Highlight | 0.40 | typically 0.5h |
| Magazine | (config) | as aired |
| News | 0.10 | typically 5 min (0.083h) |

> Under **Programme Log (Tier 2)**, program types, durations, and start/end times are read
> directly from the EPG log; only the audience is modelled. The multipliers above are the
> analyst-specified case (Tiers 1 & 3).

### 4.8 CPT table (extract)

Cost per 1,000 viewers of a 30-second ad, by market. Maintained separately; updated
periodically.

| market | CPT | market | CPT |
| ------ | --- | ------ | --- |
| Italy | €9.50 | USA | €24.50 |
| Germany | €14.20 | India | €1.10 |
| UK | €18.40 | Australia | €11.80 |
| France | €11.30 | Spain | €8.70 |

---

## 5. Finalised Average Audience (Section 5, Step 19d)

`finalised_average_audience` is the number the analyst commits to as the **actual average
viewers at any moment** during the broadcast — the standard metric CPT is priced against. It
is reached by the coalesce in §1, whose branch depends on the data tier:

- **Tier 1 (Audited):** enter the agency figure directly; the model is ignored.
  `finalised_audience = audited_audience` (e.g. 1,200,000).
- **Tier 2 (Programme Log):** structure from the EPG log; audience = analyst-confirmed
  `modelled_audience × audience_adjustment`.
- **Tier 3 (Modelled):** both structure and audience estimated;
  `finalised_audience = modelled_audience × audience_adjustment`.

> **Calibration warning.** In the worked example the modelled chain yields 6,857,771 but the
> audited figure is 1,200,000 — an `audience_adjustment` of ~0.175 would be needed on the
> modelled path. A correction that large is a *signal*, not routine: recalibrate
> `sport_interest` / `channel_size` at source rather than discounting every row.

### Peak and Reach

```
peak  = finalised_audience × peak_multiplier   = 1,200,000 × 1.5 = 1,800,000
reach = finalised_audience × reach_multiplier  = 1,200,000 × 3.5 = 4,200,000
```

**Peak** — highest simultaneous viewers (typically 1.3–1.8× average); premium-slot valuation.
**Reach** — total unique individuals who watched any part (typically 3–4× average); brand
awareness reporting. Multipliers are editable per project / broadcaster.

---

## 6. Broadcast rows & compilation (Section 4)

A single event on a single channel may generate several broadcast rows (live, highlight,
news, repeat). Each row's audience is `finalised_audience × program_type_multiplier`.

**RAI Sport × Day 1 Swimming Final → 4 broadcast rows:**

| program_title | program_type | duration_h | audience |
| ------------- | ------------ | ---------- | -------- |
| Aquatics Swimming Day 1 – Live | Live | 0.833 | 1,200,000 |
| Aquatics Swimming Day 1 – Highlight | Highlight | 0.500 | 480,000 |
| Aquatics Swimming Day 1 – Highlight | Highlight | 0.500 | 480,000 |
| Aquatics Swimming Day 1 – News | News | 0.083 | 120,000 |

### Computed fields per row

```
numerical_hours = duration in decimal hours        # 0h50m → 0.833
                                                    # audience/1000 and hours×audience are
                                                    # computed inline where a report needs them,
                                                    # not stored as separate columns
```

### Demographics (optional, nullable)

Where the feed supplies them (standard for Audited), a row can carry an age/gender breakdown.
Nullable — never required for a row to flow to valuation.

| field | example | note |
| ----- | ------- | ---- |
| aud_male / aud_female | 660,000 / 540,000 | absolute average audience by gender |
| aud_age_16_34 | 384,000 | average audience, 16–34 band |
| aud_age_35_54 | 516,000 | average audience, 35–54 band |
| aud_age_55_plus | 300,000 | average audience, 55+ band |

> Split figures reconcile against `audience`. Demographics affect CPT and client reporting, so
> retain them where available; otherwise leave empty and proceed.

### Timezone & QA

Each row carries start/end in both local and UTC time (`start_time_utc = local − tz_offset`).
Before valuation the analyst QAs the compiled `Broadcast` table:

| check | example anomaly |
| ----- | --------------- |
| Numerical hours ≤ 0 | start/end times entered wrong |
| Audience implausibly high | 50,000,000 for a small Pay-TV channel |
| Duplicate broadcast | same file imported twice |
| Event mismatch | wrong `sports_event_id` — would misjoin to Exposure |

---

## 7. Valuation — Exposure meets Audience (Section 6)

Every `FinalisedExposure` row (Part 1, Step 16) is matched to every `Broadcast` row sharing
the same `sports_event_id`, and media value is computed per combination using the formulas in
§1.

### Worked example — Arena Poolside LED × RAI Sport Live (audited)

```
modelled_audience  = 58,055,200 × 0.35 × 0.45 × 1.0(quality) × 0.75 × 1.0
                   = 6,857,771                         # fallback only — not used here
finalised_audience = 1,200,000                         # audited figure overrides the model
row_audience       = 1,200,000 × 1.0 (Live)            = 1,200,000

gross_media_value  = (375.1 × 0.833 / 30) × (1,200,000 / 1000) × 9.50
                   = (312.5 / 30) × 1,200 × 9.50
                   = 10.4167 × 1,200 × 9.50
                   = €118,750
net_media_value    = 118,750 × 0.073                   = €8,669
```

### Full valuation output — Arena Poolside LED × all broadcasts, Day 1 Swimming Final

| market | channel | program_type | audience | num_hours | CPT | gross_media_value | sif | net_media_value |
| ------ | ------- | ------------ | -------- | --------- | --- | ----------------- | --- | --------------- |
| Italy | RAI Sport | Live | 1,200,000 | 0.833 | €9.50 | €118,750 | 0.073 | €8,669 |
| Italy | RAI Sport | Highlight | 480,000 | 0.500 | €9.50 | €28,508 | 0.073 | €2,081 |
| Italy | RAI Sport | Highlight | 480,000 | 0.500 | €9.50 | €28,508 | 0.073 | €2,081 |
| Italy | RAI Sport | News | 120,000 | 0.083 | €9.50 | €1,190 | 0.073 | €87 |
| Germany | ARD | Live | 840,000 | 0.833 | €14.20 | €124,580 | 0.073 | €9,094 |
| UK | Eurosport UK | Live | 380,000 | 0.833 | €18.40 | €86,782 | 0.073 | €6,335 |
| France | L'Équipe TV | Live | 290,000 | 0.833 | €11.30 | €40,894 | 0.073 | €2,985 |
| **Total** | | | | | | **€429,212** | | **€31,332** |

> Euro figures are illustrative and rounded for display. This is one event, one sponsor, one
> asset — the full project spans every event × sponsor × asset × market.

---

## 8. Insights & reporting (Section 6)

The valuation table has one row per Exposure × Broadcast combination (potentially tens of
thousands). Insights views aggregate by `GROUP BY` — no new math.

**By sponsor (all events, all markets):**

| partner | gross_media_value | net_media_value |
| ------- | ----------------- | --------------- |
| Arena | €1,842,300 | €134,488 |
| BPER: Banca | €1,720,100 | €122,127 |
| Enel | €1,530,800 | €107,687 |
| World Aquatics | €980,400 | €68,028 |
| **Total** | **€6,073,600** | **€432,330** |

**Arena by asset type:**

| asset | gross_media_value | net_media_value | % of Arena |
| ----- | ----------------- | --------------- | ---------- |
| Poolside LED | €1,240,000 | €90,520 | 67% |
| Lane Panels | €410,000 | €29,930 | 22% |
| Swimsuit | €192,300 | €14,038 | 11% |
| **Total** | **€1,842,300** | **€134,488** | 100% |

---

## 9. What was simplified (vs the original Excel write-up)

| removed / changed | reason |
| --- | --- |
| `implied_average_audience`, `_2`, `_3` | Excel column-chaining. The 8-factor product is one expression; intermediates were storage scaffolding. |
| `fixed_multiplier` + `analyst_discount` → `audience_adjustment` | Two scalar multipliers on the same product are one factor. Merged; channel default preserves the reuse benefit. |
| "Three routes" (A/B/C) for finalised audience | One coalesce: `audited ?? modelled × audience_adjustment`. The tier is metadata, not a separate procedure. |
| `aud_000s` (stored column) | Compute `row_audience / 1000` inline at valuation. The `/1000` stays visible next to CPT; the `/ ad_slot_seconds` divisor stays a named parameter — neither merged into a magic constant. |
| `hours_viewed`, `hours_viewed_000s` | Never referenced by any valuation or insight formula — computed on demand if a report needs them. |
| recomputed `gross_seconds` / `net_seconds` at valuation | Name-collided with the per-timeslice values from Part 1 Step 16. Dropped from the money path; only the inline `EPH × numerical_hours` term feeds GMV (see §2.3 naming note). |
| `event`-name join → `sports_event_id` | Display-string joins silently drop rows on naming drift. Join on the structured key. |
| hard-coded program multipliers → config | `program_type_multipliers.json`, editable per project (Rule 1). |

### Deliberately kept

- **EPH as the bridge** — lets one exposure measurement re-project onto a *different* broadcast
  duration (a 0.5h highlight vs the 0.833h live timeslice). Not redundant; do not remove.
- **Data-tier provenance** (`data_type`) as metadata, higher tiers superseding lower.
- **Demographics** as nullable side fields.
- **`peak` / `reach`** as side outputs.

### Resolved decisions

| # | Question | Decision | Rationale |
| --- | --- | --- | --- |
| 4 | Quality-of-Time granularity: 168 hourly cells vs daypart buckets? | **Keep 168 hourly cells** (config table). | Hour-level timing materially affects modelled audience. |
| 5 | `interest_factor` when multiple keys match: max vs compound? | **Highest wins (max)** — never multiply. | Conservative; avoids runaway inflation when a market has both a home team and a home star. |

> Deferred: whether `peak` / `reach` are consumed by any downstream report. Build them only
> once a report needs them.

---

## 10. Complete pipeline summary — all steps

Steps 1–16 are detailed in Part 1 (`01-exposure-calculation.md`). Steps 17+ are this
document.

| Step | Section | What is calculated | Key output |
| ---- | ------- | ------------------ | ---------- |
| 1 | 2 | Bounding box geometry | width, height, size |
| 2 | 2 | Tag identity & approval | partner, asset |
| 3 | 2 | Timeslice assignment | timeslice_label, duration_s |
| 4 | 2 | Share of Screen | 1.45% |
| 5 | 2 | Balanced Share | 0.4406 |
| 6 | 2 | Grid position | A4 |
| 7 | 2 | Position Score | 1.5 |
| 8 | 2 | NumTags + Clutter Score | num_tags=3, clutter=0.90 |
| 9 | 2 | SIF per detection | 0.595 |
| 10 | 2 | Exclusion check | Included |
| 11 | 2+3 | Video Exposure aggregation | gross_seconds=312.4s, sif=0.221 |
| 12 | 3 | New SIF + Net Seconds | new_sif=0.073, net_seconds=22.8s |
| 13 | 3 | EPH | 375.1 |
| 14 | 3 | QA & Audit | Row kept |
| 15 | 3 | Differential override (analyst input) | differential=1.000 |
| 16 | 3 | Finalised Exposure (× differential) | gross=312.4s, net=22.8s, eph=375.1 |
| 17 | 6 | Output to valuation | EPH=375.1, SIF=0.073 |
| 18 | 4 | Audience data sources | Audited / Programme Log / Modelled |
| 19 | 5 | Modelled audience (one product) | 6,857,771 (fallback) |
| 19d | 5 | Finalised audience (coalesce) | 1,200,000 (audited) |
| 20 | 5 | Program rows | 4 rows (Live, 2×Highlight, News) |
| 21 | 4 | Compilation + QA | numerical_hours, demographics |
| 22 | 6 | CPT lookup | €9.50 (Italy) |
| 23 | 6 | Valuation: Exposure × Audience × CPT | GMV=€118,750, NMV=€8,669 per row |
| 24 | 6 | Insights & reporting | aggregated by partner / market / asset / event |
