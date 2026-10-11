// App shell is cached for offline launch; data is network-first so new races show up.
const SHELL = "outlap-shell-v7", DATA = "outlap-data-v7";
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "brand/outlap-wordmark.svg", "brand/outlap-mark.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/data/")) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(DATA).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request)));
  } else if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(c => c.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
