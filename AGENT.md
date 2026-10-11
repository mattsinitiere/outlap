# AGENT.md

Instructions for any coding agent (Claude Code or otherwise) working in this repo.
Read this file fully before making changes, and keep it accurate as the project evolves.

## Ground rules

1. **Update `CHANGELOG.md` with every change.** Add entries under `## [Unreleased]`
   in the same commit as the change, grouped as Added / Changed / Fixed / Removed.
   Write them for the owner, in plain language: what changed and why it matters,
   not which function moved. When a set of changes is released, move them under a
   new version heading with the date (see "Releasing" below). CI fails any push
   that changes code without touching the changelog (data-only commits are exempt).
2. **Update this file** when you change structure, conventions, data sources,
   commands or known limitations. If something here is wrong, fix it.
3. **Keep it personal-use.** This is an unofficial private app. Don't add
   analytics, ads, accounts, or anything that publishes official F1 imagery
   or branding. Never recreate the F1 logo, typeface or brand styling.
4. **Ask before big moves:** new frameworks, a build step, a database, paid
   services, or deleting data.

## What this is

OutLap: a personal race-analytics web app (desktop + installable phone app)
covering 2018 onward. Lap telemetry on the track map, head-to-head comparisons,
drivers, teams, cars, circuits, races and standings.

- Static site in `web/` (plain HTML/CSS/JS, **no build step**), deployed on Vercel.
- Python scripts in `ingest/` build JSON files into `web/data/`.
- A GitHub Action checks for new data every 3 hours (rebuilding the current season when
  something new is out), does a full refresh every Monday, and commits `web/data`.

## Repo layout

```
brand/                Logo source files, PNG icons, social card, BRAND.md, build_logo.py
web/
  index.html          Shell: boot loader, phone app bar, rail nav, main view, mobile tab bar, settings dialog
  brand/              Logo SVGs used by the app (copies of /brand)
  app.js              The whole app (single IIFE, ~1,300 lines, sections marked with ===== banners)
  styles.css          All styles; later blocks override earlier ones (see "CSS notes")
  sw.js               Service worker (bump cache names on every release)
  manifest.webmanifest, icons/
  data/               Generated JSON (never hand-edit; regenerate with ingest scripts)
ingest/
  build_data.py       Jolpica (results, standings, schedule) + OpenF1 (telemetry, sectors, speed traps, headshots)
  backfill_fastf1.py  2018–2022 telemetry via FastF1 (must run locally, see limitations)
  telemetry.py        Lap resampling to 420 points + estimated g-forces
  media.py            Headshots, team logos, car photos, official car images, driver galleries → media.json
  circuits.py         Layouts, official turn numbers, elevation, facts, photos → circuits.json
  wiki_info.py        Driver bios, team facts, car spec sheets and galleries → info.json
  cars.json           Chassis name per team and season (edit to fix a car photo or spec match)
  build_preview.py    Bundles web/ + data into one HTML file with Commons photos and brand SVGs embedded
  check_new.py        Cheap stdlib-only check for new results, qualifying or recent missing telemetry
.github/workflows/
  refresh-data.yml    Check every 3 h (:17), full refresh Monday 10:00 UTC, manual run with optional `since`
  changelog-check.yml Fails code changes that skip CHANGELOG.md
```

### Data files (`web/data/`)

| File | Contents |
|---|---|
| `meta.json` | Seasons available, generation time |
| `season_YYYY.json` | Races (results, pole, fastest laps), drivers, constructors, standings, `openf1` headshots/colours |
| `telemetry/index.json`, `telemetry/YYYY_RR.json` | Fastest race lap per driver: distance-aligned arrays `d x y spd thr brk gear rpm gx gy`, lap, sectors, headshot |
| `trends.json` | Per circuit per year: pole, fastest lap, winner, speed trap |
| `media.json` | `drivers` (Commons photo, official headshot, gallery), `logos[cid][year]`, `cars[year][cid]` |
| `circuits.json` | Outline `x/y` (decimetres, F1 frame), rotation, corners, elevation per point, facts, about, photos |
| `info.json` | `drivers[id]` bio, `teams[cid]` about + facts, `cars["YYYY/cid"]` about + specs + gallery |

Units in data are always **metric** (km/h, metres). Conversion happens only in the UI.

## Commands

```bash
pip install -r ingest/requirements.txt

python ingest/build_data.py                 # everything (resumable)
python ingest/build_data.py --since 2026    # current season only
python ingest/build_data.py --results-only  # skip OpenF1
python ingest/backfill_fastf1.py            # 2018–2022 telemetry, local machine only
python ingest/media.py
python ingest/circuits.py                   # --force to rebuild existing circuits
python ingest/wiki_info.py                  # --force [--keep-drivers]

cd web && python -m http.server 8000        # run locally
python ingest/build_preview.py preview.html # single-file preview
python ingest/check_new.py                  # anything new on Jolpica/OpenF1? (what the 3-hourly job runs)
```

### Automatic refresh (`refresh-data.yml`)

- **Every 3 hours:** `check_new.py` compares the current season with Jolpica (schedule
  size, result rows, latest qualifying round) and flags races from the last 14 days that
  still lack OpenF1 telemetry. Only then does it run `build_data.py --since <this year>`.
- **Monday 10:00 UTC and manual runs:** full refresh (season + media, circuits, wiki info).
  A manual run's `since` input rebuilds from an earlier season, e.g. `2023` to backfill
  OpenF1 telemetry; it's resumable, so re-run it if it hits the 2-hour timeout.
- A commit happens only if something besides `meta.json`'s timestamp changed, so quiet
  runs don't trigger Vercel deploys. Runs share a concurrency group and never overlap.
- Scheduled runs only fire from the default branch (`main`), and GitHub can start
  them late or skip them when busy.

There are no automated tests yet. Verify UI changes by loading the app at
desktop (1400 px) and phone (390 px) widths, checking every page you touched,
and watching the console for errors. Playwright screenshots work well for this.

## Front-end architecture (`web/app.js`)

- **Data:** `load(path)` caches fetches; `window.__DATA__` / `window.__IMAGES__` replace
  fetches in the preview bundle. Helpers: `meta()`, `season(y)`, `media()`, `infoData()`,
  `circuitsData()`, `telIndex()`, `allSeasons()`.
- **Routing:** hash routes `#/name/arg?query`. `VIEWS` maps names to async view functions
  returning `{ html, mount(root, ctx) }`. Use `setQuery({...})` to change query params.
  Routes: `telemetry standings races drivers driver/:id teams team/:cid cars car/:cid
  circuits circuit/:id` (`trends` redirects to circuits).
- **Rendering:** `render()` shows a skeleton only if loading takes >120 ms, then either
  swaps the page (new route, with a View Transition) or **morphs** the existing DOM with
  morphdom (same route, query change) so nothing flashes. Keep this behaviour: never
  force a full re-render or scroll reset on same-route changes.
- **mount():** wire events here, mount charts, and return a cleanup function (or push
  to `cleanups`). `ctx.first` is true on a page change; pass it as `animate` to charts.
- **Charts:** `mountChart` (lines, hover tooltip, `setCursor` for syncing),
  `mountBars`, `mountSlope` (grid to finish). Draw at real container width; no chart library.
- **Images:** always go through `imgTag(urls, alt)` (fallback chain via `data-alt`,
  fade-in on load) or `portrait(urls, alt, cls)` for halftone driver/circuit photos.
  `photoUrls(did, season)` resolves official headshot → Commons photo.
- **Units:** never format speed/distance/height by hand. Use `U.spd/spdTxt/spdUnit`,
  `U.at` (position along a lap), `U.axis`, `U.lapNum/lapUnit`, `U.h/hTxt/hUnit`.
  Default is imperial; `settings.units` switches to metric.
- **Settings:** stored in `localStorage` key `outlap-settings` (`units`, `motion`);
  the old `apex-settings` key is still read once for anyone upgrading. Opened from the
  gear in the desktop rail or the phone app bar.
  Respect `motionOK()` for any new animation.

## Brand

- Name: **OutLap** (one word, capital O and L). The logo is `OUT` + three touching
  sector slashes (purple `#7A3FD1`, green `#1D9A5B`, yellow `#F2B01E`) + `LAP`, in
  Barlow Condensed ExtraBold Italic, outlined. Rules are in `brand/BRAND.md`.
- Where it appears: the slash mark at the top of the desktop rail, the wordmark in the
  phone app bar, the boot loader, Settings, empty states, favicon and app icons.
  The progress bar uses the three sector colours.
- Don't redraw the logo in code or re-set it in a font; use the SVG files. If the logo
  changes, regenerate with `brand/build_logo.py` and copy the SVGs into `web/brand/`.
- The sector colours are a brand accent. Use them sparingly (logo, loaders, sector data),
  not as general UI colours.

## OutLap Rating

`seasonRatings(season)` in app.js computes a 60–99 score per driver per season
(minimum five starts). It's our own formula, labelled as such in the UI:

| Component | Weight | How |
|---|---|---|
| Qualifying vs teammate | 25% | Share of races starting ahead of a teammate (grid slot) |
| Racing vs teammate | 25% | Share of races finishing ahead of a teammate |
| Results | 20% | Average finishing percentile within the field |
| Places gained | 15% | Percentile of average grid-to-finish gain (classified finishes) |
| Consistency | 15% | Half finish rate, half points-finish rate |

The weighted sum is min–max scaled across that season's eligible drivers to 60–99.
Badge colours: 90+ purple, 80–89 green, 70–79 yellow, below 70 grey. If you change
the formula, update this table and the explanation text on the driver profile.

## Design and copy conventions

- **Look:** Telemetry Lab layout (left rail, cards on `#F4F5F7`) with Team Colour
  styling (team-colour hero bands via `dark(teamColor(cid))`). Light mode only.
- **Type:** Big Shoulders Display (headings, numbers) + Public Sans (body).
- **Driver photos:** only as halftone portraits in heroes, driver cards and podiums.
  Never in tables; tables use the team-colour tick + name (`driverLink`).
- **Capitalisation:** Title Case for headings, tabs, buttons, column headers, stat
  labels and chips ("G Force", "Race Results", "Age 29"). Explanatory notes and
  tooltips' sentences stay sentence case.
- **No redundancy:** no eyebrow text that repeats the title, no instruction subtitles
  ("Select a driver…"), no facts repeated in two places on one page.
- **Nothing cut off:** check 390 px width. Tables hide secondary columns with
  `hide-sm`; long names truncate with ellipsis; segmented controls wrap.
- **Nationality:** show flags (`flag(nat)`), not demonyms. Flags load from flagcdn.com
  with an emoji fallback.
- **Credits:** Commons photos show photographer + licence; Wikipedia text says
  "From Wikipedia, CC BY-SA" with a link. Estimates (g-force, elevation) are labelled.

### CSS notes

`styles.css` grew in layers; later blocks override earlier ones (look for the
"UX pass" and "more info blocks" banners). When changing a rule, search the whole
file for the selector first. Consolidating the layers is a welcome cleanup.

## Data sources and limits

| Source | Used for | Notes |
|---|---|---|
| Jolpica (Ergast successor) | Results, standings, schedule | ~4 req/s, 500/hour |
| OpenF1 | Telemetry, sectors, speed traps, headshots (2023+) | **Free access is blocked for everything while any F1 session is live.** Scripts stop cleanly and resume |
| FastF1 / F1 live-timing archive | 2018–2022 telemetry | Archive blocks cloud IPs (GitHub Actions, sandboxes); run locally |
| MultiViewer API | Circuit outlines, official turn numbers, pit loss | Madrid and Kuala Lumpur (2026) not covered |
| bacinger/f1-circuits (MIT) | Real-world outlines for elevation alignment | |
| Open-Meteo elevation | Terrain height (90 m model) | Approximate |
| Wikipedia / Wikimedia Commons | Bios, facts, specs, photos | CC BY-SA text; photo licences vary |
| formula1.com | Official headshots, team logos, car images, circuit maps | Linked for personal use only, never embedded in the preview |

Known gaps: g-forces read low (4 Hz data); brake is on/off only; corner names exist
only for Monza (`CORNERS` in app.js); 2026 car photos are matched automatically
and flagged; some Wikipedia infobox fields are missing for some cars and teams.

## Releasing

1. Move `[Unreleased]` entries under `## [x.y.z] - YYYY-MM-DD` (semver: minor for
   features, patch for fixes).
2. Bump the cache names in `web/sw.js` (`outlap-shell-vN`, `outlap-data-vN`).
3. Commit, push; Vercel deploys automatically.
