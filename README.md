<p><img src="brand/outlap-wordmark.svg" alt="OutLap" width="320"></p>

# OutLap

Personal race analytics from the 2018 season onward: the next race and the season
at a glance, lap telemetry on the track map, head-to-head comparisons, driver and
team profiles with photos and logos, every car since 2018, standings, results,
circuit trends and an F1 news feed. Light mode, works
on desktop and as a home-screen app on your phone.

Unofficial personal project. Not affiliated with Formula 1, the FIA or any team.
Keep it private, for personal use. Don't publish it to an app store.

## Sections

- **Home:** the next race with a live countdown, session times in your time zone
  and the track layout; the season at a glance (leader, lead, rounds left, who's
  still in the title fight); the last race's podium; driver and constructor
  leaderboards; and the latest news.
- **Telemetry:** two drivers' fastest race laps. Pick a season, a track from the
  strip of layouts and two drivers from chips ranked by lap time. Track map coloured by who is
  faster in each of 24 mini-sectors, or by speed, throttle, brake, gear or
  estimated g. Interactive charts (speed, throttle and brake, gear, g-force,
  gap) linked to the map, sector times, corner minimum speeds, a lap summary and
  the gap between the two drivers over the whole race.
- **Standings:** championship leader, an interactive points race, driver and
  constructor tables.
- **Races:** every round, with the next race marked and a countdown. Completed
  rounds show podium photos, pole, fastest lap, full results and Lap by Lap charts
  (positions, pace, gaps, tyre strategy and wear, consistency); upcoming rounds
  show the weekend schedule and recent winners there.
- **Drivers:** the grid for any season, and a profile per driver with career
  stats since 2018, points by season, their car, season results, teammate
  head-to-head, contract news and their latest stories.
- **Teams:** a profile per team that follows name changes (Racing Point to Aston
  Martin, Toro Rosso to Racing Bulls and so on), interactive history charts and
  every car it raced.
- **Circuits:** every track raced since 2018, sorted by a season's calendar, by name or by region. Layout with official turn numbers,
  start line and direction, elevation map and profile, facts (length, turns,
  opened, first Grand Prix, lap record, pit-stop time loss, capacity, designer),
  a description, photos, results and pole/fastest-lap/speed-trap trends.
- **Cars:** every car on the grid for a season. Each car has its own page with
  photos, a Wikipedia spec sheet (engine, power, weight, tyres, designer and
  more), its record, race-by-race results and links to its predecessor and successor.
- **News:** headlines from a dozen F1 sites, Google News searches for every
  driver and team, YouTube videos from F1 and the teams, and Reddit, refreshed
  every 3 hours and kept for 30 days. Filter by type, driver, team or source,
  or search. Stories open on the publisher's site.

- **Search:** Cmd+K (Ctrl+K) or / on any page, the Search button on Home, or the
  magnifier in the phone app bar. Finds drivers, teams, cars, circuits, races,
  telemetry and news; add a year to narrow it.

## Brand

Logo files, colours and usage rules live in `brand/` (see `brand/BRAND.md`).

## Settings

Units default to imperial (mph, miles, feet); switch to metric in Settings (the
gear in the side rail, or More → Settings on a phone). Animations can be turned
down there too. Settings are remembered on each device.

## Where everything comes from

| What | Source | Notes |
|---|---|---|
| Results, standings, schedule | Jolpica | Free |
| Lap times, positions and pit stops, 2018+ | Jolpica | Free; about 500 requests an hour, so the first backfill takes several refresh runs |
| Tyre stints and Safety Car periods, 2023+ | OpenF1 | Free for past sessions |
| Lap telemetry, sectors, speed traps, 2023+ | OpenF1 | Free for past sessions. **OpenF1 blocks all free access while any F1 session is live**; the automatic refresh retries after the session |
| Telemetry 2018–2022 | FastF1 | F1's archive blocks cloud IPs; run the backfill on your own computer |
| Driver headshots | OpenF1 (official, 2023+) with Wikipedia/Wikimedia Commons photos as fallback | Official headshots linked for personal use |
| Team logos | formula1.com logo files, 2019–2025 | Linked for personal use; teams without one get a team-colour badge |
| Car photos | Wikimedia Commons via each car's Wikipedia article, plus official formula1.com car images 2019+ | Commons photos are credited; official images linked for personal use. Chassis names in `ingest/cars.json`; 2026 cars are matched automatically and flagged |
| Driver photo galleries | Wikimedia Commons search | Credited |
| News | News-site RSS feeds, Google News, YouTube, Reddit, optional Bluesky accounts (`ingest/news_sources.json`) | Headlines, summaries and links only; stories open on the publisher's site. X and Instagram aren't included (X needs a paid API, Instagram has none) |
| Contracts and pay | Contract stories from the news feed; your own sourced figures in `ingest/driver_contracts.json` | Teams don't publish contract terms; salaries are media estimates |
| Circuit layouts and turn numbers | MultiViewer circuit API (the source FastF1 uses) | Two 2026 tracks (Madrid, Kuala Lumpur) use an open GeoJSON outline without turn positions |
| Real-world outlines | github.com/bacinger/f1-circuits (MIT) | Used to place the track on the terrain |
| Elevation | Open-Meteo elevation API (Copernicus 90 m terrain model) | Approximate and smoothed |
| Circuit descriptions and facts | Wikipedia | CC BY-SA, linked |
| Circuit photos | Wikimedia Commons search; official circuit map from formula1.com | Credited / personal use |

Limits worth knowing: g-forces are estimated from speed and position (no
accelerometer in public data) and read low; brake is on/off only; public data
samples about four times a second.

## Layout

```
ingest/
  build_data.py        Jolpica + OpenF1 → web/data
  backfill_fastf1.py   FastF1 telemetry, tyres and Safety Car periods for 2018–2022 (run locally, once)
  media.py             Headshots, logos, car photos, galleries → web/data/media.json
  circuits.py          Layouts, turns, elevation, facts, photos → web/data/circuits.json
  wiki_info.py         Driver bios, team facts, car specs and galleries → web/data/info.json
  cars.json            Chassis name per team and season (edit to fix a photo)
  telemetry.py         Resampling and g-force estimates
  build_preview.py     Bundles everything into one HTML file for a quick look
  news.py              News, videos, social posts and contract stories → web/data/news*.json, contracts.json
  news_sources.json    Which sites, channels and accounts to read (edit freely)
  driver_contracts.json  Your own sourced contract and salary figures (starts empty)
  laps.py              Lap-by-lap data → web/data/laps (runs on every auto refresh)
  check_new.py         Quick check for new results/telemetry (used by the auto refresh)
web/                   The app (static files, no build step)
serve.py               Local server that understands the app's clean addresses
.github/workflows/refresh-data.yml   Auto refresh (3-hourly check, Monday full run)
vercel.json
```

## Working on the code

See `AGENT.md` for structure, conventions and commands (Claude Code loads it
automatically through `CLAUDE.md`). Every change gets an entry in `CHANGELOG.md`;
CI blocks code changes that skip it.

## Setup

1. **Repo:** create a personal GitHub repo (keep it separate from any work org),
   then `git init && git add . && git commit -m "OutLap" && git push`.
2. **Data, on your computer, outside a race weekend:**
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r ingest/requirements.txt
   python ingest/build_data.py        # 1.5–3 hours; resumable, safe to re-run
   python ingest/backfill_fastf1.py   # 2018–2022 telemetry and tyres, a few hours, once; safe to stop and re-run
                                      # (add --push to merge with the latest data on GitHub and push)
   python ingest/media.py             # 10–15 minutes
   python ingest/circuits.py          # about 10 minutes; resumable
   python ingest/wiki_info.py         # about 10 minutes; resumable
   git add web/data && git commit -m "Data" && git push
   ```
3. **Vercel:** in a personal account, Add New → Project → import the repo,
   framework "Other", no build command. Every push redeploys.
4. **Automatic refresh:** GitHub → Settings → Actions → General → Workflow
   permissions → Read and write. Every 3 hours it checks for new results,
   qualifying and telemetry and rebuilds the season only when something is new;
   Mondays 10:00 UTC it does a full refresh. Run it by hand from Actions → Refresh
   race data; enter `2023` as the first season to backfill all OpenF1 telemetry.
   News, videos and posts refresh on every run.
5. **Phone:** open the Vercel URL in Safari → Share → Add to Home Screen.

Local preview: `python serve.py`, then open http://localhost:8000. (The plain
`python -m http.server` can't answer addresses like `/drivers/max-verstappen`.)
