<p><img src="brand/outlap-wordmark.svg" alt="OutLap" width="320"></p>

# OutLap

Personal race analytics from the 2018 season onward: lap telemetry on the track
map, head-to-head comparisons, driver and team profiles with photos and logos,
every car since 2018, standings, results and circuit trends. Light mode, works
on desktop and as a home-screen app on your phone.

Unofficial personal project. Not affiliated with Formula 1, the FIA or any team.
Keep it private, for personal use. Don't publish it to an app store.

## Sections

- **Telemetry:** two drivers' fastest race laps. Track map coloured by who is
  faster in each of 24 mini-sectors, or by speed, throttle, brake, gear or
  estimated g. Interactive charts (speed, throttle and brake, gear, g-force,
  gap) linked to the map, sector times, corner minimum speeds and a lap summary.
- **Standings:** championship leader, an interactive points race, driver and
  constructor tables.
- **Races:** every round with podium photos, pole, fastest lap and full results.
- **Drivers:** the grid for any season, and a profile per driver with career
  stats since 2018, points by season, their car, season results and teammate
  head-to-head.
- **Teams:** a profile per team that follows name changes (Racing Point to Aston
  Martin, Toro Rosso to Racing Bulls and so on), interactive history charts and
  every car it raced.
- **Circuits:** every track raced since 2018. Layout with official turn numbers,
  start line and direction, elevation map and profile, facts (length, turns,
  opened, first Grand Prix, lap record, pit-stop time loss, capacity, designer),
  a description, photos, results and pole/fastest-lap/speed-trap trends.
- **Cars:** every car on the grid for a season. Each car has its own page with
  photos, a Wikipedia spec sheet (engine, power, weight, tyres, designer and
  more), its record, race-by-race results and links to its predecessor and successor.

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
| Lap telemetry, sectors, speed traps, 2023+ | OpenF1 | Free for past sessions. **OpenF1 blocks all free access while any F1 session is live**, so refresh outside race weekends |
| Telemetry 2018–2022 | FastF1 | F1's archive blocks cloud IPs; run the backfill on your own computer |
| Driver headshots | OpenF1 (official, 2023+) with Wikipedia/Wikimedia Commons photos as fallback | Official headshots linked for personal use |
| Team logos | formula1.com logo files, 2019–2025 | Linked for personal use; teams without one get a team-colour badge |
| Car photos | Wikimedia Commons via each car's Wikipedia article, plus official formula1.com car images 2019+ | Commons photos are credited; official images linked for personal use. Chassis names in `ingest/cars.json`; 2026 cars are matched automatically and flagged |
| Driver photo galleries | Wikimedia Commons search | Credited |
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
  backfill_fastf1.py   FastF1 telemetry for 2018–2022 (run locally, once)
  media.py             Headshots, logos, car photos, galleries → web/data/media.json
  circuits.py          Layouts, turns, elevation, facts, photos → web/data/circuits.json
  wiki_info.py         Driver bios, team facts, car specs and galleries → web/data/info.json
  cars.json            Chassis name per team and season (edit to fix a photo)
  telemetry.py         Resampling and g-force estimates
  build_preview.py     Bundles everything into one HTML file for a quick look
web/                   The app (static files, no build step)
.github/workflows/refresh-data.yml   Monday refresh
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
   python ingest/backfill_fastf1.py   # 2018–2022 telemetry, a few hours, once
   python ingest/media.py             # 10–15 minutes
   python ingest/circuits.py          # about 10 minutes; resumable
   python ingest/wiki_info.py         # about 10 minutes; resumable
   git add web/data && git commit -m "Data" && git push
   ```
3. **Vercel:** in a personal account, Add New → Project → import the repo,
   framework "Other", no build command. Every push redeploys.
4. **Weekly refresh:** GitHub → Settings → Actions → General → Workflow
   permissions → Read and write. Runs Mondays 10:00 UTC, or by hand from Actions.
5. **Phone:** open the Vercel URL in Safari → Share → Add to Home Screen.

Local preview: `cd web && python -m http.server 8000`.
