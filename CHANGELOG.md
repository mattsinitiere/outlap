# Changelog

All notable changes to Apex Lab. Newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Every change adds an entry under
`[Unreleased]` in the same commit (see AGENT.md).

## [Unreleased]

### Added
- Home page, now the first thing you see: the next race with a live countdown,
  the weekend's session times in your time zone and the track layout; the season
  at a glance (leader, lead, rounds left, who's still in the title fight,
  different winners, most poles); the last race's podium; driver and constructor
  leaderboards; and the latest news at the bottom.
- News page with every story from the last 30 days, filterable by type
  (articles, videos, social), driver, team and source, with headline search.
  Driver and team pages show an In the News card with their latest stories.
- New page icons: a trophy for Races, a driver in a helmet for Drivers, a pit
  garage for Teams, a front-on car for Cars, plus Home and News.
- News collection: every 3 hours OutLap gathers F1 headlines from a dozen news
  sites, Google News searches for every current driver and team, YouTube videos
  from F1 and the teams, Reddit, and any Bluesky accounts you list. Each story is
  tagged with the drivers and teams it mentions and kept for 30 days (up to
  2,000). Only headlines, a short summary and a link are stored; stories open on
  the publisher's site. Sources live in `ingest/news_sources.json`.
- The FastF1 backfill for 2018–2022 skips races it already has, so it can be
  stopped and restarted on your own computer.
- OutLap Rating: one 60–99 score per driver per season, built from results with
  teammate head-to-heads weighted heaviest so the car matters less. Shown as a
  breakdown card and headline stat on driver profiles, a badge on driver cards,
  and a column in the drivers' championship. Drivers can be sorted by rating.
- Flags instead of nationality words on driver profiles, driver cards and team pages.
- Legend on the Grid to Finish chart (solid line Finished, dashed line Retired).
- Data now updates within a few hours of new results instead of only on Mondays.
  Every 3 hours a quick check asks whether race results, qualifying or recent lap
  telemetry are out that the app doesn't have yet, and rebuilds the season only
  when they are. The Monday full refresh still runs.
- The 2026 cars now have chassis names, so Ferrari, Racing Bulls, Alpine and
  Williams get photos and spec sheets, and a car photo is only marked as checked
  when its Wikipedia article is about that exact model.
- Race weekends now store session times (practice, sprint, qualifying, race) for
  the upcoming-race view.
- Manual data refresh can start from an earlier season (enter `2023` to fill in
  the missing 2023–2025 OpenF1 telemetry).

### Changed
- Clean web addresses: no more `#` in links. Pages live at readable paths like
  `/drivers/max-verstappen/2024`, `/races/2026/singapore-grand-prix`,
  `/teams/red-bull`, `/cars/2025/ferrari`, `/circuits/monza` and
  `/telemetry/2023/italian-grand-prix/ver-vs-per`. Old `#/` links and home-screen
  shortcuts still work and switch to the new address. Locally, run
  `python serve.py` (plain `http.server` can't answer these addresses).
- Telemetry picker rebuilt. Season tabs and a strip of every round drawn as its
  track layout replace the race dropdown (rounds without telemetry are greyed
  out). Drivers appear as chips ranked by lap time with the gap to the fastest;
  tap the Driver or Compare With slot, then a chip. Swap, Teammate and Solo
  buttons do the common comparisons in one tap.
- Navigation: Home and News join the rail. On phones the tab bar is Home,
  Telemetry, Standings and Drivers, with everything else under More.
- Long data refreshes save their progress: if building seasons runs out of time,
  everything that finished is still committed and the next run carries on. Data
  files are written safely so a cut-off run never leaves a broken file.
- Data refreshes only commit when data actually changed, so quiet runs no longer
  create a commit and a Vercel deploy just for a new timestamp.
- Driver profile layout: rating and points side by side, then profile and career
  breakdown, then a full-width car card.

## [0.7.0] - 2026-10-10

### Added
- New name and logo: the app is now **OutLap**. The logo is OUT + three touching
  sector slashes (purple, green, yellow) + LAP, supplied as outlined SVGs with a
  brand guide in `brand/`.
- New app icon, Android adaptive icon, favicon and link-preview image.
- Phone app bar with the OutLap wordmark and a Settings button.
- Branded boot loader (wordmark with pulsing sector slashes) that only appears if
  the first page takes more than a moment.
- `AGENT.md` with project instructions for coding agents, and this changelog.
- `CLAUDE.md` so Claude Code loads `AGENT.md` automatically.
- CI check that fails code changes which don't update `CHANGELOG.md` (data-only commits are exempt).

### Changed
- Loading progress bar uses the three sector colours.
- The slash mark replaces the old icon at the top of the desktop rail; the wordmark
  appears in Settings and on empty states.
- Settings moved out of the phone More menu into the app bar, so there's one way in.
- Settings are stored under a new key; existing settings carry over automatically.
- Repo, data refresh bot and request headers renamed from Apex Lab to OutLap.

### Fixed
- Images that are part of the page shell (not loaded by a view) stayed invisible
  because the fade-in only applied to images added after start-up.

## [0.6.0] - 2026-10-10

### Added
- A page for every car: photo, season stats, Wikipedia description, spec sheet
  (engine, power, weight, tyres, designer and more), record, race-by-race results,
  predecessor and successor links, photo gallery.
- Driver profile: Profile card (birthplace, height, race number, teams since 2018, bio),
  Career Breakdown (averages, places gained, front-row starts, finish rate) with a
  finishing-position chart, and a Race Wins list.
- Team profile: base, team principal, founder, one-two finishes, retirements, a
  Wikipedia summary and every driver since 2018.
- Races: interactive Grid to Finish chart and Race Notes (pole converted, biggest
  gainer and drop, retirements).
- Standings: Season Leaders (most wins, poles, podiums, fastest laps and more).
- Circuits: Who Wins Here (most wins and poles, pole-to-win rate, average winning grid slot).
- `ingest/wiki_info.py` for driver bios, team facts, car specs and car galleries.

### Changed
- New Cars icon (top-down race car) and Circuits icon (track loop with start line).
- Car cards open the car's page.

### Fixed
- Car photos in team and car headers were pushed into the text column.

## [0.5.0] - 2026-10-10

### Added
- Settings panel: imperial or metric units, animations on or reduced, about and sources.
- Page transitions, top progress bar, page-shaped loading placeholders, chart line
  drawing, bar growth, number count-ups and photo fade-ins.
- Dedicated Gap Through the Lap chart on Telemetry.

### Changed
- Imperial units by default (mph, miles, feet) everywhere, including charts and tooltips.
- Same-page changes (tabs, seasons, sorting) update in place instead of redrawing the page.
- Title Case for all headings, tabs, buttons, column headers and stat labels.
- Removed redundant breadcrumbs, instruction subtitles and repeated facts.
- Standings show one championship at a time with a Drivers/Constructors switch.

### Fixed
- Points column cut off on phones; secondary columns now hide on small screens.
- Overlapping corner labels, gap badge covering a team name, race list text running
  together, broken team cards caused by nested links.

## [0.4.0] - 2026-10-10

### Added
- Circuits section: layouts with official turn numbers, start line and direction,
  elevation map and profile, facts, Wikipedia description, photos, winners and trends.
- Official headshots for drivers back to 2018, official car images, driver photo galleries.
- `ingest/circuits.py`.

### Changed
- Trends merged into each circuit page.

## [0.3.0] - 2026-10-10

### Changed
- Driver photos became halftone portraits tinted into the team colour, used only in
  headers, driver cards and podiums. Tables use a team-colour stripe instead.
- Whole table rows open the driver or team.

## [0.2.0] - 2026-10-10

### Added
- New design: Telemetry Lab layout with Team Colour styling, light mode.
- Driver and team profiles, Cars section with Wikimedia Commons photos.
- Official headshots and team logos (linked for personal use).
- Interactive charts with tooltips; "who is faster where" mini-sector map; sector
  times; corner minimum speeds.
- `ingest/media.py` and `ingest/cars.json`.

### Removed
- 3D garage (replaced by real car photos).
- Dark mode.

## [0.1.0] - 2026-10-10

### Added
- First version: data pipeline (Jolpica, OpenF1, FastF1 backfill), telemetry on
  the track map, standings, races, teams, trends, installable phone app, Vercel
  config and the weekly data refresh workflow.
