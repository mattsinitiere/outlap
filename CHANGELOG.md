# Changelog

All notable changes to Apex Lab. Newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Every change adds an entry under
`[Unreleased]` in the same commit (see AGENT.md).

## [Unreleased]

### Added
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
- Manual data refresh can start from an earlier season (enter `2023` to fill in
  the missing 2023–2025 OpenF1 telemetry).

### Changed
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
