# Platformetrix — Sponsorship Measurement Platform

Platformetrix converts raw AI video detections of brand logos into a quality-adjusted
exposure metric (EPH + SIF), with a fully auditable analyst review step.

This is a client-only single-page app — no backend, no account required. All data is stored
in the browser (`localStorage`), scoped to `http://localhost:5174`.

> Calculation formulas, data model, and test cases: [`CLAUDE.md`](./CLAUDE.md)

---

## Tech stack

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS** for styling
- **Recharts** for charts, **lucide-react** for icons
- **Luxon** for DST-correct timezone resolution (venue timezone / audience-track foundation)
- **Vitest** + Testing Library for tests

---

## Getting started

Requires **Node.js 18+**.

```bash
npm install       # first time only
npm run dev       # starts dev server → http://localhost:5174
```

The port is pinned to `5174` (`strictPort: true`). If the port is taken:

```bash
# Windows
netstat -ano | findstr :5174
taskkill /PID <pid> /F
```

### npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server on `:5174` |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Serve `dist/` on `:5174` |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

---

## Hierarchy

```
Client
 └─ Project
     └─ Competition
         └─ Sports Event     ← one pipeline run per event
             └─ Media items  ← one CSV per item (video or audio)
```

---

## Workflow

Five tabs per Sports Event. Press **Save & Re-run** in the header to commit changes and recompute.

### 1. Event Details
Name, sport type, discipline, schedule, SIF multiplier, probability threshold.

### 2. Media & Tags
- Add media items (video or audio)
- Attach a detection CSV to each item
- Define timeslices (label, start/end seconds, included/excluded)
- Map raw AI tags → Partner / Asset, or mark as Excluded (with a reason); unmapped tags stay Pending

Unknown tags surface automatically after a CSV is attached.

### 3. Detections
Per-frame enriched table (Steps 1–10): share of screen, grid position, SIF,
clutter score, and exclusion reason for every detection. Sortable and filterable.
Reflects QA changes (Adjusted / Audited out) from tab 4 in real time.

### 4. Project Exposure & QA
Aggregated exposure rows (Steps 11–15). Analysts can:
- **Flag a row out** (`is_audited_out`) with a required note — row is excluded from tab 5
- **Override EPH** (`eph_proposed`) with a required audit note when the value changes
- A red warning appears when the differential falls below 0.70

### 5. Finalised
Final exposure table (Step 16) with differential applied. Includes totals and a **CSV export**.

---

## CSV format

One CSV = one video. Attach it to a media item in **2. Media & Tags**.

Required columns (order does not matter; extra columns such as `video_id` are ignored):

```
frame_number, timestamp_s, tag, probability,
xmin, ymin, xmax, ymax, frame_width, frame_height, seconds
```

Example:

```csv
frame_number,timestamp_s,tag,probability,xmin,ymin,xmax,ymax,frame_width,frame_height,seconds
0,0.0,Sobha - Interview Board,0.055,1401,434,1546,521,1920,1080,0.967
120,4.0,Nike - Perimeter Board,0.912,310,880,610,980,1920,1080,0.04
```

The parser handles BOM characters and Windows line endings (CRLF). Rows with
non-numeric values in numeric fields are skipped with a warning shown at upload.

---

## Browser storage limits

All CSV content is stored in `localStorage` (~5 MB limit per origin).

**To free space:**

Open a media card in **2. Media & Tags** and click **Remove** next to the attached CSV.
The Remove link deletes the raw CSV content from storage and clears the attachment,
freeing that slot for a new upload.

Or run this in the browser console to wipe all CSV content while keeping project config:

```javascript
Object.keys(localStorage)
  .filter(k => k.startsWith('platformetrix_csv'))
  .forEach(k => localStorage.removeItem(k))
location.reload()
```

To wipe everything (projects, config, and CSVs):

```javascript
Object.keys(localStorage)
  .filter(k => k.startsWith('platformetrix'))
  .forEach(k => localStorage.removeItem(k))
location.reload()
```

---

## Project structure

```
src/
├── app/            App.tsx — top-level shell and header
├── components/
│   ├── layout/     AppShell (tab bar + parse status banner)
│   ├── setup/      ProjectSetup, VideoManager, TagCleaningEditor, CountrySelect, TimezoneField
│   ├── upload/     CSVUploader (Media & Tags tab)
│   ├── enrichment/ DetectionTable (Steps 1–10)
│   ├── exposure/   ProjectExposureTable (Steps 11–15) + charts
│   ├── output/     FinalisedExposureTable (Step 16 + export)
│   ├── projects/   Sidebar, project/competition/event browser
│   ├── navigation/ Breadcrumb, modals
│   ├── settings/   Global settings editors
│   └── common/     Shared UI (InfoTip, glossary tooltips)
├── context/
│   └── ProjectContext.tsx   All app state and pipeline entry point
├── lib/
│   ├── pipeline.ts           Steps 1–16 (pure functions, no React)
│   ├── pipeline.test.ts      Regression suite — run after any pipeline change
│   ├── timezone.ts           DST/timezone resolution (Luxon; audience foundation, pure)
│   ├── countries.ts          ISO country code ↔ name + legacy migration
│   ├── parseCSV.ts           CSV parser
│   ├── storage.ts            localStorage helpers
│   ├── videos.ts             Media resolution and timeslice helpers
│   ├── glossary.ts           Tooltip definitions
│   └── utils.ts              Formatting helpers
├── config/         JSON config: parameters, clutter/position scores; country_timezones, countries
└── types/          index.ts — all TypeScript interfaces
```

The pipeline (`src/lib/pipeline.ts`) is **pure** — no React imports, no side effects.
Run `npm test` before changing it; the suite pins the Step 1–16 reference values.
