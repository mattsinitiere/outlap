"""Bundles web/ and web/data into one self-contained HTML file for a quick preview.

Freely licensed photos (Wikimedia Commons) are embedded so the preview can show them.
Official headshots and team logos are not embedded; the preview shows the
fallbacks and the deployed app loads the originals.
"""
import base64, io, json, os, sys, time
import requests
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
out = sys.argv[1] if len(sys.argv) > 1 else "outlap-preview.html"
html = open(os.path.join(ROOT, "index.html")).read()
data = {}
for base, _, files in os.walk(os.path.join(ROOT, "data")):
    for f in files:
        if f.endswith(".json"):
            p = os.path.join(base, f)
            data[os.path.relpath(p, os.path.join(ROOT, "data")).replace(os.sep, "/")] = json.load(open(p))

S = requests.Session(); S.headers["User-Agent"] = "outlap/1.0 (personal analytics)"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".preview-cache")
os.makedirs(CACHE, exist_ok=True)
def embed(url, width):
    import hashlib
    key = os.path.join(CACHE, hashlib.sha1(f"{url}|{width}".encode()).hexdigest())
    if os.path.exists(key):
        return open(key).read()
    v = _embed(url, width)
    if v:
        open(key, "w").write(v)
    return v
def _embed(url, width):
    for i in range(4):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 429: time.sleep(4 * (i + 1)); continue
            r.raise_for_status()
            im = Image.open(io.BytesIO(r.content)).convert("RGB")
            if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=72, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            time.sleep(1)
    return None
media = data.get("media.json", {})
images = {}
for d in media.get("drivers", {}).values():
    if d.get("img") and d["img"] not in images: images[d["img"]] = embed(d["img"], 320)
for yr in media.get("cars", {}).values():
    for c in yr.values():
        if c.get("img") and c["img"] not in images: images[c["img"]] = embed(c["img"], 720)
circuits = data.get("circuits.json", {})
for c in circuits.values():
    for ph in (c.get("photos") or [])[:2]:
        if ph.get("img") and ph["img"] not in images: images[ph["img"]] = embed(ph["img"], 520)
for d in media.get("drivers", {}).values():
    for ph in (d.get("gallery") or [])[:1]:
        if ph.get("img") and ph["img"] not in images: images[ph["img"]] = embed(ph["img"], 440)
for code in "us ar au at be br gb ca cn dk nl fi fr de in it jp mx mc nz pl ru es se ch th".split():
    url = f"https://flagcdn.com/h40/{code}.png"
    try:
        r = S.get(url, timeout=30); r.raise_for_status()
        images[url] = "data:image/png;base64," + base64.b64encode(r.content).decode()
    except Exception:
        pass
images = {k: v for k, v in images.items() if v}
print("embedded images:", len(images))

icon = base64.b64encode(open(os.path.join(ROOT, "icons", "favicon.svg"), "rb").read()).decode()
html = html.replace('<base href="/">\n', "")  # the preview is a file:// page and keeps hash routing
html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
html = html.replace('<link rel="apple-touch-icon" href="icons/icon-180.png">\n', "")
html = html.replace('href="icons/favicon.svg"', f'href="data:image/svg+xml;base64,{icon}"')
html = html.replace('<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">\n', "")
html = html.replace('<meta property="og:image" content="icons/social-card.png">\n', "")
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + open(os.path.join(ROOT, "styles.css")).read() + "\n</style>")
js = lambda o: json.dumps(o, separators=(",", ":")).replace("</", "<\\/")
html = html.replace('<script src="app.js"></script>',
                    f"<script>window.__DATA__={js(data)};window.__IMAGES__={js(images)};</script>\n<script>\n" + open(os.path.join(ROOT, "app.js")).read() + "\n</script>")
for name in os.listdir(os.path.join(ROOT, "brand")):
    if name.endswith(".svg"):
        uri = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(ROOT, "brand", name), "rb").read()).decode()
        html = html.replace(f"brand/{name}", uri)
open(out, "w").write(html)
print(out, round(os.path.getsize(out) / 1e6, 2), "MB")
