"""Collects background information into web/data/info.json:

  drivers  Wikipedia summary (bio), plus birthplace and height from the infobox
  teams    Wikipedia summary, plus base, team principal, technical director,
           founder and first entry from the infobox, and team photos (garage,
           pit stops) from Wikimedia Commons
  cars     Wikipedia summary for each car, its spec sheet from the infobox
           (designer, engine, power, weight, transmission, tyres, debut and so on)
           and a photo gallery from Wikimedia Commons

Wikipedia text is CC BY-SA and linked in the app. Run after media.py:
  python ingest/wiki_info.py            (resumable; --force to refresh everything)
"""
import os, re, sys, urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from build_data import load, write  # noqa: E402
from circuits import WIKI, _clean, commons_photos, get, wiki_summary  # noqa: E402


def wikitext(title):
    d = get(WIKI, dict(action="parse", page=title, prop="wikitext", section=0, format="json", formatversion=2, redirects=1))
    return (d or {}).get("parse", {}).get("wikitext", "")


def fields(text, wanted):
    """wanted: {label: [infobox field names]} -> {label: cleaned value}"""
    lines = text.split("\n")
    out = {}
    for label, names in wanted.items():
        for n in names:
            hit = None
            for i, ln in enumerate(lines):
                m = re.match(r"\s*\|\s*" + re.escape(n) + r"\s*=(.*)$", ln, re.I)
                if m:
                    v = m.group(1); j = i + 1
                    while j < len(lines) and (v.count("{{") > v.count("}}") or not re.match(r"\s*(\||\}\})", lines[j])):
                        v += "\n" + lines[j]; j += 1
                    v = _clean(v.replace("<br>", ", ").replace("<br/>", ", ").replace("<br />", ", "))
                    if v and len(v) < 200 and "NNN" not in v and "{{" not in v:
                        hit = v; break
            if hit:
                out[label] = re.sub(r"\s*,\s*,", ",", hit).strip(" ,"); break
    return out


def title_of(url):
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ") if url else None


DRIVER_FIELDS = {"Born": ["birth_place", "birthplace"], "Height": ["height"]}
TEAM_FIELDS = {
    "Base": ["Base", "base"], "Team Principal": ["Principal", "Team principal(s)", "Team principal", "team_principal"],
    "Technical Director": ["Technical director", "Technical director(s)", "technical_director", "Chief technical officer", "Technical Director"],
    "Founded By": ["Founder(s)", "Founder", "founders"], "First Entry": ["First entry", "first_entry"],
    "Constructors' Titles": ["Constructors' Championships", "Constructors_Championships"],
    "Drivers' Titles": ["Drivers' Championships", "Drivers_Championships"],
}
CAR_FIELDS = {
    "Designer": ["Designer(s)", "Designer", "designers"], "Predecessor": ["Predecessor", "predecessor"], "Successor": ["Successor", "successor"],
    "Chassis": ["Chassis", "chassis"], "Engine": ["Engine name", "Engine", "engine"], "Power": ["Power", "power"],
    "Electric Motor": ["Electric motor", "electric_motor"], "Transmission": ["Transmission", "transmission"],
    "Weight": ["Weight", "weight"], "Fuel": ["Fuel", "fuel"], "Tyres": ["Tyres", "Tires", "tyres"],
    "Front Suspension": ["Suspension (front)", "front_suspension"], "Rear Suspension": ["Suspension (rear)", "rear_suspension"],
    "Debut": ["Debut", "debut"], "Races": ["Races", "races"], "Wins": ["Wins", "wins"], "Poles": ["Poles", "poles"],
    "Fastest Laps": ["Fastest laps", "F.Laps", "fastest_laps"],
}


def main():
    force = "--force" in sys.argv
    meta = load("meta.json", {"seasons": []})
    seasons = [load(f"season_{y}.json", None) for y in meta["seasons"]]
    media = load("media.json", {"cars": {}})
    info = load("info.json", {"drivers": {}, "teams": {}, "cars": {}})

    drivers, teams = {}, {}
    for s in seasons:
        drivers.update({k: v for k, v in s["drivers"].items()})
        teams.update({k: v for k, v in s["constructors"].items()})

    for did, d in drivers.items():
        if did in info["drivers"] and (not force or "--keep-drivers" in sys.argv):
            continue
        t = title_of(d.get("wiki"))
        if not t:
            continue
        summ = wiki_summary(t) or {}
        info["drivers"][did] = dict(bio=summ.get("text"), url=summ.get("url"), **fields(wikitext(t), DRIVER_FIELDS))
        print("driver", did)
    write("info.json", info)

    for cid, c in teams.items():
        if cid in info["teams"] and not force:
            continue
        t = title_of(c.get("wiki"))
        if not t:
            continue
        summ = wiki_summary(t) or {}
        info["teams"][cid] = dict(about=summ.get("text"), url=summ.get("url"), facts=fields(wikitext(t), TEAM_FIELDS))
        print("team", cid)
    write("info.json", info)

    # Team photos (garage, pit stops, the team at work) from Wikimedia Commons, once per team
    for cid, c in teams.items():
        entry = info["teams"].setdefault(cid, {})
        if entry.get("photos") is not None and not force:
            continue
        seen, photos = set(), []
        for q in (f"{c['name']} Formula One team garage", f"{c['name']} Formula One pit stop", f"{c['name']} Formula One team"):
            for ph in commons_photos(q, n=8, min_w=1000):
                if ph["page"] not in seen:
                    seen.add(ph["page"]); photos.append(ph)
        entry["photos"] = photos[:8]
        print("team photos", cid, len(entry["photos"]))
    write("info.json", info)

    for y, row in media.get("cars", {}).items():
        for cid, k in row.items():
            key = f"{y}/{cid}"
            if key in info["cars"] and not force:
                continue
            t = k.get("article")
            entry = {}
            if t:
                summ = wiki_summary(t) or {}
                entry = dict(about=summ.get("text"), url=summ.get("url"), specs=fields(wikitext(t), CAR_FIELDS))
            name = k.get("name") or t
            old = info["cars"].get(key, {}).get("gallery")
            entry["gallery"] = old if old is not None else (commons_photos(name, n=6, min_w=900) if name else [])
            info["cars"][key] = entry
            print("car", key)
        write("info.json", info)
    write("info.json", info)
    print("Done:", len(info["drivers"]), "drivers,", len(info["teams"]), "teams,", len(info["cars"]), "cars")


if __name__ == "__main__":
    main()
