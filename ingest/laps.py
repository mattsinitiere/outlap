"""Lap-by-lap race data: every driver's lap time and position on every lap, pit stops,
and (2023 onward) tyre stints, sector times, speed-trap readings and Safety Car periods.

  Jolpica: lap times, positions and pit stops, 2018 onward (about 15 requests a race)
  OpenF1:  stints, sectors, speed traps, race control messages, 2023 onward (4 requests a race)

Writes web/data/laps/YYYY_RR.json plus laps/index.json. Standard library only, so the
refresh workflow runs it on every pass. It's resumable: races that already have a file
are skipped, newest season first, and it stops cleanly when its time budget runs out.
Jolpica allows about 500 requests an hour, so requests are spaced 8 seconds apart and the
first full backfill (about 190 races) takes several runs.

Usage:
  python ingest/laps.py                    # whatever is missing, up to 90 minutes
  python ingest/laps.py --minutes 30       # shorter budget
  python ingest/laps.py --race 2024:8      # one race (rebuilds it)
  python ingest/laps.py --refresh-openf1   # retry tyres/sectors for 2023+ files that lack them
"""
import argparse, datetime as dt, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "data")
LAPS = os.path.join(OUT, "laps")
JOLPICA = "https://api.jolpi.ca/ergast/f1"
OPENF1 = "https://api.openf1.org/v1"
FIRST_SEASON, OPENF1_FROM = 2018, 2023
JOLPICA_GAP, OPENF1_GAP = 8.0, 2.2  # seconds between requests
UA = {"User-Agent": "outlap/1.0 (personal analytics)"}


class OutOfTime(Exception):
    pass


class LiveSessionLock(Exception):
    """OpenF1 refuses unauthenticated requests while any F1 session is live."""


DEADLINE = [float("inf")]
LAST = {}


def get(base, path, gap, **params):
    """GET JSON with spacing between calls and backoff on rate limits and server errors.
    Returns None for 404."""
    url = f"{base}/{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    for i in range(6):
        if time.time() > DEADLINE[0]:
            raise OutOfTime()
        wait = LAST.get(base, 0) + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        LAST[base] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 401 and base == OPENF1:
                raise LiveSessionLock("OpenF1 is locked while a session is live")
            if e.code == 429 or e.code >= 500:
                time.sleep(min(300, 30 * 2 ** i)); continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"gave up on {url}")


def secs(s):
    if not s:
        return None
    p = str(s).split(":")
    try:
        return round(float(p[0]) * 60 + float(p[1]), 3) if len(p) == 2 else round(float(p[0]), 3)
    except ValueError:
        return None


def load(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


# ---------- Jolpica: lap times, positions, pit stops ----------

def jolpica_laps(year, rnd):
    """{driverId: {lap: (seconds, position)}} across every page of the laps endpoint."""
    out, offset = {}, 0
    while True:
        d = get(JOLPICA, f"{year}/{rnd}/laps.json", JOLPICA_GAP, limit=100, offset=offset)
        if not d:
            return out
        d = d["MRData"]
        for race in d["RaceTable"]["Races"]:
            for lap in race.get("Laps", []):
                n = int(lap["number"])
                for t in lap.get("Timings", []):
                    out.setdefault(t["driverId"], {})[n] = (secs(t.get("time")), int(t["position"]) if t.get("position") else None)
        offset += 100
        if offset >= int(d["total"]):
            return out


def jolpica_pits(year, rnd):
    stops, offset = {}, 0
    while True:
        d = get(JOLPICA, f"{year}/{rnd}/pitstops.json", JOLPICA_GAP, limit=100, offset=offset)
        if not d:
            return stops
        d = d["MRData"]
        for race in d["RaceTable"]["Races"]:
            for p in race.get("PitStops", []):
                stops.setdefault(p["driverId"], []).append([int(p["lap"]), secs(p.get("duration"))])
        offset += 100
        if offset >= int(d["total"]):
            return stops


def base_file(season, race):
    laps = jolpica_laps(season["year"], race["round"])
    if not laps:
        return None
    n = max(max(v) for v in laps.values())
    winner_laps = race["results"][0].get("laps") if race["results"] else None
    if winner_laps and n < winner_laps:
        print(f"    only {n} of {winner_laps} laps published so far, retrying next run")
        return None
    pits = jolpica_pits(season["year"], race["round"])
    drivers = {}
    for did, by_lap in laps.items():
        last = max(by_lap)
        drivers[did] = {
            "t": [by_lap.get(i, (None, None))[0] for i in range(1, last + 1)],
            "p": [by_lap.get(i, (None, None))[1] for i in range(1, last + 1)],
            "pit": sorted(pits.get(did, [])),
        }
    return {"year": season["year"], "round": race["round"], "laps": n, "drivers": drivers, "src": ["Jolpica"]}


# ---------- OpenF1: stints, sectors, speed traps, Safety Car periods ----------

SESSIONS = {}


def openf1_session(year, race):
    if year not in SESSIONS:
        SESSIONS[year] = get(OPENF1, "sessions", OPENF1_GAP, year=year, session_name="Race") or []
    day = dt.date.fromisoformat(race["date"])
    for s in SESSIONS[year]:
        if not s.get("is_cancelled") and abs((dt.date.fromisoformat(s["date_start"][:10]) - day).days) <= 1:
            return s
    return None


FLAG_RULES = [  # (pattern, kind, opens?)
    (re.compile(r"^VIRTUAL SAFETY CAR DEPLOYED"), "VSC", True),
    (re.compile(r"^VIRTUAL SAFETY CAR ENDING"), "VSC", False),
    (re.compile(r"^SAFETY CAR DEPLOYED"), "SC", True),
    (re.compile(r"^SAFETY CAR IN THIS LAP"), "SC", False),
]


def flag_periods(msgs, last_lap):
    """Race-control messages -> [[kind, firstLap, lastLap], ...]."""
    out, open_ = [], {}
    for m in sorted(msgs, key=lambda m: m.get("date") or ""):
        lap, text = m.get("lap_number"), (m.get("message") or "").upper()
        if not lap:
            continue
        if m.get("flag") == "RED" and m.get("category") == "Flag":
            out.append(["RED", lap, lap]); continue
        for pat, kind, opens in FLAG_RULES:
            if pat.match(text):
                if opens:
                    open_.setdefault(kind, lap)
                elif kind in open_:
                    out.append([kind, open_.pop(kind), lap])
                break
    out += [[k, v, last_lap] for k, v in open_.items()]  # still out when the race ended
    return sorted(out, key=lambda x: x[1])


def add_openf1(season, race, data):
    s = openf1_session(season["year"], race)
    if not s:
        data["of1"] = "none"
        return
    key = s["session_key"]
    info = get(OPENF1, "drivers", OPENF1_GAP, session_key=key) or []
    by_code = {d.get("code"): did for did, d in season["drivers"].items()}
    by_last = {(d.get("last") or "").lower(): did for did, d in season["drivers"].items()}
    num = {}
    for d in info:
        did = by_code.get(d.get("name_acronym")) or by_last.get((d.get("last_name") or "").lower())
        if did:
            num[d["driver_number"]] = did
    stints = get(OPENF1, "stints", OPENF1_GAP, session_key=key) or []
    laps = get(OPENF1, "laps", OPENF1_GAP, session_key=key) or []
    rc = get(OPENF1, "race_control", OPENF1_GAP, session_key=key) or []
    D = data["drivers"]
    for st in sorted(stints, key=lambda x: (x.get("driver_number"), x.get("stint_number") or 0)):
        did = num.get(st.get("driver_number"))
        if did not in D or not st.get("lap_start"):
            continue
        end = st.get("lap_end") or len(D[did]["t"])
        D[did].setdefault("st", []).append([(st.get("compound") or "UNKNOWN").upper(), st["lap_start"], end, st.get("tyre_age_at_start") or 0])
    for lp in laps:
        did, n = num.get(lp.get("driver_number")), lp.get("lap_number")
        if did not in D or not n or n > len(D[did]["t"]):
            continue
        dd = D[did]
        if "sec" not in dd:
            dd["sec"] = [[None] * len(dd["t"]) for _ in range(3)]
            dd["trap"] = [None] * len(dd["t"])
        for k in range(3):
            v = lp.get(f"duration_sector_{k + 1}")
            dd["sec"][k][n - 1] = round(v, 3) if v else None
        dd["trap"][n - 1] = lp.get("st_speed")
    data["flags"] = flag_periods(rc, data["laps"])
    data["of1"] = "ok"
    if "OpenF1" not in data["src"]:
        data["src"].append("OpenF1")


# ---------- main ----------

def build_index():
    idx = {}
    for name in sorted(os.listdir(LAPS)) if os.path.isdir(LAPS) else []:
        m = re.match(r"^(\d{4}_\d{2})\.json$", name)
        if not m:
            continue
        d = load(os.path.join(LAPS, name), {})
        if d.get("drivers"):
            idx[m.group(1)] = {"laps": d["laps"], "tyres": any("st" in v for v in d["drivers"].values()),
                               "flags": "flags" in d}
    write(os.path.join(LAPS, "index.json"), idx)
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=90)
    ap.add_argument("--race", help="YEAR:ROUND to rebuild one race")
    ap.add_argument("--refresh-openf1", action="store_true")
    a = ap.parse_args()
    DEADLINE[0] = time.time() + a.minutes * 60
    meta = load(os.path.join(OUT, "meta.json"), {})
    years = sorted(meta.get("seasons", []), reverse=True)
    todo = []
    for y in years:
        season = load(os.path.join(OUT, f"season_{y}.json"))
        if not season:
            continue
        for race in reversed(season["races"]):
            if not race["results"]:
                continue
            path = os.path.join(LAPS, f"{y}_{race['round']:02d}.json")
            if a.race:
                if a.race == f"{y}:{race['round']}":
                    todo.append((season, race, path, None))
                continue
            have = load(path)
            if have is None:
                todo.append((season, race, path, None))
            elif y >= OPENF1_FROM and (have.get("of1") is None or (a.refresh_openf1 and have.get("of1") != "ok")):
                todo.append((season, race, path, have))
    print(f"{len(todo)} race(s) to do")
    done = 0
    openf1_ok = True
    try:
        for season, race, path, have in todo:
            label = f"{season['year']} R{race['round']} {race['name']}"
            data = have
            if data is None:
                print(f"  {label}: laps")
                data = base_file(season, race)
                if not data:
                    continue
            if season["year"] >= OPENF1_FROM and openf1_ok and data.get("of1") != "ok":
                try:
                    print(f"  {label}: tyres, sectors, race control")
                    add_openf1(season, race, data)
                except LiveSessionLock as e:
                    print(f"  {e}; tyres and sectors wait for the next run")
                    openf1_ok = False
                except OutOfTime:
                    raise
                except Exception as e:  # noqa: BLE001 - keep the Jolpica part
                    print(f"  OpenF1 failed for {label}: {e}")
            write(path, data)
            done += 1
    except OutOfTime:
        print("Time budget used up; the next run carries on.")
    idx = build_index()
    print(f"Wrote {done} race(s); {len(idx)} races have lap-by-lap data.")


if __name__ == "__main__":
    sys.exit(main())
