# Platformetrix — Application Architecture v4

**Status:** current as of schema **v5** (drill-down navigation, `Project` hierarchy, structured
ISO country + venue timezone).
**Stack:** React + Vite + TypeScript + Tailwind. No backend — all state lives in React
context and is persisted to `localStorage`. The pipeline (Steps 1–16) is pure and lives in
`src/lib/pipeline.ts`.

This document describes the **domain hierarchy**, every **entity and its attributes**, the
**relationships** between them, the **derived (pipeline) types**, the **persistence schema**,
and the **navigation model**.

---

## 1. Entity hierarchy

```
Client                         (reference list, managed in Global Settings)
  └─ Project                   client_id  (''  = no client)
       └─ Competition          project_id (''  = unassigned)
            └─ SportsEvent      competition_id ('' = unassigned)
                 └─ Media       sports_event_id            ← VideoMedia | AudioMedia
                      └─ Timeslice   (VideoMedia only)

Cross-cutting / reference:
  StoredCSV         global file library, referenced by Media.csv_file_id
  SportDiscipline   sport_type → discipline taxonomy (Global Settings)
  GlobalSettings    global defaults + a per-event copy on each SportsEvent
  QAState           per-SportsEvent analyst overrides (Steps 14–15)
```

Each level is a thin organisational wrapper around the level below it; the actual
measurement data hangs off **SportsEvent** (its `config`, `settings`, `qa_state`) and the
**Media** it owns. Renaming history: the former `Sponsor` → **Client**, the former
`Assignment` → **Project**, and the original `Project` → **SportsEvent**.

---

## 2. Entities & attributes

### 2.1 Client
Reference entity; the commissioning organisation. Managed under Global Settings → Clients.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `name` | `string` | |
| `created_at` | `number` | epoch ms |

### 2.2 Project  *(was `Assignment`)*
A research engagement. Top level of the navigable tree.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID (`makeProjectId`) |
| `name` | `string` | |
| `client_id` | `string` | → `Client.id`; `''` = no client |
| `description` | `string` | free text |
| `created_at` | `number` | epoch ms |

### 2.3 Competition
A named sports contest with a venue and dates.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `project_id` | `string` | → `Project.id`; `''` = unassigned |
| `name` | `string` | |
| `date_start` | `string` | `YYYY-MM-DD` or `''` |
| `date_end` | `string \| null` | |
| `country` | `string` | **ISO-3166 alpha-2 code** (e.g. `"DE"`); `''` = unset. Picked via `CountrySelect` |
| `city` | `string` | |
| `timezone` | `string \| null` | IANA venue zone (e.g. `"Europe/Rome"`); auto-resolved from `country` when single-zone, else analyst-picked. Inherited by child SportsEvents |

### 2.4 SportsEvent  *(was `Project`)*
The measurement unit. Holds the committed config, a working draft, per-event settings, and
analyst QA state. Opening one launches the 5-tab pipeline workspace.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` (`SportsEventId`) | UUID |
| `competition_id` | `string` | → `Competition.id`; `''` = unassigned |
| `name` | `string` | |
| `sport_type` | `string` | from `SportDiscipline` taxonomy |
| `discipline` | `string` | filtered by `sport_type` |
| `country` | `string` | **ISO-3166 alpha-2 code**; pre-filled from the Competition on creation; `''` inherits the Competition's value |
| `city` | `string` | pre-filled from the Competition on creation; `''` falls back to (inherits) the Competition's value |
| `scheduled_start` | `string \| null` | `YYYY-MM-DDTHH:mm` — naive local (venue) wall-clock |
| `scheduled_end` | `string \| null` | |
| `timezone` | `string \| null` | IANA venue zone **override**; `null` = inherit the Competition's. Effective zone = `effectiveTimezone(se, comp)`. Anchors `scheduled_start/end` to an instant |
| `config` | `SportsEventConfig` | **committed** — drives the pipeline |
| `draft_config` | `SportsEventConfig` | editable draft (Save & Re-run commits it) |
| `settings` | `GlobalSettings` | committed per-event parameters |
| `draft_settings` | `GlobalSettings` | editable draft |
| `qa_state` | `QAState` | analyst flags/overrides |
| `created_at` | `number` | epoch ms |
| `updated_at` | `number` | epoch ms |

> **Venue inheritance:** `country`/`city` are copied from the parent Competition when the
> event is created (`createSportsEvent`), and can be amended per event. At read time a blank
> value falls back to the Competition's value (`se.city || comp.city`, `se.country ||
> comp.country`), so the effective location is shown wherever the event appears. The venue
> **`timezone`** follows the same rule: `null` on the event inherits the Competition's zone
> (`effectiveTimezone(se, comp)` in `src/lib/timezone.ts`). The zone is resolved from the ISO
> `country` via `defaultZonesForCountry()` — single-zone countries auto-fill; multi-zone
> require an explicit pick. Country labels are rendered through `countryName(code)`.

#### SportsEventConfig
| Field | Type | Notes |
|-------|------|-------|
| `media_ids` | `string[]` | Media included in the pipeline |
| `excluded_media_ids` | `string[]` | Media explicitly excluded |
| `tag_cleaning_rules` | `TagCleaningRule[]` | raw-tag → partner/asset mapping |

> Note: **timeslices are NOT on the config** — they are intrinsic to each `VideoMedia`.

### 2.5 Media  *(discriminated union: `VideoMedia | AudioMedia`)*
Owned directly by a SportsEvent. The `type` discriminant selects the exposure method.

Common base (`MediaBase`):

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID (`makeMediaId`) |
| `sports_event_id` | `string` | → `SportsEvent.id` (owner) |
| `label` | `string` | display name |
| `is_excluded` | `boolean` | |
| `csv_file_id` | `string \| null` | → `StoredCSV.id` |

`VideoMedia` adds:

| Field | Type | Notes |
|-------|------|-------|
| `type` | `'video'` | discriminant |
| `timeslices` | `SportsEventTimeslice[]` | committed immediately (not in draft) |

`AudioMedia` adds:

| Field | Type | Notes |
|-------|------|-------|
| `type` | `'audio'` | discriminant; audio exposure fields TBD |

Type guards: `isVideoMedia(m)`, `isAudioMedia(m)`.

### 2.6 SportsEventTimeslice  *(VideoMedia only)*
| Field | Type | Notes |
|-------|------|-------|
| `media_id` | `string` | owning VideoMedia |
| `video_id` | `string` | derived at resolve time (see §4) |
| `label` | `string` | e.g. "Final" |
| `start_s` | `number` | seconds |
| `end_s` | `number` | seconds |
| `duration_s` | `number` | seconds |
| `is_excluded` | `boolean` | |

`type Timeslice = SportsEventTimeslice` (alias used by the pipeline).

### 2.7 TagCleaningRule
One disposition per distinct raw tag, decided in the Tag Cleaning step.

| Field | Type | Notes |
|-------|------|-------|
| `raw_tag` | `string` | exact, **case-sensitive** match from the CSV |
| `status` | `TagStatus` | `'mapped'` \| `'excluded'` \| `'pending'` (derived: filled = mapped, Exclude ticked = excluded, else pending) |
| `partner` | `string \| null` | required when `status === 'mapped'` |
| `asset` | `string \| null` | required when `status === 'mapped'` |
| `note` | `string \| null` | free-text; the analyst's reason when excluded, optional otherwise |

> `excluded` → `EXCLUDED_BY_RULE`; `pending` (or no rule) → `TAG_PENDING`. Replaced the old
> `{cleaning_partner/asset, approved}` shape and the magic `'DELETE'` string (migration v4→v5).

### 2.8 StoredCSV  *(global file library)*
Metadata for an uploaded CSV; the raw text is stored separately under
`platformetrix_csv_<id>` in localStorage.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID (`makeCSVId`) |
| `filename` | `string` | |
| `size_bytes` | `number` | |
| `row_count` | `number` | parsed detections |
| `skipped_rows` | `number` | malformed rows skipped |
| `frame_count` | `number` | distinct frames |
| `duration_s` | `number` | max timestamp |
| `video_ids` | `string[]` | distinct video_ids found |
| `tags` | `string[]` | distinct raw tags |
| `uploaded_at` | `number` | epoch ms |
| `stored` | `boolean` | whether raw content persisted |

### 2.9 SportDiscipline  *(taxonomy)*
| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | UUID |
| `sport_type` | `string` | e.g. "Aquatics" |
| `discipline` | `string` | e.g. "Swimming" |

### 2.10 GlobalSettings  *(global default + per-event copy)*
| Field | Type | Notes |
|-------|------|-------|
| `balanced_share_exponent` | `number` | constant 40 |
| `ad_slot_seconds` | `number` | constant 30 |
| `exposure_threshold` | `number` | default 0.001 |
| `probability_threshold` | `number` | min detection probability |
| `sif_multiplier` | `number` | default 0.33 |
| `peak_multiplier` | `number` | 1.5 — **global** in the prototype; channel-level scope deferred to Stage 3 |
| `reach_multiplier` | `number` | 3.5 — **global** in the prototype; channel-level scope deferred to Stage 3 |
| `currency` | `string` | e.g. "USD" |
| `clutter_scores` | `Record<string, number>` | num_tags → score |
| `position_scores` | `Record<string, number>` | "A1".."D4" → score |

(`GlobalConfig` is the scalar-only seed shape used for the JSON config files.)

### 2.11 QAState / QARowState  *(per SportsEvent)*
`QAState = { rows: Record<string, QARowState> }`, keyed by `ProjectExposure.qa_key`.

| QARowState field | Type | Notes |
|------------------|------|-------|
| `is_audited_out` | `boolean` | Step 14 flag |
| `audit_flag_note` | `string \| null` | required when flagged |
| `differential` | `number` | Step 15 **analyst input** (default 1.0); scales gross/net seconds and EPH |
| `eph_proposed` | `number \| null` | derived: `eph_current × differential` (`null` = none) |
| `override_note` | `string \| null` | required when `differential ≠ 1` |

---

## 3. Relationships (cardinality)

| From | → | To | Key | Cardinality |
|------|---|----|-----|-------------|
| Client | → | Project | `Project.client_id` | 1 → many (0 allowed; `''` = none) |
| Project | → | Competition | `Competition.project_id` | 1 → many |
| Competition | → | SportsEvent | `SportsEvent.competition_id` | 1 → many |
| SportsEvent | → | Media | `Media.sports_event_id` | 1 → many (owns) |
| VideoMedia | → | Timeslice | `Timeslice.media_id` | 1 → many (embedded) |
| Media | → | StoredCSV | `Media.csv_file_id` | many → 1 (nullable) |
| SportsEvent.config | → | Media | `media_ids` / `excluded_media_ids` | many → many (by id) |
| SportsEvent | → | QAState | embedded `qa_state` | 1 → 1 |
| SportsEvent | → | GlobalSettings | embedded `settings`/`draft_settings` | 1 → 1 each |
| SportsEvent/Media | uses | SportDiscipline | `sport_type`/`discipline` (by value) | reference |

**Cascade behaviour (in `ProjectContext`):**
- `deleteClient` → its Projects keep `client_id = ''` (orphaned, not deleted).
- `deleteProject` → its Competitions keep `project_id = ''`.
- `deleteCompetition` → its SportsEvents keep `competition_id = ''`.
- `deleteSportsEvent` → **deletes** the Media it owns and drops its session.
- `deleteMedia` → removed from `config`/`draft_config` id lists; prunes now-orphaned
  `tag_cleaning_rules`; marks the owning event's session stale.
- `deleteCSVFile` → nulls `csv_file_id` on any Media referencing it.

---

## 4. Derived / pipeline types

These are **computed**, not persisted. Built by `runPipeline()` from a `PipelineInput`.

**`ResolvedMedia`** = `Media` + `{ competition_name, sports_event_name, video_id }` where
`video_id = "{competition_name} / {sports_event_name} / {label}"`. Produced by
`resolveMediaList()` in `src/lib/videos.ts`. `collectTimeslices()` gathers all VideoMedia
timeslices (stamping the derived `video_id`) into the pipeline input.

**Detection** (raw CSV row): `video_id`, `frame_number`, `timestamp_s`, `tag`,
`probability`, `xmin/xmax/ymin/ymax`, `frame_width`, `frame_height`, `seconds`.
(`video_id` is assigned from the owning Media on combine — it is not a CSV column.)

**EnrichedDetection** (Steps 1–10) adds: `width/height/size`; `partner/asset`, `tag_status`;
`timeslice_label`, `timeslice_duration_s`,
`is_excluded_timeslice`; `share_of_screen`; `balanced_share`; `xmean/ymean`,
`screen_position`; `position_score`; `num_tags`, `clutter_score`; `sif`; `is_excluded`,
`exclusion_reason`.

`ExclusionReason` (evaluated in order, first match wins): `NO_DETECTION` →
`EXCLUDED_BY_RULE` → `VIDEO_EXCLUDED` → `TIMESLICE_EXCLUDED` → `NO_TIMESLICE` →
`BELOW_PROBABILITY` → `BELOW_THRESHOLD` → `TAG_PENDING`.

**VideoExposure** (Step 11): `qa_key` (unique per video_id+partner+asset+timeslice),
`exposure_identifier` (`"{partner} – {asset} – {timeslice}"`, em dash, display only),
`video_id`, `partner`, `asset`, `timeslice_label`, `timeslice_duration_s`, `gross_seconds`
(Σ seconds), `sif` (avg), `avg_probability`, `detection_count`.

**ProjectExposure** (Steps 12–14) extends VideoExposure with: `sif_multiplier`, `new_sif`,
`net_seconds`, `eph`, `is_audited_out`, `audit_flag_note`, `eph_current`, `eph_proposed`,
`differential`, `override_note`.

**FinalisedExposure** (Step 16): `event` (= Competition.name), `exposure_identifier`,
`video_id`, `timeslice_label`, `partner`, `asset`, `eph` (= `eph_current × differential`),
`sif`, `gross_seconds` (× differential), `net_seconds` (= scaled gross × new_sif),
`differential`, `note`.

> The full Step 1–16 formulas are the source of truth in `CLAUDE.md` /
> `01-exposure-calculation.md`; the Vitest suite (`src/lib/pipeline.test.ts`) pins the values.

---

## 5. Persistence (localStorage)

`PersistedAppState` (key `platformetrix_v1`, `SCHEMA_VERSION = 5`):

```ts
{
  version: 5
  clients: Client[]
  projects: Project[]                 // was `assignments`
  competitions: Competition[]         // Competition.project_id (was assignment_id)
  sports_events: SportsEvent[]
  media: Media[]
  csv_library: StoredCSV[]
  activeSportsEventId: string | null
  globalSettings: GlobalSettings
  sport_disciplines: SportDiscipline[]
}
```

- Raw CSV text is stored separately per file under `platformetrix_csv_<id>`.
- Roboflow defaults under `platformetrix_roboflow`.
- **Sessions** (parsed detections + pipeline outputs) are in-memory only; rebuilt lazily when
  an event is opened, on Save & Re-run, or on demand via `getEventFinalised(id)`.

**Migrations (run once in `loadAppState`):**
- `v1 → v4`: `sponsors→clients`; synthesise `Project` per sponsor and `Competition` per
  `(project, sport_event)`; old `Project→SportsEvent`; `StoredVideo→Media`; timeslices moved
  onto VideoMedia.
- `v2 → v4` and `v3 → v4`: rename `assignments→projects` and `Competition.assignment_id→
  project_id`; (v2 also lifts timeslices from config onto VideoMedia).
- Any other/unknown version → cleared (fresh start). Backfills ensure every VideoMedia has a
  `timeslices` array, every StoredCSV has stats, and every SportsEvent has `country`/`city`.
- **Venue location (`resolveVenue` in `storage.ts`, run on load):** migrates free-text
  `country` on Competitions and SportsEvents → ISO codes (`countryCodeFromName`, alias-aware:
  `UK→GB`, `USA→US`); resolves a single-zone `timezone` when none is set. Idempotent;
  unmappable country names become `''` for re-selection.

> **Note:** the previous SportsEvent export/import bundle feature (`projectIO.ts`,
> `exportSportsEvent` / `importSportsEvent`, the sidebar "Import Event" button) has been
> **removed**. The only data exports now are the **finalised-results CSV** downloads on the
> Finalised tab and in the Project Overview (per event).

---

## 6. Navigation model (UI)

The left sidebar is a single **Projects** entry. All drilling happens in
the main panel via a master-detail browser (`src/components/projects/`):

```
NavView:  list ─► project ─► competition ─► event
                     └─────► overview
```

| View | Component | Shows |
|------|-----------|-------|
| `list` | `ProjectList` | all Projects (name, client, description, # competitions) |
| `project` | `ProjectDetail` | Project attribute form + its Competitions; "Project Overview" button |
| `competition` | `CompetitionDetail` | Competition attribute form + its SportsEvents (sorted by scheduled start; each row shows location, schedule, media type counts); "Project Overview" button |
| `overview` | `ProjectOverview` | whole-project rollup (lazy-loaded — pulls in `recharts`). Header labelled **"Project Overview"** with descriptive stats (competitions, events, media video/audio, detections, partners, assets, totals) and chip lists. Per Competition → **foldable** SportsEvent cards (open by default) showing event details + location, a media panel (CSV info, timeslices), **partner·asset charts** (EPH; gross vs net seconds), the **Finalised Exposure** table, and a per-event CSV export |
| `event` | `AppShell` | the 5-tab pipeline workspace |

A `Breadcrumb` renders `Projects / {Project} / {Competition} / {Event}` (or `… / Overview`),
each crumb clickable to jump up. The header **Save & Re-run** button shows only in the
`event` view. The SportsEvent workspace tabs:

1. **Event Details** — name, sport type, discipline, country (ISO picker) / city / venue timezone (each inheriting the competition when blank), scheduled start/end, per-event parameters.
2. **Media & Tags** — add Video/Audio media, attach CSVs, edit timeslices, tag cleaning rules.
3. **Detections** — enriched detections (Steps 1–10) with SIF and exclusion reason.
4. **Project Exposure & QA** — Steps 11–15 (aggregation, EPH, flags, overrides).
5. **Finalised** — Step 16 output + CSV export.

---

## 7. Key source locations

| Concern | File |
|---------|------|
| All types | `src/types/index.ts` |
| Pipeline (Steps 1–16, pure) | `src/lib/pipeline.ts` |
| Timezone/DST resolution (audience foundation, pure) | `src/lib/timezone.ts` + `src/config/country_timezones.json` |
| Country code ↔ name + migration | `src/lib/countries.ts` + `src/config/countries.json` |
| Country / timezone form controls | `src/components/setup/CountrySelect.tsx`, `TimezoneField.tsx` |
| Media/timeslice resolution | `src/lib/videos.ts` |
| Persistence + migrations | `src/lib/storage.ts` |
| App state + CRUD + sessions | `src/context/ProjectContext.tsx` |
| Navigation shell | `src/app/App.tsx`, `src/components/navigation/Sidebar.tsx` |
| Drill-down browser | `src/components/projects/*` |
| Event workspace | `src/components/layout/AppShell.tsx` + `setup/`, `upload/`, `enrichment/`, `exposure/`, `output/` |
```
