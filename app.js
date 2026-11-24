(() => {
  "use strict";

  const CFG = window.TABLO_CONFIG;
  const API = "https://api.golemio.cz/v2/pid/departureboards";
  const TOKEN_KEY = "golemioToken";
  const PREFS_KEY = "tabloSettings";
  const TS = window.TabloSettings;
  const BOARD_KEY = "activeBoard";
  const METRO_COLORS = { A: "#00a562", B: "#f9b200", C: "#e3000b", D: "#0a4fa3" };

  const ICON_WHEEL = '<svg class="flag" viewBox="0 0 24 24" aria-label="bezbariérový"><path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 13v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43a1.9 1.9 0 0 0-.63-.46A2 2 0 0 0 10 11.09V17c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5A3 3 0 1 1 9 16.17V12.1A5 5 0 1 0 14.9 18h-2.07z"/></svg>';
  const ICON_UBER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 6c-.2-.6-.8-1-1.4-1h-11c-.7 0-1.2.4-1.4 1L3 12v8c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h12v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-8l-2.1-6zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 11l1.5-4.5h11L19 11H5z"/></svg>';
  const ICON_MAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>';

  const $ = (id) => document.getElementById(id);
  const els = {
    boards: $("boards"),
    clock: $("clock"),
    status: $("status"),
    switcher: $("switcher"),
    actions: $("actions"),
    settingsBtn: $("settings-btn"),
    dialog: $("settings"),
    tokenInput: $("token-input"),
    tokenSave: $("token-save"),
    tokenClear: $("token-clear"),
    prefsInput: $("prefs-input"),
    prefsReport: $("prefs-report"),
    prefsHelpBtn: $("prefs-help-btn"),
    prefsHelp: $("prefs-help"),
    shareBtn: $("share-btn"),
    shareBox: $("share-box"),
    shareLink: $("share-link"),
  };

  const state = {
    active: 0,
    data: {},            // key -> { trips: [...], infotexts, at }
    error: null,
    loading: false,
    seq: 0,
    pos: null,           // { lat, lon, acc, at }
    geo: "pending",      // pending | ok | denied | unavailable
    userPicked: false,
    autoSelectPending: CFG.autoSelectByLocation !== false,
    geoNote: "",
  };

  // ---------- Pomocné ----------
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "—");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const board = () => CFG.boards[state.active];
  // Osobní nastavení (jen v localStorage)
  let P = TS.parse(localStorage.getItem(PREFS_KEY) || "").values;
  const PLACE_NAMES = { doma: "Doma", prace: "Práce" };
  const place = (k) => (P[k] ? { name: PLACE_NAMES[k] || k, lat: P[k].lat, lon: P[k].lon } : null);
  const watched = (line) => !P["hlidane-linky"] || P["hlidane-linky"].includes(String(line).toUpperCase());
  const ts = (t) => (t && (t.predicted || t.scheduled) ? new Date(t.predicted || t.scheduled) : null);

  function fmtCountdown(sec) {
    const neg = sec < 0;
    let s = Math.abs(Math.trunc(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    s = s % 60;
    const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    return (neg ? "−" : "") + body;
  }
  const fmtDur = (sec) => {
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  };

  function distanceKm(a, b) {
    const R = 6371;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---------- Token ----------
  // Jednorázový přenos z odkazu: #token=… nebo #nastaveni=… (část za # se na server neposílá)
  function readFromHash() {
    const parts = location.hash.replace(/^#/, "").split("&").filter(Boolean);
    let changed = false;
    const rest = parts.filter((p) => {
      if (p.startsWith("token=")) {
        localStorage.setItem(TOKEN_KEY, decodeURIComponent(p.slice(6)).trim());
        changed = true;
        return false;
      }
      if (p.startsWith("nastaveni=")) {
        try {
          const o = TS.decode(p.slice(10));
          if (o.k) localStorage.setItem(TOKEN_KEY, String(o.k).trim());
          if (typeof o.s === "string") localStorage.setItem(PREFS_KEY, o.s);
          P = TS.parse(localStorage.getItem(PREFS_KEY) || "").values;
          state.importNote = "nastavení načteno z odkazu";
        } catch (e) {
          console.error(e);
          state.importNote = "odkaz s nastavením se nepodařilo přečíst";
        }
        changed = true;
        return false;
      }
      return true;
    });
    if (changed)
      history.replaceState(null, "", location.pathname + location.search + (rest.length ? "#" + rest.join("&") : ""));
  }
  const getToken = () => (localStorage.getItem(TOKEN_KEY) || "").trim();

  // ---------- Volba tabule ----------
  function initialBoard() {
    const fromHash = location.hash.replace(/^#/, "").split("&")[0];
    const fromStore = localStorage.getItem(BOARD_KEY);
    for (const key of [fromHash, fromStore]) {
      const i = CFG.boards.findIndex((b) => b.key === key);
      if (i >= 0) return i;
    }
    return 0;
  }

  function renderSwitcher() {
    els.switcher.innerHTML = CFG.boards
      .map((b, i) => `<button class="seg-btn${i === state.active ? " active" : ""}" data-i="${i}">${esc(b.button || b.title)}</button>`)
      .join("");
    els.switcher.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.userPicked = true;
        state.geoNote = "";
        selectBoard(Number(btn.dataset.i));
      })
    );
    renderActions();
  }

  function selectBoard(i) {
    if (i === state.active) return;
    state.active = i;
    localStorage.setItem(BOARD_KEY, board().key);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    document.title = `Odjezdy – ${board().title}`;
    state.error = null;
    renderSwitcher();
    render();
    refresh();
  }

  // ---------- Uber / Google Maps ----------
  function uberUrl(from, to) {
    const p = new URLSearchParams();
    p.set("action", "setPickup");
    p.set("pickup[latitude]", from.lat);
    p.set("pickup[longitude]", from.lon);
    p.set("pickup[nickname]", from.name);
    p.set("dropoff[latitude]", to.lat);
    p.set("dropoff[longitude]", to.lon);
    p.set("dropoff[nickname]", to.name);
    return `https://m.uber.com/ul/?${p}`;
  }
  function mapsUrl(from, to) {
    const p = new URLSearchParams({
      api: "1",
      origin: `${from.lat},${from.lon}`,
      destination: `${to.lat},${to.lon}`,
      travelmode: "driving",
    });
    return `https://www.google.com/maps/dir/?${p}`;
  }
  // Tlačítka Uber / Trasa autem. Jsou-li v nastavení místa pro taxi (taxi-N), nabídnou
  // podmenu: do práce = z vybraného místa do práce, domů = z práce na vybrané místo.
  // Bod u práce pro taxi: zvlášť příjezd (cíl cesty do práce) a odjezd (nástup cesty domů)
  function taxiPlace(k, dir) {
    if (k === "prace") {
      const p = P[dir === "to" ? "taxi-prace-prijezd" : "taxi-prace-odjezd"];
      if (p) return { name: PLACE_NAMES.prace, lat: p.lat, lon: p.lon };
    }
    return place(k);
  }
  function rideOptions(r) {
    const from = taxiPlace(r.from, "from");
    const to = taxiPlace(r.to, "to");
    const taxi = P.taxi || [];
    if (taxi.length) {
      if (r.from === "doma" && to) return taxi.map((t) => [t, to]);
      if (r.to === "doma" && from) return taxi.map((t) => [from, t]);
    }
    return from && to ? [[from, to]] : [];
  }
  function renderActions() {
    const r = board().ride;
    if (!r) { els.actions.innerHTML = ""; return; }
    const opts = rideOptions(r);
    if (!opts.length) {
      els.actions.innerHTML = `<button type="button" class="act setup" data-open-settings>Nastav doma / práci / taxi pro Uber a mapu</button>`;
      els.actions.querySelector("[data-open-settings]").addEventListener("click", openSettings);
      return;
    }
    const label = `${PLACE_NAMES[r.from]} → ${PLACE_NAMES[r.to]}`;
    const button = (kind, icon, title, sub, urlFn) => {
      if (opts.length === 1) {
        const [f, t] = opts[0];
        return `<a class="act ${kind}" href="${esc(urlFn(f, t))}" target="_blank" rel="noopener">${icon}<span>${title}<small>${esc(sub)}</small></span></a>`;
      }
      const items = opts
        .map(([f, t]) => `<a href="${esc(urlFn(f, t))}" target="_blank" rel="noopener">${esc(f.name)} → ${esc(t.name)}</a>`)
        .join("");
      return `<div class="act-wrap">
          <button type="button" class="act ${kind}" data-menu>${icon}<span>${title}<small>${esc(sub)} ▾</small></span></button>
          <div class="act-menu" hidden>${items}</div>
        </div>`;
    };
    els.actions.innerHTML =
      button("uber", ICON_UBER, "Uber", label, uberUrl) +
      button("maps", ICON_MAP, "Trasa autem", label, mapsUrl);
    els.actions.querySelectorAll("[data-menu]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        const open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
      })
    );
    els.actions.querySelectorAll(".act-menu a").forEach((link) => link.addEventListener("click", closeMenus));
  }
  function closeMenus() {
    els.actions.querySelectorAll(".act-menu").forEach((m) => { m.hidden = true; });
  }
  document.addEventListener("click", (e) => { if (!els.actions.contains(e.target)) closeMenus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

  // ---------- Poloha ----------
  function startGeolocation() {
    if (!("geolocation" in navigator)) { state.geo = "unavailable"; return; }
    navigator.geolocation.watchPosition(onPosition, onPositionError, GEO_OPTS);
  }
  const GEO_OPTS = { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 };
  function onPosition(p) {
    state.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
    state.geo = "ok";
    if (state.autoSelectPending) {
      state.autoSelectPending = false;
      autoSelect();
    }
  }
  function onPositionError(err) {
    if (state.pos) return;   // dočasný výpadek – držím poslední polohu
    state.geo = err.code === 1 ? "denied" : "unavailable";
    state.autoSelectPending = false;
  }

  function autoSelect() {
    if (state.userPicked || !state.pos) return;
    let best = -1;
    let bestDist = Infinity;
    CFG.boards.forEach((b, i) => {
      if (!b.location) return;
      const d = distanceKm(state.pos, b.location);
      if (d <= (b.location.radiusKm ?? 3) && d < bestDist) { best = i; bestDist = d; }
    });
    if (best < 0) return;
    state.geoNote = "tabule podle polohy";
    if (best !== state.active) selectBoard(best);
  }

  // Odkud počítat cestu k zastávce: aktuální poloha, jinak domov / práce z nastavení.
  function origin(b) {
    if (state.pos) return state.pos;
    return place(b.ride?.from);
  }
  // Úsek chůze / kolem: vzdušná vzdálenost × koeficient × tempo (+ přirážka za kolo)
  function legSec(km, legKey) {
    const mode = P[legKey] === "kolo" ? "kolo" : "chuze";
    return km * P.koef * P[mode] * 60 + (mode === "kolo" ? P["kolo-navic"] : 0);
  }
  function accessSec(route, b) {
    const o = origin(b);
    const km = o ? distanceKm(o, route.stop) : 0;
    return legSec(km, route.access.leg) + (route.access.metro ? P["vstup-metro"] : 0);
  }
  // Ze stanice do cíle; null, když cíl (doma / práce) není nastaven
  function finishSec(route) {
    const f = route.finish;
    if (!f) return 0;
    const dest = place(f.to);
    if (!dest) return null;
    return (f.metro ? P["vstup-metro"] : 0) +
      legSec(distanceKm(f.from, dest), f.leg) +
      (f.to === "prace" ? P["vstup-prace"] : 0);
  }
  const finalTime = (t) => {
    if (!t.lastArr) return null;
    const sec = finishSec(t.route);
    return sec == null ? null : new Date(t.lastArr.getTime() + sec * 1000);
  };

  // ---------- Načtení dat ----------
  const DEBUG = /[?&]debug\b/.test(location.search);
  const debugLog = [];

  async function getBoard(ids, minutesAfter, limit, token, label) {
    const p = new URLSearchParams();
    const uniq = [...new Set(ids)];
    uniq.forEach((id) => p.append("ids[]", id));
    p.set("minutesBefore", "0");
    p.set("minutesAfter", String(minutesAfter));
    p.set("limit", String(limit));
    p.set("order", "real");
    p.set("mode", "departures");
    p.set("preferredTimezone", "Europe/Prague");
    const res = await fetch(`${API}?${p}`, {
      headers: { "X-Access-Token": token, Accept: "application/json" },
      cache: "no-store",
    });
    let json = null;
    let bodyText = "";
    if (!res.ok || DEBUG) {
      bodyText = await res.text();
      try { json = JSON.parse(bodyText); } catch { json = null; }
    } else {
      json = await res.json();
    }
    if (DEBUG) {
      const deps = Array.isArray(json?.departures) ? json.departures : [];
      const perStop = {};
      deps.forEach((d) => { perStop[d.stop?.id] = (perStop[d.stop?.id] || 0) + 1; });
      const times = deps.map((d) => ts(d.departure_timestamp)).filter(Boolean);
      debugLog.push({
        label, status: res.status, ids: uniq.join(","), limit, minutesAfter,
        keys: json ? Object.keys(json).join(",") : "(není JSON)",
        count: deps.length,
        perStop: JSON.stringify(perStop),
        span: times.length ? `${hhmm(new Date(Math.min(...times)))}–${hhmm(new Date(Math.max(...times)))}` : "-",
        sample: deps.slice(0, 3).map((d) => `${d.route?.short_name}/${d.stop?.id}/${d.trip?.id}/arr:${d.arrival_timestamp?.predicted || d.arrival_timestamp?.scheduled || "-"}`).join(" | "),
        body: res.ok ? "" : bodyText.slice(0, 300),
      });
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function fetchBoard(b, token) {
    const minAfter = CFG.minutesAfter || 90;
    debugLog.length = 0;
    const routes = b.routes.filter((r) => r.lines.some(watched));
    const originIds = [...new Set(routes.map((r) => r.stop.id))];
    if (!originIds.length) return { trips: [], infotexts: [], at: new Date() };
    // Příjezdy na výstupní / přestupní zastávky: zvlášť dotaz pro každou skupinu stanovišť,
    // aby velké přestupní uzly nevytlačily ostatní zastávky z limitu odpovědi.
    const groups = new Map();
    for (const r of routes) {
      for (const ids of [r.alight.ids, r.transfer?.boardIds, r.transfer?.alight.ids]) {
        if (ids?.length) groups.set([...ids].sort().join(","), ids);
      }
    }
    const [orig, ...legParts] = await Promise.all([
      getBoard(originIds, minAfter, 100, token, "odjezdy"),
      ...[...groups.values()].map((ids) => getBoard(ids, minAfter + 60, 300, token, "příjezdy")),
    ]);
    const legs = { departures: legParts.flatMap((j) => j?.departures || []) };

    // trip.id -> [{ stopId, arr, dep }]
    const byTrip = new Map();
    const tripLine = new Map();
    for (const d of legs.departures || []) {
      const id = d.trip?.id;
      if (!id) continue;
      tripLine.set(id, String(d.route?.short_name ?? ""));
      if (!byTrip.has(id)) byTrip.set(id, []);
      byTrip.get(id).push({
        stopId: d.stop?.id,
        arr: ts(d.arrival_timestamp) || ts(d.departure_timestamp),
        dep: ts(d.departure_timestamp) || ts(d.arrival_timestamp),
      });
    }
    const stopTime = (tripId, ids, after, field) => {
      const hit = (byTrip.get(tripId) || [])
        .filter((e) => ids.includes(e.stopId) && e[field] && (!after || e[field] > after))
        .sort((x, y) => x[field] - y[field])[0];
      return hit ? hit[field] : null;
    };

    // Navazující spoje pro přestupy: [{ dep (z přestupní stanice), arr (do cíle) }]
    const connections = new Map();
    for (const r of routes) {
      if (!r.transfer) continue;
      const list = [];
      for (const tripId of byTrip.keys()) {
        const tl = tripLine.get(tripId);
        if (!watched(tl) || (r.transfer.lines && !r.transfer.lines.includes(tl))) continue;
        const dep = stopTime(tripId, r.transfer.boardIds, null, "dep");
        if (!dep) continue;
        const arr = stopTime(tripId, r.transfer.alight.ids, dep, "arr");
        if (arr) list.push({ dep, arr, line: tripLine.get(tripId) });
      }
      connections.set(r, list.sort((x, y) => x.dep - y.dep));
    }

    const trips = [];
    for (const d of orig.departures || []) {
      const line = String(d.route?.short_name ?? "");
      const route = watched(line) && routes.find((r) => r.stop.id === d.stop?.id && r.lines.includes(line));
      if (!route) continue;
      const dep = ts(d.departure_timestamp);
      if (!dep) continue;
      const delay = d.delay || {};
      const t = {
        route,
        line,
        isMetro: d.route?.type === 1,
        dep,
        delayMin: delay.is_available ? Math.round((delay.seconds ?? delay.minutes * 60) / 60) : null,
        wheelchair: !!d.trip?.is_wheelchair_accessible,
        canceled: !!d.trip?.is_canceled,
        alightAt: stopTime(d.trip?.id, route.alight.ids, dep, "arr"),
        transfer: null,
        lastArr: null,
      };
      let lastArr = t.alightAt;
      if (route.transfer && t.alightAt) {
        const minDep = new Date(t.alightAt.getTime() + route.transfer.minSec * 1000);
        const c = connections.get(route).find((x) => x.dep >= minDep);
        if (c) {
          t.transfer = { dep: c.dep, arr: c.arr, line: c.line, waitSec: (c.dep - t.alightAt) / 1000 };
          lastArr = c.arr;
        } else lastArr = null;
      }
      t.lastArr = lastArr;
      trips.push(t);
    }

    const relevant = new Set(originIds);
    const infotexts = [];
    const seen = new Set();
    for (const it of orig.infotexts || []) {
      const rel = it.related_stops || [];
      if (rel.length && !rel.some((s) => relevant.has(s))) continue;
      if (seen.has(it.text)) continue;
      seen.add(it.text);
      infotexts.push(it.text);
    }
    if (DEBUG) {
      const matched = (orig.departures || []).filter((d) => byTrip.has(d.trip?.id)).length;
      debugLog.push({ label: "párování", count: matched, perStop: `odjezdů ${orig.departures?.length || 0}, z toho nalezeno v příjezdech ${matched}; spojů v příjezdech ${byTrip.size}` });
    }
    return { trips, infotexts, at: new Date() };
  }

  async function refresh() {
    const token = getToken();
    els.settingsBtn.classList.toggle("attention", !token);
    if (!token) {
      state.error = { kind: "notoken" };
      render();
      return;
    }
    const b = board();
    const mySeq = ++state.seq;
    state.loading = true;
    try {
      state.data[b.key] = await fetchBoard(b, token);
      if (mySeq === state.seq) state.error = null;
    } catch (e) {
      console.error(e);
      if (mySeq === state.seq)
        state.error = e.status === 401 || e.status === 403 ? { kind: "badtoken" } : { kind: "net", msg: e.message };
    } finally {
      if (mySeq === state.seq) {
        state.loading = false;
        render();
      }
    }
  }

  // ---------- Vykreslení ----------
  function lineBadge(t) {
    if (t.isMetro) {
      const c = METRO_COLORS[t.line] || "#666";
      const fg = t.line === "B" ? ";color:#1d1d1b" : "";
      return `<span class="metro-icon">M</span><span class="metro-badge" style="background:${c}${fg}">${esc(t.line)}</span>`;
    }
    return `<span class="tram-badge">${esc(t.line)}</span>`;
  }

  function detailHtml(t) {
    const r = t.route;
    const parts = [`<span class="from">${esc(r.stop.name)}</span>`];
    if (t.canceled) parts.push(`<span class="warn">spoj odřeknut</span>`);
    else if (!t.alightAt) parts.push(`<span class="muted">nejede přes ${esc(r.alight.name)}</span>`);
    else {
      parts.push(`${esc(r.alight.name)} <b>${hhmm(t.alightAt)}</b>`);
      if (r.transfer) {
        if (t.transfer) {
          const tight = t.transfer.waitSec < 120 ? " tight" : "";
          const onto = r.transfer.showLine && t.transfer.line ? ` na ${esc(t.transfer.line)}` : "";
          parts.push(`<span class="xfer${tight}">přestup${onto} ${fmtDur(t.transfer.waitSec)}</span>`);
          parts.push(`${esc(r.transfer.alight.name)} <b>${hhmm(t.transfer.arr)}</b>`);
        } else {
          parts.push(`<span class="muted">přestup nenalezen</span>`);
        }
      }
    }
    return parts.join('<span class="sep">›</span>');
  }

  function rowHtml(t, now, leaveIn, isBest) {
    const depIn = (t.dep - now) / 1000;
    const leaveCls = leaveIn < 0 ? "late" : leaveIn < 120 ? "soon" : "ok";
    const delay = t.delayMin ? ` <span class="delay${t.delayMin >= 2 ? " late" : ""}">+${t.delayMin}′</span>` : "";
    return `<div class="row${t.canceled ? " canceled" : ""}${isBest ? " best" : ""}">
      <div class="c-line">${lineBadge(t)}${t.wheelchair ? ICON_WHEEL : ""}</div>
      <div class="c-leave ${leaveCls}">${fmtCountdown(leaveIn)}</div>
      <div class="c-dep">${fmtCountdown(depIn)}<small>${hhmm(t.dep)}${delay}</small></div>
      <div class="c-final">${hhmm(finalTime(t))}</div>
      <div class="c-detail">${detailHtml(t)}</div>
    </div>`;
  }

  function noticeHtml() {
    const e = state.error;
    if (e?.kind === "notoken")
      return `<div class="notice">Pro živé odjezdy je potřeba bezplatný klíč Golemio API.<br>
        <button class="btn primary" data-open-settings>Zadat klíč</button></div>`;
    if (e?.kind === "badtoken")
      return `<div class="notice">Golemio klíč nebyl přijat (neplatný nebo prošlý).<br>
        <button class="btn primary" data-open-settings>Změnit klíč</button></div>`;
    return "";
  }

  function visibleTrips(b, now) {
    const data = state.data[b.key];
    if (!data) return null;
    const minLeave = CFG.minLeaveSec ?? -120;
    return data.trips
      .map((t) => ({ t, leaveIn: (t.dep - now) / 1000 - accessSec(t.route, b) }))
      .filter(({ t, leaveIn }) => t.dep > now && leaveIn >= minLeave)
      .sort((x, y) => x.leaveIn - y.leaveIn)
      .slice(0, CFG.maxRows || 8);
  }

  function render() {
    const now = new Date();
    const b = board();
    const data = state.data[b.key];
    const notice = noticeHtml();
    let body;
    if (notice) body = notice;
    else if (!data) body = `<div class="empty">Načítám odjezdy…</div>`;
    else {
      const list = visibleTrips(b, now);
      // Zvýraznit spoj, se kterým budu v cíli nejdřív (z těch, které ještě stihnu)
      let best = null;
      let bestFinal = null;
      for (const { t, leaveIn } of list) {
        const f = finalTime(t);
        if (leaveIn >= 0 && f && !t.canceled && (!bestFinal || f < bestFinal)) { best = t; bestFinal = f; }
      }
      body = list.length
        ? `<div class="row head"><div>Spoj</div><div>Vyrazit</div><div>Odjezd</div><div>V cíli</div></div>` +
          list.map(({ t, leaveIn }) => rowHtml(t, now, leaveIn, t === best)).join("")
        : `<div class="empty">V příštích ${CFG.minutesAfter || 90} minutách žádný spoj.</div>`;
    }
    const info = !notice && data?.infotexts?.length
      ? `<div class="infotexts">${data.infotexts.map((t) => `<div class="infotext">${esc(t)}</div>`).join("")}</div>`
      : "";
    els.boards.innerHTML = `<section class="board-wrap">
        <h1 class="board-title">${esc(b.title)}</h1>
        <div class="board">${body}</div>
        ${info}
      </section>`;
    if (DEBUG) {
      els.boards.insertAdjacentHTML("beforeend", `<pre class="debug">${esc(debugLog.map((e) =>
        Object.entries(e).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}: ${v}`).join("\n")).join("\n\n"))}</pre>`);
    }
    els.boards.querySelectorAll("[data-open-settings]").forEach((btn) => btn.addEventListener("click", openSettings));
    renderStatus(data);
  }

  function renderStatus(data) {
    const parts = [];
    if (state.error?.kind === "net") parts.push(`<span class="error">Chyba načítání (${esc(state.error.msg)}), zkouším znovu…</span>`);
    else if (data?.at) parts.push(`Aktualizováno ${hhmm(data.at)}:${pad(data.at.getSeconds())}`);
    else if (state.loading) parts.push("Načítám…");
    if (state.geo === "ok" && state.pos) {
      parts.push(`📍 ±${Math.round(state.pos.acc)} m${state.geoNote ? " · " + state.geoNote : ""}`);
    } else if (state.geo === "pending") {
      parts.push("📍 zjišťuji polohu…");
    } else {
      const from = place(board().ride?.from);
      parts.push(from ? `📍 bez polohy – počítám od: ${esc(from.name.toLowerCase())}` : "📍 bez polohy a bez nastavených souřadnic – počítám od zastávky");
    }
    if (state.importNote) parts.push(esc(state.importNote));
    els.status.innerHTML = parts.join(" · ");
  }

  // ---------- Nastavení ----------
  function renderPrefsReport() {
    const r = TS.parse(els.prefsInput.value);
    els.prefsReport.innerHTML = r.report
      .map((x) => `<li class="${x.ok === true ? "ok" : x.ok === false ? "err" : "def"}">${esc(x.text)}</li>`)
      .join("");
    return r;
  }
  function openSettings() {
    els.tokenInput.value = getToken();
    els.prefsInput.value = localStorage.getItem(PREFS_KEY) || "";
    els.shareBox.hidden = true;
    renderPrefsReport();
    els.dialog.showModal();
  }
  function applyPrefs() {
    P = TS.parse(localStorage.getItem(PREFS_KEY) || "").values;
    state.data = {};
    renderActions();
    refresh();
  }
  els.settingsBtn.addEventListener("click", openSettings);
  els.prefsInput.addEventListener("input", () => { els.shareBox.hidden = true; renderPrefsReport(); });
  els.prefsHelpBtn.addEventListener("click", () => { els.prefsHelp.hidden = !els.prefsHelp.hidden; });
  els.tokenSave.addEventListener("click", () => {
    const t = els.tokenInput.value.trim();
    if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(PREFS_KEY, els.prefsInput.value);
    state.importNote = "";
    els.dialog.close();
    applyPrefs();
  });
  els.tokenClear.addEventListener("click", () => {
    if (!confirmClear()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PREFS_KEY);
    els.tokenInput.value = "";
    els.prefsInput.value = "";
    els.dialog.close();
    applyPrefs();
  });
  // Dvojklik „pojistka“ místo window.confirm (dialogy prohlížeče na mobilu ruší)
  let clearArmed = 0;
  function confirmClear() {
    if (Date.now() - clearArmed < 4000) return true;
    clearArmed = Date.now();
    els.tokenClear.textContent = "Opravdu smazat?";
    setTimeout(() => { els.tokenClear.textContent = "Smazat vše"; }, 4000);
    return false;
  }
  els.shareBtn.addEventListener("click", async () => {
    const payload = TS.encode({ k: els.tokenInput.value.trim(), s: els.prefsInput.value });
    const link = `${location.origin}${location.pathname}#nastaveni=${payload}`;
    els.shareLink.value = link;
    els.shareBox.hidden = false;
    els.shareLink.select();
    try {
      await navigator.clipboard.writeText(link);
      els.shareBtn.textContent = "Zkopírováno ✓";
    } catch {
      els.shareBtn.textContent = "Zkopíruj z pole níže";
    }
    setTimeout(() => { els.shareBtn.textContent = "Odkaz do mobilu"; }, 3000);
  });

  // ---------- Časovače ----------
  function tick() {
    const d = new Date();
    els.clock.textContent = `${hhmm(d)}:${pad(d.getSeconds())}`;
    if (!els.dialog.open) render();
  }

  readFromHash();
  state.active = initialBoard();
  document.title = `Odjezdy – ${board().title}`;
  renderSwitcher();
  tick();
  refresh();
  startGeolocation();
  setInterval(tick, 1000);
  setInterval(() => { if (!document.hidden) refresh(); }, (CFG.refreshSeconds || 20) * 1000);

  // Po návratu do dlouho skryté stránky znovu vybrat tabuli podle polohy.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000 && CFG.autoSelectByLocation !== false) {
      state.userPicked = false;
      state.autoSelectPending = true;
      if ("geolocation" in navigator)
        navigator.geolocation.getCurrentPosition(onPosition, onPositionError, { ...GEO_OPTS, maximumAge: 0 });
    }
    refresh();
  });
  window.addEventListener("hashchange", () => {
    const i = CFG.boards.findIndex((b) => b.key === location.hash.replace(/^#/, ""));
    if (i >= 0) selectBoard(i);
  });
})();
