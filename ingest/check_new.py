"""Cheap check for new race data, run every few hours by the refresh workflow.

Compares the current season's local files with Jolpica (a handful of tiny requests)
and looks for recent races still missing OpenF1 telemetry. Standard library only,
so it runs before anything is installed.

Prints a reason for each finding and, under GitHub Actions, writes new=true|false
to $GITHUB_OUTPUT. If Jolpica can't be reached it reports false; the next check retries.

Usage:
  python ingest/check_new.py
"""
import datetime as dt, json, os, sys, urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "data")
JOLPICA = "https://api.jolpi.ca/ergast/f1"
TELEMETRY_DAYS = 14  # keep retrying missing OpenF1 telemetry this long after a race


def mr(path, **params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{JOLPICA}/{path}.json?{q}",
                                 headers={"User-Agent": "outlap/1.0 (personal analytics)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["MRData"]


def load(name):
    try:
        with open(os.path.join(OUT, name)) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def findings(year, today):
    season = load(f"season_{year}.json")
    if season is None:
        return [f"no local file for {year} yet"]
    races = season["races"]
    found = []

    sched = int(mr(f"{year}", limit=1)["total"])
    if sched != len(races):
        found.append(f"schedule has {sched} rounds, local has {len(races)}")

    rows = int(mr(f"{year}/results", limit=1)["total"])
    have = sum(len(r["results"]) for r in races)
    if rows != have:
        found.append(f"Jolpica has {rows} result rows, local has {have}")

    q = int(mr(f"{year}/qualifying", limit=1)["total"])
    if q:
        last = mr(f"{year}/qualifying", limit=1, offset=q - 1)["RaceTable"]["Races"]
        latest = int(last[0]["round"]) if last else 0
        have = max([r["round"] for r in races if r["pole"]], default=0)
        if latest > have:
            found.append(f"qualifying for round {latest} is out, local pole data ends at round {have}")

    if year >= 2023:  # OpenF1 telemetry lands a little after results
        trends = load("trends.json") or {}
        for r in races:
            age = (today - dt.date.fromisoformat(r["date"])).days
            if not r["results"] or not 0 <= age <= TELEMETRY_DAYS:
                continue
            tele = os.path.exists(os.path.join(OUT, "telemetry", f"{year}_{r['round']:02d}.json"))
            trend = "topSpeed" in trends.get(r["circuit"], {}).get("years", {}).get(str(year), {})
            if not (tele and trend):
                found.append(f"round {r['round']} ({r['name']}) has results but no OpenF1 telemetry yet")
    return found


def main():
    today = dt.date.today()
    try:
        found = findings(today.year, today)
    except Exception as e:  # network trouble: skip this check, the next one retries
        print(f"Check failed, skipping this run: {e}")
        found = []
    for f in found:
        print(f"New: {f}")
    if not found:
        print("Nothing new.")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"new={'true' if found else 'false'}\n")


if __name__ == "__main__":
    sys.exit(main())
