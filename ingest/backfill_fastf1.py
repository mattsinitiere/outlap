"""One-time backfill of 2018-2022 data with FastF1: lap telemetry, speed traps, and for the
Lap by Lap charts, tyre stints, sector times and official Safety Car periods.

OpenF1 starts in 2023, so earlier data comes from F1's live-timing archive through FastF1.
That archive blocks many cloud/datacenter IP ranges, so run this from your own computer,
not from GitHub Actions. Historical data never changes, so you only need to run it once.
It's resumable: races already done are skipped, so stop it any time and run it again later.

  pip install -r ingest/requirements.txt
  python ingest/backfill_fastf1.py                  # 2018-2022, ~1-2 min per race
  python ingest/backfill_fastf1.py --push           # then merge with the latest data on GitHub and push
  python ingest/backfill_fastf1.py --years 2021 --drivers 10
  python ingest/backfill_fastf1.py --force          # re-download races you already have
"""
import argparse, os, subprocess, sys

import fastf1

sys.path.insert(0, os.path.dirname(__file__))
from build_data import OUT, add_telemetry, load, write  # noqa: E402
from laps import EXTRAS, flag_periods, merge_extras  # noqa: E402
from telemetry import process_lap  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fastf1-cache")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SHARED = ["web/data/trends.json", "web/data/telemetry/index.json"]  # files the cloud refresh also writes


def isnan(v):
    return v is None or v != v


def secs(td):
    return None if isnan(td) else round(td.total_seconds(), 3)


def lap_extras(season, s):
    """Tyre stints, sector times and speed traps per driver, and Safety Car periods."""
    by_code = {d.get("code"): did for did, d in season["drivers"].items()}
    out = {}
    laps = s.laps
    for code, dl in laps.groupby("Driver"):
        did = by_code.get(code)
        if not did:
            continue
        dl = dl.sort_values("LapNumber")
        n = int(dl["LapNumber"].max())
        sec, trap = [[None] * n for _ in range(3)], [None] * n
        for _, lap in dl.iterrows():
            i = int(lap["LapNumber"]) - 1
            for k in range(3):
                sec[k][i] = secs(lap[f"Sector{k + 1}Time"])
            trap[i] = None if isnan(lap["SpeedST"]) else int(lap["SpeedST"])
        stints = []
        for _, st in dl.groupby("Stint"):
            first = st.iloc[0]
            comp = first["Compound"] if isinstance(first["Compound"], str) else "UNKNOWN"
            life = first["TyreLife"]
            stints.append([comp.upper().replace("TEST_UNKNOWN", "UNKNOWN"), int(st["LapNumber"].min()), int(st["LapNumber"].max()),
                           0 if isnan(life) else max(0, int(life) - 1)])
        out[did] = {"st": sorted(stints, key=lambda x: x[1]), "sec": sec, "trap": trap}
    msgs = []
    try:
        for _, m in s.race_control_messages.iterrows():
            msgs.append({"date": str(m.get("Time")), "lap_number": None if isnan(m.get("Lap")) else int(m["Lap"]),
                         "category": m.get("Category"), "flag": m.get("Flag"), "message": m.get("Message")})
    except Exception:  # noqa: BLE001 - no messages for this race
        msgs = None
    last = int(laps["LapNumber"].max()) if len(laps) else 0
    return {"drivers": out, "flags": flag_periods(msgs, last) if msgs is not None else None}


def save_extras(year, rnd, ex):
    name = f"{year}_{rnd:02d}.json"
    data = load(f"laps/{name}", None)
    if data:  # lap file already there: merge now
        merge_extras(data, ex)
        write(f"laps/{name}", data)
    else:  # the cloud refresh hasn't fetched this race's laps yet; laps.py merges it later
        write(f"laps/fastf1/{name}", ex)


def extras_done(year, rnd):
    name = f"{year}_{rnd:02d}.json"
    data = load(f"laps/{name}", None)
    return bool(data and data.get("ff1") == "ok") or os.path.exists(os.path.join(EXTRAS, name))


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, check=check, text=True, capture_output=True)


def push():
    """Merge this run's results with whatever the cloud refresh committed meanwhile, then push.
    Per-race files never clash; the two shared index files are re-merged in Python."""
    for attempt in range(3):
        ours_trends, ours_index = load("trends.json", {}), load("telemetry/index.json", [])
        git("checkout", "--", *SHARED, check=False)
        r = git("pull", "--rebase", "--autostash", "origin", "main", check=False)
        if r.returncode:
            print(r.stdout, r.stderr); sys.exit("git pull failed; see above")
        trends, index = load("trends.json", {}), load("telemetry/index.json", [])
        for cid, c in ours_trends.items():
            for y, v in c.get("years", {}).items():
                if int(y) <= 2022 and v.get("topSpeed") is not None:
                    trends.setdefault(cid, {"name": c.get("name"), "years": {}})["years"].setdefault(y, {})["topSpeed"] = v["topSpeed"]
        have = {i["file"] for i in index}
        index += [i for i in ours_index if i["file"] not in have and os.path.exists(os.path.join(OUT, "telemetry", i["file"]))]
        index.sort(key=lambda i: (i["year"], i["round"]))
        write("trends.json", trends)
        write("telemetry/index.json", index)
        git("add", "web/data")
        if not git("status", "--porcelain", "web/data").stdout.strip():
            print("Nothing new to push."); return
        r = git("commit", "-m", "FastF1 data 2018-2022 (telemetry, tyres, Safety Car periods)", check=False)
        if r.returncode:
            print(r.stdout, r.stderr); sys.exit("git commit failed (set your name and email with git config, see above), then run with --push again")
        r = git("push", "origin", "HEAD:main", check=False)
        if r.returncode == 0:
            print("Pushed. Vercel deploys in a minute or two."); return
        git("reset", "--soft", "HEAD~1")  # un-commit (changes stay) and merge onto the newer data
        print("The cloud refresh pushed in the meantime; merging again...")
    sys.exit("Push kept failing; run the command again in a few minutes.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2018,2019,2020,2021,2022")
    ap.add_argument("--drivers", type=int, default=20)
    ap.add_argument("--force", action="store_true", help="re-download races already done")
    ap.add_argument("--push", action="store_true", help="after the run, merge with GitHub and push")
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
            need_tel = a.force or not (done and have_top)
            need_extras = a.force or not extras_done(year, race["round"])
            if not need_tel and not need_extras:
                continue  # already downloaded
            print(f"{year} R{race['round']} {race['name']}", flush=True)
            try:
                s = fastf1.get_session(year, race["round"], "R")
                s.load(laps=True, telemetry=need_tel, weather=False, messages=True)
                laps = s.laps
            except Exception as e:  # noqa: BLE001
                print(f"  skipped: {e}"); continue
            if need_extras:
                try:
                    save_extras(year, race["round"], lap_extras(season, s))
                    print("  tyres, sectors and Safety Car periods saved")
                except Exception as e:  # noqa: BLE001
                    print(f"  tyres skipped: {e}")
            if not need_tel:
                continue
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
    if a.push:
        push()
    else:
        print("Done. To publish it, run:\n  python ingest/backfill_fastf1.py --push")


if __name__ == "__main__":
    main()
