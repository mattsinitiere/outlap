"""One-time backfill of 2018-2022 telemetry and speed traps with FastF1.

OpenF1 starts in 2023, so earlier telemetry comes from F1's live-timing archive
through FastF1. That archive blocks many cloud/datacenter IP ranges, so run this
from your own computer, not from GitHub Actions. Historical data never changes,
so you only need to run it once, then commit web/data. It's resumable: races
already downloaded are skipped, so stop it any time and run it again later.

  pip install -r ingest/requirements.txt
  python ingest/backfill_fastf1.py                  # 2018-2022, ~1-2 min per race
  python ingest/backfill_fastf1.py --years 2021 --drivers 10
  python ingest/backfill_fastf1.py --force          # re-download races you already have
"""
import argparse, os, sys

import fastf1

sys.path.insert(0, os.path.dirname(__file__))
from build_data import OUT, add_telemetry, load, write  # noqa: E402
from telemetry import process_lap  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fastf1-cache")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2018,2019,2020,2021,2022")
    ap.add_argument("--drivers", type=int, default=20)
    ap.add_argument("--force", action="store_true", help="re-download races already done")
    a = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE)

    trends = load("trends.json", {})
    index = load("telemetry/index.json", [])
    for year in [int(y) for y in a.years.split(",")]:
        season = load(f"season_{year}.json", None)
        if not season:
            print(f"Run build_data.py for {year} first"); continue
        for race in season["races"]:
            if not race["results"]:
                continue
            done = os.path.exists(os.path.join(OUT, "telemetry", f"{year}_{race['round']:02d}.json"))
            have_top = trends.get(race["circuit"], {}).get("years", {}).get(str(year), {}).get("topSpeed") is not None
            if done and have_top and not a.force:
                continue  # already downloaded
            print(f"{year} R{race['round']} {race['name']}", flush=True)
            try:
                s = fastf1.get_session(year, race["round"], "R")
                s.load(laps=True, telemetry=True, weather=False, messages=False)
                laps = s.laps
            except Exception as e:  # noqa: BLE001
                print(f"  skipped: {e}"); continue
            top = laps["SpeedST"].max()
            yr = trends.setdefault(race["circuit"], {"name": race["circuitName"], "years": {}}) \
                ["years"].setdefault(str(year), {})
            yr["topSpeed"] = None if top != top else int(top)

            order = [season["drivers"][r["d"]]["code"] for r in race["results"]][: a.drivers]
            traces = []
            for code in order:
                try:
                    lap = laps.pick_drivers(code).pick_fastest()
                    if lap is None or lap.empty:
                        continue
                    tel = lap.get_telemetry()
                    tr = process_lap(tel["Time"].dt.total_seconds().values, tel["Speed"].values,
                                     tel["Throttle"].values, tel["Brake"].astype(float).values,
                                     tel["nGear"].values, tel["RPM"].values,
                                     tel["X"].values, tel["Y"].values)
                except Exception as e:  # noqa: BLE001
                    print(f"  {code}: {e}"); continue
                if tr:
                    color = s.get_driver(code).get("TeamColor") or "8A97A8"
                    traces.append(dict(code=code, team=lap["Team"], color="#" + color,
                                       lap=round(lap["LapTime"].total_seconds(), 3),
                                       lapNo=int(lap["LapNumber"]),
                                       sectors=[None if lap[k] != lap[k] else round(lap[k].total_seconds(), 3)
                                                for k in ("Sector1Time", "Sector2Time", "Sector3Time")],
                                       headshot=s.get_driver(code).get("HeadshotUrl") or None, **tr))
            if traces:
                add_telemetry(index, dict(year=year, round=race["round"], circuit=race["circuit"],
                                          name=race["name"], session="Race", source="FastF1",
                                          drivers=traces))
            write("trends.json", trends)
            write("telemetry/index.json", index)
    print("Done. Now commit and push the data:\n  git add web/data && git commit -m \"FastF1 telemetry 2018-2022\" && git push")


if __name__ == "__main__":
    main()
