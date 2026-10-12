"""Collects image links for drivers, team logos and cars into web/data/media.json.

  Driver photos: official headshots come from OpenF1 (2023 onward, stored in the
                 season files). Every driver also gets a freely licensed photo
                 from Wikipedia/Wikimedia Commons as a fallback, with credit.
  Team logos:    official logo files on formula1.com, 2019 onward, linked for
                 personal use. Teams without one show a team-colour badge.
  Car photos:    freely licensed photos from Wikimedia Commons, found through the
                 car's Wikipedia article (chassis names in ingest/cars.json).

Run after build_data.py:  python ingest/media.py
"""
import json, os, re, sys, time, urllib.parse

import requests

sys.path.insert(0, os.path.dirname(__file__))
from build_data import OUT, load, write  # noqa: E402

S = requests.Session()
S.headers["User-Agent"] = "outlap/1.0 (personal analytics; contact via GitHub)"
WIKI = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
LOGO = "https://media.formula1.com/content/dam/fom-website/teams/{y}/{slug}-logo.png.transform/2col/image.png"
CAR = "https://media.formula1.com/content/dam/fom-website/teams/{y}/{slug}.png.transform/4col/image.png"
HEADSHOT = "https://media.formula1.com/content/dam/fom-website/drivers/{i}/{ref}_{first}_{last}/{low}.png.transform/2col/image.png"
LOGO_SLUGS = {
    "red_bull": ["red-bull-racing"], "ferrari": ["ferrari"], "mercedes": ["mercedes"],
    "mclaren": ["mclaren"], "alpine": ["alpine"], "aston_martin": ["aston-martin"],
    "williams": ["williams"], "haas": ["haas", "haas-f1-team"], "sauber": ["kick-sauber"],
    "alfa": ["alfa-romeo", "alfa-romeo-racing"], "rb": ["racing-bulls", "rb"],
    "alphatauri": ["alphatauri"], "renault": ["renault"], "racing_point": ["racing-point"],
    "toro_rosso": ["toro-rosso"],
}
SKIP_TITLES = re.compile(r"season|Championship|Grand Prix|list of|in Formula One|F1 Team|Formula [234]", re.I)


def api(url, **params):
    """GET a MediaWiki API; backs off on rate limits and returns {} if it keeps failing (the caller skips that item)."""
    params.update(format="json", formatversion=2)
    for i in range(6):
        try:
            r = S.get(url, params=params, timeout=40)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(60, 5 * 2 ** i)); continue
            r.raise_for_status()
            time.sleep(0.5)
            return r.json()
        except (requests.RequestException, ValueError):
            time.sleep(min(60, 5 * 2 ** i))
    print(f"  gave up on {url} {params.get('srsearch') or params.get('titles', '')[:60]}")
    return {}


def title_from_url(u):
    return urllib.parse.unquote(u.rsplit("/wiki/", 1)[-1]).replace("_", " ") if u else None


def page_images(titles, size):
    """title -> (thumbnail url, file name) for free-licensed lead images."""
    out = {}
    for i in range(0, len(titles), 40):
        d = api(WIKI, action="query", prop="pageimages", piprop="thumbnail|name",
                pithumbsize=size, pilicense="free", redirects=1, titles="|".join(titles[i:i + 40]))
        q = d.get("query", {})
        alias = {r["to"]: r["from"] for r in q.get("redirects", []) + q.get("normalized", [])}
        for p in q.get("pages", []):
            if "thumbnail" in p:
                key = p["title"]
                while key in alias:
                    key = alias[key]
                out[key] = (p["thumbnail"]["source"], p.get("pageimage"))
    return out


def credits(files):
    """file name -> {credit, license, page} from Commons metadata."""
    out = {}
    files = [f for f in files if f]
    for i in range(0, len(files), 40):
        d = api(COMMONS, action="query", prop="imageinfo", iiprop="extmetadata|url",
                titles="|".join("File:" + f for f in files[i:i + 40]))
        for p in d.get("query", {}).get("pages", []):
            info = (p.get("imageinfo") or [{}])[0]
            m = info.get("extmetadata", {})
            artist = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip()
            out[p["title"].replace("File:", "").replace(" ", "_")] = dict(
                credit=artist[:120] or "Wikimedia Commons",
                license=m.get("LicenseShortName", {}).get("value", ""),
                page=info.get("descriptionurl"))
    return out


def search_title(query):
    d = api(WIKI, action="query", list="search", srsearch=query, srlimit=5)
    for r in d.get("query", {}).get("search", []):
        if not SKIP_TITLES.search(r["title"]):
            return r["title"]
    return None


def logo_for(cid, year):
    for y in [year] + [year + k for k in (1, -1, 2, -2)]:
        for slug in LOGO_SLUGS.get(cid, []):
            url = LOGO.format(y=y, slug=slug)
            try:
                if S.head(url, timeout=20).status_code == 200:
                    return url
            except requests.RequestException:
                pass
    return None


def ok(url):
    try:
        return S.head(url, timeout=20).status_code == 200
    except requests.RequestException:
        return False


def fold(t):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFKD", t) if not unicodedata.combining(ch))


def official_headshot(d):
    """formula1.com headshot for any driver, current or retired (personal use)."""
    first, last = d.get("first") or "", d.get("last") or ""
    tries = [(first, last), (first.split(" ")[0], last), (last, first)]
    for f, l in tries:
        a, b = fold(f).replace(" ", "")[:3].upper(), fold(l).replace(" ", "").replace("'", "")[:3].upper()
        ref = f"{a}{b}01"
        url = HEADSHOT.format(i=a[:1], ref=ref, first=urllib.parse.quote(f), last=urllib.parse.quote(l), low=ref.lower())
        if ok(url):
            return url
    return None


def commons_gallery(query, n=6):
    d = api(COMMONS, action="query", generator="search", gsrnamespace=6, gsrsearch=f"{query} filetype:bitmap",
            gsrlimit=30, prop="imageinfo", iiprop="url|extmetadata|size|mime", iiurlwidth=1000)
    out = []
    for p in sorted(d.get("query", {}).get("pages", []), key=lambda p: p.get("index", 0)):
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") != "image/jpeg" or ii.get("width", 0) < 900:
            continue
        m = ii.get("extmetadata", {})
        artist = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip()
        out.append(dict(img=ii.get("thumburl"), page=ii.get("descriptionurl"), credit=artist[:120] or "Wikimedia Commons",
                        license=m.get("LicenseShortName", {}).get("value", "")))
        if len(out) >= n:
            break
    return out


def main():
    meta = load("meta.json", {"seasons": []})
    seasons = {y: load(f"season_{y}.json", None) for y in meta["seasons"]}
    media = load("media.json", {"drivers": {}, "cars": {}, "logos": {}})

    # Driver photos (Wikipedia/Commons fallback for everyone)
    drivers = {}
    for s in seasons.values():
        for did, d in s["drivers"].items():
            if d.get("wiki"):
                drivers[did] = title_from_url(d["wiki"])
    imgs = page_images(sorted(set(drivers.values())), 360)
    meta_for = credits([v[1] for v in imgs.values()])
    for did, title in drivers.items():
        if title in imgs:
            url, f = imgs[title]
            media["drivers"][did] = dict(img=url, **meta_for.get(f, {}))
    print(f"Driver photos: {len(media['drivers'])} of {len(drivers)}")

    # Team logos per season
    for y, s in seasons.items():
        for cid in s["constructors"]:
            url = logo_for(cid, int(y))
            if url:
                media["logos"].setdefault(cid, {})[str(y)] = url
    print(f"Team logos: {sum(len(v) for v in media['logos'].values())} team-seasons")

    # Car photos per team and season
    chassis = json.load(open(os.path.join(os.path.dirname(__file__), "cars.json")))
    wanted = {}
    for y, s in seasons.items():
        for cid, c in s["constructors"].items():
            name = chassis.get(str(y), {}).get(cid)
            title = search_title(name + " Formula One car") if name else \
                search_title(f"{c['name']} {y} Formula One car")
            if title:
                # a known chassis only counts as checked if the article is about that model
                model = re.sub(r"[^a-z0-9]", "", name.split()[-1].lower()) if name else ""
                sure = bool(name) and model in re.sub(r"[^a-z0-9]", "", title.lower())
                wanted[(str(y), cid)] = (name or title, title, sure)
    # A search hit already used by a known chassis is another season's car: drop it
    known_titles = {t for (_, t, k) in wanted.values() if k}
    wanted = {key: v for key, v in wanted.items() if v[2] or v[1] not in known_titles}
    imgs = page_images(sorted({t for _, t, _ in wanted.values()}), 900)
    meta_for = credits([v[1] for v in imgs.values()])
    previous, media["cars"] = media.get("cars", {}), {}
    for (y, cid), (name, title, known) in wanted.items():
        if title in imgs:
            url, f = imgs[title]
            media["cars"].setdefault(y, {})[cid] = dict(
                name=name, article=title, img=url, verified=known, **meta_for.get(f, {}))
    kept = 0  # a search or image lookup that failed this run (rate limits, timeouts) keeps last run's photo
    for y, row in previous.items():
        for cid, k in row.items():
            if k.get("img") and not media["cars"].get(y, {}).get(cid, {}).get("img"):
                media["cars"].setdefault(y, {})[cid] = {key: v for key, v in k.items() if key != "official"}; kept += 1
    print(f"Car photos: {sum(len(v) for v in media['cars'].values())} team-seasons ({kept} kept from the last run)")

    # Official car images per team and season (formula1.com, personal use)
    n_off = 0
    for y, s in seasons.items():
        for cid in s["constructors"]:
            for slug in LOGO_SLUGS.get(cid, []):
                u = CAR.format(y=y, slug=slug)
                if ok(u):
                    media["cars"].setdefault(str(y), {}).setdefault(cid, {})["official"] = u; n_off += 1; break
    print(f"Official car images: {n_off}")

    # Official headshots for every driver, and a photo gallery from Commons
    names = {}
    for s in seasons.values():
        for did, d in s["drivers"].items():
            names[did] = d
    for did, d in names.items():
        e = media["drivers"].setdefault(did, {})
        e["official"] = official_headshot(d)
        e["gallery"] = commons_gallery(f"{d['name']} Formula One")
    print(f"Official headshots: {sum(1 for d in media['drivers'].values() if d.get('official'))} of {len(names)}")
    write("media.json", media)


if __name__ == "__main__":
    main()
