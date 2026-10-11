/* OutLap — personal race analytics. Plain JS, no build step. */
(() => {
  "use strict";

  // ===================================================================
  // Data
  // ===================================================================
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const inline = window.__DATA__ && window.__DATA__[path];
    const p = inline ? Promise.resolve(inline)
      : fetch(`data/${path}`).then(r => { if (!r.ok) throw new Error(`${path} (${r.status})`); return r.json(); });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
    return p;
  }
  const meta = () => load("meta.json");
  const season = y => load(`season_${y}.json`).then(s => (seasonSync[y] = s));
  const media = () => load("media.json").catch(() => ({ drivers: {}, cars: {}, logos: {} }));
  const telIndex = () => load("telemetry/index.json").catch(() => []).then(i => (telSync = i));
  const circuitsData = () => load("circuits.json").catch(() => ({}));
  const trendsData = () => load("trends.json").catch(() => ({}));
  const infoData = () => load("info.json").catch(() => ({ drivers: {}, teams: {}, cars: {} }));
  async function allSeasons() { const m = await meta(); return Promise.all(m.seasons.map(season)); }
  async function latestYear() { const m = await meta(); return Math.max(...m.seasons); }

  // ===================================================================
  // Settings and units (imperial by default)
  // ===================================================================
  const settings = (() => { try { return JSON.parse(localStorage.getItem("outlap-settings") || localStorage.getItem("apex-settings")) || {}; } catch { return {}; } })();
  settings.units = settings.units || "imperial";
  settings.motion = settings.motion || "full";
  const saveSettings = () => { try { localStorage.setItem("outlap-settings", JSON.stringify(settings)); } catch { /* private mode */ } };
  const imperial = () => settings.units === "imperial";
  const motionOK = () => settings.motion !== "reduced" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const applyMotion = () => document.documentElement.toggleAttribute("data-reduced", !motionOK());
  applyMotion();
  const U = {
    spd: kmh => (kmh == null ? null : imperial() ? kmh * 0.621371 : kmh),
    spdUnit: () => (imperial() ? "mph" : "km/h"),
    spdTxt: kmh => `${Math.round(U.spd(kmh))} ${U.spdUnit()}`,
    at: m => (imperial() ? `${(m / 1609.344).toFixed(2)} mi` : `${Math.round(m).toLocaleString()} m`),
    axis: m => (imperial() ? `${(m / 1609.344).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`),
    lapNum: km => (imperial() ? (km * 0.621371).toFixed(3) : km.toFixed(3)),
    lapUnit: () => (imperial() ? "mi" : "km"),
    h: m => (imperial() ? m * 3.28084 : m),
    hUnit: () => (imperial() ? "ft" : "m"),
    hTxt: m => `${Math.round(imperial() ? m * 3.28084 : m).toLocaleString()} ${imperial() ? "ft" : "m"}`,
  };

  // ===================================================================
  // Helpers
  // ===================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtLap = s => {
    if (s == null || isNaN(s)) return "–";
    const m = Math.floor(s / 60), r = s - m * 60;
    return m ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
  };
  const fmtPts = p => (p == null ? "–" : Number.isInteger(p) ? String(p) : p.toFixed(1));
  const signed = (v, d = 3) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
  const ordinal = p => (p ? `P${p}` : "–");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const shortDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const longDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const age = dob => { if (!dob) return null; const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, t, f) => { const a = hexRgb(h), b = hexRgb(t); return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, "0")).join(""); };
  const dark = h => mix(h, "#0B1020", 0.42);
  const tint = h => mix(h, "#FFFFFF", 0.82);
  function ramp(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(Math.floor(t), stops.length - 2), f = t - i;
    return mix(stops[i], stops[i + 1], f);
  }
  const count = (v, dec = 0) => `<b data-count="${v}" data-dec="${dec}">${Number(v).toFixed(dec)}</b>`;

  const TEAM = {
    mercedes: "#27B8A6", ferrari: "#E8002D", red_bull: "#3671C6", mclaren: "#FF8000", alpine: "#0093CC",
    renault: "#E8B400", aston_martin: "#229971", racing_point: "#F596C8", force_india: "#F596C8",
    williams: "#1868DB", haas: "#8C9196", alfa: "#C92D4B", sauber: "#2FBF5B", toro_rosso: "#469BFF",
    alphatauri: "#5E8FAA", rb: "#6692FF", audi: "#BB0A30", cadillac: "#7C8794",
  };
  const LINEAGE = {
    force_india: "aston_martin", racing_point: "aston_martin", aston_martin: "aston_martin",
    toro_rosso: "rb", alphatauri: "rb", rb: "rb", renault: "alpine", alpine: "alpine",
    sauber: "audi", alfa: "audi", audi: "audi",
  };
  const lineage = c => LINEAGE[c] || c;
  const teamColor = c => TEAM[c] || "#7C8794";
  const CORNERS = { monza: ["Rettifilo", "Roggia", "Lesmo 1", "Lesmo 2", "Ascari", "Parabolica"] };
  const teamOf = (s, did) => {
    for (let i = s.races.length - 1; i >= 0; i--) { const r = s.races[i].results.find(x => x.d === did); if (r) return r.c; }
    const st = s.driverStandings.find(x => x.d === did); return st ? st.c : null;
  };
  const lastName = (s, did) => s.drivers[did]?.last || s.drivers[did]?.code || did;

  // ===================================================================
  // Images: official headshots and logos (personal use), Commons photos as fallback
  // ===================================================================
  const preview = !!window.__DATA__;
  const src = url => { if (!url) return null; if (window.__IMAGES__) return window.__IMAGES__[url] || null; return url; };
  const bigHeadshot = u => (u ? u.replace(/\/[12]col\//, "/4col/") : u);
  window.outlapImgErr = el => {
    const alt = (el.dataset.alt || "").split("|").filter(Boolean);
    if (alt.length) { el.dataset.alt = alt.slice(1).join("|"); el.src = alt[0]; return; }
    el.parentElement && el.parentElement.classList.add("fallback");
    el.remove();
  };
  window.outlapImgIn = el => el.classList.add("in");
  document.addEventListener("load", e => { if (e.target.tagName === "IMG") e.target.classList.add("in"); }, true);
  const imgTag = (urls, alt = "", extra = "", eager = false) => {
    const list = urls.map(src).filter(Boolean);
    if (!list.length) return "";
    return `<img src="${esc(list[0])}" data-alt="${esc(list.slice(1).join("|"))}" alt="${esc(alt)}" ${eager ? "" : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" onload="outlapImgIn(this)" onerror="outlapImgErr(this)" ${extra}>`;
  };
  let M = { drivers: {}, cars: {}, logos: {} };
  let I = { drivers: {}, teams: {}, cars: {} };
  const tidy = v => String(v).replace(/\s*,\s*\(/g, " (").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  function photoUrls(did, s, big = false) {
    const code = s?.drivers?.[did]?.code;
    const off = s?.openf1?.[code]?.headshot || M.drivers[did]?.official;
    const wiki = M.drivers[did]?.img;
    return [big ? bigHeadshot(off) : null, off, wiki].filter(Boolean);
  }
  function logo(cid, year, s, size = 28) {
    const url = M.logos?.[cid]?.[year];
    const im = url ? imgTag([url], `${s?.constructors?.[cid]?.name || cid} logo`, "", true) : "";
    if (im) return `<span class="logo" style="width:${size}px;height:${size}px">${im}</span>`;
    const name = (s?.constructors?.[cid]?.name || cid).replace(/F1 Team|Racing|Team/g, "").trim();
    return `<span class="logo badge" style="width:${size}px;height:${size}px;background:${teamColor(cid)};font-size:${Math.round(size * .38)}px">${esc(name.slice(0, 3).toUpperCase())}</span>`;
  }
  const car = (year, cid) => { const k = M.cars?.[year]?.[cid]; if (!k) return null; if (!k.img && k.official) return { ...k, img: k.official, credit: null, verified: true }; return k.img ? k : null; };
  const creditLine = (m, prefix = "Photo", plain = false) => (m && m.credit ? `<span class="credit">${prefix}: ${m.page && !plain ? `<a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.credit)}</a>` : esc(m.credit)}${m.license ? `, ${esc(m.license)}` : ""}</span>` : "");
  const driverLink = (did, s, opts = {}) => {
    const d = s.drivers[did] || { name: did, code: did };
    return `<a class="who" href="#/driver/${did}?y=${s.year}"><span class="tick" style="background:${teamColor(teamOf(s, did))}"></span><b>${esc(d.name)}</b>${opts.code === false ? "" : `<span class="code">${esc(d.code)}</span>`}</a>`;
  };
  const teamLink = (cid, s, opts = {}) =>
    `<a class="who" href="#/team/${cid}?y=${s.year}">${logo(cid, s.year, s, opts.size || 26)}<b>${esc(s.constructors[cid]?.name || cid)}</b></a>`;
  // Flags: flag images from flagcdn.com (falls back to emoji where images can't load)
  const NAT = { American: "us", Argentine: "ar", Australian: "au", Austrian: "at", Belgian: "be", Brazilian: "br", British: "gb", Canadian: "ca", Chinese: "cn",
    Danish: "dk", Dutch: "nl", Finnish: "fi", French: "fr", German: "de", Indian: "in", Italian: "it", Japanese: "jp", Mexican: "mx", Monegasque: "mc",
    "New Zealander": "nz", Polish: "pl", Russian: "ru", Spanish: "es", Swedish: "se", Swiss: "ch", Thai: "th" };
  const COUNTRY = { us: "United States", ar: "Argentina", au: "Australia", at: "Austria", be: "Belgium", br: "Brazil", gb: "United Kingdom", ca: "Canada", cn: "China",
    dk: "Denmark", nl: "Netherlands", fi: "Finland", fr: "France", de: "Germany", in: "India", it: "Italy", jp: "Japan", mx: "Mexico", mc: "Monaco",
    nz: "New Zealand", pl: "Poland", ru: "Russia", es: "Spain", se: "Sweden", ch: "Switzerland", th: "Thailand" };
  function flag(nat, h = 18) {
    const c = NAT[nat]; if (!c) return esc(nat || "");
    const url = src(`https://flagcdn.com/h40/${c}.png`), name = COUNTRY[c];
    if (url) return `<img class="flag" src="${esc(url)}" alt="${esc(name)}" title="${esc(name)}" style="height:${h}px" onload="outlapImgIn(this)" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${c.toUpperCase()}'}))">`;
    const emoji = String.fromCodePoint(...[...c.toUpperCase()].map(ch => 127397 + ch.charCodeAt(0)));
    return `<span class="flag-emoji" role="img" aria-label="${esc(name)}" title="${esc(name)}" style="font-size:${h}px">${emoji}</span>`;
  }

  // OutLap Rating: our own 60–99 season score from results data (formula documented in AGENT.md)
  const ratingCache = new WeakMap();
  const isClassified = x => /Finished|Lap/.test(x.st);
  function seasonRatings(s) {
    if (ratingCache.has(s)) return ratingCache.get(s);
    const acc = {};
    const A = d => (acc[d] = acc[d] || { starts: 0, qW: 0, qN: 0, rW: 0, rN: 0, pct: 0, gain: [], fin: 0, pf: 0 });
    s.races.forEach(r => {
      const field = r.results.length; if (!field) return;
      r.results.forEach(x => {
        const a = A(x.d); a.starts++; a.pct += field > 1 ? 1 - (x.pos - 1) / (field - 1) : 1;
        if (isClassified(x)) { a.fin++; if (x.grid) a.gain.push(x.grid - x.pos); }
        if (x.pts > 0) a.pf++;
        r.results.filter(z => z.c === x.c && z.d !== x.d).forEach(z => { if (x.grid && z.grid) { a.qN++; if (x.grid < z.grid) a.qW++; } a.rN++; if (x.pos < z.pos) a.rW++; });
      });
    });
    const avgOf = a => (a.length ? a.reduce((p, v) => p + v, 0) / a.length : 0);
    const ids = Object.keys(acc).filter(d => acc[d].starts >= 5);
    const gains = ids.map(d => avgOf(acc[d].gain)).sort((a, b) => a - b);
    const pctl = v => (gains.length > 1 ? gains.filter(g => g < v).length / (gains.length - 1) : 0.5);
    const out = {};
    ids.forEach(d => {
      const a = acc[d];
      const c = { q: a.qN ? a.qW / a.qN : 0.5, r: a.rN ? a.rW / a.rN : 0.5, res: a.pct / a.starts, rc: pctl(avgOf(a.gain)), cons: 0.5 * (a.fin / a.starts) + 0.5 * (a.pf / a.starts) };
      out[d] = { ...c, raw: 0.25 * c.q + 0.25 * c.r + 0.2 * c.res + 0.15 * c.rc + 0.15 * c.cons, starts: a.starts };
    });
    const raws = ids.map(d => out[d].raw), lo = Math.min(...raws), hi = Math.max(...raws);
    ids.forEach(d => { out[d].rating = Math.round(60 + 39 * ((out[d].raw - lo) / (hi - lo || 1))); });
    ids.slice().sort((a, b) => out[b].raw - out[a].raw).forEach((d, i) => { out[d].rank = i + 1; out[d].of = ids.length; });
    ratingCache.set(s, out);
    return out;
  }
  const ratingTone = v => (v >= 90 ? ["#7A3FD1", "#fff"] : v >= 80 ? ["#1D9A5B", "#fff"] : v >= 70 ? ["#F2B01E", "#0F1218"] : ["#E3E6EB", "#0F1218"]);
  const rBadge = (v, cls = "") => { if (v == null) return ""; const [bg, fg] = ratingTone(v); return `<span class="rbadge ${cls}" style="background:${bg};color:${fg}" title="OutLap Rating">${v}</span>`; };
  const nth = n => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;

  function portrait(urls, alt, cls) {
    const a = imgTag(urls, alt, 'class="base"', true), b = imgTag(urls, "", 'class="dots" aria-hidden="true"', true);
    return a ? `<span class="ht ${cls}">${a}${b}</span>` : "";
  }

  // ===================================================================
  // Interactive charts (SVG drawn at the container's real width so text stays crisp)
  // ===================================================================
  function mountChart(el, cfg) {
    const H = cfg.height || 220, L = cfg.padL ?? 50, R = 12, T = 12, B = 26;
    el.classList.add("chart-wrap");
    el.innerHTML = `<svg role="img" aria-label="${esc(cfg.label || "Chart")}"></svg><div class="tip"></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
    const xs = cfg.xs, n = xs.length;
    const all = cfg.series.flatMap(s => s.values.filter(v => v != null && !isNaN(v)));
    let lo = cfg.yMin ?? Math.min(...all), hi = cfg.yMax ?? Math.max(...all);
    if (lo === hi) { lo -= 1; hi += 1; }
    if (cfg.minRange && hi - lo < cfg.minRange) { const mid = (hi + lo) / 2; lo = mid - cfg.minRange / 2; hi = mid + cfg.minRange / 2; }
    const pad = (hi - lo) * 0.06; if (cfg.yMin == null) lo -= pad; if (cfg.yMax == null) hi += pad;
    let W = 600, cursor = null, drawn = false;
    const X = x => L + ((x - xs[0]) / ((xs[n - 1] - xs[0]) || 1)) * (W - L - R);
    const Y = v => cfg.invert ? T + ((v - lo) / (hi - lo)) * (H - T - B) : T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    function draw() {
      W = Math.max(260, el.clientWidth || 600);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
      const yf = cfg.yFmt || (v => Math.round(v)), xf = cfg.xFmt || (v => v);
      let g = "";
      (cfg.bands || []).forEach(b => { g += `<rect x="${X(b.x0)}" y="${T}" width="${Math.max(1, X(b.x1) - X(b.x0))}" height="${H - T - B}" fill="${b.fill || "#F4F5F7"}"/>`; });
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4;
        g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#EEF0F3"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${esc(yf(v))}</text>`;
      }
      if (cfg.zero && lo < 0 && hi > 0) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#9AA0AC"/>`;
      let ticks = cfg.xTicks || [0, .25, .5, .75, 1].map(f => xs[0] + (xs[n - 1] - xs[0]) * f);
      if (W < 420 && ticks.length > 5) ticks = ticks.filter((_, k) => k % 2 === 0 || k === ticks.length - 1);
      ticks.forEach((x, k) => { g += `<text x="${X(x)}" y="${H - 7}" text-anchor="${k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"}">${esc(xf(x))}</text>`; });
      cfg.series.forEach(s => {
        let d = "", pen = false, first = null, last = null;
        s.values.forEach((v, i) => {
          if (v == null || isNaN(v)) { pen = false; return; }
          const px = X(xs[i]).toFixed(1), py = Y(v).toFixed(1);
          if (s.step && pen) d += `H${px}`;
          d += `${pen ? "L" : "M"}${px},${py}`; pen = true; if (first == null) first = px; last = px;
        });
        if (s.area && first != null) g += `<path class="ar" d="${d}L${last},${Y(cfg.yMin ?? lo)}L${first},${Y(cfg.yMin ?? lo)}Z" fill="${s.color}" fill-opacity="${s.area}"/>`;
        g += `<path class="ln${s.dash ? " dash" : ""}" d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 4"' : ""}/>`;
        if (cfg.dots) s.values.forEach((v, i) => { if (v != null) g += `<circle class="dt" cx="${X(xs[i])}" cy="${Y(v)}" r="4" fill="#fff" stroke="${s.color}" stroke-width="2.2"/>`; });
      });
      g += `<g class="cur"></g>`;
      svg.innerHTML = g;
      if (!drawn && cfg.animate && motionOK()) intro();
      drawn = true;
      if (cursor != null) guide(cursor);
    }
    function intro() {
      $$(".ln:not(.dash)", svg).forEach(p => {
        const len = p.getTotalLength(); p.style.strokeDasharray = `${len}`;
        p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: "cubic-bezier(.2,.7,.2,1)" }).onfinish = () => { p.style.strokeDasharray = ""; };
      });
      $$(".ar, .ln.dash, .dt", svg).forEach(p => p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 250, fill: "backwards" }));
    }
    function guide(i) {
      cursor = i;
      const x = X(xs[i]);
      let g = `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" stroke="#0F1218" stroke-width="1"/>`;
      cfg.series.forEach(s => { const v = s.values[i]; if (v != null && !isNaN(v)) g += `<circle cx="${x}" cy="${Y(v)}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`; });
      const c = svg.querySelector(".cur"); if (c) c.innerHTML = g;
    }
    function showTip(i) {
      const x = X(xs[i]);
      const rows = cfg.series.map(s => {
        const v = s.values[i]; if (v == null || isNaN(v)) return "";
        return `<span class="r"><span><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span><b>${esc(cfg.tipRow ? cfg.tipRow(s, i) : v)}</b></span>`;
      }).join("");
      tip.innerHTML = `<span class="t">${esc(cfg.tipTitle ? cfg.tipTitle(i) : xs[i])}</span>${rows}${cfg.tipExtra ? cfg.tipExtra(i) || "" : ""}`;
      tip.style.display = "flex";
      const tw = tip.offsetWidth, left = x + 16 + tw > W ? x - 16 - tw : x + 16;
      tip.style.left = `${clamp(left, 0, Math.max(0, W - tw))}px`; tip.style.top = `${T + 4}px`;
    }
    const indexAt = e => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      const xv = xs[0] + ((px - L) / (W - L - R)) * (xs[n - 1] - xs[0]);
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.abs(xs[i] - xv); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    const move = e => { const i = indexAt(e); guide(i); showTip(i); cfg.onMove && cfg.onMove(i); };
    el.onpointermove = move; el.onpointerdown = move;
    el.onpointerleave = () => { tip.style.display = "none"; };
    const ro = new ResizeObserver(() => draw()); ro.observe(el);
    draw();
    return { setCursor: i => guide(i), destroy: () => ro.disconnect() };
  }

  function mountBars(el, cfg) {
    el.classList.add("chart-wrap");
    const H = cfg.height || 200, L = 44, R = 6, T = 10, B = 24, n = cfg.values.length;
    el.innerHTML = `<svg role="img" aria-label="${esc(cfg.label || "Bar chart")}"></svg><div class="tip"></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
    const hi = Math.max(1, ...cfg.values.map(v => v || 0)) * 1.08;
    let W = 600, sel = null, drawn = false;
    function draw() {
      W = Math.max(240, el.clientWidth || 600);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
      const bw = (W - L - R) / n, Y = v => T + (1 - v / hi) * (H - T - B);
      let g = "";
      for (let k = 0; k <= 3; k++) { const v = (hi * k) / 3; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#EEF0F3"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${esc((cfg.yFmt || Math.round)(v))}</text>`; }
      cfg.values.forEach((v, i) => {
        const x = L + i * bw + bw * 0.14, w = bw * 0.72, y = Y(v || 0);
        const outline = cfg.outline && cfg.outline(i);
        g += `<rect class="br" x="${x}" y="${y}" width="${w}" height="${Math.max(0, H - B - y)}" rx="5" fill="${cfg.colors[i]}" ${outline ? `stroke="${outline}" stroke-width="1.5" stroke-dasharray="4 3" fill-opacity=".35"` : ""} ${sel === i ? 'stroke="#0F1218" stroke-width="2"' : ""}/>`;
        g += `<text x="${x + w / 2}" y="${H - 7}" text-anchor="middle">${esc(cfg.labels[i])}</text>`;
      });
      svg.innerHTML = g;
      if (!drawn && cfg.animate && motionOK()) $$(".br", svg).forEach((r, i) => r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 650, delay: i * 45, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" }));
      drawn = true;
    }
    const move = e => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      const i = clamp(Math.floor((px - L) / ((W - L - R) / n)), 0, n - 1);
      sel = i; draw();
      tip.innerHTML = cfg.tip(i); tip.style.display = "flex";
      const x = L + (i + 0.5) * ((W - L - R) / n), tw = tip.offsetWidth;
      tip.style.left = `${clamp(x - tw / 2, 0, Math.max(0, W - tw))}px`; tip.style.top = "0px";
    };
    el.onpointermove = move; el.onpointerdown = move;
    el.onpointerleave = () => { tip.style.display = "none"; sel = null; draw(); };
    const ro = new ResizeObserver(draw); ro.observe(el); draw();
    return { destroy: () => ro.disconnect() };
  }

  // ===================================================================
  // Shell
  // ===================================================================
  const ICON = {
    telemetry: '<path d="M4 17c3 0 4-10 8-10s5 10 8 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    standings: '<path d="M5 20V11M12 20V5M19 20v-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    races: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 6H4.5v1.2a3.3 3.3 0 0 0 3 3.3M17 6h2.5v1.2a3.3 3.3 0 0 1-3 3.3M12 14v3.5M8 20.5h8M9.5 17.5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    drivers: '<path d="M12 2.8c-3 0-5 2.2-5 5.1v3.4c0 1.2 1 2.2 2.2 2.2h5.6c1.2 0 2.2-1 2.2-2.2V7.9c0-2.9-2-5.1-5-5.1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6 7.3h6.8v2.4H8.6z" fill="currentColor"/><path d="M4 21c1.2-3.2 4.2-4.8 8-4.8s6.8 1.6 8 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    circuits: '<path d="M7.5 20.5C5 20.5 3.5 18.8 3.5 16.7c0-1.8 1.2-3.1 2.9-3.5l6.1-1.3c1.4-.3 2.2-1.2 2.2-2.4 0-1.3-1-2.3-2.4-2.3H9.6c-1 0-1.8-.8-1.8-1.8S8.6 3.5 9.6 3.5h7.6c2.3 0 3.3 1.7 3.3 3.9v9.2c0 2.2-1.8 3.9-4 3.9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M11 18.2v4.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    teams: '<path d="M3 20V9.5L12 4l9 5.5V20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 20v-8h11v8M6.5 15h11M6.5 17.6h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/>',
    cars: '<path d="M5 5.5h14M5 5.5V9M19 5.5V9M8.6 14c.7-3 1.9-4.4 3.4-4.4s2.7 1.4 3.4 4.4M6.5 15.2h11M3.5 20h17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><circle cx="12" cy="12.6" r="1.3" fill="currentColor"/><rect x="2.5" y="10" width="4" height="8" rx="1.3" fill="currentColor"/><rect x="17.5" y="10" width="4" height="8" rx="1.3" fill="currentColor"/>',
    home: '<path d="M3.5 17.5a8.5 8.5 0 1 1 17 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17.5l4.2-5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor"/><path d="M6.6 11.3l1.2 1M12 8.3v1.6M17.4 11.3l-1.2 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/>',
    news: '<path d="M4 5.5h12v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 9h3.5v9.5a2 2 0 0 1-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/>',
    more: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
    settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    play: '<path d="M8.5 5.8v12.4L18.5 12z" fill="currentColor"/>',
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const SECTIONS = [["home", "Home"], ["telemetry", "Telemetry"], ["standings", "Standings"], ["races", "Races"], ["drivers", "Drivers"], ["circuits", "Circuits"], ["teams", "Teams"], ["cars", "Cars"], ["news", "News"]];
  const TABS = ["home", "telemetry", "standings", "drivers"];
  const MORE = SECTIONS.filter(([id]) => !TABS.includes(id));
  const SECTION_OF = { driver: "drivers", team: "teams", circuit: "circuits", trends: "circuits", car: "cars" };
  const icon = (k, size) => `<svg viewBox="0 0 24 24" aria-hidden="true"${size ? ` width="${size}" height="${size}"` : ""}>${ICON[k]}</svg>`;
  $("#rail").innerHTML = `<a href="#/home" class="home" aria-label="OutLap home" title="OutLap"><img src="brand/outlap-mark.svg" alt="OutLap"></a>` +
    SECTIONS.map(([id, l]) => `<a href="#/${id}" data-id="${id}">${icon(id)}<span>${l}</span></a>`).join("") +
    `<button type="button" class="rail-settings" data-open-settings aria-label="Settings">${icon("settings")}<span>Settings</span></button>`;
  $("#tabbar").innerHTML = SECTIONS.filter(([id]) => TABS.includes(id)).map(([id, l]) => `<a href="#/${id}" data-id="${id}">${icon(id)}<span>${l}</span></a>`).join("") +
    `<button type="button" id="moreBtn" aria-haspopup="menu" aria-expanded="false" data-id="more">${icon("more")}<span>More</span></button>`;
  $("#more").innerHTML = MORE.map(([id, l]) => `<a href="#/${id}" role="menuitem">${icon(id, 20)}${l}</a>`).join("");
  const closeMore = () => { $("#more").removeAttribute("open"); $("#moreBtn").setAttribute("aria-expanded", "false"); };
  $("#moreBtn").onclick = e => { e.stopPropagation(); const m = $("#more"), open = !m.hasAttribute("open"); m.toggleAttribute("open", open); $("#moreBtn").setAttribute("aria-expanded", open); };
  document.addEventListener("click", e => { if (!e.target.closest("#more")) closeMore(); });
  $("#more").addEventListener("click", e => { if (e.target.closest("a,button")) closeMore(); });

  // ---------- settings dialog ----------
  function openSettings() {
    const dlg = $("#settings");
    const draw = () => {
      dlg.innerHTML = `<form method="dialog" class="dlg">
        <div class="dlg-head"><h2>Settings</h2><button class="icon-btn" value="close" aria-label="Close">✕</button></div>
        <div class="set-row"><div><b>Units</b><p class="tiny muted">${imperial() ? "Miles, mph and feet" : "Kilometres, km/h and metres"}</p></div>
          ${seg("setUnits", [["imperial", "Imperial"], ["metric", "Metric"]], settings.units, "Units")}</div>
        <div class="set-row"><div><b>Animations</b><p class="tiny muted">Page transitions, chart drawing and loading effects</p></div>
          ${seg("setMotion", [["full", "On"], ["reduced", "Reduced"]], settings.motion, "Animations")}</div>
        <div class="about"><img class="about-logo" src="brand/outlap-wordmark.svg" alt="OutLap"><h3>About and Sources</h3>
          <p>Unofficial personal project, not affiliated with Formula 1, the FIA or any team.</p>
          <p>Results and standings from Jolpica. Lap telemetry from OpenF1 (2023 onward) and FastF1 (2018 to 2022). Circuit layouts and turn numbers from MultiViewer, real-world outlines from the open f1-circuits dataset, elevation from Open-Meteo's terrain model. Descriptions from Wikipedia. Photos from Wikimedia Commons under their stated licences; official headshots, logos and images from formula1.com are linked for personal use.</p>
          <p>G-force figures are estimated from speed and position, and elevation from 90 m terrain data, so both are approximate.</p>
        </div></form>`;
      onSeg(dlg, "#setUnits", v => { settings.units = v; saveSettings(); draw(); render(); });
      onSeg(dlg, "#setMotion", v => { settings.motion = v; saveSettings(); applyMotion(); draw(); });
    };
    draw();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  document.addEventListener("click", e => { if (e.target.closest("[data-open-settings]")) { e.preventDefault(); openSettings(); } });
  $("#settings").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  // ===================================================================
  // Routing and rendering
  // ===================================================================
  // Views speak an internal route ("driver/max_verstappen?y=2026"); the address bar shows a clean path
  // ("/drivers/max-verstappen/2026"). Templates write internal links as href="#/…" and render() rewrites them.
  // The single-file preview (file://) keeps hash routing because it has no server to answer deep links.
  const HASH = preview || location.protocol === "file:";
  const slug = id => String(id).replace(/_/g, "-");
  const unslug = s => String(s || "").toLowerCase().replace(/-/g, "_");
  const nameSlug = n => String(n).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const YEAR = /^\d{4}$/;
  const seasonSync = {}; // filled as seasons load, so links can name races
  let telSync = null; // same for the telemetry index
  const raceSlug = (y, round) => { const r = seasonSync[y]?.races.find(x => x.round === +round); return r ? nameSlug(r.name) : `round-${round}`; };
  const findRace = (races, rs) => races.find(x => nameSlug(x.name) === rs) || races.find(x => `round-${x.round}` === rs);
  const MAP_WORD = { faster: "faster", spd: "speed", thr: "throttle", brk: "brake", gear: "gear", gx: "braking-g", gy: "cornering-g" };
  const CHART_WORD = { spd: "speed", thr: "throttle", gear: "gear", g: "g-force" };
  const flip = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

  function toPath(name, arg, q) {
    const g = k => q.get(k), qs = new URLSearchParams();
    const yr = g("y") && YEAR.test(g("y")) ? `/${g("y")}` : "";
    let p = "/";
    switch (name) {
      case "home": if (g("nk")) qs.set("news", g("nk")); break;
      case "telemetry": {
        p = "/telemetry";
        let y = g("ty"), rs = g("tr");
        const f = g("f"), e = f && telSync?.find(i => i.file === f), m = f && f.match(/^(\d{4})_(\d+)/);
        if (e) { y = e.year; rs = nameSlug(e.name); } else if (m) { y = m[1]; rs = `round-${+m[2]}`; }
        if (y && rs) {
          p += `/${y}/${rs}`;
          const a = g("a"), b = g("b");
          if (a) p += `/${a.toLowerCase()}${b === "none" ? "-solo" : b ? `-vs-${b.toLowerCase()}` : ""}`;
        }
        if (MAP_WORD[g("m")]) qs.set("map", MAP_WORD[g("m")]);
        if (CHART_WORD[g("c")] && g("c") !== "spd") qs.set("chart", CHART_WORD[g("c")]);
        break;
      }
      case "standings": p = `/standings${yr}${g("t") === "constructors" ? "/constructors" : ""}`; break;
      case "races": p = `/races${yr}`; if (yr && (g("r") || g("rs"))) p += `/${g("r") ? raceSlug(g("y"), g("r")) : g("rs")}`; break;
      case "drivers": p = `/drivers${yr}`; if (g("sort")) qs.set("sort", g("sort")); break;
      case "driver": p = `/drivers/${slug(arg)}${yr}`; break;
      case "teams": p = `/teams${yr}`; break;
      case "team": p = `/teams/${slug(arg)}${yr}`; break;
      case "cars": p = `/cars${yr}`; break;
      case "car": p = `/cars${yr}/${slug(arg)}`; break;
      case "circuits": p = "/circuits"; break;
      case "circuit": p = `/circuits/${slug(arg)}`; if (g("m") === "elev") qs.set("view", "elevation"); break;
      case "trends": p = g("c") ? `/circuits/${slug(g("c"))}` : "/circuits"; break;
      case "news": p = "/news";
        if (g("k")) qs.set("type", g("k")); if (g("d")) qs.set("driver", slug(g("d"))); if (g("t")) qs.set("team", slug(g("t"))); if (g("s")) qs.set("source", g("s"));
        break;
    }
    const s = qs.toString();
    return p + (s ? `?${s}` : "");
  }
  function fromPath(pathname, search) {
    const seg = pathname.split("/").filter(Boolean).map(x => decodeURIComponent(x).toLowerCase());
    const sp = new URLSearchParams(search), q = new URLSearchParams();
    const set = (k, v) => { if (v != null && v !== "") q.set(k, v); };
    const top = seg[0] || "home";
    let name = top, arg = null;
    switch (top) {
      case "home": set("nk", sp.get("news")); break;
      case "telemetry": {
        set("ty", seg[1]); set("tr", seg[2]);
        const m = (seg[3] || "").match(/^([a-z0-9]+)(?:-(solo)|-vs-([a-z0-9]+))?$/);
        if (m) { set("a", m[1].toUpperCase()); set("b", m[2] ? "none" : m[3] ? m[3].toUpperCase() : null); }
        set("m", flip(MAP_WORD)[sp.get("map")]); set("c", flip(CHART_WORD)[sp.get("chart")]);
        break;
      }
      case "standings": seg.slice(1).forEach(x => { if (YEAR.test(x)) set("y", x); else if (x === "constructors") set("t", x); }); break;
      case "races": set("y", seg[1]); set("rs", seg[2]); break;
      case "drivers": case "teams":
        if (seg[1] && !YEAR.test(seg[1])) { name = top === "drivers" ? "driver" : "team"; arg = unslug(seg[1]); set("y", seg[2]); }
        else { set("y", seg[1]); set("sort", sp.get("sort")); }
        break;
      case "cars":
        if (seg[2]) { name = "car"; arg = unslug(seg[2]); set("y", seg[1]); }
        else if (seg[1] && !YEAR.test(seg[1])) { name = "car"; arg = unslug(seg[1]); }
        else set("y", seg[1]);
        break;
      case "circuits": if (seg[1]) { name = "circuit"; arg = unslug(seg[1]); if (sp.get("view") === "elevation") set("m", "elev"); } break;
      case "news": set("k", sp.get("type")); set("d", sp.get("driver") && unslug(sp.get("driver"))); set("t", sp.get("team") && unslug(sp.get("team"))); set("s", sp.get("source")); break;
      default: name = "home";
    }
    if (q.get("y") && !YEAR.test(q.get("y"))) q.delete("y");
    return { name: VIEWS[name] ? name : "home", arg, q };
  }
  function parseInternal(raw) {
    const [path, qs] = (raw || "home").split("?");
    const [name, arg] = path.split("/");
    return { name: VIEWS[name] ? name : "home", arg: arg ? decodeURIComponent(arg) : null, q: new URLSearchParams(qs || "") };
  }
  const internalHash = (name, arg, q) => `#/${name}${arg ? "/" + encodeURIComponent(arg) : ""}${[...q].length ? "?" + q : ""}`;
  // internal "#/…" link -> what goes in the href
  const link = raw => { if (HASH) return `#/${raw}`; const r = parseInternal(raw); return toPath(r.name, r.arg, r.q); };
  const cleanLinks = html => (HASH ? html : html.replace(/(href|data-href)="#\/([^"]*)"/g, (_, at, raw) => `${at}="${esc(link(raw.replace(/&amp;/g, "&")))}"`));
  function route() {
    return HASH ? parseInternal(location.hash.replace(/^#\/?/, "")) : fromPath(location.pathname, location.search);
  }
  function go(url, replace) {
    if (HASH) { location.hash = url; return; }
    if (url === location.pathname + location.search) return;
    history[replace ? "replaceState" : "pushState"](null, "", url);
    render();
  }
  // Once a page knows exactly what it shows, tidy the address in place (round-5 -> its race name, unknown paths -> /)
  function canonical(name, arg, q, canon) {
    if (HASH) return;
    const q2 = new URLSearchParams(q);
    Object.entries(canon || {}).forEach(([k, v]) => { (ALIAS[k] || []).forEach(x => q2.delete(x)); q2.set(k, v); });
    const u = toPath(name, arg, q2);
    if (u !== location.pathname + location.search) history.replaceState(null, "", u);
  }
  // a key replaces its stand-ins: picking a round drops the race slug, picking a file drops year and track
  const ALIAS = { r: ["rs"], f: ["ty", "tr"], y: ["rs"] };
  function setQuery(params) {
    const { name, arg, q } = route();
    Object.entries(params).forEach(([k, v]) => { (ALIAS[k] || []).forEach(x => q.delete(x)); v == null || v === "" ? q.delete(k) : q.set(k, v); });
    go(HASH ? internalHash(name, arg, q) : toPath(name, arg, q));
  }
  function bootRouter() {
    $$('a[href^="#/"]').forEach(a => a.setAttribute("href", link(a.getAttribute("href").slice(2)))); // rail, tab bar, app bar
    // old #/ bookmarks and home-screen shortcuts land on the clean address
    if (!HASH && location.hash.startsWith("#/")) history.replaceState(null, "", link(location.hash.slice(2)));
  }
  if (!HASH) {
    window.addEventListener("popstate", () => render());
    document.addEventListener("click", e => {
      const a = e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || /^\/(data|brand|icons)\//.test(u.pathname) || /\.[a-z0-9]+$/i.test(u.pathname)) return;
      e.preventDefault(); go(u.pathname + u.search);
    });
  }
  const onChange = (root, sel, fn) => { const el = $(sel, root); if (el) el.onchange = e => fn(e.target.value); };
  const onSeg = (root, sel, fn) => $$(`${sel} button`, root).forEach(b => (b.onclick = e => { e.preventDefault(); fn(b.dataset.v); }));
  const seg = (id, items, cur, label) => `<div class="seg" id="${id}" role="group" aria-label="${esc(label)}">${items.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join("")}</div>`;
  async function seasonPick(cur, id = "season") {
    const m = await meta();
    return `<select class="pick" id="${id}" aria-label="Season">${m.seasons.slice().reverse().map(y => `<option value="${y}"${+y === +cur ? " selected" : ""}>${y} Season</option>`).join("")}</select>`;
  }
  const back = (href, label) => `<a class="back" href="${href}">${icon("back", 18)}${esc(label)}</a>`;

  // Skeletons shown only when a page takes a moment to load
  const sk = (h, w = "100%", r = 18) => `<div class="skel" style="height:${h}px;width:${w};border-radius:${r}px"></div>`;
  const SKELETON = {
    telemetry: () => `${sk(44, "55%", 10)}${sk(200)}<div class="split-main">${sk(520)}<div class="stack">${sk(320)}<div class="grid-3">${sk(220)}${sk(220)}${sk(220)}</div></div></div>`,
    list: () => `${sk(48, "34%", 10)}<div class="cards">${Array.from({ length: 10 }, () => sk(240)).join("")}</div>`,
    table: () => `${sk(48, "40%", 10)}${sk(180)}<div class="grid-2">${sk(520)}${sk(520)}</div>`,
    detail: () => `${sk(22, "120px", 8)}${sk(300, "100%", 22)}<div class="grid-2">${sk(280)}${sk(280)}</div>${sk(360)}`,
  };
  const skeletonFor = name => (SKELETON[{ home: "table", news: "list", telemetry: "telemetry", drivers: "list", teams: "list", cars: "list", circuits: "list", standings: "table", races: "table" }[name] || "detail"])();

  const progress = (() => {
    const bar = $("#progress"); let t = null;
    return {
      start() { clearTimeout(t); bar.classList.remove("done"); bar.classList.add("run"); },
      done() { bar.classList.add("done"); t = setTimeout(() => bar.classList.remove("run", "done"), 400); },
    };
  })();

  function countUp(root) {
    if (!motionOK()) return;
    $$("[data-count]", root).forEach(el => {
      const end = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0;
      if (!isFinite(end) || end === 0) return;
      const t0 = performance.now(), dur = 800;
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  const morph = (from, html) => {
    if (!window.morphdom) { from.outerHTML = html; return; }
    window.morphdom(from, html, {
      onBeforeElUpdated: (a, b) => {
        if (a.isEqualNode(b)) return false;
        if (a.tagName === "IMG" && a.getAttribute("src") === b.getAttribute("src")) return false;
        if (a.tagName === "SELECT") { a.innerHTML = b.innerHTML; a.value = b.value; return false; }
        return true;
      },
    });
  };

  let token = 0, cleanups = [], lastKey = null;
  async function render() {
    const my = ++token;
    const { name, arg, q } = route();
    const key = `${name}/${arg || ""}`, pageChange = key !== lastKey;
    const sec = SECTION_OF[name] || name;
    $$("#rail a[data-id], #tabbar [data-id]").forEach(a => (a.dataset.id === sec || (a.dataset.id === "more" && MORE.some(([id]) => id === sec)) ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    const view = $("#view");
    progress.start();
    const skel = setTimeout(() => { if (my === token && pageChange) { view.innerHTML = `<div class="page skeleton" aria-busy="true">${skeletonFor(name)}</div>`; } }, pageChange ? 120 : 400);
    let out;
    try {
      [M, I] = await Promise.all([media(), infoData()]);
      out = await VIEWS[name](arg, q);
    } catch (e) {
      console.error(e);
      out = { html: `<div class="empty"><img class="empty-mark" src="brand/outlap-mark.svg" alt=""><h3>This Page Couldn't Load</h3><p>${esc(e.message)}. Run <code>python ingest/build_data.py</code>, then reload.</p></div>` };
    }
    clearTimeout(skel);
    if (my !== token) return;
    cleanups.forEach(f => f()); cleanups = [];
    const html = cleanLinks(`<div class="page${pageChange ? " enter" : ""}" data-key="${esc(key)}">${out.html}</div>`);
    const apply = () => {
      const cur = view.firstElementChild;
      if (pageChange || !cur || cur.classList.contains("skeleton")) view.innerHTML = html;
      else morph(cur, html);
      const root = view.firstElementChild;
      $$("tr[data-href]", root).forEach(tr => { tr.classList.add("go"); tr.onclick = e => { if (!e.target.closest("a")) go(tr.dataset.href); }; });
      if (out.mount) { const c = out.mount(root, { first: pageChange }); if (c) cleanups.push(c); }
      canonical(name, arg, q, out.canon);
      $$("img", root).forEach(im => { if (im.complete && im.naturalWidth) im.classList.add("in"); });
      if (pageChange) { window.scrollTo(0, 0); countUp(root); }
    };
    lastKey = key;
    const boot = document.getElementById("boot");
    if (boot) { boot.classList.add("gone"); setTimeout(() => boot.remove(), 450); }
    if (pageChange && document.startViewTransition && motionOK() && !view.querySelector(".skeleton")) document.startViewTransition(apply);
    else apply();
    progress.done();
  }
  if (HASH) window.addEventListener("hashchange", render);

  // ===================================================================
  // NEWS (shared by Home, News and the driver and team pages)
  // ===================================================================
  const newsLatest = () => load("news.json").catch(() => null);
  const newsArchive = () => load("news_archive.json").catch(() => newsLatest());
  const NEWS_KIND = { article: "Article", video: "Video", social: "Social" };
  const okUrl = u => (/^https?:\/\//i.test(u || "") ? u : "#");
  const ago = iso => {
    const m = Math.max(0, (Date.now() - new Date(iso)) / 60000);
    if (m < 60) return `${Math.max(1, Math.round(m))}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    const d = Math.round(m / 1440);
    return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  function newsItem(n, s, opts = {}) {
    const tags = [
      ...(n.dr || []).filter(d => s?.drivers?.[d]).map(d => `<span class="nw-tag" style="--c:${teamColor(teamOf(s, d))}">${esc(s.drivers[d].code)}</span>`),
      ...(n.tm || []).filter(c => s?.constructors?.[c]).map(c => `<span class="nw-tag" style="--c:${teamColor(c)}">${esc(s.constructors[c].name)}</span>`),
    ];
    const thumb = n.img ? imgTag([n.img], "") : "";
    const tile = esc((n.s || "?").replace(/^r\//, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase());
    return `<a class="nw${opts.big ? " nw-big" : ""}" href="${esc(okUrl(n.u))}" target="_blank" rel="noopener noreferrer">
      <span class="nw-ph${thumb ? "" : " fallback"}">${thumb}<span class="nw-tile">${tile}</span>${n.k === "video" ? `<span class="nw-play">${icon("play")}</span>` : ""}</span>
      <span class="nw-bd"><span class="nw-meta"><b>${esc(n.s)}</b><span>${ago(n.d)}</span>${n.k !== "article" ? `<span class="nw-kind">${NEWS_KIND[n.k] || ""}</span>` : ""}</span>
        <span class="nw-t">${esc(n.t)}</span>${opts.big && n.x ? `<span class="nw-x">${esc(n.x)}</span>` : ""}
        ${tags.length ? `<span class="nw-tags">${tags.slice(0, opts.big ? 6 : 3).join("")}${tags.length > (opts.big ? 6 : 3) ? `<span class="nw-tag more">+${tags.length - (opts.big ? 6 : 3)}</span>` : ""}</span>` : ""}</span></a>`;
  }
  const newsEmpty = `<div class="empty"><h3>No News Yet</h3><p>Headlines, videos and posts arrive with the next data refresh, every 3 hours.</p></div>`;
  // "In the News" card on driver and team pages, filled after the page has drawn
  function mountInNews(root, s, match, moreHref) {
    const el = $("#inNews", root); if (!el) return;
    newsArchive().then(a => {
      const items = (a?.items || []).filter(match);
      if (!items.length || !el.isConnected) return;
      el.innerHTML = cleanLinks(`<div class="card-head"><h2>In the News</h2><a class="link small" href="${moreHref}">${items.length === 1 ? "1 Story" : `All ${items.length} Stories`}</a></div>
        <div class="nw-list cols">${items.slice(0, 6).map(n => newsItem(n, s)).join("")}</div>`);
      el.hidden = false;
      $$("img", el).forEach(im => { if (im.complete && im.naturalWidth) im.classList.add("in"); });
    });
  }

  // ===================================================================
  // HOME
  // ===================================================================
  const at = (d, t) => (t ? new Date(`${d}T${t.endsWith("Z") ? t : t + "Z"}`) : null);
  const fmtWhen = (date, opts) => date.toLocaleString("en-US", opts);
  function weekend(r) {
    const list = [...(r.sessions || []).map(x => ({ n: x.n, d: x.d, at: at(x.d, x.t) })), { n: "Race", d: r.date, at: at(r.date, r.time), race: true }];
    return list.sort((a, b) => (a.at && b.at ? a.at - b.at : a.d.localeCompare(b.d)));
  }
  function mountCountdown(root) {
    const cd = $("#countdown", root); if (!cd) return null;
    const to = new Date(cd.dataset.to).getTime();
    const tick = () => {
      const ms = Math.max(0, to - Date.now()), m = Math.floor(ms / 60000);
      const v = { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
      $$("[data-u]", cd).forEach(b => { b.textContent = String(v[b.dataset.u]).padStart(2, "0"); });
      if (ms === 0) { clearInterval(t); render(); }
    };
    const t = setInterval(tick, 15000); tick();
    return () => clearInterval(t);
  }
  // The race weekend card: countdown, sessions in local time, layout. Used on Home and for upcoming rounds on Races.
  function weekendCard(r, { y, total, C, T, prev, isNext }) {
    const now = Date.now();
    const c = C[r.circuit] || {}, sess = weekend(r);
    const upcoming = sess.find(x => x.at && x.at.getTime() > now);
    const race = sess[sess.length - 1];
    const live = sess.find(x => x.at && x.at.getTime() <= now && now < x.at.getTime() + (x.race ? 2.5 : 1.25) * 3600e3);
    const target = upcoming?.at;
    const lastWin = (() => {
      const yrs = Object.keys(T[r.circuit]?.years || {}).map(Number).filter(v => v < y).sort((a, b) => b - a);
      if (!yrs.length) return null;
      const yy = yrs[0], code = T[r.circuit].years[yy].winner;
      const pr = yy === y - 1 && prev ? prev.races.find(x => x.circuit === r.circuit && x.results.length) : null;
      return { y: yy, name: pr ? prev.drivers[pr.results[0].d].name : code };
    })();
    const firstDay = new Date(sess[0].d + "T12:00:00"), raceDay = new Date(r.date + "T12:00:00");
    const range = sess[0].d === r.date ? longDate(r.date) : `${firstDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${raceDay.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    return `<section class="next-race">
      <div class="nr-main">
        <p class="nr-kicker">${live ? `<span class="live-dot"></span>${esc(live.n)} Live Now` : `${isNext ? "Next Race, " : ""}Round ${r.round} of ${total}`}</p>
        <h2 class="nr-name">${esc(r.name)}</h2>
        <p class="nr-where"><a href="#/circuit/${r.circuit}">${esc(r.circuitName)}</a>, ${esc(r.locality)}, ${esc(range)}</p>
        ${target ? `<div class="cd" id="countdown" data-to="${target.toISOString()}" aria-label="Time until ${esc(upcoming.n)}">
          <div><b data-u="d">–</b><span>Days</span></div><div><b data-u="h">–</b><span>Hours</span></div><div><b data-u="m">–</b><span>Minutes</span></div>
          <p class="cd-what">Until ${esc(upcoming.n)}</p></div>` : live ? "" : `<p class="cd-what">${race.at ? "" : "Session times arrive with the next data refresh."}</p>`}
        <ol class="sessions">${sess.map(x => {
          const state = x.at ? (x === live ? "live" : x.at.getTime() < now ? "past" : x === upcoming ? "next" : "") : "";
          const when = x.at ? `${fmtWhen(x.at, { weekday: "short" })} ${fmtWhen(x.at, { hour: "numeric", minute: "2-digit" })}` : new Date(x.d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return `<li class="${state}"><span>${esc(x.n)}</span><b>${esc(when)}</b></li>`; }).join("")}</ol>
        ${sess.some(x => x.at) ? `<p class="nr-note">Times shown in your time zone.</p>` : ""}
      </div>
      <a class="nr-map" href="#/circuit/${r.circuit}" aria-label="${esc(r.circuitName)} Layout">${c.x ? outlineSvg(c, { color: "#FFFFFF", pad: 0.06 }) : ""}
        <span class="nr-facts">${c.x ? `<span><b>${U.lapNum(lapKm(c))}</b> ${U.lapUnit()} Lap</span>` : ""}${(c.corners || []).length || c.facts?.turns ? `<span><b>${esc((c.corners || []).length || c.facts.turns)}</b> Turns</span>` : ""}${lastWin ? `<span>${lastWin.y} Winner <b>${esc(lastWin.name)}</b></span>` : ""}</span></a>
    </section>`;
  }
  async function homeView(_, q) {
    const y = await latestYear();
    const [s, C, T, news, prev] = await Promise.all([season(y), circuitsData(), trendsData(), newsLatest(), season(y - 1).catch(() => null)]);
    const done = s.races.filter(r => r.results.length), total = s.races.length;
    const next = s.races.find(r => !r.results.length);
    const last = done[done.length - 1];
    const now = Date.now();

    // next race
    let nextCard = "";
    if (next) {
      nextCard = weekendCard(next, { y, total, C, T, prev, isNext: true });
    } else if (s.driverStandings[0]) {
      const ch = s.driverStandings[0];
      nextCard = `<section class="next-race done"><div class="nr-main"><p class="nr-kicker">${y} Season Complete</p><h2 class="nr-name">${esc(s.drivers[ch.d].name)}, World Champion</h2>
        <p class="nr-where">${fmtPts(ch.pts)} points and ${plural(ch.wins, "win", "wins")} for ${esc(s.constructors[ch.c]?.name || "")}</p></div></section>`;
    }

    // last race
    const lastCard = last ? (() => {
      const fl = last.results.find(x => x.flr === 1);
      return `<section class="card last-race"><div class="card-head"><h2>Last Race</h2><a class="link small" href="#/races?y=${y}&r=${last.round}">Race Report</a></div>
        <p class="small muted" style="margin:-6px 0 10px">Round ${last.round}, ${esc(last.name)}, ${shortDate(last.date)}</p>
        <ol class="mini-pod">${last.results.slice(0, 3).map(x => `<li><span class="p">P${x.pos}</span>${driverLink(x.d, s)}<span class="tiny muted">${esc(s.constructors[x.c]?.name || "")}</span></li>`).join("")}</ol>
        <div class="mini-facts">${last.pole ? `<div><span>Pole</span><b>${esc(s.drivers[last.pole.d]?.code || "")}</b></div>` : ""}${fl ? `<div><span>Fastest Lap</span><b class="purple">${fmtLap(fl.fl)}</b></div>` : ""}
          <div><span>Finishers</span><b>${last.results.filter(classified).length}</b></div></div></section>`;
    })() : "";

    // season numbers
    const L1 = s.driverStandings[0], L2 = s.driverStandings[1];
    const left = total - s.afterRound;
    const alive = L1 ? s.driverStandings.filter(x => x.pts + left * 25 >= L1.pts).length : 0;
    const winners = new Set(done.map(r => r.results[0].d)).size;
    const lead = seasonLeaders(s);
    const poles = lead.find(l => l.label === "Most Poles");
    const stats = L1 ? `<section class="card"><div class="card-head"><h2>${y} at a Glance</h2><span class="tiny muted">After Round ${s.afterRound} of ${total}</span></div>
      <div class="glance">
        <a href="#/driver/${L1.d}?y=${y}" style="--c:${teamColor(L1.c)}"><span>Leader</span><b>${esc(lastName(s, L1.d))}</b><em>${fmtPts(L1.pts)} Pts</em></a>
        ${L2 ? `<a href="#/driver/${L2.d}?y=${y}" style="--c:${teamColor(L2.c)}"><span>Lead</span>${count(L1.pts - L2.pts)}<em>Over ${esc(lastName(s, L2.d))}</em></a>` : ""}
        <div><span>Rounds Left</span>${count(left)}<em>Up to ${left * 25} GP Pts</em></div>
        <div><span>In the Title Fight</span>${count(alive)}<em>${alive === 1 ? "Title Decided" : "Drivers Still in Reach"}</em></div>
        <div><span>Different Winners</span>${count(winners)}<em>In ${plural(done.length, "Race", "Races")}</em></div>
        ${poles ? `<a href="#/driver/${poles.did}?y=${y}" style="--c:${teamColor(teamOf(s, poles.did))}"><span>Most Poles</span><b>${esc(lastName(s, poles.did))}</b><em>${poles.v} Poles</em></a>` : ""}
      </div><p class="tiny muted" style="margin-top:10px">Points still available count Grand Prix wins only; sprints aren't included.</p></section>` : "";

    // leaderboards
    const maxD = Math.max(1, ...s.driverStandings.map(x => x.pts)), maxC = Math.max(1, ...s.constructorStandings.map(x => x.pts));
    const boards = `
      <section class="card"><div class="card-head"><h2>Drivers</h2><a class="link small" href="#/standings?y=${y}">Full Standings</a></div>
        <div class="table-wrap"><table class="board"><tbody>${s.driverStandings.slice(0, 10).map(r => `<tr data-href="#/driver/${r.d}?y=${y}"><td class="pos">${r.pos || "–"}</td><td>${driverLink(r.d, s)}</td>
          <td class="r num pts">${fmtPts(r.pts)}</td><td class="hide-sm barcell"><div class="bar" style="width:${(r.pts / maxD) * 100}%;background:${teamColor(r.c)}"></div></td></tr>`).join("")}</tbody></table></div></section>
      <section class="card"><div class="card-head"><h2>Constructors</h2><a class="link small" href="#/standings?y=${y}&t=constructors">Full Standings</a></div>
        <div class="table-wrap"><table class="board"><tbody>${s.constructorStandings.map(r => `<tr data-href="#/team/${r.c}?y=${y}"><td class="pos">${r.pos || "–"}</td><td>${teamLink(r.c, s, { size: 22 })}</td>
          <td class="r num pts">${fmtPts(r.pts)}</td><td class="hide-sm barcell"><div class="bar" style="width:${(r.pts / maxC) * 100}%;background:${teamColor(r.c)}"></div></td></tr>`).join("")}</tbody></table></div></section>`;

    // news
    const kind = ["article", "video", "social"].includes(q.get("nk")) ? q.get("nk") : "all";
    const items = (news?.items || []).filter(n => kind === "all" || n.k === kind);
    const featured = items.find(n => n.img) || items[0];
    const rest = items.filter(n => n !== featured).slice(0, 10);
    const newsCard = `<section class="card"><div class="card-head"><h2>Latest News</h2>
        ${seg("newsKind", [["all", "All"], ["article", "Articles"], ["video", "Videos"], ["social", "Social"]], kind, "News Type")}</div>
      ${news ? (items.length ? `<div class="nw-home">${newsItem(featured, s, { big: true })}<div class="nw-list cols">${rest.map(n => newsItem(n, s)).join("")}</div></div>
        <div class="nw-foot"><span class="tiny muted">${news.total.toLocaleString()} stories from ${plural(news.sources.length, "source", "sources")}, updated ${ago(news.updated)}</span><a class="btn" href="#/news${kind === "all" ? "" : `?k=${kind}`}">${icon("news", 18)}More News</a></div>`
        : `<p class="muted small">Nothing of this type in the latest batch.</p>`) : newsEmpty}
    </section>`;

    const html = `
      <div class="page-head"><div><h1>${y} Season</h1><p class="sub">${next ? `${done.length} of ${total} Rounds Complete` : "Final Standings"}</p></div></div>
      ${nextCard}
      ${stats}
      <div class="home-grid">${lastCard}${boards}</div>
      ${newsCard}`;
    return { html, mount(root) {
      onSeg(root, "#newsKind", v => setQuery({ nk: v === "all" ? null : v }));
      return mountCountdown(root);
    } };
  }

  // ===================================================================
  // NEWS PAGE
  // ===================================================================
  async function newsView(_, q) {
    const [arc, y] = await Promise.all([newsArchive(), latestYear()]);
    const s = await season(y);
    const all = arc?.items || [];
    if (!all.length) return { html: `<div class="page-head"><h1>News</h1></div>${newsEmpty}` };
    const kind = ["article", "video", "social"].includes(q.get("k")) ? q.get("k") : "all";
    const d = s.drivers[q.get("d")] ? q.get("d") : "", t = s.constructors[q.get("t")] ? q.get("t") : "";
    const sources = arc.sources || [...new Set(all.map(n => n.s))].sort();
    const src = sources.includes(q.get("s")) ? q.get("s") : "";
    const list = all.filter(n => (kind === "all" || n.k === kind) && (!d || n.dr.includes(d)) && (!t || n.tm.includes(t)) && (!src || n.s === src));
    const nD = id => all.filter(n => n.dr.includes(id)).length, nT = id => all.filter(n => n.tm.includes(id)).length;
    const drivers = s.driverStandings.length ? s.driverStandings.map(x => x.d) : Object.keys(s.drivers);
    const teams = s.constructorStandings.length ? s.constructorStandings.map(x => x.c) : Object.keys(s.constructors);
    const filtered = d || t || src || kind !== "all";
    const html = `
      <div class="page-head"><div><h1>News</h1><p class="sub">${list.length.toLocaleString()} of ${all.length.toLocaleString()} Stories, Updated ${ago(arc.updated)}</p></div>
        <div class="controls">${seg("kind", [["all", "All"], ["article", "Articles"], ["video", "Videos"], ["social", "Social"]], kind, "News Type")}</div></div>
      <section class="card nw-filters">
        <select class="pick" id="nwDriver" aria-label="Driver"><option value="">All Drivers</option>${drivers.map(id => `<option value="${id}"${id === d ? " selected" : ""}>${esc(s.drivers[id].name)} (${nD(id)})</option>`).join("")}</select>
        <select class="pick" id="nwTeam" aria-label="Team"><option value="">All Teams</option>${teams.map(id => `<option value="${id}"${id === t ? " selected" : ""}>${esc(s.constructors[id].name)} (${nT(id)})</option>`).join("")}</select>
        <select class="pick" id="nwSource" aria-label="Source"><option value="">All Sources</option>${sources.map(x => `<option value="${esc(x)}"${x === src ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>
        <input class="search" id="nwSearch" type="search" placeholder="Search Headlines" aria-label="Search Headlines" autocomplete="off">
        ${filtered ? `<a class="link small" href="#/news">Clear Filters</a>` : ""}
      </section>
      <section class="card"><div class="nw-list cols" id="nwList"></div><p class="muted small" id="nwNone" hidden>No stories match.</p>
        <div class="nw-foot"><span class="tiny muted" id="nwCount"></span><button type="button" class="btn" id="nwMore" hidden>Show More</button></div></section>
      <p class="foot">Headlines and summaries link to the publisher. OutLap stores only the headline, a short summary and a thumbnail link, for 30 days.</p>`;
    return { html, mount(root) {
      onSeg(root, "#kind", v => setQuery({ k: v === "all" ? null : v }));
      onChange(root, "#nwDriver", v => setQuery({ d: v }));
      onChange(root, "#nwTeam", v => setQuery({ t: v }));
      onChange(root, "#nwSource", v => setQuery({ s: v }));
      const box = $("#nwList", root), more = $("#nwMore", root), none = $("#nwNone", root), cnt = $("#nwCount", root), sea = $("#nwSearch", root);
      let shown = 30, words = [];
      const draw = () => {
        const hits = words.length ? list.filter(n => { const h = `${n.t} ${n.x} ${n.s}`.toLowerCase(); return words.every(w => h.includes(w)); }) : list;
        box.innerHTML = hits.slice(0, shown).map(n => newsItem(n, s)).join("");
        none.hidden = hits.length > 0; more.hidden = hits.length <= shown;
        cnt.textContent = hits.length ? `Showing ${Math.min(shown, hits.length)} of ${hits.length.toLocaleString()}` : "";
        $$("img", box).forEach(im => { if (im.complete && im.naturalWidth) im.classList.add("in"); });
      };
      let deb = null;
      sea.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { words = sea.value.toLowerCase().split(/\s+/).filter(Boolean); shown = 30; draw(); }, 150); };
      more.onclick = () => { shown += 30; draw(); };
      draw();
      return () => clearTimeout(deb);
    } };
  }

  // ===================================================================
  // TELEMETRY
  // ===================================================================
  const METRICS = {
    spd: { label: "Speed", stops: ["#2D5BD3", "#22B7C9", "#3CC47C", "#F2B01E", "#F26B1D"], fmt: v => `${Math.round(U.spd(v))}`, unit: () => U.spdUnit() },
    thr: { label: "Throttle", stops: ["#D5D9E0", "#7FD4A6", "#1D9A5B"], fixed: [0, 100], fmt: v => `${Math.round(v)}`, unit: () => "%" },
    brk: { label: "Brake", stops: ["#D5D9E0", "#E5484D"], fixed: [0, 1], fmt: v => (v ? "On" : "Off"), unit: () => "" },
    gear: { label: "Gear", stops: ["#6B4FD8", "#2D5BD3", "#22B7C9", "#3CC47C", "#F2B01E", "#F26B1D"], fixed: [1, 8], fmt: v => `${Math.round(v)}`, unit: () => "" },
    gx: { label: "Braking G", stops: ["#E5484D", "#F2A7A9", "#D5D9E0", "#9AD9B6", "#1D9A5B"], fixed: [-3.5, 3.5], fmt: v => v.toFixed(1), unit: () => "G" },
    gy: { label: "Cornering G", stops: ["#D5D9E0", "#B79CF0", "#7A3FD1", "#F2B01E"], abs: true, fixed: [0, 4.5], fmt: v => Math.abs(v).toFixed(1), unit: () => "G" },
  };
  function cumTime(D) {
    const t = [0];
    for (let i = 1; i < D.d.length; i++) { const v = Math.max(5, (D.spd[i] + D.spd[i - 1]) / 2 / 3.6); t.push(t[i - 1] + (D.d[i] - D.d[i - 1]) / v); }
    const k = D.lap / t[t.length - 1];
    return t.map(x => x * k);
  }
  function alignTo(A, B) {
    const n = A.x.length, m = B.x.length;
    const map = A.x.map((x, i) => {
      const g = Math.round((i / (n - 1)) * (m - 1)); let best = g, bd = Infinity;
      for (let j = Math.max(0, g - 30); j <= Math.min(m - 1, g + 30); j++) { const d = (B.x[j] - x) ** 2 + (B.y[j] - A.y[i]) ** 2; if (d < bd) { bd = d; best = j; } }
      return best;
    });
    map[0] = 0; map[n - 1] = m - 1; return map;
  }
  function findCorners(A, circuit) {
    const n = A.spd.length, top = Math.max(...A.spd), out = [];
    for (let i = 4; i < n - 4; i++) {
      const w = A.spd.slice(i - 4, i + 5);
      if (A.spd[i] === Math.min(...w) && A.spd[i] < top * 0.8 && (!out.length || i - out[out.length - 1] > 8)) out.push(i);
    }
    const names = CORNERS[circuit];
    return out.map((i, k) => ({ i, name: names && names.length === out.length ? names[k] : `Corner ${k + 1}` }));
  }
  function lapStats(D) {
    const n = D.spd.length;
    return { top: Math.max(...D.spd), min: Math.min(...D.spd), full: D.thr.filter(v => v >= 98).length / n, brake: D.brk.filter(Boolean).length / n, brakeG: Math.abs(Math.min(...D.gx)), latG: Math.max(...D.gy.map(Math.abs)) };
  }

  let telSlot = "b"; // which picker slot the next driver tap fills
  async function telemetryView(_, q) {
    const [index, C] = await Promise.all([telIndex(), circuitsData()]);
    if (!index.length) return { html: `<div class="empty"><img class="empty-mark" src="brand/outlap-mark.svg" alt=""><h3>No Lap Telemetry Yet</h3><p>Run <code>python ingest/build_data.py</code> to download lap telemetry from OpenF1 (2023 onward) and <code>python ingest/backfill_fastf1.py</code> on your own computer for 2018 to 2022.</p></div>` };
    const bySlug = q.get("ty") && index.filter(i => i.year === +q.get("ty")).find(i => nameSlug(i.name) === q.get("tr") || `round-${i.round}` === q.get("tr"));
    const file = index.find(i => i.file === q.get("f")) ? q.get("f") : bySlug ? bySlug.file : index[index.length - 1].file;
    const entry = index.find(i => i.file === file);
    const [tel, s] = await Promise.all([load(`telemetry/${file}`), season(entry.year)]);
    const idOf = code => Object.keys(s.drivers).find(k => s.drivers[k].code === code);
    const nm = code => { const id = idOf(code); return id ? s.drivers[id].name : code; };
    const ln = code => { const id = idOf(code); return id ? lastName(s, id) : code; };
    const codes = tel.drivers.map(d => d.code);
    const a = codes.includes((q.get("a") || "").toUpperCase()) ? q.get("a").toUpperCase() : codes[0];
    const b = q.get("b") === "none" ? null : codes.includes((q.get("b") || "").toUpperCase()) && q.get("b").toUpperCase() !== a ? q.get("b").toUpperCase() : codes.find(c => c !== a) || null;
    const A = tel.drivers.find(d => d.code === a), B = b ? tel.drivers.find(d => d.code === b) : null;
    const dA = idOf(a), dB = b ? idOf(b) : null;
    const cA = dA ? teamOf(s, dA) : null, cB = dB ? teamOf(s, dB) : null;
    const colA = A.color || teamColor(cA);
    let colB = B ? (B.color || teamColor(cB)) : null;
    if (B && colB.toLowerCase() === colA.toLowerCase()) colB = "#5A6070";
    const mapMode = (q.get("m") && (q.get("m") === "faster" ? !!B : METRICS[q.get("m")])) ? q.get("m") : (B ? "faster" : "spd");
    const chartMode = ["spd", "thr", "gear", "g"].includes(q.get("c")) ? q.get("c") : "spd";

    const n = A.d.length, dist = A.d, total = dist[n - 1];
    const bMap = B ? alignTo(A, B) : null;
    const tA = cumTime(A), tB = B ? cumTime(B) : null;
    const bv = key => B ? dist.map((_, i) => B[key][bMap[i]]) : null;
    const rawGap = B ? tA.map((t, i) => tB[bMap[i]] - t) : null;
    const gap = B ? rawGap.map((_, i) => { let sum = 0, c = 0; for (let k = i - 3; k <= i + 3; k++) if (k >= 0 && k < n) { sum += rawGap[k]; c++; } return sum / c; }) : null;
    const corners = findCorners(A, tel.circuit);
    const sA = lapStats(A), sB = B ? lapStats(B) : null;
    const brakeBands = []; let st = null;
    A.brk.forEach((v, i) => { if (v && st == null) st = i; if ((!v || i === n - 1) && st != null) { brakeBands.push({ x0: dist[st], x1: dist[i], fill: "#F6F7F9" }); st = null; } });

    // map geometry
    const xs = A.x, ys = A.y.map(v => -v);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY), padM = span * 0.08, sw = span / 62;
    const vb = [minX - padM, minY - padM, maxX - minX + 2 * padM, maxY - minY + 2 * padM].map(v => v.toFixed(1)).join(" ");
    const pathOf = (a0, a1) => "M" + Array.from({ length: a1 - a0 + 1 }, (_, k) => `${xs[a0 + k].toFixed(1)},${ys[a0 + k].toFixed(1)}`).join("L");
    let segs = "", legend = "";
    if (mapMode === "faster") {
      const parts = 24; let winsA = 0;
      for (let k = 0; k < parts; k++) {
        const i0 = Math.floor((k * (n - 1)) / parts), i1 = Math.floor(((k + 1) * (n - 1)) / parts);
        const aT = tA[i1] - tA[i0], bT = tB[i1] - tB[i0], faster = aT <= bT;
        if (faster) winsA++;
        segs += `<path d="${pathOf(i0, i1)}" stroke="${faster ? colA : colB}"><title>${esc(faster ? ln(a) : ln(b))} Faster by ${Math.abs(aT - bT).toFixed(3)}s</title></path>`;
      }
      legend = `<div class="legend"><span><i style="background:${colA}"></i>${esc(ln(a))} Faster in ${winsA} of 24</span><span><i style="background:${colB}"></i>${esc(ln(b))} Faster in ${24 - winsA}</span></div>`;
    } else {
      const Mt = METRICS[mapMode], vals = A[mapMode].map(v => (Mt.abs ? Math.abs(v) : v));
      const [lo, hi] = Mt.fixed || [Math.min(...vals), Math.max(...vals)];
      for (let i = 1; i < n; i++) segs += `<line x1="${xs[i - 1]}" y1="${ys[i - 1]}" x2="${xs[i]}" y2="${ys[i]}" stroke="${ramp(Mt.stops, ((vals[i] + vals[i - 1]) / 2 - lo) / (hi - lo || 1))}"/>`;
      legend = `<div class="legend" style="gap:10px"><span>${Mt.fmt(lo)}</span><span class="ramp" style="background:linear-gradient(90deg,${Mt.stops.join(",")})"></span><span>${Mt.fmt(hi)} ${esc(Mt.unit())}</span><span>${esc(ln(a))}'s Lap</span></div>`;
    }
    const cornerText = corners.map(c => { const right = xs[c.i] > minX + (maxX - minX) * 0.62; return `<text x="${xs[c.i] + (right ? -sw * 1.6 : sw * 1.6)}" y="${ys[c.i] + sw * 0.6}" text-anchor="${right ? "end" : "start"}" style="font-size:${(sw * 1.25).toFixed(1)}px;stroke-width:${(sw * 0.35).toFixed(1)}px">${esc(c.name)}</text>`; }).join("");

    const official = B && [A, B].every(D => D.sectors && D.sectors.every(v => v != null));
    const thirds = D => { const t = D === A ? tA : tB; const k1 = Math.floor((n - 1) / 3), k2 = Math.floor((2 * (n - 1)) / 3); return [t[k1], t[k2] - t[k1], t[n - 1] - t[k2]]; };
    const secA = official ? A.sectors : thirds(A), secB = B ? (official ? B.sectors : thirds(B)) : null;
    const secMax = B ? Math.max(...secA.map((v, k) => Math.abs(v - secB[k])), 0.05) : 1;

    // picker: season tabs, a strip of tracks, then driver chips ranked by lap time
    const years = [...new Set(index.map(i => i.year))].sort((x, y) => y - x);
    const byRound = new Map(index.filter(i => i.year === entry.year).map(i => [i.round, i]));
    const tracks = s.races.map(r => {
      const t = byRound.get(r.round), c = C[r.circuit], on = t && t.file === file;
      return `<button type="button" class="tp-track${on ? " on" : ""}"${t ? ` data-f="${t.file}"` : " disabled"} aria-pressed="${!!on}" title="${esc(r.name)}${t ? "" : ", No Telemetry Yet"}">
        <span class="tp-map">${c?.x ? outlineSvg(c, { thin: true, pad: 0.12, color: "currentColor" }) : ""}</span>
        <span class="tp-rnd">R${r.round}</span><b>${esc(r.name.replace(/ Grand Prix.*$/, "").replace(/^Grand Prix of /, ""))}</b></button>`;
    }).join("");
    const ranked = tel.drivers.slice().sort((x, y) => x.lap - y.lap), fastest = ranked[0].lap;
    const chipCol = d => d.color || teamColor(idOf(d.code) ? teamOf(s, idOf(d.code)) : null);
    const chips = ranked.map((d, k) => {
      const role = d.code === a ? "a" : d.code === b ? "b" : "";
      return `<button type="button" class="tp-chip${role ? ` is-${role}` : ""}${k >= 10 ? " extra" : ""}" data-code="${esc(d.code)}" aria-pressed="${!!role}" style="--c:${chipCol(d)}">
        <span class="tp-k">${k + 1}</span><span class="tp-n"><b>${esc(d.code)}</b><span>${esc(ln(d.code))}</span></span>
        <span class="tp-l"><b>${fmtLap(d.lap)}</b><span>${k ? `+${(d.lap - fastest).toFixed(3)}` : "Fastest"}</span></span>${role ? `<span class="tp-role" style="background:${role === "a" ? colA : colB}">${role.toUpperCase()}</span>` : ""}</button>`;
    }).join("");
    const mate = (() => { const c0 = cA || A.team; return tel.drivers.find(d => d.code !== a && ((idOf(d.code) && teamOf(s, idOf(d.code)) === c0) || (!idOf(d.code) && d.team === A.team))); })();
    const slot = (key, D, col, label) => `<button type="button" class="tp-slot" data-slot="${key}" aria-pressed="${telSlot === key}" style="--c:${col || "#C9CDD5"}">
      <span class="tp-sl">${label}</span><b>${D ? esc(nm(D.code)) : "No Comparison"}</b><span>${D ? `${fmtLap(D.lap)}, Lap ${D.lapNo}` : "Solo Lap"}</span></button>`;
    const picker = `<section class="card tpick">
      <div class="tp-top">${years.length > 1 ? seg("tpYear", years.map(y => [String(y), String(y)]), String(entry.year), "Season") : `<b class="tp-year">${entry.year}</b>`}
        <span class="tiny muted">${plural(byRound.size, "race", "races")} with lap telemetry this season</span></div>
      <div class="tp-tracks" id="tpTracks">${tracks}</div>
      <div class="tp-drivers">
        <div class="tp-slots">${slot("a", A, colA, "Driver")}
          <div class="tp-acts"><button type="button" class="btn sm" id="tpSwap"${B ? "" : " disabled"}>Swap</button>${mate ? `<button type="button" class="btn sm" id="tpMate" data-code="${esc(mate.code)}">Teammate</button>` : ""}${B ? `<button type="button" class="btn sm" id="tpSolo">Solo</button>` : ""}</div>
          ${slot("b", B, colB, "Compare With")}</div>
        <div class="tp-chips" id="tpChips">${chips}</div>
        ${ranked.length > 10 ? `<button type="button" class="link small tp-all" id="tpAll">Show All ${ranked.length} Drivers</button>` : ""}
      </div></section>`;

    const side = (D, did, cid, col, right) => {
      const shot = did ? portrait([bigHeadshot(D.headshot), D.headshot, ...photoUrls(did, s, true)], s.drivers[did].name, right ? "ht-right" : "ht-left") : "";
      const teamName = s.constructors[cid]?.name || D.team || "";
      const info = `<a class="info" href="${did ? `#/driver/${did}?y=${s.year}` : "#/drivers"}">
          <span class="team">${right ? "" : logo(cid, s.year, s, 30)}${esc(teamName)}${right ? logo(cid, s.year, s, 30) : ""}</span>
          <span class="name">${esc(did ? s.drivers[did].name : D.code)}</span>
          <span class="big">${fmtLap(D.lap)}</span>
          <span class="meta">Lap ${D.lapNo}, Top Speed ${U.spdTxt(Math.max(...D.spd))}</span></a>`;
      return `<div class="side${right ? " right" : ""}" style="background:${dark(col)}">${shot}${info}</div>`;
    };
    const gapChip = B ? `<div class="gap"><b>${Math.abs(B.lap - A.lap).toFixed(3)}s</b><span>${esc(ln((B.lap < A.lap ? B : A).code))} Quicker</span></div>` : "";
    const row3 = (l, va, vb2, strong) => `<div class="row3"><span>${l}</span><b${strong === "a" ? ` style="color:${colA}"` : ""}>${va}</b><b class="${B ? "" : "hide"}"${strong === "b" ? ` style="color:${colB}"` : ' style="font-weight:500"'}>${vb2 ?? ""}</b></div>`;

    const html = `
      <div class="page-head">
        <div><p class="kicker"><a href="#/races?y=${entry.year}&r=${entry.round}">${entry.year} Round ${entry.round}</a></p><h1>${esc(tel.name)}</h1></div>
      </div>
      ${picker}
      <section class="hero${B ? "" : " solo"}">${side(A, dA, cA, colA, false)}${B ? side(B, dB, cB, colB, true) : ""}${gapChip}</section>
      <div class="split-main">
        <section class="card map">
          <div class="card-head"><h2>${mapMode === "faster" ? "Who's Faster Where" : `${esc(METRICS[mapMode].label)} on Track`}</h2></div>
          ${seg("mapMode", [...(B ? [["faster", "Faster"]] : []), ["spd", "Speed"], ["thr", "Throttle"], ["brk", "Brake"], ["gear", "Gear"], ["gx", "Braking G"], ["gy", "Cornering G"]], mapMode, "Colour the Track By")}
          <svg id="map" viewBox="${vb}" role="img" aria-label="Track Map" style="margin-top:12px">
            <path class="base" d="${pathOf(0, n - 1)}Z" style="stroke-width:${(sw * 2.4).toFixed(1)}px"/>
            <g fill="none" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${segs}</g>
            <rect x="${(xs[0] - sw * 1.6).toFixed(1)}" y="${(ys[0] - sw * 0.3).toFixed(1)}" width="${(sw * 3.2).toFixed(1)}" height="${(sw * 0.6).toFixed(1)}" fill="#E8002D"/>
            ${cornerText}
            ${B ? `<circle id="curB" r="${(sw * 1.05).toFixed(1)}" fill="${colB}" stroke="#fff" stroke-width="${(sw * 0.35).toFixed(1)}"/>` : ""}
            <circle id="curA" r="${(sw * 1.25).toFixed(1)}" fill="${colA}" stroke="#fff" stroke-width="${(sw * 0.4).toFixed(1)}"/>
          </svg>
          ${legend}
          <div class="readout" id="readout" aria-live="polite"></div>
        </section>
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>Through the Lap</h2>
              ${seg("chartMode", [["spd", "Speed"], ["thr", "Throttle & Brake"], ["gear", "Gear"], ["g", "G Force"]], chartMode, "Chart")}</div>
            <div class="corner-labels">${corners.map((c, k) => { const l = (dist[c.i] / total) * 100, prev = k ? (dist[corners[k - 1].i] / total) * 100 : -99; return `<span style="left:${l}%;top:${l - prev < 8 && k % 2 === 1 ? 13 : 0}px">${esc(c.name)}</span>`; }).join("")}</div>
            <div id="lapChart"></div>
            <p class="tiny muted" style="margin-top:6px">Shaded bands are braking zones.</p>
          </section>
          ${B ? `<section class="card"><div class="card-head"><h2>Gap Through the Lap</h2><span class="tiny muted">Above zero means ${esc(ln(b))} is behind</span></div><div id="gapChart"></div></section>` : ""}
        </div>
      </div>
          <div class="grid-3">
            <section class="card">
              <h3>${official ? "Sectors" : "Lap in Thirds"}</h3>
              ${secA.map((v, k) => {
                const d = B ? secB[k] - v : 0, w = B ? Math.min(50, (Math.abs(d) / secMax) * 50) : 0, who = d >= 0 ? ln(a) : ln(b), col = d >= 0 ? colA : colB;
                return `<div class="sector"><span class="small muted">${official ? `Sector ${k + 1}` : ["First Third", "Middle Third", "Final Third"][k]}</span><b class="num">${v.toFixed(3)}</b>
                  ${B ? `<span class="sbar"><span style="${d >= 0 ? "right" : "left"}:50%;width:${w}%;background:${col}"></span><i></i></span><span class="tiny" style="font-weight:700;color:${col}">${esc(who)} +${Math.abs(d).toFixed(3)}</span>` : ""}</div>`;
              }).join("")}
              ${official ? "" : `<p class="tiny muted" style="margin-top:8px">Official sector times arrive with the next data refresh.</p>`}
            </section>
            <section class="card">
              <div class="row3 head"><h3>Corner Speed</h3><span style="color:${colA}">${esc(a)}</span><span class="${B ? "" : "hide"}" style="color:${colB || "inherit"}">${esc(b || "")}</span></div>
              ${corners.slice(0, 9).map(c => { const va = A.spd[c.i], vb2 = B ? Math.min(...B.spd.slice(Math.max(0, bMap[c.i] - 6), bMap[c.i] + 7)) : null; return row3(esc(c.name), Math.round(U.spd(va)), vb2 == null ? null : Math.round(U.spd(vb2)), B ? (va > vb2 ? "a" : vb2 > va ? "b" : "") : ""); }).join("")}
              <p class="tiny muted" style="margin-top:8px">Minimum speed in ${U.spdUnit()}.</p>
            </section>
            <section class="card">
              <div class="row3 head"><h3>Lap Summary</h3><span style="color:${colA}">${esc(a)}</span><span class="${B ? "" : "hide"}" style="color:${colB || "inherit"}">${esc(b || "")}</span></div>
              ${[["Top Speed", x => `${Math.round(U.spd(x.top))}`], ["Slowest Point", x => `${Math.round(U.spd(x.min))}`], ["Full Throttle", x => `${Math.round(x.full * 100)}%`], ["On the Brakes", x => `${Math.round(x.brake * 100)}%`], ["Peak Braking G", x => x.brakeG.toFixed(1)], ["Peak Cornering G", x => x.latG.toFixed(1)]]
                .map(([l, f]) => row3(l, f(sA), sB ? f(sB) : null)).join("")}
              <p class="tiny muted" style="margin-top:8px">Speeds in ${U.spdUnit()}. G values are estimates and read low.</p>
            </section>
          </div>`;

    return {
      html,
      canon: q.get("f") || q.get("ty") ? { f: file } : null,
      mount(root, ctx) {
        $$("[data-f]", root).forEach(el => (el.onclick = () => setQuery({ f: el.dataset.f, a: null, b: null })));
        onSeg(root, "#tpYear", v => { const last = index.filter(i => i.year === +v).pop(); if (last) setQuery({ f: last.file, a: null, b: null }); });
        const slots = $$(".tp-slot", root);
        slots.forEach(el => (el.onclick = () => { telSlot = el.dataset.slot; slots.forEach(x => x.setAttribute("aria-pressed", x === el)); }));
        const pick2 = (na, nb) => setQuery({ f: file, a: na, b: nb });
        $$(".tp-chip", root).forEach(el => (el.onclick = () => {
          const code = el.dataset.code;
          if (telSlot === "a") { telSlot = "b"; if (code !== a) pick2(code, code === b ? a : b || "none"); else render(); }
          else if (code === a) pick2(b || a, b ? a : "none");
          else pick2(a, code);
        }));
        const sw = $("#tpSwap", root); if (sw) sw.onclick = () => B && pick2(b, a);
        const mt = $("#tpMate", root); if (mt) mt.onclick = () => pick2(a, mt.dataset.code);
        const so = $("#tpSolo", root); if (so) so.onclick = () => pick2(a, "none");
        const all = $("#tpAll", root); if (all) all.onclick = () => { const on = $("#tpChips", root).classList.toggle("all"); all.textContent = on ? "Show Fewer" : `Show All ${ranked.length} Drivers`; };
        const strip = $("#tpTracks", root), cur = $(".tp-track.on", root);
        if (strip && cur && ctx.first) strip.scrollLeft = cur.offsetLeft - strip.clientWidth / 2 + cur.clientWidth / 2;
        onSeg(root, "#mapMode", v => setQuery({ m: v }));
        onSeg(root, "#chartMode", v => setQuery({ c: v }));
        const nameAt = i => { const c = corners.find(c => Math.abs(dist[c.i] - dist[i]) < 120); return c ? `, ${c.name}` : ""; };
        const title = i => `${U.at(dist[i])}${nameAt(i)}`;
        const spdS = arr => arr.map(v => U.spd(v));
        let series, cfg = {};
        if (chartMode === "spd") { series = [{ name: ln(a), color: colA, values: spdS(A.spd), area: 0.08 }, ...(B ? [{ name: ln(b), color: colB, values: spdS(bv("spd")), dash: true }] : [])]; cfg = { tipRow: (s2, i) => `${Math.round(s2.values[i])} ${U.spdUnit()}`, tipExtra: i => { if (!B) return ""; const d = U.spd(A.spd[i]) - U.spd(B.spd[bMap[i]]); return `<span class="d" style="color:${d >= 0 ? colA : colB}">${esc(d >= 0 ? ln(a) : ln(b))} +${Math.abs(Math.round(d))} ${U.spdUnit()} Here</span>`; } }; }
        if (chartMode === "thr") { series = [{ name: `${ln(a)} Throttle`, color: colA, values: A.thr }, ...(B ? [{ name: `${ln(b)} Throttle`, color: colB, values: bv("thr"), dash: true }] : [])]; cfg = { yMin: 0, yMax: 100, yFmt: v => `${Math.round(v)}%`, tipRow: (s2, i) => `${s2.values[i]}%`, tipExtra: i => `<span class="d">Brake: ${esc(ln(a))} ${A.brk[i] ? "On" : "Off"}${B ? `, ${esc(ln(b))} ${B.brk[bMap[i]] ? "On" : "Off"}` : ""}</span>` }; }
        if (chartMode === "gear") { series = [{ name: ln(a), color: colA, values: A.gear, step: true }, ...(B ? [{ name: ln(b), color: colB, values: bv("gear"), dash: true, step: true }] : [])]; cfg = { yMin: 0.5, yMax: 8.5, tipRow: (s2, i) => `Gear ${s2.values[i]}`, tipExtra: i => `<span class="d">RPM ${A.rpm[i].toLocaleString()}${B ? ` / ${B.rpm[bMap[i]].toLocaleString()}` : ""}</span>` }; }
        if (chartMode === "g") { series = [{ name: ln(a), color: colA, values: A.gx }, ...(B ? [{ name: ln(b), color: colB, values: bv("gx"), dash: true }] : [])]; cfg = { zero: true, yFmt: v => v.toFixed(1), tipRow: (s2, i) => `${s2.values[i].toFixed(1)} G`, tipExtra: i => `<span class="d">Cornering ${Math.abs(A.gy[i]).toFixed(1)} G${B ? ` / ${Math.abs(B.gy[bMap[i]]).toFixed(1)} G` : ""}</span>` }; }
        const ch = mountChart($("#lapChart", root), { xs: dist, series, height: 270, xFmt: U.axis, tipTitle: title, bands: brakeBands, onMove: i => setCursor(i, false), label: "Lap Chart", animate: ctx.first, ...cfg });
        cleanups.push(ch.destroy);
        const gch = B ? mountChart($("#gapChart", root), { xs: dist, series: [{ name: `${ln(b)} vs ${ln(a)}`, color: colB, values: gap, area: 0.1 }], height: 200, xFmt: U.axis, tipTitle: title, zero: true, yFmt: v => `${signed(v, 2)}s`, tipRow: (s2, i) => `${signed(s2.values[i], 2)}s`, onMove: i => setCursor(i, false, "gap"), label: "Gap Chart", animate: ctx.first }) : null;
        if (gch) cleanups.push(gch.destroy);
        const cA2 = $("#curA", root), cB2 = $("#curB", root), out = $("#readout", root);
        function setCursor(i, fromMap, from) {
          cA2.setAttribute("cx", xs[i]); cA2.setAttribute("cy", ys[i]);
          const j = B ? bMap[i] : null;
          if (B) { cB2.setAttribute("cx", B.x[j]); cB2.setAttribute("cy", -B.y[j]); }
          if (fromMap || from === "gap") ch.setCursor(i);
          if (gch && from !== "gap") gch.setCursor(i);
          out.innerHTML = `<div class="row3 head"><span>${esc(title(i))}</span><span style="color:${colA}">${esc(a)}</span><span class="${B ? "" : "hide"}" style="color:${colB || "inherit"}">${esc(b || "")}</span></div>` +
            [["Speed", D => `${Math.round(U.spd(D.spd[D === A ? i : j]))} ${U.spdUnit()}`], ["Throttle", D => `${D.thr[D === A ? i : j]}%`], ["Brake", D => (D.brk[D === A ? i : j] ? "On" : "Off")], ["Gear", D => `${D.gear[D === A ? i : j]}`]]
              .map(([l, f]) => row3(l, f(A), B ? f(B) : null)).join("") + (B ? row3("Gap Here", `${signed(gap[i], 2)}s`, "") : "");
        }
        const map = $("#map", root);
        const pick = e => {
          const pt = map.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          const p = pt.matrixTransform(map.getScreenCTM().inverse());
          let best = 0, bd = Infinity;
          for (let i = 0; i < n; i++) { const d = (xs[i] - p.x) ** 2 + (ys[i] - p.y) ** 2; if (d < bd) { bd = d; best = i; } }
          if (bd < (sw * 7) ** 2) setCursor(best, true);
        };
        map.onpointermove = pick; map.onpointerdown = pick;
        setCursor(corners[0] ? corners[0].i : Math.round(n * 0.1), true);
      },
    };
  }

  // ===================================================================
  // STANDINGS
  // ===================================================================
  async function standingsView(_, q) {
    const y = +(q.get("y") || await latestYear());
    const s = await season(y);
    const done = s.races.filter(r => r.results.length), total = s.races.length;
    const final = s.afterRound >= total;
    const tab = q.get("t") === "constructors" ? "constructors" : "drivers";
    const maxD = Math.max(1, ...s.driverStandings.map(x => x.pts)), maxC = Math.max(1, ...s.constructorStandings.map(x => x.pts));
    const L1 = s.driverStandings[0], L2 = s.driverStandings[1];
    const top = s.driverStandings.slice(0, 6).map(x => x.d);
    const html = `
      <div class="page-head"><div><h1>${y} Standings</h1><p class="sub">${final ? "Final Standings" : `After Round ${s.afterRound} of ${total}`}</p></div><div class="controls">${await seasonPick(y)}</div></div>
      ${L1 ? `<section class="hero solo hero-short"><div class="side" style="background:${dark(teamColor(L1.c))}">
        ${portrait(photoUrls(L1.d, s, true), s.drivers[L1.d].name, "ht-left")}
        <a class="info" href="#/driver/${L1.d}?y=${y}"><span class="team">${logo(L1.c, y, s, 30)}${final ? "World Champion" : "Championship Leader"}</span><span class="name">${esc(s.drivers[L1.d].name)}</span>
        <span class="big">${fmtPts(L1.pts)} Pts</span><span class="meta">${L2 ? `${fmtPts(L1.pts - L2.pts)} Points Ahead of ${esc(lastName(s, L2.d))}, ` : ""}${plural(L1.wins, "Win", "Wins")}</span></a></div></section>` : ""}
      ${done.length > 1 ? `<section class="card"><div class="card-head"><h2>Points Race</h2><span class="tiny muted">Grand Prix points by round for the top six. Sprints aren't included.</span></div><div id="ptsChart"></div><div class="legend" id="ptsLegend" style="margin-top:8px"></div></section>` : ""}
      ${done.length ? `<section class="card"><h2 style="margin-bottom:12px">Season Leaders</h2><div class="leaders">${seasonLeaders(s).map(l => `<a class="leader" href="#/driver/${l.did}?y=${y}" style="--c:${teamColor(teamOf(s, l.did))}"><span class="tiny muted">${l.label}</span><b class="num">${l.v}</b><span class="small">${esc(s.drivers[l.did].name)}</span></a>`).join("")}</div></section>` : ""}
      <section class="card">
        <div class="card-head"><h2>${tab === "drivers" ? "Drivers' Championship" : "Constructors' Championship"}</h2>${seg("tab", [["drivers", "Drivers"], ["constructors", "Constructors"]], tab, "Championship")}</div>
        <div class="table-wrap">${tab === "drivers" ? `<table>
          <thead><tr><th>Pos</th><th>Driver</th><th class="hide-sm">Team</th><th class="r hide-sm">Rating</th><th class="r">Wins</th><th class="r">Points</th><th class="hide-sm" style="width:22%"></th></tr></thead>
          <tbody>${s.driverStandings.map(r => `<tr data-href="#/driver/${r.d}?y=${y}"><td class="pos">${r.pos || "–"}</td><td>${driverLink(r.d, s)}</td><td class="hide-sm">${teamLink(r.c, s, { size: 22 })}</td><td class="r hide-sm">${rBadge(seasonRatings(s)[r.d]?.rating)}</td>
            <td class="r">${r.wins}</td><td class="r num pts">${fmtPts(r.pts)}</td><td class="hide-sm"><div class="bar" style="width:${(r.pts / maxD) * 100}%;background:${teamColor(r.c)}"></div></td></tr>`).join("")}</tbody></table>` : `<table>
          <thead><tr><th>Pos</th><th>Team</th><th class="r">Wins</th><th class="r">Points</th><th class="hide-sm" style="width:34%"></th></tr></thead>
          <tbody>${s.constructorStandings.map(r => `<tr data-href="#/team/${r.c}?y=${y}"><td class="pos">${r.pos || "–"}</td><td>${teamLink(r.c, s)}</td><td class="r">${r.wins}</td>
            <td class="r num pts">${fmtPts(r.pts)}</td><td class="hide-sm"><div class="bar" style="width:${(r.pts / maxC) * 100}%;background:${teamColor(r.c)}"></div></td></tr>`).join("")}</tbody></table>`}</div>
      </section>`;
    return { html, mount(root, ctx) {
      onChange(root, "#season", v => setQuery({ y: v }));
      onSeg(root, "#tab", v => setQuery({ t: v === "drivers" ? null : v }));
      const el = $("#ptsChart", root); if (!el) return;
      const rounds = done.map(r => r.round), cum = {};
      top.forEach(d => { let t = 0; cum[d] = done.map(r => { const x = r.results.find(z => z.d === d); t += x ? x.pts : 0; return t; }); });
      const used = new Set();
      const col = d => { let c = teamColor(teamOf(s, d)); if (used.has(c)) c = mix(c, "#0F1218", 0.45); used.add(c); return c; };
      const series = top.map(d => ({ name: lastName(s, d), color: col(d), values: cum[d], width: 2.4 }));
      $("#ptsLegend", root).innerHTML = series.map((x, k) => `<a class="who" href="#/driver/${top[k]}?y=${y}"><i style="background:${x.color}"></i>${esc(s.drivers[top[k]].name)}</a>`).join("");
      const ch = mountChart(el, { xs: rounds, series, height: 260, xTicks: rounds.filter((r, k) => k % Math.ceil(rounds.length / 8) === 0 || k === rounds.length - 1), xFmt: r => `R${r}`,
        tipTitle: i => `Round ${done[i].round}, ${done[i].name}`, tipRow: (s2, i) => `${fmtPts(s2.values[i])} Pts`, yMin: 0, label: "Cumulative Points", animate: ctx.first });
      return ch.destroy;
    } };
  }

  // ===================================================================
  // RACES
  // ===================================================================
  async function racesView(_, q) {
    const y = +(q.get("y") || await latestYear());
    const s = await season(y);
    const done = s.races.filter(r => r.results.length);
    const rnd = +(q.get("r") || findRace(s.races, q.get("rs") || "")?.round || (done.length ? done[done.length - 1].round : 1));
    const race = s.races.find(r => r.round === rnd) || s.races[0];
    const tele = (await telIndex()).find(i => i.year === y && i.round === race.round);
    const fl = race.results.find(r => r.flr === 1);
    const pod = race.results.slice(0, 3);
    const raceNotes = [];
    if (race.results.length) {
      const fin = race.results.filter(x => classified(x) && x.grid), win = race.results[0];
      const gain = fin.slice().sort((a, b) => (b.grid - b.pos) - (a.grid - a.pos));
      const outs = race.results.filter(x => !classified(x));
      const dn = id => `<a class="link" href="#/driver/${id}?y=${y}">${esc(s.drivers[id].name)}</a>`;
      raceNotes.push(["Winner Started", win.grid ? `P${win.grid}` : "Pit Lane"]);
      if (race.pole) raceNotes.push(["Pole Converted", race.pole.d === win.d ? "Yes" : `No, ${esc(lastName(s, race.pole.d))} Finished P${race.results.find(x => x.d === race.pole.d)?.pos ?? "–"}`]);
      if (gain[0] && gain[0].grid - gain[0].pos > 0) raceNotes.push(["Biggest Gainer", `${dn(gain[0].d)}, +${gain[0].grid - gain[0].pos}`]);
      const lose = gain[gain.length - 1];
      if (lose && lose.grid - lose.pos < 0) raceNotes.push(["Biggest Drop", `${dn(lose.d)}, −${lose.pos - lose.grid}`]);
      raceNotes.push(["Laps Completed", `${win.laps}`]);
      raceNotes.push(["Retirements", outs.length ? outs.map(x => `${esc(lastName(s, x.d))} (${esc(x.st)})`).join(", ") : "None"]);
      const lapped = race.results.filter(x => /Lap/.test(x.st)).length; if (lapped) raceNotes.push(["Lapped Finishers", `${lapped}`]);
    }
    const order = pod.length === 3 ? [pod[1], pod[0], pod[2]] : pod;
    const html = `
      <div class="page-head"><div><h1>${y} Races</h1><p class="sub">${done.length} of ${s.races.length} Rounds Complete</p></div><div class="controls">${await seasonPick(y)}</div></div>
      <div class="split-main split-list">
        <section class="card" style="padding:8px"><ul class="race-list">${s.races.map(r => {
          const w = r.results[0];
          return `<li><button type="button" data-r="${r.round}" aria-current="${r.round === race.round}"><span class="rnd">${r.round}</span>
            <span class="rl"><b>${esc(r.name.replace(" Grand Prix", ""))}</b><span class="muted tiny">${esc(r.locality)}, ${shortDate(r.date)}</span></span>
            <span class="tiny" style="font-weight:700">${w ? esc(s.drivers[w.d].code) : ""}</span></button></li>`; }).join("")}</ul></section>
        <div class="stack">
          <div><h1 class="h-race">${esc(race.name)}</h1><p class="muted" style="margin-top:6px"><a class="link" style="color:var(--ink)" href="#/circuit/${race.circuit}">${esc(race.circuitName)}</a>, ${longDate(race.date)}</p></div>
          ${race.results.length ? `
          <div class="podium">${order.map(r => { const c = teamColor(r.c), h = r.pos === 1 ? 210 : r.pos === 2 ? 182 : 162; return `<a href="#/driver/${r.d}?y=${y}" style="height:${h}px;background:${dark(c)}">
            ${portrait(photoUrls(r.d, s, true), s.drivers[r.d].name, "ht-card")}
            <span class="tx"><b>P${r.pos}</b><span>${esc(s.drivers[r.d].name)}</span></span></a>`; }).join("")}</div>
          <div class="card"><div class="hero-stats">
            ${race.pole ? `<div><b>${esc(s.drivers[race.pole.d]?.code)}</b><span>Pole Position, ${fmtLap(race.pole.t)}</span></div>` : ""}
            ${fl ? `<div><b class="purple">${fmtLap(fl.fl)}</b><span>Fastest Lap, ${esc(s.drivers[fl.d].code)}</span></div>` : ""}
            <div>${count(race.results.filter(r => /Finished|Lap/.test(r.st)).length)}<span>Classified Finishers</span></div>
            ${tele ? `<div class="push"><a class="btn" href="#/telemetry?f=${tele.file}">${icon("telemetry", 18)}Lap Telemetry</a></div>` : ""}
          </div></div>
          <div class="grid-2">
            <section class="card"><div class="card-head"><h2>Grid to Finish</h2></div><div id="slope"></div>
              <div class="legend" style="margin-top:8px"><span><svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" stroke="#0F1218" stroke-width="2.5"/></svg> Finished</span><span><svg width="28" height="8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" stroke="#0F1218" stroke-width="2.5" stroke-dasharray="4 4"/></svg> Retired</span><span class="tiny">Hover a line to follow one driver</span></div></section>
            <section class="card"><h2 style="margin-bottom:6px">Race Notes</h2><div class="facts-grid one">${raceNotes.map(([k, v]) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`).join("")}</div></section>
          </div>
          <section class="card"><h2 style="margin-bottom:8px">Race Results</h2><div class="table-wrap"><table>
            <thead><tr><th>Pos</th><th>Driver</th><th class="hide-sm">Team</th><th class="r hide-sm">Grid</th><th class="r">+/−</th><th class="hide-sm">Status</th><th class="r hide-sm">Fastest Lap</th><th class="r">Points</th></tr></thead>
            <tbody>${race.results.map(r => { const g = r.grid ? r.grid - r.pos : null; return `<tr data-href="#/driver/${r.d}?y=${y}"><td class="pos">${r.pos}</td><td>${driverLink(r.d, s)}</td><td class="hide-sm">${teamLink(r.c, s, { size: 22 })}</td>
              <td class="r hide-sm">${r.grid || "Pit Lane"}</td><td class="r ${g > 0 ? "up" : g < 0 ? "down" : ""}">${g == null ? "" : g > 0 ? `+${g}` : g === 0 ? "–" : `−${-g}`}</td>
              <td class="muted small hide-sm">${esc(r.st)}</td><td class="r hide-sm ${r.flr === 1 ? "purple" : ""}">${fmtLap(r.fl)}</td><td class="r">${r.pts ? fmtPts(r.pts) : ""}</td></tr>`; }).join("")}</tbody></table></div></section>` :
          `<div class="empty"><h3>Not Raced Yet</h3><p>Results appear after the Monday data refresh.</p></div>`}
        </div>
      </div>`;
    return { html, canon: q.get("r") || q.get("rs") ? { r: race.round } : null, mount(root) {
      onChange(root, "#season", v => setQuery({ y: v, r: null }));
      $$("[data-r]", root).forEach(b => (b.onclick = () => setQuery({ r: b.dataset.r })));
      const sl = $("#slope", root); if (sl) cleanups.push(mountSlope(sl, race, s).destroy);
      const cur = $('[data-r][aria-current="true"]', root), list = $(".race-list", root);
      if (cur && list && (cur.offsetTop < list.scrollTop || cur.offsetTop > list.scrollTop + list.clientHeight - 60)) list.scrollTop = cur.offsetTop - list.clientHeight / 2;
    } };
  }

  // ===================================================================
  // DRIVERS
  // ===================================================================
  async function driversView(_, q) {
    const y = +(q.get("y") || await latestYear());
    const s = await season(y);
    const R = seasonRatings(s), sort = ["rating", "name"].includes(q.get("sort")) ? q.get("sort") : "standings";
    let ids = s.driverStandings.length ? s.driverStandings.map(x => x.d) : Object.keys(s.drivers);
    if (sort === "rating") ids = ids.slice().sort((a, b) => (R[b]?.raw ?? -1) - (R[a]?.raw ?? -1));
    if (sort === "name") ids = ids.slice().sort((a, b) => (s.drivers[a].last || "").localeCompare(s.drivers[b].last || ""));
    const html = `
      <div class="page-head"><h1>${y} Drivers</h1><div class="controls">${seg("sort", [["standings", "Standings"], ["rating", "Rating"], ["name", "Name"]], sort, "Sort Drivers")}${await seasonPick(y)}</div></div>
      <div class="cards">${ids.map(did => {
        const d = s.drivers[did], c = teamOf(s, did), st = s.driverStandings.find(x => x.d === did) || {};
        return `<a class="dcard" href="#/driver/${did}?y=${y}"><div class="top" style="background:${dark(teamColor(c))}"><span class="n">${esc(d.number || "")}</span>
          ${portrait(photoUrls(did, s, true), d.name, "ht-card")}${logo(c, y, s, 30)}${rBadge(R[did]?.rating, "corner")}</div>
          <div class="bot"><span class="nm"><b>${esc(d.first)}</b><b>${esc(d.last)}</b><span class="tiny muted nat">${flag(d.nat, 13)}${esc(s.constructors[c]?.name || "")}</span></span>
          <span class="st"><span class="num">${ordinal(st.pos)}</span><span class="tiny muted">${fmtPts(st.pts ?? 0)} Pts</span></span></div></a>`;
      }).join("")}</div>`;
    return { html, mount(root) { onChange(root, "#season", v => setQuery({ y: v })); onSeg(root, "#sort", v => setQuery({ sort: v === "standings" ? null : v })); } };
  }

  function driverSeason(s, did) {
    let wins = 0, pods = 0, poles = 0, starts = 0, best = 99, dnf = 0;
    const rows = [];
    s.races.forEach(r => {
      const x = r.results.find(z => z.d === did);
      if (x) { starts++; if (x.pos === 1) wins++; if (x.pos <= 3) pods++; best = Math.min(best, x.pos); if (!/Finished|Lap/.test(x.st)) dnf++; rows.push({ r, x }); }
      if (r.pole && r.pole.d === did) poles++;
    });
    const st = s.driverStandings.find(z => z.d === did) || {};
    return { year: s.year, s, team: teamOf(s, did), pos: st.pos, pts: st.pts ?? 0, wins, pods, poles, starts, dnf, best: best === 99 ? null : best, rows, complete: s.afterRound >= s.races.length };
  }

  async function driverView(did, q) {
    const seasons = await allSeasons();
    const hist = seasons.filter(s => s.drivers[did]).map(s => driverSeason(s, did));
    if (!hist.length) return { html: `<div class="empty"><h3>Driver Not Found</h3><p>${back("#/drivers", "All Drivers")}</p></div>` };
    const y = hist.find(h => h.year === +q.get("y")) ? +q.get("y") : hist[hist.length - 1].year;
    const H = hist.find(h => h.year === y), s = H.s, d = s.drivers[did], col = teamColor(H.team);
    const tot = hist.reduce((a, h) => ({ titles: a.titles + (h.pos === 1 && h.complete ? 1 : 0), wins: a.wins + h.wins, pods: a.pods + h.pods, poles: a.poles + h.poles, starts: a.starts + h.starts }), { titles: 0, wins: 0, pods: 0, poles: 0, starts: 0 });
    const mates = {};
    H.rows.forEach(({ r, x }) => r.results.filter(z => z.c === x.c && z.d !== did).forEach(z => { mates[z.d] = mates[z.d] || { ahead: 0, races: 0 }; mates[z.d].races++; if (x.pos < z.pos) mates[z.d].ahead++; }));
    const mateList = Object.entries(mates).sort((p, q2) => q2[1].races - p[1].races);
    const wikiPhoto = M.drivers[did];
    const cm = car(y, H.team);
    const gallery = (M.drivers[did]?.gallery || []).filter(p => src(p.img));
    const bio = I.drivers[did] || {};
    const RT = seasonRatings(s)[did] || null;
    const careerR = (() => { const rs = hist.map(h => ({ r: seasonRatings(h.s)[did], n: h.starts })).filter(o => o.r); const n = rs.reduce((a, o) => a + o.n, 0); return n ? Math.round(rs.reduce((a, o) => a + o.r.rating * o.n, 0) / n) : null; })();
    const ratingCard = `<section class="card"><div class="card-head"><h2>OutLap Rating</h2><span class="tiny muted">${y} Season</span></div>
      ${RT ? `<div class="rating-top">${rBadge(RT.rating, "big")}<div><b>${nth(RT.rank)} of ${RT.of}</b><span class="small muted">on the ${y} grid</span>${careerR ? `<span class="small muted">Career average ${careerR}</span>` : ""}</div></div>
        <div class="rbars">${[["Qualifying vs Teammate", RT.q], ["Racing vs Teammate", RT.r], ["Results", RT.res], ["Places Gained", RT.rc], ["Consistency", RT.cons]].map(([l, v]) => `<div class="rbar"><span>${l}</span><i><em style="width:${Math.round(v * 100)}%"></em></i><b>${Math.round(v * 100)}</b></div>`).join("")}</div>
        <p class="tiny muted" style="margin-top:10px">Our own score, not an official one. Built from results: teammate head-to-heads count for half so the car matters less, then results, places gained and consistency. Scaled 60 to 99 against the rest of that season's grid.</p>`
      : `<p class="muted small">A rating needs at least five starts in a season.</p>`}</section>`;
    const allRows = hist.flatMap(h => h.rows.map(o => ({ ...o, h })));
    const fins = allRows.filter(o => classified(o.x));
    const avg = a => (a.length ? a.reduce((p, v) => p + v, 0) / a.length : null);
    const avgFin = avg(fins.map(o => o.x.pos)), avgGrid = avg(allRows.filter(o => o.x.grid).map(o => o.x.grid));
    const gained = fins.filter(o => o.x.grid).reduce((a, o) => a + (o.x.grid - o.x.pos), 0);
    const ptsAll = hist.reduce((a, h) => a + h.pts, 0);
    const frontRow = allRows.filter(o => o.x.grid && o.x.grid <= 2).length;
    const bestChamp = Math.min(...hist.filter(h => h.pos).map(h => h.pos));
    const wins = allRows.filter(o => o.x.pos === 1);
    const maxPos = Math.max(20, ...fins.map(o => o.x.pos));
    const dist = Array.from({ length: maxPos }, (_, k) => fins.filter(o => o.x.pos === k + 1).length).concat([allRows.length - fins.length]);
    const teamsRun = []; hist.forEach(h => { const last = teamsRun[teamsRun.length - 1]; if (last && last.c === h.team) last.to = h.year; else teamsRun.push({ c: h.team, from: h.year, to: h.year, s: h.s }); });
    const html = `
      ${back(`#/drivers?y=${y}`, "All Drivers")}
      <div>
        <section class="p-hero" style="background:${dark(col)}">
          <span class="watermark" aria-hidden="true">${esc(d.number || "")}</span>
          ${portrait(photoUrls(did, s, true), d.name, "ht-profile")}
          <div class="txt">
            <span class="team">${logo(H.team, y, s, 32)}${esc(s.constructors[H.team]?.name || "")}</span>
            <h1>${esc(d.first)}<br>${esc(d.last)}</h1>
            <p class="meta flag-line">${flag(d.nat, 22)}<span>${[d.dob ? `Age ${age(d.dob)}` : null, d.number ? `Car ${d.number}` : null].filter(Boolean).map(esc).join(", ")}</span></p>
          </div>
        </section>
        <div class="float-stats">
          ${RT ? `<div><b style="color:${ratingTone(RT.rating)[0] === "#E3E6EB" ? "var(--ink)" : ratingTone(RT.rating)[0] === "#F2B01E" ? "#B57F00" : ratingTone(RT.rating)[0]}" data-count="${RT.rating}" data-dec="0">${RT.rating}</b><span>${y} Rating</span></div>` : ""}<div>${count(tot.titles)}<span>Titles</span></div><div>${count(tot.wins)}<span>Wins</span></div><div>${count(tot.pods)}<span>Podiums</span></div><div>${count(tot.poles)}<span>Poles</span></div><div>${count(tot.starts)}<span>Starts</span></div>
        </div>
        <p class="tiny muted center" style="margin-top:8px">Career totals since 2018.${(!s.openf1?.[d.code]?.headshot && !M.drivers[did]?.official || preview) && wikiPhoto?.credit ? ` Photo: ${esc(wikiPhoto.credit)}${wikiPhoto.license ? `, ${esc(wikiPhoto.license)}` : ""}.` : ""}</p>
      </div>
      <div class="grid-2">
        ${ratingCard}
        <section class="card"><div class="card-head"><h2>Points by Season</h2></div><div id="seasonBars"></div>
          <div class="bar-pos" style="grid-template-columns:repeat(${hist.length},minmax(0,1fr))">${hist.map(h => `<span class="${h.pos === 1 && h.complete ? "champ" : ""}">${ordinal(h.pos)}</span>`).join("")}</div></section>
      </div>
      <div class="grid-2">
        <section class="card"><h2 style="margin-bottom:6px">Profile</h2>
          <div class="facts-grid one">
            <div class="fact"><span>Full Name</span><b>${esc(d.name)}</b></div>
            ${d.dob ? `<div class="fact"><span>Born</span><b>${esc(new Date(d.dob + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))}${bio.Born ? `, ${esc(tidy(bio.Born))}` : ""}</b></div>` : ""}
            <div class="fact"><span>Nationality</span><b>${flag(d.nat, 20)}</b></div>
            ${d.number ? `<div class="fact"><span>Race Number</span><b>${esc(d.number)}</b></div>` : ""}
            ${bio.Height ? `<div class="fact"><span>Height</span><b>${esc(tidy(bio.Height))}</b></div>` : ""}
            <div class="fact"><span>Teams Since 2018</span><b class="team-run">${teamsRun.map(t => `<a href="#/team/${t.c}?y=${t.to}" style="--c:${teamColor(t.c)}">${esc(t.s.constructors[t.c]?.name)} ${t.from === t.to ? t.from : `${t.from}–${String(t.to).slice(2)}`}</a>`).join("")}</b></div>
          </div>
          ${bio.bio ? `<p class="prose small" style="margin-top:12px">${esc(bio.bio)}</p><p class="tiny muted" style="margin-top:8px">From <a href="${esc(bio.url)}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA.</p>` : ""}
        </section>
        <section class="card"><h2 style="margin-bottom:10px">Career Breakdown</h2>
          <div class="mini-stats">
            <div><b>${avgFin ? avgFin.toFixed(1) : "–"}</b><span>Avg Finish</span></div><div><b>${avgGrid ? avgGrid.toFixed(1) : "–"}</b><span>Avg Grid</span></div>
            <div><b>${allRows.length ? (ptsAll / allRows.length).toFixed(1) : "–"}</b><span>Points per Race</span></div><div><b>${gained > 0 ? "+" : ""}${gained}</b><span>Places Gained</span></div>
            <div><b>${frontRow}</b><span>Front Row Starts</span></div><div><b>${isFinite(bestChamp) ? `P${bestChamp}` : "–"}</b><span>Best Championship</span></div>
            <div><b>${allRows.length ? Math.round((fins.length / allRows.length) * 100) : 0}%</b><span>Finish Rate</span></div><div><b>${allRows.length ? Math.round((allRows.filter(o => o.x.pts > 0).length / allRows.length) * 100) : 0}%</b><span>Points Finishes</span></div>
          </div>
          <h3 style="margin:16px 0 4px">Finishing Positions</h3><div id="finDist"></div>
        </section>
      </div>
        <section class="card car-card wide">
          ${cm ? `<a class="car-ph" href="#/team/${H.team}?y=${y}">${imgTag([cm.img], cm.name || "")}</a>` : `<div class="car-ph none" style="background:${tint(col)}">No Photo of This Car Yet</div>`}
          <div class="car-bd">
            <div><h3>${esc(cm?.name || `${s.constructors[H.team]?.name} ${y}`)}</h3><p class="small muted">${esc(s.constructors[H.team]?.name)}, ${y} Season</p>${creditLine(cm)}${cm && cm.verified === false ? '<p class="credit">Matched Automatically</p>' : ""}</div>
            <a class="link small" href="#/cars?y=${y}">All ${y} Cars</a></div>
        </section>
      <section class="card" id="inNews" hidden></section>
      ${wins.length ? `<section class="card"><div class="card-head"><h2>Race Wins</h2><span class="small muted">${plural(wins.length, "Win", "Wins")} since 2018</span></div>
        <div class="win-list${wins.length > 12 ? " collapsed" : ""}" id="winList">${wins.slice().reverse().map(o => `<a href="#/races?y=${o.h.year}&r=${o.r.round}" style="--c:${teamColor(o.x.c)}"><b>${o.h.year}</b><span>${esc(o.r.name.replace(" Grand Prix", ""))}</span><span class="tiny muted">From P${o.x.grid || "–"}</span></a>`).join("")}</div>${wins.length > 12 ? `<button type="button" class="btn more-btn" id="winsMore">Show All ${wins.length} Wins</button>` : ""}</section>` : ""}
      <section class="card">
        <div class="card-head"><h2>${y} Season</h2>${hist.length > 1 ? `<select class="pick" id="yr" aria-label="Season">${hist.slice().reverse().map(h => `<option value="${h.year}"${h.year === y ? " selected" : ""}>${h.year} Season</option>`).join("")}</select>` : ""}</div>
        <div class="hero-stats" style="margin-bottom:14px">
          <div><b>${ordinal(H.pos)}</b><span>${H.complete ? "Final Position" : "Current Position"}</span></div><div>${count(H.pts, Number.isInteger(H.pts) ? 0 : 1)}<span>Points</span></div>
          <div>${count(H.wins)}<span>Wins</span></div><div>${count(H.pods)}<span>Podiums</span></div><div>${count(H.poles)}<span>Poles</span></div><div>${count(H.dnf)}<span>Retirements</span></div>
          ${mateList.map(([m, v]) => `<div><b>${v.ahead}–${v.races - v.ahead}</b><span>Against ${esc(s.drivers[m].name)}</span></div>`).join("")}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Round</th><th>Race</th><th class="r">Grid</th><th class="r">Finish</th><th class="r hide-sm">+/−</th><th class="hide-sm">Status</th><th class="r">Points</th></tr></thead>
          <tbody>${H.rows.map(({ r, x }) => { const g = x.grid ? x.grid - x.pos : null; return `<tr data-href="#/races?y=${y}&r=${r.round}"><td class="muted">${r.round}</td><td><b style="font-weight:600">${esc(r.name.replace(" Grand Prix", ""))}</b></td><td class="r">${x.grid || "Pit"}</td>
            <td class="r num pts">${x.pos}</td><td class="r hide-sm ${g > 0 ? "up" : g < 0 ? "down" : ""}">${g == null ? "" : g > 0 ? `+${g}` : g === 0 ? "–" : `−${-g}`}</td><td class="muted small hide-sm">${esc(x.st)}</td><td class="r">${x.pts ? fmtPts(x.pts) : ""}</td></tr>`; }).join("")}</tbody></table></div>
      </section>
      ${gallery.length ? `<section class="card"><div class="card-head"><h2>Photos</h2></div>
        <div class="gallery">${gallery.map(p => `<figure class="g-item"><a class="g-ph" href="${esc(p.page)}" target="_blank" rel="noopener">${imgTag([p.img], d.name)}</a><figcaption>${esc(p.credit)}${p.license ? `, ${esc(p.license)}` : ""}</figcaption></figure>`).join("")}</div></section>` : ""}`;
    return { html, mount(root, ctx) {
      onChange(root, "#yr", v => setQuery({ y: v }));
      mountInNews(root, seasons[seasons.length - 1], n => n.dr.includes(did), `#/news?d=${did}`);
      const bars = mountBars($("#seasonBars", root), {
        labels: hist.map(h => `'${String(h.year).slice(2)}`), values: hist.map(h => h.pts), height: 210, animate: ctx.first,
        colors: hist.map(h => (h.year === y ? teamColor(h.team) : h.pos === 1 && h.complete ? mix(teamColor(h.team), "#FFFFFF", 0.45) : tint(teamColor(h.team)))), outline: i => (!hist[i].complete ? teamColor(hist[i].team) : null),
        tip: i => { const h = hist[i]; return `<span class="t">${h.year}, ${esc(h.s.constructors[h.team]?.name)}</span><span class="r"><span>Points</span><b>${fmtPts(h.pts)}</b></span><span class="r"><span>Position</span><b>${ordinal(h.pos)}</b></span><span class="r"><span>Wins</span><b>${h.wins}</b></span>${h.complete ? "" : '<span class="d">Season in Progress</span>'}`; },
        label: "Points by Season",
      });
      const wm = $("#winsMore", root); if (wm) wm.onclick = () => { const l = $("#winList", root), c2 = l.classList.toggle("collapsed"); wm.textContent = c2 ? `Show All ${wins.length} Wins` : "Show Fewer"; };
      const fd = mountBars($("#finDist", root), { labels: dist.map((_, k) => (k === dist.length - 1 ? "DNF" : k % 2 === 0 || k === 0 ? `P${k + 1}` : "")), values: dist, height: 160, animate: ctx.first,
        colors: dist.map((_, k) => (k === dist.length - 1 ? "#C9CDD5" : k < 3 ? col : tint(col))),
        tip: k => `<span class="t">${k === dist.length - 1 ? "Did Not Finish" : `Finished P${k + 1}`}</span><span class="r"><span>Races</span><b>${dist[k]}</b></span>`, label: "Finishing Positions" });
      return () => { bars.destroy(); fd.destroy(); };
    } };
  }

  // ===================================================================
  // TEAMS
  // ===================================================================
  function teamSeason(s, c) {
    let pods = 0, poles = 0, best = 99, dnf = 0, wins = 0;
    const drivers = new Set();
    s.races.forEach(r => {
      r.results.filter(x => x.c === c).forEach(x => { drivers.add(x.d); if (x.pos === 1) wins++; if (x.pos <= 3) pods++; best = Math.min(best, x.pos); if (!/Finished|Lap/.test(x.st)) dnf++; });
      if (r.pole && r.results.find(x => x.d === r.pole.d && x.c === c)) poles++;
    });
    const st = s.constructorStandings.find(x => x.c === c) || {};
    return { year: s.year, s, id: c, name: s.constructors[c]?.name, pos: st.pos, pts: st.pts ?? 0, wins, pods, poles, dnf, best: best === 99 ? null : best, drivers: [...drivers], complete: s.afterRound >= s.races.length };
  }
  const carCard = (y, c, s, opts = {}) => {
    const k = car(y, c), t = teamSeason(s, c);
    const tag = opts.link === false ? "div" : "a";
    return `<${tag} class="ccard" ${opts.link === false ? "" : `href="${opts.href || `#/car/${c}?y=${y}`}"`}>
      <div class="ph">${k ? imgTag([k.img], k.name || t.name) : ""}<span class="none" ${k ? 'style="display:none"' : ""}>No Photo Yet</span></div><div class="stripe" style="background:${teamColor(c)}"></div>
      <div class="bd">${opts.year ? "" : logo(c, y, s, 40)}<span class="grow"><b>${esc(opts.year ? (k?.name || t.name) : (opts.title || k?.name || t.name))}</b>
        <span class="tiny muted">${esc(opts.sub || `${t.name}, ${ordinal(t.pos)}, ${fmtPts(t.pts)} Pts`)}</span>${opts.sub2 ? `<span class="tiny muted">${esc(opts.sub2)}</span>` : ""}${creditLine(k, "Photo", opts.link !== false)}${k && k.verified === false ? '<span class="credit">Matched Automatically</span>' : ""}</span></div></${tag}>`;
  };

  async function teamsView(_, q) {
    const y = +(q.get("y") || await latestYear());
    const s = await season(y);
    const ids = s.constructorStandings.length ? s.constructorStandings.map(x => x.c) : Object.keys(s.constructors);
    const html = `
      <div class="page-head"><h1>${y} Teams</h1><div class="controls">${await seasonPick(y)}</div></div>
      <div class="cards wide">${ids.map(c => { const t = teamSeason(s, c); return carCard(y, c, s, { href: `#/team/${c}?y=${y}`, title: t.name, sub: `${ordinal(t.pos)}, ${fmtPts(t.pts)} Pts`, sub2: t.drivers.map(d => s.drivers[d].name).join(", ") }); }).join("")}</div>`;
    return { html, mount(root) { onChange(root, "#season", v => setQuery({ y: v })); } };
  }

  async function teamView(c, q) {
    const seasons = await allSeasons();
    const line = lineage(c);
    const hist = seasons.map(s => { const id = Object.keys(s.constructors).find(k => lineage(k) === line); return id ? teamSeason(s, id) : null; }).filter(Boolean);
    if (!hist.length) return { html: `<div class="empty"><h3>Team Not Found</h3><p>${back("#/teams", "All Teams")}</p></div>` };
    const y = hist.find(h => h.year === +q.get("y")) ? +q.get("y") : hist[hist.length - 1].year;
    const H = hist.find(h => h.year === y), s = H.s, col = teamColor(H.id);
    const names = [...new Set(hist.map(h => h.name))];
    const tot = hist.reduce((a, h) => ({ titles: a.titles + (h.pos === 1 && h.complete ? 1 : 0), wins: a.wins + h.wins, pods: a.pods + h.pods, poles: a.poles + h.poles, pts: a.pts + h.pts }), { titles: 0, wins: 0, pods: 0, poles: 0, pts: 0 });
    const cm = car(y, H.id);
    const html = `
      ${back(`#/teams?y=${y}`, "All Teams")}
      <div>
        <section class="p-hero" style="background:${dark(col)};min-height:320px">
          ${cm ? `<div class="shot car">${imgTag([cm.img], cm.name || H.name, "", true)}</div>` : ""}
          <div class="txt">
            <span class="team">${logo(H.id, y, s, 40)}${esc(cm?.name ? `${cm.name}, ${y}` : String(y))}</span>
            <h1>${esc(H.name)}</h1>
            ${names.length > 1 ? `<p class="meta">Raced as ${names.map(esc).join(", Then ")}</p>` : ""}
          </div>
        </section>
        <div class="float-stats">
          <div>${count(tot.titles)}<span>Titles</span></div><div>${count(tot.wins)}<span>Wins</span></div><div>${count(tot.pods)}<span>Podiums</span></div><div>${count(tot.poles)}<span>Poles</span></div><div>${count(Math.round(tot.pts))}<span>Points</span></div>
        </div>
        <p class="tiny muted center" style="margin-top:8px">Constructors' totals since 2018.${cm?.credit ? ` Car photo: ${esc(cm.credit)}${cm.license ? `, ${esc(cm.license)}` : ""}.` : ""}</p>
      </div>
      <div class="grid-2">
        <section class="card"><h2 style="margin-bottom:6px">Team Profile</h2>
          <div class="facts-grid one">
            ${Object.entries((I.teams[H.id] || I.teams[c] || {}).facts || {}).filter(([k2]) => !/Titles/.test(k2)).map(([k2, v]) => `<div class="fact"><span>${esc(k2)}</span><b>${esc(tidy(v))}</b></div>`).join("")}
            <div class="fact"><span>Nationality</span><b>${flag(s.constructors[H.id]?.nat, 20)}</b></div>
            <div class="fact"><span>One-Two Finishes</span><b>${hist.reduce((a, h) => a + h.s.races.filter(r => r.results.length > 1 && r.results[0].c === h.id && r.results[1].c === h.id).length, 0)}</b></div>
            <div class="fact"><span>Retirements</span><b>${hist.reduce((a, h) => a + h.dnf, 0)}</b></div>
          </div>
          ${(I.teams[H.id] || {}).about ? `<p class="prose small" style="margin-top:12px">${esc(I.teams[H.id].about)}</p><p class="tiny muted" style="margin-top:8px">From <a href="${esc(I.teams[H.id].url)}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA.</p>` : ""}
        </section>
        <section class="card"><h2 style="margin-bottom:10px">Drivers Since 2018</h2>
          <div class="driver-runs">${(() => { const m2 = {}; hist.forEach(h => h.drivers.forEach(d => { m2[d] = m2[d] || { s: h.s, ys: [] }; m2[d].ys.push(h.year); m2[d].s = h.s; })); return Object.entries(m2).sort((a, b) => b[1].ys[b[1].ys.length - 1] - a[1].ys[a[1].ys.length - 1] || b[1].ys.length - a[1].ys.length).map(([d, v]) => `<a href="#/driver/${d}?y=${v.ys[v.ys.length - 1]}"><b>${esc(v.s.drivers[d].name)}</b><span class="tiny muted">${v.ys.length > 1 ? `${v.ys[0]}–${v.ys[v.ys.length - 1]}` : v.ys[0]}, ${plural(v.ys.length, "Season", "Seasons")}</span></a>`).join(""); })()}</div>
        </section>
      </div>
      <section class="card" id="inNews" hidden></section>
      <div class="grid-2">
        <section class="card"><h2 style="margin-bottom:8px">Championship Position</h2><div id="posChart"></div></section>
        <section class="card"><h2 style="margin-bottom:8px">Points by Season</h2><div id="ptsChart"></div></section>
      </div>
      <section class="card"><h2 style="margin-bottom:12px">Every Car Since 2018</h2>
        <div class="cards wide">${hist.slice().reverse().map(h => carCard(h.year, h.id, h.s, { year: true, sub: `${h.year}, ${h.name}, ${ordinal(h.pos)}` })).join("")}</div></section>
      <section class="card"><h2 style="margin-bottom:8px">Season by Season</h2><div class="table-wrap"><table>
        <thead><tr><th>Season</th><th class="hide-sm">Entered As</th><th>Drivers</th><th class="r">Pos</th><th class="r">Wins</th><th class="r hide-sm">Podiums</th><th class="r hide-sm">Poles</th><th class="r">Points</th></tr></thead>
        <tbody>${hist.slice().reverse().map(h => `<tr><td class="num pts">${h.year}</td><td class="hide-sm">${teamLink(h.id, h.s, { size: 22 })}</td>
          <td><span class="who-list">${h.drivers.map(d => driverLink(d, h.s, { code: false })).join("")}</span></td>
          <td class="r">${ordinal(h.pos)}</td><td class="r">${h.wins}</td><td class="r hide-sm">${h.pods}</td><td class="r hide-sm">${h.poles}</td><td class="r num pts">${fmtPts(h.pts)}</td></tr>`).join("")}</tbody></table></div></section>`;
    return { html, mount(root, ctx) {
      const cur = seasons[seasons.length - 1], curId = Object.keys(cur.constructors).find(k => lineage(k) === line);
      mountInNews(root, cur, n => n.tm.some(x => lineage(x) === line), curId ? `#/news?t=${curId}` : "#/news");
      const years = hist.map(h => h.year);
      const tipTitle = i => `${hist[i].year}, ${hist[i].name}`;
      const extra = i => `<span class="r"><span>Wins</span><b>${hist[i].wins}</b></span><span class="r"><span>Podiums</span><b>${hist[i].pods}</b></span>${hist[i].complete ? "" : '<span class="d">Season in Progress</span>'}`;
      const xt = { xs: years, xTicks: years, xFmt: v => `'${String(v).slice(2)}`, dots: true, height: 230, tipTitle, tipExtra: extra, animate: ctx.first };
      const a = mountChart($("#posChart", root), { ...xt, series: [{ name: "Position", color: col, values: hist.map(h => h.pos || null), width: 2.6 }], invert: true, yMin: 1, yMax: 11, yFmt: v => `P${Math.round(v)}`, tipRow: (s2, i) => ordinal(hist[i].pos), label: "Championship Position" });
      const b = mountChart($("#ptsChart", root), { ...xt, series: [{ name: "Points", color: col, values: hist.map(h => h.pts), area: 0.1, width: 2.6 }], yMin: 0, tipRow: (s2, i) => fmtPts(hist[i].pts), label: "Points by Season" });
      return () => { a.destroy(); b.destroy(); };
    } };
  }

  // ===================================================================
  // CARS
  // ===================================================================
  async function carsView(_, q) {
    const y = +(q.get("y") || await latestYear());
    const s = await season(y);
    const ids = s.constructorStandings.length ? s.constructorStandings.map(x => x.c) : Object.keys(s.constructors);
    const html = `
      <div class="page-head"><h1>${y} Cars</h1><div class="controls">${await seasonPick(y)}</div></div>
      <div class="cards wide">${ids.map(c => carCard(y, c, s)).join("")}</div>`;
    return { html, mount(root) { onChange(root, "#season", v => setQuery({ y: v })); } };
  }

  // ===================================================================
  // CAR PAGE
  // ===================================================================
  async function carView(cid, q) {
    const seasons = await allSeasons();
    const years = seasons.filter(s => s.constructors[cid]).map(s => s.year);
    if (!years.length) return { html: `<div class="empty"><h3>Car Not Found</h3><p>${back("#/cars", "All Cars")}</p></div>` };
    const y = years.includes(+q.get("y")) ? +q.get("y") : years[years.length - 1];
    const s = seasons.find(z => z.year === y), t = teamSeason(s, cid), col = teamColor(cid);
    const k = car(y, cid), inf = I.cars[`${y}/${cid}`] || {}, sp = inf.specs || {};
    const name = k?.name || `${t.name} ${y}`;
    const gallery = (inf.gallery || []).filter(p => src(p.img));
    const prevY = years.filter(v => v < y).pop(), nextY = years.find(v => v > y);
    const carLink = (yy, label) => (yy ? `<a class="link" href="#/car/${cid}?y=${yy}">${esc(label || car(yy, cid)?.name || `${yy} Car`)}</a>` : "");
    const one2 = s.races.filter(r => r.results.length >= 2 && r.results[0].c === cid && r.results[1].c === cid).length;
    const raceRows = s.races.filter(r => r.results.length).map(r => ({ r, xs: r.results.filter(x => x.c === cid) })).filter(o => o.xs.length);
    const specOrder = ["Engine", "Power", "Electric Motor", "Weight", "Transmission", "Chassis", "Front Suspension", "Rear Suspension", "Tyres", "Fuel", "Designer"];
    const record = ["Debut", "Races", "Wins", "Poles", "Fastest Laps"].filter(f => sp[f]);
    const html = `
      ${back(`#/cars?y=${y}`, `All ${y} Cars`)}
      <div>
        <section class="p-hero" style="background:${dark(col)};min-height:340px">
          ${k ? `<div class="shot car">${imgTag([k.img], name, "", true)}</div>` : ""}
          <div class="txt">
            <span class="team">${logo(cid, y, s, 40)}${esc(t.name)}, ${y} Season</span>
            <h1>${esc(name)}</h1>
            ${t.drivers.length ? `<p class="meta">Driven by ${t.drivers.map(d => esc(s.drivers[d].name)).join(", ")}</p>` : ""}
          </div>
        </section>
        <div class="float-stats">
          <div><b>${ordinal(t.pos)}</b><span>Constructors'</span></div><div>${count(Math.round(t.pts))}<span>Points</span></div><div>${count(t.wins)}<span>Wins</span></div><div>${count(t.pods)}<span>Podiums</span></div><div>${count(t.poles)}<span>Poles</span></div>
        </div>
        ${k?.credit ? `<p class="tiny muted center" style="margin-top:8px">Photo: ${esc(k.credit)}${k.license ? `, ${esc(k.license)}` : ""}.</p>` : ""}
      </div>
      <div class="split-main split-wide">
        <div class="stack">
          ${inf.about ? `<section class="card"><h2 style="margin-bottom:8px">About the Car</h2><p class="prose">${esc(inf.about)}</p><p class="tiny muted" style="margin-top:10px">From <a href="${esc(inf.url)}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA.</p></section>` : ""}
          <section class="card"><h2 style="margin-bottom:8px">${y} Season Results</h2><div class="table-wrap"><table>
            <thead><tr><th>Round</th><th>Race</th>${t.drivers.map(d => `<th class="r">${esc(s.drivers[d].code)}</th>`).join("")}<th class="r">Points</th></tr></thead>
            <tbody>${raceRows.map(({ r, xs }) => `<tr data-href="#/races?y=${y}&r=${r.round}"><td class="muted">${r.round}</td><td><b style="font-weight:600">${esc(r.name.replace(" Grand Prix", ""))}</b></td>
              ${t.drivers.map(d => { const x = xs.find(z => z.d === d); return `<td class="r ${x && x.pos <= 3 ? "num pts" : ""}">${x ? (/Finished|Lap/.test(x.st) ? `P${x.pos}` : "DNF") : ""}</td>`; }).join("")}
              <td class="r">${fmtPts(xs.reduce((a, x) => a + x.pts, 0))}</td></tr>`).join("")}</tbody></table></div></section>
        </div>
        <div class="stack">
          <section class="card"><h2 style="margin-bottom:6px">Specifications</h2>
            ${specOrder.filter(f => sp[f]).length ? `<div class="facts-grid one">${specOrder.filter(f => sp[f]).map(f => `<div class="fact"><span>${f}</span><b>${esc(tidy(sp[f]))}</b></div>`).join("")}</div>` : `<p class="muted small">No specification sheet found for this car yet.</p>`}
            ${inf.url ? `<p class="tiny muted" style="margin-top:10px">From Wikipedia.</p>` : ""}
          </section>
          <section class="card"><h2 style="margin-bottom:6px">Record</h2><div class="facts-grid one">
            ${record.map(f => `<div class="fact"><span>${f === "Races" ? "Races Entered" : f}</span><b>${esc(tidy(sp[f]))}</b></div>`).join("")}
            <div class="fact"><span>One-Two Finishes</span><b>${one2}</b></div>
            <div class="fact"><span>Retirements</span><b>${t.dnf}</b></div>
            ${prevY ? `<div class="fact"><span>Predecessor</span><b>${carLink(prevY)}</b></div>` : ""}
            ${nextY ? `<div class="fact"><span>Successor</span><b>${carLink(nextY)}</b></div>` : ""}
            <div class="fact"><span>Team</span><b><a class="link" href="#/team/${cid}?y=${y}">${esc(t.name)}</a></b></div>
          </div></section>
        </div>
      </div>
      ${gallery.length ? `<section class="card"><h2 style="margin-bottom:12px">Photos</h2><div class="gallery">${gallery.map(p => `<figure class="g-item"><a class="g-ph" href="${esc(p.page)}" target="_blank" rel="noopener">${imgTag([p.img], name)}</a><figcaption>${esc(p.credit)}${p.license ? `, ${esc(p.license)}` : ""}</figcaption></figure>`).join("")}</div></section>` : ""}`;
    return { html };
  }

  // ===================================================================
  // Shared stats
  // ===================================================================
  const classified = x => /Finished|Lap/.test(x.st);
  function seasonLeaders(s) {
    const t = {};
    const bump = (d, k, n = 1) => { t[d] = t[d] || { wins: 0, poles: 0, pods: 0, fl: 0, pf: 0, dnf: 0, gained: 0 }; t[d][k] += n; };
    s.races.forEach(r => {
      r.results.forEach(x => { if (x.pos === 1) bump(x.d, "wins"); if (x.pos <= 3) bump(x.d, "pods"); if (x.flr === 1) bump(x.d, "fl"); if (x.pts > 0) bump(x.d, "pf"); if (!classified(x)) bump(x.d, "dnf"); if (x.grid && classified(x)) bump(x.d, "gained", x.grid - x.pos); });
      if (r.pole) bump(r.pole.d, "poles");
    });
    const best = k => Object.entries(t).sort((a, b) => b[1][k] - a[1][k])[0];
    return [["Most Wins", "wins"], ["Most Poles", "poles"], ["Most Podiums", "pods"], ["Most Fastest Laps", "fl"], ["Most Points Finishes", "pf"], ["Most Places Gained", "gained"], ["Most Retirements", "dnf"]]
      .map(([label, k]) => { const b = best(k); return b && b[1][k] > 0 ? { label, did: b[0], v: b[1][k] } : null; }).filter(Boolean);
  }

  // Grid to finish: one line per driver, hover to highlight
  function mountSlope(el, race, s) {
    const rows = race.results.filter(x => x.grid > 0);
    const n = Math.max(...race.results.map(x => x.pos), ...rows.map(x => x.grid));
    const H = n * 24 + 30, T = 18;
    el.classList.add("chart-wrap");
    el.innerHTML = `<svg role="img" aria-label="Grid to Finish"></svg><div class="tip"></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
    let W = 600, hot = null;
    const Y = p => T + (p - 1) * 24 + 6;
    function draw() {
      W = Math.max(280, el.clientWidth || 600);
      const L = W < 420 ? 44 : 64, R = W - L;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
      let g = `<text x="${L}" y="10" text-anchor="middle" style="font-weight:700">Grid</text><text x="${R}" y="10" text-anchor="middle" style="font-weight:700">Finish</text>`;
      rows.forEach(x => {
        const c = teamColor(x.c), on = hot == null || hot === x.d, dnf = !classified(x);
        g += `<g class="sl" data-d="${x.d}" style="opacity:${on ? 1 : 0.14}">
          <line x1="${L}" y1="${Y(x.grid)}" x2="${R}" y2="${Y(x.pos)}" stroke="${c}" stroke-width="${hot === x.d ? 3.4 : 2.2}" ${dnf ? 'stroke-dasharray="4 4"' : ""}/>
          <circle cx="${L}" cy="${Y(x.grid)}" r="4" fill="${c}"/><circle cx="${R}" cy="${Y(x.pos)}" r="4" fill="${dnf ? "#fff" : c}" stroke="${c}" stroke-width="2"/>
          <text x="${L - 10}" y="${Y(x.grid) + 4}" text-anchor="end">${esc(s.drivers[x.d].code)}</text><text x="${R + 10}" y="${Y(x.pos) + 4}">${esc(s.drivers[x.d].code)}</text></g>`;
      });
      svg.innerHTML = g;
    }
    const pick = e => {
      const r = svg.getBoundingClientRect(), py = ((e.clientY - r.top) / r.height) * H, px = ((e.clientX - r.left) / r.width) * W;
      const L = W < 420 ? 44 : 64, R = W - L, f = clamp((px - L) / (R - L), 0, 1);
      let best = null, bd = Infinity;
      rows.forEach(x => { const yy = Y(x.grid) + (Y(x.pos) - Y(x.grid)) * f, d = Math.abs(yy - py); if (d < bd) { bd = d; best = x; } });
      if (!best || bd > 14) return;
      hot = best.d; draw();
      const g2 = best.grid - best.pos;
      tip.innerHTML = `<span class="t">${esc(s.drivers[best.d].name)}</span><span class="r"><span>Grid</span><b>P${best.grid}</b></span><span class="r"><span>Finish</span><b>${classified(best) ? `P${best.pos}` : "DNF"}</b></span>${classified(best) ? `<span class="d ${g2 > 0 ? "up" : g2 < 0 ? "down" : ""}">${g2 > 0 ? `Gained ${g2}` : g2 < 0 ? `Lost ${-g2}` : "No Change"}</span>` : `<span class="d">${esc(best.st)}</span>`}`;
      tip.style.display = "flex"; const tw = tip.offsetWidth; tip.style.left = `${clamp(px + 14, 0, W - tw)}px`; tip.style.top = `${clamp(py - 20, 0, H - 120)}px`;
    };
    el.onpointermove = pick; el.onpointerdown = pick;
    el.onpointerleave = () => { hot = null; draw(); tip.style.display = "none"; };
    const ro = new ResizeObserver(draw); ro.observe(el); draw();
    return { destroy: () => ro.disconnect() };
  }

  // ===================================================================
  // CIRCUITS
  // ===================================================================
  const lapKm = c => { const w = parseFloat(c.facts?.length_km), p = (c.pathLen || 0) / 1000; if (w && p && Math.abs(w - p) / w < 0.04) return w; if (c.lengthM) return c.lengthM / 1000; return p; };
  function trackGeom(c) {
    const r = ((c.rotation || 0) * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
    const rot = (x, y) => [x * cs - y * sn, -(x * sn + y * cs)];
    const pts = c.x.map((x, i) => rot(x, c.y[i]));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY);
    const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(c.x[i] - c.x[i - 1], c.y[i] - c.y[i - 1]) / 10);
    const corners = (c.corners || []).map(k => {
      const [px, py] = rot(k.x, k.y);
      const a = (k.a * Math.PI) / 180;
      const [lx, ly] = rot(k.x + 0.06 * span * Math.cos(a), k.y + 0.06 * span * Math.sin(a));
      let best = 0, bd = Infinity; pts.forEach((p, i) => { const dd = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (dd < bd) { bd = dd; best = i; } });
      return { ...k, px, py, lx, ly, i: best, label: `${k.n}${k.l || ""}` };
    });
    return { pts, minX, maxX, minY, maxY, span, d, corners };
  }
  function outlineSvg(c, opts = {}) {
    if (!c.x) return "";
    const G = trackGeom(c), pad = G.span * (opts.pad ?? 0.08), sw = G.span / (opts.thin ? 55 : 70);
    const vb = [G.minX - pad, G.minY - pad, G.maxX - G.minX + 2 * pad, G.maxY - G.minY + 2 * pad].map(v => v.toFixed(0)).join(" ");
    return `<svg viewBox="${vb}" role="img" aria-label="${esc(c.name)} Layout"><path class="outline" d="M${G.pts.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join("L")}Z" fill="none" stroke="${opts.color || "#0F1218"}" stroke-width="${sw.toFixed(0)}" stroke-linejoin="round" pathLength="1"/></svg>`;
  }

  async function circuitsView() {
    const [C, y] = await Promise.all([circuitsData(), latestYear()]);
    const s = await season(y);
    const cal = s.races.map(r => r.circuit).filter(id => C[id]);
    const others = Object.keys(C).filter(id => !cal.includes(id)).sort((a, b) => C[a].name.localeCompare(C[b].name));
    const card = (id, race) => {
      const c = C[id], turns = (c.corners || []).length || c.facts?.turns;
      return `<a class="tcard" href="#/circuit/${id}">
        <div class="tmap">${outlineSvg(c, { thin: true })}${race ? `<span class="rnd">Round ${race.round}</span>` : ""}</div>
        <div class="bd"><b>${esc(c.locality)}</b><span class="tiny muted clamp1">${esc(c.name)}</span>
          <span class="facts"><span>${U.lapNum(lapKm(c))} ${U.lapUnit()}</span>${turns ? `<span>${esc(turns)} Turns</span>` : ""}${c.elevStats ? `<span>${U.hTxt(c.elevStats.max - c.elevStats.min)} Rise</span>` : ""}</span>
          ${race ? `<span class="tiny ${race.results.length ? "muted" : "next"}">${shortDate(race.date)}${race.results.length ? `, ${esc(lastName(s, race.results[0].d))} Won` : ""}</span>` : `<span class="tiny muted">Raced ${c.years.join(", ")}</span>`}
        </div></a>`;
    };
    const html = `
      <div class="page-head"><h1>Circuits</h1></div>
      <h2>${y} Calendar</h2>
      <div class="cards tcards">${s.races.filter(r => C[r.circuit]).map(r => card(r.circuit, r)).join("")}</div>
      ${others.length ? `<h2>Also Raced Since 2018</h2><div class="cards tcards">${others.map(id => card(id, null)).join("")}</div>` : ""}`;
    return { html };
  }

  async function circuitView(id, q) {
    const [C, trends, m, seasons] = await Promise.all([circuitsData(), trendsData(), meta(), allSeasons()]);
    const c = C[id];
    if (!c) return { html: `<div class="empty"><h3>Circuit Not Found</h3><p>${back("#/circuits", "All Circuits")}</p></div>` };
    const f = c.facts || {}, T = trends[id] || { years: {} };
    const mode = q.get("m") === "elev" && c.elev ? "elev" : "plain";
    const G = c.x ? trackGeom(c) : null;
    const turns = (c.corners || []).length || f.turns;
    const lenKm = lapKm(c);
    const wikiLen = parseFloat(f.length_km);
    const recordOk = f.lap_record && wikiLen && Math.abs(wikiLen - (c.lengthM || c.pathLen) / 1000) / wikiLen < 0.03;
    const recTime = recordOk ? (f.lap_record.match(/\d:\d{2}\.\d{3}/) || [f.lap_record])[0] : null;
    const years = m.seasons.filter(y2 => T.years[y2]);
    const winnerOf = y2 => { const s = seasons.find(z => z.year === y2), r = s?.races.find(z => z.circuit === id && z.results.length); return r ? { did: r.results[0].d, s, r } : null; };
    const tele = (await telIndex()).filter(t => t.circuit === id);
    const photos = (c.photos || []).filter(p => src(p.img));
    const heroPhoto = photos[0];
    const ELEV = ["#2D5BD3", "#22B7C9", "#3CC47C", "#F2B01E", "#E5484D"];

    let mapSvg = "";
    if (G) {
      const pad = G.span * 0.1, sw = G.span / 60, P = G.pts;
      const vb = [G.minX - pad, G.minY - pad, G.maxX - G.minX + 2 * pad, G.maxY - G.minY + 2 * pad].map(v => v.toFixed(0)).join(" ");
      const pathD = `M${P.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join("L")}Z`;
      let segs = "";
      if (mode === "elev") {
        const lo = Math.min(...c.elev), hi = Math.max(...c.elev);
        for (let i = 1; i <= P.length; i++) { const a = P[i - 1], b = P[i % P.length]; segs += `<line x1="${a[0].toFixed(0)}" y1="${a[1].toFixed(0)}" x2="${b[0].toFixed(0)}" y2="${b[1].toFixed(0)}" stroke="${ramp(ELEV, ((c.elev[i - 1] + c.elev[i % P.length]) / 2 - lo) / (hi - lo || 1))}"/>`; }
      } else segs = `<path d="${pathD}" stroke="#0F1218"/>`;
      const [x0, y0] = P[0], [x1, y1] = P[3], ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang);
      const start = `<line x1="${x0 + nx * sw * 1.8}" y1="${y0 + ny * sw * 1.8}" x2="${x0 - nx * sw * 1.8}" y2="${y0 - ny * sw * 1.8}" stroke="#E8002D" stroke-width="${sw * 0.7}"/>`;
      const [ax, ay] = P[8], ang2 = Math.atan2(P[10][1] - P[6][1], P[10][0] - P[6][0]);
      const arrow = `<path d="M${-sw * 1.4},${-sw * 1.1} L${sw * 1.2},0 L${-sw * 1.4},${sw * 1.1}" fill="none" stroke="#fff" stroke-width="${sw * 0.45}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${ax} ${ay}) rotate(${(ang2 * 180) / Math.PI})"/>`;
      const turnsSvg = G.corners.map(k => `<g class="turn"><line x1="${k.px}" y1="${k.py}" x2="${k.lx}" y2="${k.ly}" stroke="#9AA0AC" stroke-width="${sw * 0.18}"/><circle cx="${k.lx}" cy="${k.ly}" r="${sw * 1.35}" fill="#fff" stroke="#0F1218" stroke-width="${sw * 0.2}"/><text x="${k.lx}" y="${k.ly}" dy="0.35em" text-anchor="middle" style="font-size:${(sw * (k.label.length > 2 ? 1.05 : 1.3)).toFixed(0)}px">${esc(k.label)}</text></g>`).join("");
      mapSvg = `<svg id="cmap" viewBox="${vb}" role="img" aria-label="${esc(c.name)} With Turn Numbers">
        <path d="${pathD}" fill="none" stroke="#EEF0F3" stroke-width="${sw * 2.6}" stroke-linejoin="round"/>
        <g fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${segs}</g>${start}${arrow}${turnsSvg}
        <circle id="cdot" r="${sw * 1.1}" fill="#E8002D" stroke="#fff" stroke-width="${sw * 0.35}" style="display:none"/></svg>`;
    }
    const fact = (k, v) => (v == null || v === "" ? "" : `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`);
    const html = `
      ${back("#/circuits", "All Circuits")}
      <div>
        <section class="p-hero c-hero">
          ${heroPhoto ? portrait([heroPhoto.img], c.name, "ht-profile ht-wide") : ""}
          <div class="c-outline">${outlineSvg(c, { color: "#FFFFFF", pad: 0.04 })}</div>
          <div class="txt"><span class="team">${esc(c.locality)}, ${esc(c.country)}</span><h1>${esc(c.name)}</h1></div>
        </section>
        <div class="float-stats">
          <div>${count(U.lapNum(lenKm), 3)}<span>Lap Length (${U.lapUnit()})</span></div>
          <div>${count(turns || 0)}<span>Turns</span></div>
          <div>${c.elevStats ? count(Math.round(U.h(c.elevStats.max - c.elevStats.min))) : "<b>–</b>"}<span>Elevation Change (${U.hUnit()})</span></div>
          <div><b>${recTime ? esc(recTime) : "–"}</b><span>Lap Record</span></div>
          <div><b>${c.pitLoss ? `${(+c.pitLoss).toFixed(1)}s` : "–"}</b><span>Pit Stop Loss</span></div>
        </div>
        ${heroPhoto ? `<p class="tiny muted center" style="margin-top:8px">Photo: ${esc(heroPhoto.credit)}${heroPhoto.license ? `, ${esc(heroPhoto.license)}` : ""}.</p>` : ""}
      </div>
      <div class="split-main split-wide">
        <section class="card map">
          <div class="card-head"><h2>Layout and Turns</h2>${c.elev ? seg("cmode", [["plain", "Turns"], ["elev", "Elevation"]], mode, "Map Style") : ""}</div>
          ${mapSvg || `<p class="muted">No layout data for this circuit yet.</p>`}
          ${mode === "elev" ? `<div class="legend" style="gap:10px"><span>${U.hTxt(Math.min(...c.elev))}</span><span class="ramp" style="background:linear-gradient(90deg,${ELEV.join(",")})"></span><span>${U.hTxt(Math.max(...c.elev))} Above Sea Level</span></div>` : ""}
          <p class="tiny muted" style="margin-top:8px">${(c.corners || []).length ? "Official turn numbers. The red line marks start and finish; the arrow shows the racing direction." : "Turn positions aren't available for this circuit yet."}</p>
          <div class="readout" id="creadout"></div>
        </section>
        <div class="stack">
          <section class="card"><h2 style="margin-bottom:6px">Circuit Facts</h2>
            <div class="facts-grid">
              ${fact("Direction", c.direction ? cap(c.direction) : null)}${fact("Opened", f.opened || c.opened)}${fact("First Grand Prix", c.firstGp)}
              ${fact("Lowest Point", c.elevStats ? U.hTxt(c.elevStats.min) : null)}${fact("Highest Point", c.elevStats ? U.hTxt(c.elevStats.max) : null)}${fact("Climb Per Lap", c.elevStats ? `About ${U.hTxt(c.elevStats.climb)}` : null)}
              ${fact("Lap Record Holder", recTime && f.record_driver ? `${f.record_driver}${f.record_year ? `, ${f.record_year}` : ""}` : null)}
              ${fact("Capacity", f.capacity)}${fact("Designer", f.architect)}${fact("Layout", f.layout)}${fact("Races Since 2018", c.years.length)}
            </div>
            <p class="tiny muted" style="margin-top:10px">Elevation comes from 90 m terrain data, so it's approximate and smoothed.</p>
          </section>
          ${c.about?.text ? `<section class="card"><h2 style="margin-bottom:8px">About the Circuit</h2><p class="prose">${esc(c.about.text)}</p>
            <p class="tiny muted" style="margin-top:10px">From <a href="${esc(c.about.url || c.wiki)}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA.</p></section>` : ""}
        </div>
      </div>
      ${c.elev ? `<section class="card"><div class="card-head"><h2>Elevation Profile</h2><span class="tiny muted">From the start line, in ${imperial() ? "feet" : "metres"} above sea level</span></div>
        <div class="corner-labels" id="eTurns"></div><div id="elevChart"></div></section>` : ""}
      ${photos.length || (c.officialMap && src(c.officialMap)) ? `<section class="card"><div class="card-head"><h2>Photos</h2></div>
        <div class="gallery">${c.officialMap && src(c.officialMap) ? `<figure class="g-item"><span class="g-ph" style="background:#fff">${imgTag([c.officialMap], "Official Circuit Map", 'style="object-fit:contain"')}</span><figcaption>Official circuit map, formula1.com</figcaption></figure>` : ""}
        ${photos.map(p => `<figure class="g-item"><a class="g-ph" href="${esc(p.page)}" target="_blank" rel="noopener">${imgTag([p.img], p.title || c.name)}</a><figcaption>${esc(p.credit)}${p.license ? `, ${esc(p.license)}` : ""}</figcaption></figure>`).join("")}</div></section>` : ""}
      ${years.length ? `<div class="grid-3">
        <section class="card"><h3>Pole Lap</h3><div id="tPole"></div></section>
        <section class="card"><h3>Fastest Race Lap</h3><div id="tFl"></div></section>
        <section class="card"><h3>Speed Trap</h3><div id="tTop"></div><p class="tiny muted" style="margin-top:6px">${U.spdUnit()}. Years before 2023 fill in after the FastF1 backfill.</p></section>
      </div>
      ${(() => {
        const W2 = {}, P2 = {}; let conv = 0, n2 = 0, gridSum = 0;
        years.forEach(y2 => { const w = winnerOf(y2); if (!w) return; n2++; W2[w.did] = W2[w.did] || { n: 0, s: w.s }; W2[w.did].n++; gridSum += w.r.results[0].grid || 0; if (w.r.pole) { P2[w.r.pole.d] = P2[w.r.pole.d] || { n: 0, s: w.s }; P2[w.r.pole.d].n++; if (w.r.pole.d === w.did) conv++; } });
        if (!n2) return "";
        const top = o => Object.entries(o).sort((a, b) => b[1].n - a[1].n).slice(0, 4);
        return `<section class="card"><h2 style="margin-bottom:10px">Who Wins Here</h2><div class="grid-3 tight">
          <div><h3>Most Wins</h3>${top(W2).map(([d, v]) => `<div class="fact"><span>${driverLink(d, v.s, { code: false })}</span><b>${v.n}</b></div>`).join("")}</div>
          <div><h3>Most Poles</h3>${top(P2).map(([d, v]) => `<div class="fact"><span>${driverLink(d, v.s, { code: false })}</span><b>${v.n}</b></div>`).join("")}</div>
          <div><h3>Patterns</h3><div class="fact"><span>Pole to Win</span><b>${Math.round((conv / n2) * 100)}%</b></div><div class="fact"><span>Avg Winning Grid Slot</span><b>P${(gridSum / n2).toFixed(1)}</b></div><div class="fact"><span>Different Winners</span><b>${Object.keys(W2).length} of ${n2}</b></div></div>
        </div></section>`;
      })()}
      <section class="card"><div class="card-head"><h2>Winners Since 2018</h2>${tele.length ? `<span class="small">Lap Telemetry: ${tele.map(t => `<a class="link" href="#/telemetry?f=${t.file}">${t.year}</a>`).join(", ")}</span>` : ""}</div><div class="table-wrap"><table>
        <thead><tr><th>Season</th><th>Winner</th><th class="hide-sm">Team</th><th class="r">Pole</th><th class="r hide-sm">Fastest Lap</th><th class="r hide-sm">Speed Trap</th></tr></thead>
        <tbody>${years.slice().reverse().map(y2 => { const w = winnerOf(y2), t = T.years[y2]; return `<tr data-href="#/races?y=${y2}&r=${w?.r.round || ""}"><td class="num pts">${y2}</td>
          <td>${w ? driverLink(w.did, w.s) : esc(t.winner || "–")}</td><td class="hide-sm">${w ? teamLink(w.r.results[0].c, w.s, { size: 22 }) : ""}</td>
          <td class="r">${fmtLap(t.pole)}</td><td class="r hide-sm">${fmtLap(t.fastestLap)}</td><td class="r hide-sm">${t.topSpeed ? Math.round(U.spd(t.topSpeed)) : "–"}</td></tr>`; }).join("")}</tbody></table></div></section>` : ""}`;

    return { html, mount(root, ctx) {
      onSeg(root, "#cmode", v => setQuery({ m: v === "plain" ? null : v }));
      const out = [];
      const map = $("#cmap", root), dot = $("#cdot", root), ro = $("#creadout", root);
      let elevChart = null;
      const nearTurn = i => { if (!G || !G.corners.length) return null; let b = null, bd = Infinity; G.corners.forEach(k => { const dd = Math.abs(G.d[k.i] - G.d[i]); if (dd < bd) { bd = dd; b = k; } }); return bd < 120 ? b : null; };
      function cursor(i, fromMap) {
        if (!G) return;
        dot.style.display = ""; dot.setAttribute("cx", G.pts[i][0]); dot.setAttribute("cy", G.pts[i][1]);
        const t = nearTurn(i);
        ro.innerHTML = `<div class="row3"><span>Distance</span><b>${U.at(G.d[i])}</b><b></b></div>` + (c.elev ? `<div class="row3"><span>Elevation</span><b>${U.hTxt(c.elev[i])}</b><b></b></div>` : "") + `<div class="row3"><span>Nearest Turn</span><b>${t ? `Turn ${esc(t.label)}` : "–"}</b><b></b></div>`;
        if (fromMap && elevChart) elevChart.setCursor(i);
      }
      if (map && G) {
        const pick = e => {
          const pt = map.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          const p = pt.matrixTransform(map.getScreenCTM().inverse());
          let best = 0, bd = Infinity; G.pts.forEach((q2, i) => { const dd = (q2[0] - p.x) ** 2 + (q2[1] - p.y) ** 2; if (dd < bd) { bd = dd; best = i; } });
          if (bd < (G.span / 9) ** 2) cursor(best, true);
        };
        map.onpointermove = pick; map.onpointerdown = pick;
        cursor(0, false);
      }
      const ec = $("#elevChart", root);
      if (ec && G) {
        const total = G.d[G.d.length - 1];
        $("#eTurns", root).innerHTML = G.corners.map((k, j) => { const l = (G.d[k.i] / total) * 100, prev = j ? (G.d[G.corners[j - 1].i] / total) * 100 : -99; return `<span style="left:${l}%;top:${l - prev < 3.2 && j % 2 ? 13 : 0}px">T${esc(k.label)}</span>`; }).join("");
        elevChart = mountChart(ec, { xs: G.d, series: [{ name: "Elevation", color: "#0F1218", values: c.elev.map(U.h), area: 0.08, width: 2.4 }], height: 220, xFmt: U.axis, yFmt: v => `${Math.round(v)} ${U.hUnit()}`,
          tipTitle: i => `${U.at(G.d[i])}${nearTurn(i) ? `, Turn ${nearTurn(i).label}` : ""}`, tipRow: (s2, i) => `${Math.round(s2.values[i]).toLocaleString()} ${U.hUnit()}`, onMove: i => cursor(i, false), label: "Elevation Profile", animate: ctx.first });
        out.push(elevChart);
      }
      if (years.length) {
        const pick = k => years.map(y2 => T.years[y2][k] ?? null);
        const base = { xs: years, xTicks: years, xFmt: v => `'${String(v).slice(2)}`, dots: true, height: 200, padL: 60, tipTitle: i => `${years[i]}`, animate: ctx.first, tipExtra: i => { const w = winnerOf(years[i]); return w ? `<span class="d">Won by ${esc(w.s.drivers[w.did].name)}</span>` : ""; } };
        const mk = (sel, vals, color, fmt, minRange) => { const el = $(sel, root); if (vals.some(v => v != null)) out.push(mountChart(el, { ...base, minRange, series: [{ name: "Value", color, values: vals, width: 2.6 }], yFmt: fmt, tipRow: (s2, i) => fmt(s2.values[i]), label: sel })); else el.innerHTML = '<p class="small muted">No data yet.</p>'; };
        mk("#tPole", pick("pole"), "#0F1218", v => fmtLap(v)); mk("#tFl", pick("fastestLap"), "#7A3FD1", v => fmtLap(v)); mk("#tTop", pick("topSpeed").map(U.spd), "#E8002D", v => `${Math.round(v)}`, 12);
      }
      return () => out.forEach(o => o.destroy());
    } };
  }

  // ===================================================================
  const VIEWS = { home: homeView, news: newsView, telemetry: telemetryView, standings: standingsView, races: racesView, drivers: driversView, driver: driverView, teams: teamsView, team: teamView,
    circuits: circuitsView, circuit: circuitView, car: carView, trends: (a, q) => (q.get("c") ? circuitView(q.get("c"), q) : circuitsView(a, q)), cars: carsView };
  bootRouter();
  render();
  if ("serviceWorker" in navigator && location.protocol === "https:" && !preview) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
