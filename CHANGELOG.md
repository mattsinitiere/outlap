# Changelog

All notable changes to Apex Lab. Newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Every change adds an entry under
`[Unreleased]` in the same commit (see AGENT.md).

## [Unreleased]

### Added
- Lap by Lap on every race page, beyond the fastest lap: Positions (every driver's
  place on every lap, with pit stops and Safety Car periods), Pace (lap times for
  the drivers you pick, with slow laps left out), Gaps (to the leader or to any
  driver), Strategy (each driver's stints and tyres, plus a Stint Pace table with
  average lap and estimated tyre wear per stint) and Consistency (how tightly each
  driver's laps were grouped). The Telemetry page's head-to-head now ends with the
  gap between the two drivers over the whole race.
- Lap times, positions and pit stops cover 2018 onward; tyres, sector times and
  official Safety Car periods cover 2023 onward. Before 2023, Safety Car laps are
  estimated from the whole field slowing down and labelled that way, and stints come
  from pit stops until the local FastF1 run adds tyre compounds.
- The local FastF1 run (`python ingest/backfill_fastf1.py`) now also collects 2018–2022
  tyre compounds (including 2018's hypersoft to superhard), per-lap sector times and the
  official Safety Car periods, so those seasons get the full Lap by Lap view. Add `--push`
  and it merges with whatever the automatic refresh committed meanwhile, then pushes.
- The data refresh fetches all of this by itself. Filling in every race since 2018
  takes several runs (about 12 hours) because of Jolpica's request limit; new races
  are added after that.
- Search everything from anywhere: press Cmd+K (Ctrl+K on Windows) or / on any
  page, use the Search button at the top right of Home, or tap the magnifier in
  the phone app bar. It finds drivers, teams, cars, circuits, every race since
  2018, lap telemetry, season pages and news headlines as you type. Add a year to
  narrow it ("2021 Verstappen" opens his 2021 profile). Arrow keys and Enter pick
  a result, and your recent picks show when the box is empty.
- Circuits page sorting: Calendar (a season's rounds in order, then the circuits
  not on that calendar, most recently raced first), Name (A to Z) or Location
  (grouped by region, then country). A season picker shows any year's calendar.
- Team photos on team profiles: garage, pit-stop and team shots from Wikimedia
  Commons (credited), with the first one as the page's header image and the rest
  in a Team Photos gallery. Teams without photos keep their car in the header.
- Contract and Pay card on driver profiles. It lists contract, extension and salary
  stories about that driver from the news feed (kept for a year), and shows a
  contract end year and estimated salary when you add them, with their source,
  to `ingest/driver_contracts.json`. That file starts empty: teams don't publish
  contract terms, salaries are media estimates, and F1 prize money goes to teams,
  so there are no official career winnings to show.
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
- The Teams page shows the teams instead of their cars: each card has the team logo on
  its colour, championship position and points, the drivers with flags, the season's
  wins, podiums and poles, and a points bar. Car photos stay on the Cars page and each
  team's profile. A logo that fails to load falls back to the team's initials.
- Team pages: the car photos section is now called Cars and sits right under the
  team profile instead of near the bottom.
- Turn labels on the elevation profile (and corner labels on the telemetry chart)
  sit in one line as alternating dark and light tags, each with a tick to its exact
  spot, instead of being staggered on two levels. When space runs short they slide
  sideways, switch to just the number, and on phones the chart scrolls sideways.
- Turn numbers on circuit maps no longer overlap each other or the track: crowded
  corners fan their numbers out, each joined to its corner by a line.
- Launch screen now shows every time the app opens: the OutLap wordmark rises in
  and the three sector lines fill one after another, for at least a second and
  never more than about three (if the page is still loading, its placeholders take over).
- The browser-tab icon follows your light or dark mode: the three sector lines on
  a white tile in light mode, on the dark tile in dark mode.
- Race list on the Races page rebuilt so the next race is obvious: a season
  progress bar, a Next Race shortcut with "Race Day", "Tomorrow" or "In 5 Days",
  an Upcoming divider, the next round outlined in red, a small track layout on
  every row and the winner with a team-colour tick on completed rounds. Opening an
  upcoming round shows its weekend (countdown, session times, layout) and recent
  winners there instead of "Not Raced Yet". On phones the list is a swipeable strip.
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

### Fixed
- A single slow answer from Jolpica no longer stops the whole data refresh; it waits and
  retries. This is what left 2026 without session times and telemetry after the last run.
- YouTube videos: when a channel's feed is refused, the refresh tries the same videos
  through the channel's uploads playlist feed.
- Teams with fewer than three photos (AlphaTauri, Cadillac) get another, broader search.
- 2018 race pages no longer ask for a 2017 season file that doesn't exist.
- Data refreshes no longer stop on one bad record. A single lap with missing
  timing data had ended the telemetry backfill partway through 2025, and one
  failed Wikipedia lookup stopped the car photo update; both are now skipped and
  logged, and Wikipedia rate limits are waited out.
- YouTube videos: channels are now found through their video feed (or a channel id
  in `ingest/news_sources.json`) instead of a page lookup that YouTube was refusing.
  Three news feeds that no longer exist (PlanetF1, GPblog, ESPN) were removed, and
  the log now says why a feed returned no stories.
- On phones, tapping something no longer leaves it looking blank. Touch screens
  keep the last tapped item in a "hover" state, and some hover styles overrode the
  selected look, most visibly a selected track in the telemetry picker turning white
  on near-white. Hover styles now only apply with a mouse, and never over a selected item.
- Phone layout touch-ups: telemetry and circuit readouts stay on one line, round
  labels on circuit cards no longer overlap the track, the circuit page title no
  longer runs into the track outline, tracks without telemetry are easier to read,
  the A/B badges stay readable on light team colours, and the Grid to Finish hint
  says Tap on touch screens.
- iPhone home-screen icon: it had transparent rounded corners, which iOS fills
  with black, leaving a dark fringe. It's now a full square that iOS rounds cleanly.

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
