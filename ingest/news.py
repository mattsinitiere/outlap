"""Collects F1 news, videos and social posts into web/data/news.json and news_archive.json.

  Sources (ingest/news_sources.json, edit freely):
    feeds    RSS/Atom feeds from news sites (headline, summary, image, link)
    google   Google News searches: "Formula 1" plus every current driver and team,
             so each of them gets their own stream of articles
    youtube  F1 and team channels (videos)
    bluesky  public posts from listed accounts (public API, no key)
    reddit   subreddit posts

Only headlines, a short summary, a thumbnail link and the article link are kept;
the app links out to read the full story. Items are tagged with the current
season's drivers and teams they mention. The archive keeps 30 days (up to 2,000
items); news.json holds the newest 150 for the home page.

Standard library only, so the 3-hourly workflow can run it without installing anything.

  python ingest/news.py
"""
import datetime as dt, email.utils, hashlib, html, json, os, re, sys, time, unicodedata
import urllib.parse, urllib.request
import xml.etree.ElementTree as ET

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "data")
SOURCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news_sources.json")
UA = "Mozilla/5.0 (compatible; outlap/1.0; personal F1 news reader)"
KEEP_DAYS, KEEP_MAX, LATEST = 30, 2000, 150
NS = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/",
      "content": "http://purl.org/rss/1.0/modules/content/", "yt": "http://www.youtube.com/xml/schemas/2015"}
TEAM_WORDS = {
    "mercedes": ["Mercedes"], "ferrari": ["Ferrari"], "red_bull": ["Red Bull Racing", "Red Bull"], "mclaren": ["McLaren"],
    "aston_martin": ["Aston Martin"], "alpine": ["Alpine"], "williams": ["Williams"], "haas": ["Haas"],
    "rb": ["Racing Bulls", "VCARB"], "audi": ["Audi", "Sauber"], "cadillac": ["Cadillac"],
    "sauber": ["Sauber", "Kick Sauber"], "alphatauri": ["AlphaTauri"], "alfa": ["Alfa Romeo"],
}


# ---------- fetching ----------

def fetch(url, accept="*/*", limit=6_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(limit)


def safe_url(u):
    u = (u or "").strip()
    return u if re.match(r"^https?://", u, re.I) else None


def text(s, n=None):
    """Plain text from an HTML fragment, whitespace collapsed, optionally cut to n chars on a word."""
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    if n and len(s) > n:
        s = s[:n].rsplit(" ", 1)[0].rstrip(",.;:–-") + "…"
    return s


def when(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def first_img(fragment):
    m = re.search(r"<img[^>]+src=[\"']([^\"']+)", fragment or "", re.I)
    return safe_url(html.unescape(m.group(1))) if m else None


def item(title, url, source, kind, date, summary="", img=None, teams=(), drivers=()):
    url, title = safe_url(url), text(title)
    if not url or not title or not date:
        return None
    return dict(id=hashlib.sha1(url.encode()).hexdigest()[:12], t=title[:220], u=url, s=source, k=kind, d=date,
                x=text(summary, 240), img=safe_url(img), tm=list(teams), dr=list(drivers))


# ---------- parsers ----------

def parse_feed(raw, source, kind="article", teams=()):
    """RSS 2.0 or Atom -> items."""
    root = ET.fromstring(raw)
    out = []
    for it in root.iter("item"):  # RSS
        g = lambda tag: (it.findtext(tag) or "")
        desc = g("description") or ""
        enc = it.find("content:encoded", NS)
        body = enc.text if enc is not None and enc.text else desc
        img = None
        for tag in ("media:content", "media:thumbnail"):
            for m in it.findall(tag, NS):
                if m.get("url") and (m.get("medium") in (None, "image") or tag == "media:thumbnail"):
                    img = m.get("url"); break
            if img:
                break
        e = it.find("enclosure")
        if not img and e is not None and (e.get("type") or "").startswith("image"):
            img = e.get("url")
        src = g("source").strip() or source
        out.append(item(g("title"), g("link"), src, kind, when(g("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date")),
                        desc, img or first_img(body), teams))
    for en in root.iter("{http://www.w3.org/2005/Atom}entry"):  # Atom (YouTube, Reddit, some sites)
        link = next((l.get("href") for l in en.findall("atom:link", NS) if l.get("rel") in (None, "alternate")), None)
        grp = en.find("media:group", NS)
        img = None
        if grp is not None:
            th = grp.find("media:thumbnail", NS); img = th.get("url") if th is not None else None
        body = en.findtext("atom:content", "", NS) or en.findtext("atom:summary", "", NS)
        if grp is not None and not body:
            body = grp.findtext("media:description", "", NS)
        out.append(item(en.findtext("atom:title", "", NS), link, source, kind,
                        when(en.findtext("atom:published", "", NS) or en.findtext("atom:updated", "", NS)),
                        body, img or first_img(en.findtext("atom:content", "", NS)), teams))
    return [i for i in out if i]


def google_news(query, source_tag, drivers=(), teams=()):
    q = urllib.parse.quote(f"{query} when:7d")
    raw = fetch(f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en")
    items = parse_feed(raw, "Google News", "article", teams)
    for i in items:
        # Google appends " - Publisher" to every headline; the publisher is also in <source>
        if i["s"] != "Google News" and i["t"].endswith(" - " + i["s"]):
            i["t"] = i["t"][: -len(i["s"]) - 3]
        i["x"] = ""  # Google's summary just repeats the headline
        i["dr"] = list(drivers)
        i["via"] = source_tag
    return items


def youtube_channel(handle, cache):
    if handle in cache:
        return cache[handle]
    page = fetch(f"https://www.youtube.com/{urllib.parse.quote(handle, safe='@')}").decode("utf-8", "replace")
    m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', page) or \
        re.search(r'"(?:externalId|channelId)":"(UC[\w-]{22})"', page)
    if not m:
        raise ValueError("channel id not found")
    cache[handle] = m.group(1)
    return cache[handle]


def bluesky(handle, name, teams=()):
    d = json.loads(fetch("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?" +
                         urllib.parse.urlencode({"actor": handle, "limit": 30, "filter": "posts_no_replies"}), "application/json"))
    out = []
    for f in d.get("feed", []):
        p = f.get("post", {}); rec = p.get("record", {})
        rkey = (p.get("uri") or "").rsplit("/", 1)[-1]
        imgs = (p.get("embed") or {}).get("images") or []
        body = rec.get("text", "")
        out.append(item(body[:120], f"https://bsky.app/profile/{handle}/post/{rkey}", name, "social", when(rec.get("createdAt")),
                        body, imgs[0].get("thumb") if imgs else None, teams))
    return [i for i in out if i]


# ---------- tagging ----------

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def taggers():
    """Current season's drivers and teams -> (driver patterns, team patterns, google queries)."""
    try:
        meta = json.load(open(os.path.join(OUT, "meta.json")))
        s = json.load(open(os.path.join(OUT, f"season_{max(meta['seasons'])}.json")))
    except (OSError, ValueError, KeyError):
        return [], [], []
    dpat, tpat, queries = [], [], [("Formula 1", (), ())]
    for did, d in s["drivers"].items():
        last = fold(d.get("last") or "")
        full = fold(d.get("name") or "")
        if last:  # full name anywhere, or the capitalised surname as a whole word
            dpat.append((did, re.compile(rf"\b{re.escape(full)}\b|\b{re.escape(last)}\b")))
        queries.append((f'"{d["name"]}" F1', (did,), ()))
    for cid, c in s["constructors"].items():
        words = TEAM_WORDS.get(cid, [c["name"]])
        tpat.append((cid, re.compile(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b")))
        queries.append((f'"{words[0]}" F1', (), (cid,)))
    return dpat, tpat, queries


def tag(items, dpat, tpat):
    for i in items:
        hay = fold(f"{i['t']} {i['x']}")
        i["dr"] = sorted(set(i["dr"]) | {d for d, p in dpat if p.search(hay)})
        i["tm"] = sorted(set(i["tm"]) | {c for c, p in tpat if p.search(hay)})


# ---------- main ----------

def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", fold(t).lower()).strip()


def main():
    cfg = json.load(open(SOURCES))
    old = {}
    try:
        old = json.load(open(os.path.join(OUT, "news_archive.json")))
    except (OSError, ValueError):
        pass
    channels = old.get("channels", {})
    dpat, tpat, queries = taggers()
    fresh, report = [], []

    def run(label, fn):
        try:
            got = fn()
            fresh.extend(got); report.append((label, len(got), None))
        except Exception as e:  # noqa: BLE001 - one broken source must not stop the rest
            report.append((label, 0, str(e)[:120]))
        time.sleep(0.6)

    for f in cfg.get("feeds", []):
        run(f["name"], lambda f=f: parse_feed(fetch(f["url"], "application/rss+xml, application/xml, text/xml"), f["name"],
                                              "article", [f["team"]] if f.get("team") else []))
    if cfg.get("google", True):
        for q, drivers, teams in queries:
            run(f"Google News: {q}", lambda q=q, drivers=drivers, teams=teams: google_news(q, q, drivers, teams))
    for y in cfg.get("youtube", []):
        run(f"YouTube {y['handle']}", lambda y=y: parse_feed(
            fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={youtube_channel(y['handle'], channels)}"),
            y["name"], "video", [y["team"]] if y.get("team") else []))
    for b in cfg.get("bluesky", []):
        run(f"Bluesky {b['handle']}", lambda b=b: bluesky(b["handle"], b.get("name", b["handle"]), [b["team"]] if b.get("team") else []))
    for r in cfg.get("reddit", []):
        run(f"Reddit r/{r['sub']}", lambda r=r: parse_feed(fetch(f"https://www.reddit.com/r/{r['sub']}/top/.rss?t=day&limit=50"),
                                                           r.get("name", f"r/{r['sub']}"), "social"))

    tag(fresh, dpat, tpat)
    # merge: same link or same headline is one story; keep the richer copy and every tag
    by_id, by_title = {}, {}
    for i in old.get("items", []) + fresh:
        key = by_id.get(i["id"]) or by_title.get(norm_title(i["t"]))
        if key:
            k = key
            k["dr"] = sorted(set(k["dr"]) | set(i["dr"])); k["tm"] = sorted(set(k["tm"]) | set(i["tm"]))
            if not k.get("img") and i.get("img"):
                k["img"] = i["img"]
            if not k.get("x") and i.get("x"):
                k["x"] = i["x"]
            if k.get("via") and not i.get("via"):  # prefer the publisher's own link over Google's redirect
                k.update(u=i["u"], s=i["s"]); k.pop("via", None)
            continue
        by_id[i["id"]] = i; by_title[norm_title(i["t"])] = i
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    items = sorted((i for i in by_id.values() if cutoff <= i["d"] <= future), key=lambda i: i["d"], reverse=True)[:KEEP_MAX]
    for i in items:
        i.pop("via", None)

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sources = sorted({i["s"] for i in items})
    for label, n, err in report:
        print(f"  {'FAIL' if err else 'ok  '} {label}: {err or n}")
    ok = sum(1 for _, _, e in report if not e)
    print(f"{ok} of {len(report)} sources answered, {len(fresh)} items fetched, {len(items)} kept")
    if not fresh and not items:
        print("Nothing fetched; leaving existing files alone."); return
    def tmp(name, data):  # write then swap, so a cut-off run never leaves half a file
        path = os.path.join(OUT, name)
        with open(path + ".tmp", "w") as f:
            json.dump(data, f, separators=(",", ":"))
        os.replace(path + ".tmp", path)
    tmp("news_archive.json", dict(updated=now, channels=channels, sources=sources, items=items))
    tmp("news.json", dict(updated=now, total=len(items), sources=sources, items=items[:LATEST]))


if __name__ == "__main__":
    sys.exit(main())
