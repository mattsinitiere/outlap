"""Builds the app's data files from free sources.

  Jolpica (Ergast successor): schedule, results, qualifying, standings, 2018+
  OpenF1:                     lap telemetry, positions, speed traps, 2023+

Telemetry for 2018-2022 comes from backfill_fastf1.py (run it once, locally).

Usage:
  python ingest/build_data.py                         # 2018..this year, telemetry 2023+
  python ingest/build_data.py --since 2026            # refresh just this season
  python ingest/build_data.py --telemetry monza:2025,spa:2026 --drivers 10
"""
import argparse, datetime as dt, json, os, sys, time

import numpy as np
import requests

sys.path.insert(0, os.path.dirname(__file__))
from telemetry import process_lap  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "data")
JOLPICA = "https://api.jolpi.ca/ergast/f1"
OPENF1 = "https://api.openf1.org/v1"
FIRST_SEASON = 2018
S = requests.Session()
S.headers["User-Agent"] = "outlap/1.0 (personal analytics)"


class LiveSessionLock(Exception):
    """OpenF1 blocks all unauthenticated requests, historical included, while a session is live."""


def get(url, params=None, pause=0.35, tries=6):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=60)
        except requests.RequestException as e:  # timeouts and dropped connections: wait and retry
            print(f"    {type(e).__name__} on {url}, retrying"); time.sleep(10 * (i + 1)); continue
        if r.status_code == 401 and "openf1" in url:
            raise LiveSessionLock(r.json().get("detail", "OpenF1 requires a key right now"))
        if r.status_code == 429:
            time.sleep(10 * (i + 1)); continue
        if r.status_code >= 500:
            time.sleep(3 * (i + 1)); continue
        if r.status_code == 404:
            time.sleep(pause); return []
        r.raise_for_status()
        time.sleep(pause)
        return r.json()
    raise RuntimeError(f"Gave up on {url} {params}")


# ---------- Jolpica ----------

def jol_races(path, key):
    """Fetch every page of a race-table endpoint and merge rows by round."""
    merged, offset = {}, 0
    while True:
        d = get(f"{JOLPICA}/{path}.json", {"limit": 100, "offset": offset})["MRData"]
        for r in d["RaceTable"]["Races"]:
            m = merged.setdefault(r["round"], dict(r, **{key: []}))
            m[key].extend(r.get(key, []))
        offset += 100
        if offset >= int(d["total"]):
            return merged


def secs(s):
    if not s:
        return None
    p = s.split(":")
    return round(float(p[0]) * 60 + float(p[1]), 3) if len(p) == 2 else float(p[0])


SESSIONS = [("FirstPractice", "Practice 1"), ("SecondPractice", "Practice 2"), ("ThirdPractice", "Practice 3"),
            ("SprintQualifying", "Sprint Qualifying"), ("SprintShootout", "Sprint Shootout"), ("Sprint", "Sprint"),
            ("Qualifying", "Qualifying")]


def build_season(year):
    sched = get(f"{JOLPICA}/{year}.json")["MRData"]["RaceTable"]["Races"]
    results = jol_races(f"{year}/results", "Results")
    quali = jol_races(f"{year}/qualifying", "QualifyingResults")
    drivers, constructors, races = {}, {}, []
    for r in sched:
        c = r["Circuit"]
        race = dict(round=int(r["round"]), name=r["raceName"], date=r["date"],
                    circuit=c["circuitId"], circuitName=c["circuitName"],
                    locality=c["Location"]["locality"], country=c["Location"]["country"],
                    results=[], pole=None)
        if r.get("time"):
            race["time"] = r["time"]
        sessions = [dict(n=label, d=r[k]["date"], t=r[k].get("time")) for k, label in SESSIONS if r.get(k, {}).get("date")]
        if sessions:
            race["sessions"] = sessions
        for x in results.get(r["round"], {}).get("Results", []):
            d, k = x["Driver"], x["Constructor"]
            code = d.get("code") or d["familyName"][:3].upper()
            drivers[d["driverId"]] = dict(code=code, name=f'{d["givenName"]} {d["familyName"]}',
                                          first=d["givenName"], last=d["familyName"],
                                          number=x.get("number") or d.get("permanentNumber"),
                                          nat=d.get("nationality"), dob=d.get("dateOfBirth"),
                                          wiki=d.get("url"))
            constructors[k["constructorId"]] = dict(name=k["name"], nat=k.get("nationality"),
                                                    wiki=k.get("url"))
            fl = x.get("FastestLap", {})
            race["results"].append(dict(
                pos=int(x["position"]), d=d["driverId"], c=k["constructorId"], grid=int(x["grid"]),
                pts=float(x["points"]), st=x["status"], laps=int(x["laps"]),
                fl=secs(fl.get("Time", {}).get("time")),
                flr=int(fl["rank"]) if fl.get("rank") else None))
        q = quali.get(r["round"], {}).get("QualifyingResults", [])
        if q:
            p = q[0]
            race["pole"] = dict(d=p["Driver"]["driverId"],
                                t=secs(p.get("Q3") or p.get("Q2") or p.get("Q1")))
        races.append(race)

    def standings(kind):
        lists = get(f"{JOLPICA}/{year}/{kind}.json")["MRData"]["StandingsTable"]["StandingsLists"]
        return lists[0] if lists else {}

    ds, cs = standings("driverStandings"), standings("constructorStandings")
    return dict(
        year=year, races=races, drivers=drivers, constructors=constructors,
        afterRound=int(ds.get("round", 0)),
        driverStandings=[dict(pos=int(s.get("position", 0) or 0), d=s["Driver"]["driverId"],
                              c=s["Constructors"][-1]["constructorId"], pts=float(s["points"]),
                              wins=int(s["wins"])) for s in ds.get("DriverStandings", [])],
        constructorStandings=[dict(pos=int(s.get("position", 0) or 0),
                                   c=s["Constructor"]["constructorId"],
                                   pts=float(s["points"]), wins=int(s["wins"]))
                              for s in cs.get("ConstructorStandings", [])])


# ---------- OpenF1 (2023+) ----------

def of1(path, **params):
    return get(f"{OPENF1}/{path}", params, pause=2.2)


def openf1_race_sessions(year):
    today = dt.date.today().isoformat()
    return [s for s in of1("sessions", year=year, session_name="Race")
            if not s.get("is_cancelled") and s["date_end"][:10] < today]


def match_round(season, session):
    day = dt.date.fromisoformat(session["date_start"][:10])
    for r in season["races"]:
        if abs((dt.date.fromisoformat(r["date"]) - day).days) <= 1:
            return r
    return None


def iso(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def lap_telemetry(session_key, lap):
    start = iso(lap["date_start"])
    end = start + dt.timedelta(seconds=lap["lap_duration"])
    win = {"date>": (start - dt.timedelta(seconds=1)).isoformat(),
           "date<": (end + dt.timedelta(seconds=1)).isoformat()}
    car = of1("car_data", session_key=session_key, driver_number=lap["driver_number"], **win)
    loc = of1("location", session_key=session_key, driver_number=lap["driver_number"], **win)
    if len(car) < 40 or len(loc) < 40:
        return None
    ts = lambda rows: np.array([(iso(r["date"]) - start).total_seconds() for r in rows])
    tc, tl = ts(car), ts(loc)
    li = lambda k: np.interp(tc, tl, [r[k] for r in loc])
    return process_lap(tc, [r["speed"] for r in car], [r["throttle"] for r in car],
                       [min(1, (r["brake"] or 0) / 100) for r in car],
                       [r["n_gear"] for r in car], [r["rpm"] for r in car], li("x"), li("y"))


def openf1_race(season, session, race, want_telemetry, n_drivers):
    key = session["session_key"]
    laps = [l for l in of1("laps", session_key=key)
            if l.get("lap_duration") and l.get("date_start") and not l.get("is_pit_out_lap")]
    speeds = [l["st_speed"] for l in laps if l.get("st_speed")]
    trend = dict(topSpeed=max(speeds) if speeds else None)
    if not want_telemetry:
        return trend, None
    sectors = lambda l: [l.get("duration_sector_1"), l.get("duration_sector_2"), l.get("duration_sector_3")]
    info = {d["driver_number"]: d for d in of1("drivers", session_key=key)}
    best = {}
    for l in laps:
        n = l["driver_number"]
        if n not in best or l["lap_duration"] < best[n]["lap_duration"]:
            best[n] = l
    finish = {season["drivers"][x["d"]]["code"]: i for i, x in enumerate(race["results"])}
    picks = sorted(best.values(), key=lambda l: finish.get(
        info.get(l["driver_number"], {}).get("name_acronym"), 99))[:n_drivers]
    traces = []
    for lap in picks:
        di = info.get(lap["driver_number"], {})
        try:
            tr = lap_telemetry(key, lap)
        except LiveSessionLock:
            raise
        except Exception as e:  # noqa: BLE001 - one bad lap shouldn't stop the season
            print(f"    {di.get('name_acronym')} skipped: {e}"); tr = None
        if tr:
            traces.append(dict(code=di.get("name_acronym"), team=di.get("team_name"),
                               color="#" + (di.get("team_colour") or "8A97A8"),
                               lap=lap["lap_duration"], lapNo=lap["lap_number"],
                               sectors=sectors(lap), headshot=di.get("headshot_url"), **tr))
            print(f"    {di.get('name_acronym')} lap {lap['lap_number']} {lap['lap_duration']}s")
    tele = dict(year=season["year"], round=race["round"], circuit=race["circuit"],
                name=race["name"], session="Race", source="OpenF1", drivers=traces)
    return trend, tele


# ---------- files ----------

def write(name, data):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as f:  # write then swap, so a killed run never leaves half a file
        json.dump(data, f, separators=(",", ":"))
    os.replace(path + ".tmp", path)


def load(name, default):
    try:
        with open(os.path.join(OUT, name)) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def add_telemetry(index, tele):
    fname = f"{tele['year']}_{tele['round']:02d}.json"
    write(f"telemetry/{fname}", tele)
    index[:] = [i for i in index if i["file"] != fname] + [dict(
        file=fname, year=tele["year"], round=tele["round"], circuit=tele["circuit"],
        name=tele["name"], source=tele["source"], drivers=[d["code"] for d in tele["drivers"]])]
    index.sort(key=lambda i: (i["year"], i["round"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=int, default=FIRST_SEASON)
    ap.add_argument("--until", type=int, default=dt.date.today().year)
    ap.add_argument("--telemetry", default="all",
                    help="'all', 'none', or circuit:year pairs, e.g. monza:2025,spa:2026")
    ap.add_argument("--drivers", type=int, default=20, help="drivers per race with telemetry")
    ap.add_argument("--force", action="store_true", help="re-fetch races already downloaded")
    ap.add_argument("--results-only", action="store_true", help="skip OpenF1 entirely")
    a = ap.parse_args()
    wanted = None if a.telemetry == "all" else set() if a.telemetry == "none" else \
        {tuple(p.split(":")) for p in a.telemetry.split(",")}

    trends = load("trends.json", {})
    index = load("telemetry/index.json", [])
    seasons = sorted(set(load("meta.json", {}).get("seasons", [])) |
                     set(range(a.since, a.until + 1)))
    locked = False
    for year in range(a.since, a.until + 1):
        print(f"Season {year}: results and standings")
        season = build_season(year)
        write(f"season_{year}.json", season)
        for r in season["races"]:
            if not r["results"]:
                continue
            t = trends.setdefault(r["circuit"], {"name": r["circuitName"], "years": {}})
            y = t["years"].setdefault(str(year), {})
            y.update(pole=r["pole"]["t"] if r["pole"] else None,
                     fastestLap=min([x["fl"] for x in r["results"] if x["fl"]], default=None),
                     winner=season["drivers"][r["results"][0]["d"]]["code"])
        if year < 2023 or a.results_only or locked:
            continue
        try:
            sessions = openf1_race_sessions(year)
        except LiveSessionLock as e:
            print(f"  OpenF1 paused: {e}\n  Re-run after the session ends; finished races are kept.")
            locked = True; continue
        if sessions:
            try:  # official headshots + session colours for this season's grid
                season["openf1"] = {d["name_acronym"]: dict(headshot=d.get("headshot_url"),
                                                            colour=d.get("team_colour"))
                                    for d in of1("drivers", session_key=sessions[-1]["session_key"])
                                    if d.get("name_acronym")}
                write(f"season_{year}.json", season)
            except LiveSessionLock as e:
                print(f"  OpenF1 paused: {e}"); locked = True; continue
        for s in sessions:
            race = match_round(season, s)
            if not race or not race["results"]:
                continue
            want = wanted is None or (race["circuit"], str(year)) in wanted
            have_trend = "topSpeed" in trends[race["circuit"]]["years"][str(year)]
            have_tele = os.path.exists(os.path.join(OUT, "telemetry", f"{year}_{race['round']:02d}.json"))
            if not a.force and have_trend and (not want or have_tele):
                continue  # already done; makes long runs resumable
            print(f"  OpenF1 {year} {s['location']}{' + telemetry' if want else ''}")
            try:
                trend, tele = openf1_race(season, s, race, want, a.drivers)
            except LiveSessionLock as e:
                print(f"  OpenF1 paused: {e}\n  Re-run after the session ends; finished races are kept.")
                locked = True; break
            trends[race["circuit"]]["years"][str(year)].update(trend)
            if tele and tele["drivers"]:
                add_telemetry(index, tele)
            write("trends.json", trends)
            write("telemetry/index.json", index)
    write("trends.json", trends)
    write("telemetry/index.json", index)
    write("meta.json", dict(seasons=seasons,
                            generated=dt.datetime.now(dt.timezone.utc).isoformat()))
    print("Done.")


if __name__ == "__main__":
    main()
