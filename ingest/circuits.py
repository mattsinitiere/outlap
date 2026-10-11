"""Builds web/data/circuits.json: for every circuit raced since 2018 —
track outline, official turn numbers and positions, elevation along the lap,
key facts, a description, and photos.

Sources
  MultiViewer circuit API   track outline in F1's timing coordinates, numbered corners,
                            rotation and pit-lane time loss (the same source FastF1 uses)
  f1-circuits GeoJSON       real-world outline in latitude/longitude (MIT licence,
                            github.com/bacinger/f1-circuits)
  Open-Meteo elevation      terrain height along the lap (Copernicus 90 m model), so
                            elevation is approximate and smoothed
  Wikipedia                 description (CC BY-SA, linked) and infobox facts
  Wikimedia Commons         photos with credits
  formula1.com              official circuit map image, linked for personal use

Run after build_data.py:  python ingest/circuits.py
"""
import json, math, os, re, sys, time, urllib.parse

import numpy as np
import requests

sys.path.insert(0, os.path.dirname(__file__))
from build_data import load, write  # noqa: E402

S = requests.Session()
S.headers["User-Agent"] = "outlap/1.0 (personal analytics)"
MV = "https://api.multiviewer.app/api/v1/circuits"
GEOJSON = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
F1MAP = "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/Circuit%20maps%2016x9/{n}_Circuit.png.transform/7col/image.png"

# Jolpica circuit id -> MultiViewer circuit key
MV_KEYS = {
    "silverstone": 2, "hungaroring": 4, "imola": 6, "spa": 7, "americas": 9, "albert_park": 10,
    "interlagos": 14, "catalunya": 15, "red_bull_ring": 19, "monaco": 22, "villeneuve": 23,
    "ricard": 28, "hockenheimring": 34, "monza": 39, "suzuka": 46, "shanghai": 49, "zandvoort": 55,
    "istanbul": 59, "marina_bay": 61, "bahrain": 63, "rodriguez": 65, "yas_marina": 70,
    "nurburgring": 72, "sochi": 79, "baku": 144, "mugello": 146, "portimao": 147, "jeddah": 149,
    "losail": 150, "miami": 151, "vegas": 152,
}
# formula1.com map image names to try, per circuit
F1MAP_NAMES = {
    "silverstone": ["Great_Britain"], "hungaroring": ["Hungary"], "imola": ["Emilia_Romagna"], "spa": ["Belgium"],
    "americas": ["USA"], "albert_park": ["Australia"], "interlagos": ["Brazil"], "catalunya": ["Spain"],
    "red_bull_ring": ["Austria"], "monaco": ["Monoco", "Monaco"], "villeneuve": ["Canada"], "ricard": ["France"],
    "hockenheimring": ["Germany"], "monza": ["Italy"], "suzuka": ["Japan"], "shanghai": ["China"],
    "zandvoort": ["Netherlands"], "istanbul": ["Turkey"], "marina_bay": ["Singapore"], "bahrain": ["Bahrain"],
    "rodriguez": ["Mexico"], "yas_marina": ["Abu_Dhabi", "Abu_Dhab"], "sochi": ["Russia"], "baku": ["Baku", "Azerbaijan"],
    "mugello": ["Tuscany"], "portimao": ["Portugal"], "jeddah": ["Saudi_Arabia"], "losail": ["Qatar"],
    "miami": ["Miami"], "vegas": ["Las_Vegas"], "nurburgring": ["Eifel"], "madring": ["Madrid", "Spain_Madrid"],
    "sepang": ["Malaysia"],
}


def get(url, params=None, kind="json", pause=0.4, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=40)
            if r.status_code == 429:
                time.sleep(5 * (i + 1)); continue
            if r.status_code == 404:
                return None
            r.raise_for_status()
            time.sleep(pause)
            return r.json() if kind == "json" else r.text
        except requests.RequestException:
            time.sleep(2 * (i + 1))
    return None


def resample(x, y, n):
    d = np.concatenate([[0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])
    t = np.linspace(0, d[-1], n)
    return np.interp(t, d, x), np.interp(t, d, y), d[-1]


def icp_align(src, dst):
    """Align src points (N,2) onto dst (M,2) with rotation, reflection, scale and shift.
    Returns transformed src and RMS error relative to dst size."""
    def norm(P):
        c = P.mean(0); s = np.sqrt(((P - c) ** 2).sum(1).mean()); return (P - c) / s, c, s
    A, _, _ = norm(src); B, cb, sb = norm(dst)
    best = (1e9, None)
    for refl in (1, -1):
        A0 = A * np.array([1, refl])
        for ang in np.radians(np.arange(0, 360, 15)):
            R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
            P = A0 @ R.T
            for _ in range(25):
                idx = ((P[:, None, :] - B[None, :, :]) ** 2).sum(2).argmin(1)
                Q = B[idx]
                pc, qc = P.mean(0), Q.mean(0)
                U, _, Vt = np.linalg.svd((P - pc).T @ (Q - qc))
                Rm = (U @ Vt).T
                if np.linalg.det(Rm) < 0:
                    Vt[-1] *= -1; Rm = (U @ Vt).T
                P = (P - pc) @ Rm.T + qc
            err = np.sqrt(((P[:, None, :] - B[None, :, :]) ** 2).sum(2).min(1).mean())
            if err < best[0]:
                best = (err, P)
    return best[1] * sb + cb, best[0]


def _clean(v):
    v = re.sub(r"<ref[^>]*/>", "", v)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<br\s*/?>", ", ", v)
    v = re.sub(r"<[^>]+>", " ", v).replace("&nbsp;", " ")
    v = re.sub(r"^\s*\*\s*", "", v, flags=re.M)
    for _ in range(6):  # innermost templates first
        def tpl(m):
            parts = [p.strip() for p in m.group(1).split("|")]
            name = parts[0].lower()
            if name in ("convert", "cvt", "cvt2"):
                return f"{parts[1]} {parts[2]}" if len(parts) > 2 else parts[1]
            if name.startswith("start date"):
                nums = [p for p in parts[1:] if p.isdigit()]
                return nums[0] if nums else ""
            if name in ("ubl", "unbulleted list", "plainlist", "hlist", "flatlist", "ublist", "bulleted list"):
                return ", ".join(p for p in parts[1:] if p and "=" not in p)
            if name in ("nowrap", "small", "abbr"):
                return parts[1] if len(parts) > 1 else ""
            if name in ("racing lap record", "lap record"):
                return parts[1] if len(parts) > 1 else ""
            return ""
        v2 = re.sub(r"\{\{([^{}]*)\}\}", tpl, v)
        if v2 == v:
            break
        v = v2
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", v)
    v = re.sub(r"'{2,}", "", v)
    v = re.sub(r"-{2,}", " ", v)
    v = re.sub(r"\s+", " ", v).strip(" ,;")
    if v.count("(") > v.count(")"):
        v += ")"
    v = re.sub(r"^\)|\(\s*\)", "", v).strip()
    return v or None


def wiki_infobox(title):
    d = get(WIKI, dict(action="parse", page=title, prop="wikitext", section=0, format="json", formatversion=2, redirects=1))
    text = (d or {}).get("parse", {}).get("wikitext", "")
    lines = text.split("\n")

    def field(*names):
        for n in names:
            for i, ln in enumerate(lines):
                m = re.match(r"\s*\|\s*" + n + r"\s*=(.*)$", ln, re.I)
                if m:
                    v = m.group(1)
                    j = i + 1
                    while j < len(lines) and not re.match(r"\s*(\||\}\})", lines[j]):
                        v += " " + lines[j]; j += 1
                    v = _clean(v)
                    if v:
                        return v
        return None
    def layout(suffix):
        f = lambda n: field(n + suffix)
        return {"length_km": f("Length_km"), "turns": f("Turns"), "lap_record": f("Race_lap_record") or f("Record_time"),
                "record_driver": f("Record_driver"), "record_team": f("Record_team"), "record_year": f("Record_year"),
                "layout": f("Layout") if suffix else field("Layout")}
    layouts = [layout(sfx) for sfx in ["", "2", "3", "4", "5", "6"]]
    layouts = [l for l in layouts if l["length_km"]]

    def pick(target_m):
        def num(v):
            m = re.search(r"\d+(\.\d+)?", v or ""); return float(m.group()) if m else None
        if not layouts:
            return {}
        if not target_m:
            return layouts[0]
        return min(layouts, key=lambda l: abs((num(l["length_km"]) or 0) * 1000 - target_m))
    return {
        "_pick": pick,
        "opened": field("opened", "Opened"),
        "capacity": field("capacity", "Capacity"),
        "architect": field("architect", "Architect"),
    }


def wiki_summary(title):
    d = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_")))
    if not d:
        return None
    return dict(text=d.get("extract"), url=d.get("content_urls", {}).get("desktop", {}).get("page"),
                image=(d.get("originalimage") or d.get("thumbnail") or {}).get("source"))


def commons_photos(query, n=8, min_w=1000):
    d = get(COMMONS, dict(action="query", format="json", formatversion=2, generator="search", gsrnamespace=6,
                          gsrsearch=f"{query} filetype:bitmap", gsrlimit=30, prop="imageinfo",
                          iiprop="url|extmetadata|size|mime", iiurlwidth=1200))
    out = []
    for p in sorted((d or {}).get("query", {}).get("pages", []), key=lambda p: p.get("index", 0)):
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") != "image/jpeg" or ii.get("width", 0) < min_w:
            continue
        m = ii.get("extmetadata", {})
        artist = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip()
        out.append(dict(img=ii.get("thumburl"), page=ii.get("descriptionurl"), credit=artist[:120] or "Wikimedia Commons",
                        license=m.get("LicenseShortName", {}).get("value", ""),
                        title=re.sub(r"\.\w+$", "", p["title"].replace("File:", ""))[:90]))
        if len(out) >= n:
            break
    return out


def main():
    meta = load("meta.json", {"seasons": []})
    seasons = [load(f"season_{y}.json", None) for y in meta["seasons"]]
    raced = {}
    for s in seasons:
        for r in s["races"]:
            raced.setdefault(r["circuit"], dict(name=r["circuitName"], locality=r["locality"], country=r["country"], years=set()))
            if r["results"] or True:
                raced[r["circuit"]]["years"].add(s["year"])
    jol = {c["circuitId"]: c for c in (get("https://api.jolpi.ca/ergast/f1/circuits.json", {"limit": 100}) or {})
           .get("MRData", {}).get("CircuitTable", {}).get("Circuits", [])}
    geo = (get(GEOJSON) or {}).get("features", [])
    out = load("circuits.json", {})

    force = "--force" in sys.argv
    for cid, info in sorted(raced.items()):
        if not force and out.get(cid, {}).get("photos") is not None:
            continue  # already done; makes runs resumable
        print(cid)
        j = jol.get(cid, {})
        lat, lon = float(j.get("Location", {}).get("lat", 0)), float(j.get("Location", {}).get("long", 0))
        c = dict(id=cid, name=info["name"], locality=info["locality"], country=info["country"],
                 lat=lat, lon=lon, years=sorted(info["years"]), wiki=j.get("url"))

        # Real-world outline (lat/lon) nearest to the circuit's location
        g = None
        for f in geo:
            co = np.array(f["geometry"]["coordinates"])
            if co.ndim == 2 and math.hypot(co[:, 1].mean() - lat, (co[:, 0].mean() - lon) * math.cos(math.radians(lat))) < 0.06:
                g = f; break
        if g:
            co = np.array(g["geometry"]["coordinates"])
            c["opened"] = g["properties"].get("opened"); c["firstGp"] = g["properties"].get("firstgp")
            c["lengthM"] = g["properties"].get("length"); c["altitude"] = g["properties"].get("altitude")

        # Official outline + numbered corners
        mv = None
        key = MV_KEYS.get(cid)
        if key:
            for y in sorted(info["years"], reverse=True) + [2023, 2022, 2021]:
                mv = get(f"{MV}/{key}/{y}")
                if mv and mv.get("x"):
                    break
        if mv and mv.get("x"):
            x, y = np.array(mv["x"], float), np.array(mv["y"], float)
            c["source"] = "official"
            c["rotation"] = mv.get("rotation", 0)
            c["pitLoss"] = (mv.get("pitLoss") or {}).get("normal")
            c["corners"] = [dict(n=k["number"], l=k.get("letter") or "", x=round(k["trackPosition"]["x"]), y=round(k["trackPosition"]["y"]),
                                 a=round(k.get("angle", 0)), d=round(k.get("length", 0) / 10)) for k in (mv.get("corners") or []) if k.get("trackPosition")]
        elif g:
            px = (co[:, 0] - lon) * 111320 * math.cos(math.radians(lat)) * 10
            py = (co[:, 1] - lat) * 110540 * 10
            x, y = px, py
            c["source"] = "geojson"; c["rotation"] = 0; c["corners"] = []
        else:
            out[cid] = c; continue
        # resample outline to 400 points (units: decimetres, F1 style)
        xs, ys, total = resample(x, y, 400)
        c["x"] = np.round(xs).astype(int).tolist(); c["y"] = np.round(ys).astype(int).tolist()
        c["pathLen"] = round(total / 10)
        area = 0.5 * np.sum(xs[:-1] * ys[1:] - xs[1:] * ys[:-1])
        c["direction"] = "anticlockwise" if area > 0 else "clockwise"

        # Elevation: align the lat/lon outline onto this outline, then sample terrain
        if g:
            gx = (co[:, 0] - lon) * 111320 * math.cos(math.radians(lat))
            gy = (co[:, 1] - lat) * 110540
            rgx, rgy, _ = resample(gx, gy, 200)
            src = np.stack([np.array(c["x"], float)[::2], np.array(c["y"], float)[::2]], 1)
            aligned, err = icp_align(src, np.stack([rgx, rgy], 1))
            if err < 0.08:
                pts_lon = lon + aligned[:, 0] / (111320 * math.cos(math.radians(lat)))
                pts_lat = lat + aligned[:, 1] / 110540
                elev = []
                for i in range(0, len(pts_lat), 100):
                    e = get("https://api.open-meteo.com/v1/elevation", dict(
                        latitude=",".join(f"{v:.6f}" for v in pts_lat[i:i + 100]),
                        longitude=",".join(f"{v:.6f}" for v in pts_lon[i:i + 100])))
                    elev += (e or {}).get("elevation", [None] * len(pts_lat[i:i + 100]))
                if elev and None not in elev:
                    e = np.array(elev, float)
                    k = np.ones(5) / 5
                    e = np.convolve(np.pad(e, 2, mode="wrap"), k, mode="valid")
                    e = np.interp(np.arange(400) / 2, np.arange(len(e)), e)
                    c["elev"] = np.round(e, 1).tolist()
                    c["elevStats"] = dict(min=round(float(e.min()), 1), max=round(float(e.max()), 1),
                                          climb=round(float(np.clip(np.diff(e), 0, None).sum()), 1))
                c["alignErr"] = round(float(err), 3)

        # Facts and description from Wikipedia
        title = urllib.parse.unquote(c["wiki"].rsplit("/wiki/", 1)[-1]).replace("_", " ") if c.get("wiki") else c["name"]
        fx = wiki_infobox(title)
        pick = fx.pop("_pick")
        fx.update(pick(c.get("pathLen")))
        c["facts"] = fx
        c["about"] = wiki_summary(title)

        # Photos
        c["photos"] = commons_photos(c["name"]) or commons_photos(f"{c['locality']} Grand Prix circuit") or commons_photos(f"{c['locality']} Formula 1")
        for n in F1MAP_NAMES.get(cid, []):
            u = F1MAP.format(n=n)
            try:
                if S.head(u, timeout=20).status_code == 200:
                    c["officialMap"] = u; break
            except requests.RequestException:
                pass
        c["years"] = sorted(info["years"])
        out[cid] = c
        write("circuits.json", out)
    write("circuits.json", out)
    print("Circuits:", len(out))


if __name__ == "__main__":
    main()
