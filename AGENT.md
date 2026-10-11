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
covering 2018 onward. A home page with the next race and the season at a glance,
lap telemetry on the track map, head-to-head comparisons, drivers, teams, cars,
circuits, races, standings and an F1 news feed.

- Static site in `web/` (plain HTML/CSS/JS, **no build step**), deployed on Vercel.
- Python scripts in `ingest/` build JSON files into `web/data/`.
- A GitHub Action runs every 3 hours: it refreshes news and rebuilds the current season
  when new results or telemetry are out; every Monday it does a full refresh. It commits `web/data`.
- Clean URLs (`/drivers/max-verstappen/2024`): Vercel rewrites every non-file path to
  `index.html` and the app routes it. Locally use `python serve.py`, not `http.server`.

## Repo layout

```
serve.py              Local dev server: serves web/ and answers clean URLs with index.html
vercel.json           Output dir, data cache headers, rewrite of app paths to index.html
brand/                Logo source files, PNG icons, social card, BRAND.md, build_logo.py
web/
  index.html          Shell (has <base href="/"> so relative assets work on deep paths): boot loader, phone app bar, rail nav, main view, mobile tab bar, settings dialog
  brand/              Logo SVGs used by the app (copies of /brand)
  app.js              The whole app (single IIFE, ~1,900 lines, sections marked with ===== banners)
  styles.css          All styles; later blocks override earlier ones (see "CSS notes")
  sw.js               Service worker (bump cache names on every release)
  manifest.webmanifest, icons/
  data/               Generated JSON (never hand-edit; regenerate with ingest scripts)
ingest/
  build_data.py       Jolpica (results, standings, schedule) + OpenF1 (telemetry, sectors, speed traps, headshots)
  backfill_fastf1.py  2018–2022 telemetry, tyre stints, sectors, race control via FastF1 (run locally; --push merges and pushes)
  telemetry.py        Lap resampling to 420 points + estimated g-forces
  media.py            Headshots, team logos, car photos, official car images, driver galleries → media.json
  circuits.py         Layouts, official turn numbers, elevation, facts, photos → circuits.json
  wiki_info.py        Driver bios, team facts, car spec sheets and galleries → info.json
  cars.json           Chassis name per team and season (edit to fix a car photo or spec match)
  build_preview.py    Bundles web/ + data into one HTML file with Commons photos and brand SVGs embedded
  laps.py             Stdlib-only lap-by-lap collector (Jolpica laps and pit stops, OpenF1 stints, sectors, race control) → laps/
  check_new.py        Cheap stdlib-only check for new results, qualifying or recent missing telemetry
  news.py             Stdlib-only news collector → news.json, news_archive.json, contracts.json
  news_sources.json   News sites, Google News switch, YouTube handles, Bluesky accounts, subreddits (edit freely)
  driver_contracts.json  Hand-kept contract end years and salary estimates, each with a source (starts empty)
.github/workflows/
  refresh-data.yml    Every 3 h (:17) news + check, full refresh Monday 10:00 UTC, manual run with optional `since`
  changelog-check.yml Fails code changes that skip CHANGELOG.md
```

### Data files (`web/data/`)

| File | Contents |
|---|---|
| `meta.json` | Seasons available, generation time |
| `season_YYYY.json` | Races (results, pole, fastest laps, `time` and `sessions` in UTC), drivers, constructors, standings, `openf1` headshots/colours |
| `telemetry/index.json`, `telemetry/YYYY_RR.json` | Fastest race lap per driver: distance-aligned arrays `d x y spd thr brk gear rpm gx gy`, lap, sectors, headshot |
| `laps/index.json`, `laps/YYYY_RR.json` | Per race: `laps` count, `drivers[id]` with `t` lap times (s), `p` positions, `pit` [[lap, pit-lane s]], and from 2023 `st` stints [[compound, firstLap, lastLap, ageAtStart]], `sec` [s1[], s2[], s3[]], `trap` speeds; `flags` [[SC/VSC/RED, firstLap, lastLap]]; `of1` ok/none once OpenF1 was tried, `ff1` ok once FastF1 extras were merged (2018–2022; extras waiting for their lap file sit in `laps/fastf1/` and `laps.py` merges them). Index lists races with `tyres`/`flags` |
| `trends.json` | Per circuit per year: pole, fastest lap, winner, speed trap |
| `media.json` | `drivers` (Commons photo, official headshot, gallery), `logos[cid][year]`, `cars[year][cid]` |
| `circuits.json` | Outline `x/y` (decimetres, F1 frame), rotation, corners, elevation per point, facts, about, photos |
| `info.json` | `drivers[id]` bio, `teams[cid]` about + facts + `photos` (Commons team shots), `cars["YYYY/cid"]` about + specs + gallery |
| `news.json` | Newest 150 stories for Home: `t` title, `u` link, `s` source, `k` article/video/social, `d` UTC time, `x` summary, `img`, `dr`/`tm` driver and team tags |
| `news_archive.json` | Same items for 30 days (max 2,000), plus `sources` and the YouTube `channels` id cache |
| `contracts.json` | `drivers` (copied from `ingest/driver_contracts.json`) and `news[driverId]` contract/salary stories, kept a year |

Units in data are always **metric** (km/h, metres). Conversion happens only in the UI.

## Commands

```bash
pip install -r ingest/requirements.txt

python ingest/build_data.py                 # everything (resumable)
python ingest/build_data.py --since 2026    # current season only
python ingest/build_data.py --results-only  # skip OpenF1
python ingest/backfill_fastf1.py --push     # 2018–2022 telemetry + tyres/SC, local machine only; merges and pushes
python ingest/media.py
python ingest/circuits.py                   # --force to rebuild existing circuits
python ingest/wiki_info.py                  # --force [--keep-drivers]

python serve.py                             # run locally on :8000 (handles clean URLs)
python ingest/news.py                       # news, videos, social posts, contract stories
python ingest/build_preview.py preview.html # single-file preview
python ingest/laps.py                       # lap-by-lap data for races that lack it (--minutes, --race 2024:8)
python ingest/check_new.py                  # anything new on Jolpica/OpenF1? (what the 3-hourly job runs)
```

### Automatic refresh (`refresh-data.yml`)

- **Every run:** `news.py` (about a minute) refreshes news and contract stories, and
  `laps.py` adds lap-by-lap data for any race without it (85-minute budget, 25 on full runs).
  Requests to Jolpica are spaced 8 s apart to stay under 500 an hour, so the first backfill
  of about 190 races takes several runs; afterwards a run only fetches new races.
- **Every 3 hours:** `check_new.py` compares the current season with Jolpica (schedule
  size, result rows, latest qualifying round) and flags races from the last 14 days that
  still lack OpenF1 telemetry. Only then does it run `build_data.py --since <this year>`.
- **Monday 10:00 UTC and manual runs:** full refresh (season + media, circuits, wiki info).
  A manual run's `since` input rebuilds from an earlier season, e.g. `2023` to backfill
  OpenF1 telemetry. The season build has a 240-minute limit; whatever finished is still
  committed (data files are written atomically) and a re-run carries on.
- A commit happens only if something besides `meta.json`'s timestamp changed. News changes
  most runs, so expect a "News refresh" commit (and Vercel deploy) about every 3 hours.
  Runs on the same branch share a concurrency group and never overlap.
- Scheduled runs only fire from the default branch (`main`), and GitHub can start
  them late or skip them when busy.

There are no automated tests yet. Verify UI changes by loading the app at
desktop (1400 px) and phone (390 px) widths, checking every page you touched,
and watching the console for errors. Playwright screenshots work well for this.

## Front-end architecture (`web/app.js`)

- **Data:** `load(path)` caches fetches; `window.__DATA__` / `window.__IMAGES__` replace
  fetches in the preview bundle. Helpers: `meta()`, `season(y)`, `media()`, `infoData()`,
  `circuitsData()`, `telIndex()`, `allSeasons()`.
- **Routing:** views use internal routes (`driver/max_verstappen?y=2026`); the address bar
  shows clean paths (`/drivers/max-verstappen/2026`). `toPath()` and `fromPath()` translate
  between them, so add a case to both for a new route. Templates write internal links as
  `href="#/…"` (also `data-href` on table rows) and `render()` rewrites them via
  `cleanLinks()`; HTML injected later (like `mountInNews`) must go through `cleanLinks()` too.
  Use `setQuery({...})` to change state and `go(url)` to navigate. A view can return
  `canon` to tidy the address once it knows exactly what it shows (`round-5` → race name).
  Old `#/` links redirect. The file:// preview bundle keeps hash routing (`HASH`).
  Paths: `/` (home) `/telemetry/:year/:race/:a-vs-:b` `/standings/:year/constructors`
  `/races/:year/:race` `/drivers/:year` `/drivers/:id/:year` `/teams/:year` `/teams/:id/:year`
  `/cars/:year` `/cars/:year/:team` `/circuits/:year?sort=name|location` `/circuits/:id` `/news?type=&driver=&team=&source=`.
  Ids are slugs with `-` for `_`; race slugs come from the race name.
- **Turn labels:** `mountTurnRow(row, items)` draws one row of turn pills above a lap chart
  (wrap the row and chart with `turnRowHtml(rowId, chartId)`; its L/R padding must match the
  chart's). `placeTurnBubbles(G, r, sw)` spreads circuit-map turn numbers so none overlap.
- **Home and Races:** `weekendCard(race, …)` (countdown, sessions in local time, layout) is
  shared by Home and upcoming rounds on Races; `mountCountdown(root)` drives it.
- **Search:** `openSearch()` opens the `#search` dialog (Cmd/Ctrl+K, `/`, or any element with
  `data-open-search`). `buildSearchIndex()` builds one client-side index on first open from every
  season, circuits, the telemetry index, media (car names) and the news archive; `searchFor()`
  scores it (all words must match; a 4-digit word filters by year and picks that year's page) and
  groups results by type. Recent picks live in `localStorage` key `outlap-recent-search`.
  A new kind of page should add its entries in `buildSearchIndex()`.
- **News:** `newsItem(n, season)` renders one story; `mountInNews` fills the driver/team
  cards after the page has drawn; `mountContract` fills the driver Contract and Pay card.
- **Rendering:** `render()` shows a skeleton only if loading takes >120 ms, then either
  swaps the page (new route, with a View Transition) or **morphs** the existing DOM with
  morphdom (same route, query change) so nothing flashes. Keep this behaviour: never
  force a full re-render or scroll reset on same-route changes.
- **mount():** wire events here, mount charts, and return a cleanup function (or push
  to `cleanups`). `ctx.first` is true on a page change; pass it as `animate` to charts.
- **Lap by Lap:** `lapsFor(y, round)` loads a race's lap file (only if `laps/index.json` lists it);
  `raceLaps(L, race)` derives cumulative times, neutralised laps (race control, or an estimate
  when the field ran 15% slower), clean laps (`why[i]` says why a lap isn't clean) and stints.
  `lapCard()` renders the race page card; `mountLapCard()` draws its charts. Race page query:
  `?laps=positions|pace|gaps|strategy|consistency&drivers=ver,nor&ref=ver` (internal `lt`, `ld`, `lg`).
  Tyre wear is the clean-lap trend in a stint plus `FUEL_PER_LAP` (0.06 s, an estimate).
- **Charts:** `mountChart` (lines, hover tooltip, `setCursor` for syncing; options include
  `yTicks`, `tipHtml(i)` for a custom tooltip, `marks` for dots, per-series `opacity`/`quiet`),
  `mountBars`, `mountSlope` (grid to finish). Draw at real container width; no chart library.
- **Teams page:** `teamCard(y, cid, s, maxPts)` (logo on the team colour, standing, drivers, record).
  Car photos belong on the Cars page and team profiles, not on the Teams list.
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
  phone app bar, the launch screen (`#boot`: shown on every open for 1 to about 3 s,
  timing in `hideBoot()` in app.js, animation in styles.css), Settings, empty states, favicon and app icons.
  The tab icon (`web/icons/favicon.svg`) switches to a white tile in light mode; the
  iPhone icon (`icon-180.png`) must stay a full opaque square (iOS rounds it).
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
  "From Wikipedia, CC BY-SA" with a link. Estimates (g-force, elevation, salaries) are labelled.
- **News:** store and show only headline, short summary, thumbnail link and source;
  always link out to the publisher. Never republish full articles.
- **Contracts:** never invent contract terms or salaries. Figures only come from
  `ingest/driver_contracts.json` with a named source.

### CSS notes

`styles.css` grew in layers; later blocks override earlier ones (look for the
"UX pass" and "more info blocks" banners). When changing a rule, search the whole
file for the selector first. Consolidating the layers is a welcome cleanup.

**Descenders:** Big Shoulders' g, p, y and j hang below a tight line box. Any display-font
text that truncates (ellipsis, `clamp1`/`clamp2`, line clamp) needs `line-height` of about 1.2,
or its letters get cut off at the bottom.

**Hover:** put every `:hover` rule inside `@media (hover: hover)` and exclude selected
states (`:not(.on)`, `:not([aria-current="true"])`). Phones keep the last tapped
element in `:hover`, so a hover style that beats a selected style makes it vanish.

## Data sources and limits

| Source | Used for | Notes |
|---|---|---|
| Jolpica (Ergast successor) | Results, standings, schedule, lap times and positions, pit stops | ~4 req/s, 500/hour; laps endpoint pages 100 timings at a time (about 13 requests a race) |
| OpenF1 | Telemetry, sectors, speed traps, headshots, tyre stints, race control (2023+) | **Free access is blocked for everything while any F1 session is live.** Scripts stop cleanly and resume |
| FastF1 / F1 live-timing archive | 2018–2022 telemetry | Archive blocks cloud IPs (GitHub Actions, sandboxes); run locally |
| MultiViewer API | Circuit outlines, official turn numbers, pit loss | Madrid and Kuala Lumpur (2026) not covered |
| bacinger/f1-circuits (MIT) | Real-world outlines for elevation alignment | |
| Open-Meteo elevation | Terrain height (90 m model) | Approximate |
| Wikipedia / Wikimedia Commons | Bios, facts, specs, photos | CC BY-SA text; photo licences vary |
| formula1.com | Official headshots, team logos, car images, circuit maps | Linked for personal use only, never embedded in the preview |
| News site RSS feeds | Headlines, summaries, thumbnails | List in `ingest/news_sources.json`; a failing feed is logged and skipped |
| Google News RSS | Per-driver and per-team article searches (last 7 days) | No images; links go through Google's redirect |
| YouTube channel feeds | F1 and team videos | Handles resolved to channel ids once and cached in `news_archive.json` |
| Reddit RSS | r/formula1 top posts | Reddit sometimes blocks cloud IPs |
| Bluesky public API | Posts from listed accounts | No key; list starts empty |
| X / Instagram | Not used | X needs a paid API plan, Instagram has no public API. Ask before adding a paid service |

Known gaps: tyre compounds and official Safety Car periods start in 2023 (earlier SC laps are estimated);
pit stop times are pit-lane time, not stationary time; g-forces read low (4 Hz data); brake is on/off only; corner names exist
only for Monza (`CORNERS` in app.js); some Wikipedia infobox fields are missing for
some cars and teams. News tags are name matches (a common surname like Russell can
over-match) plus the driver or team a Google search was run for. Contract terms
aren't public and drivers have no official career winnings.

## Releasing

1. Move `[Unreleased]` entries under `## [x.y.z] - YYYY-MM-DD` (semver: minor for
   features, patch for fixes).
2. Bump the cache names in `web/sw.js` (`outlap-shell-vN`, `outlap-data-vN`).
3. Commit, push; Vercel deploys automatically.
