// Čtení osobního nastavení z jednoho textového pole.
// Formát: položky "klíč = hodnota", oddělené novým řádkem nebo středníkem.
// Ukládá se jen v prohlížeči (localStorage), v kódu nic osobního není.
(() => {
  "use strict";

  const DEFAULTS = {
    prace: null,
    doma: null,
    chuze: 12,                  // min/km
    kolo: 4,                    // min/km
    koef: 1.3,                  // vzdušná čára → skutečná cesta
    "doma-petriny": "chuze",
    "prace-invalidovna": "chuze",
    "prace-trznice": "chuze",
    "vstup-metro": 45,          // s
    "vstup-prace": 60,          // s
    "kolo-navic": 30,           // s, za každý úsek na kole
    "hlidane-linky": null,      // null = všechny linky
  };

  const LABELS = {
    prace: "práce",
    doma: "doma",
    chuze: "chůze",
    kolo: "kolo",
    koef: "koeficient vzdálenosti",
    "doma-petriny": "doma ↔ Petřiny",
    "prace-invalidovna": "práce ↔ Invalidovna",
    "prace-trznice": "práce ↔ Hol. tržnice",
    "vstup-metro": "vstup do/z metra",
    "vstup-prace": "vstup do práce",
    "kolo-navic": "kolo navíc",
    "hlidane-linky": "hlídané linky",
  };

  const ALIASES = {
    metro: "vstup-metro",
    vstup: "vstup-prace",
    "prace-holesovicka-trznice": "prace-trznice",
    "prace-hol-trznice": "prace-trznice",
    "doma-petriny-metro": "doma-petriny",
    linky: "hlidane-linky",
    "kolo-navic-s": "kolo-navic",
  };

  const TYPES = {
    prace: "coord", doma: "coord",
    chuze: "pace", kolo: "pace",
    koef: "number",
    "doma-petriny": "mode", "prace-invalidovna": "mode", "prace-trznice": "mode",
    "vstup-metro": "duration", "vstup-prace": "duration", "kolo-navic": "duration",
    "hlidane-linky": "lines",
  };

  const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normKey = (k) => {
    const n = strip(k).toLowerCase().trim().replace(/\s*-\s*/g, "-").replace(/[\s_]+/g, "-");
    return ALIASES[n] || n;
  };
  const num = (s) => Number(String(s).replace(",", "."));

  function parseCoord(v) {
    const N = "([+-]?\\d+(?:\\.\\d+)?)";
    const re = new RegExp(`^\\s*([NS])?\\s*${N}\\s*°?\\s*([NS])?\\s*[,\\s]\\s*([EW])?\\s*${N}\\s*°?\\s*([EW])?\\s*$`, "i");
    const m = v.match(re);
    if (!m) throw new Error("souřadnice zapiš jako 50.1234567N, 14.1234567E nebo 50.12345, 14.12345 (desetinná tečka)");
    let lat = Number(m[2]);
    let lon = Number(m[5]);
    if (/s/i.test(m[1] || m[3] || "")) lat = -lat;
    if (/w/i.test(m[4] || m[6] || "")) lon = -lon;
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error("souřadnice mimo rozsah");
    return { lat, lon };
  }
  function parseNumber(v) {
    const m = v.match(/[+-]?\d+(?:[.,]\d+)?/);
    if (!m) throw new Error("čekám číslo, např. 1,3");
    return num(m[0]);
  }
  function parsePace(v) {
    const ms = v.match(/^\s*(\d+):(\d{1,2})/);           // 12:30 = 12,5 min/km
    const val = ms ? Number(ms[1]) + Number(ms[2]) / 60 : parseNumber(v);
    if (!(val > 0 && val < 120)) throw new Error("tempo zapiš v min/km, např. 12 nebo 3,5");
    return val;
  }
  function parseDuration(v) {
    const s = strip(v).toLowerCase().trim();
    let m;
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(min|m)\b/))) return num(m[1]) * 60;
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|sek|sekund)?\b/))) return num(m[1]);
    throw new Error("čas zapiš např. 45, 45s, 0:45 nebo 1 min");
  }
  function parseMode(v) {
    const s = strip(v).toLowerCase();
    if (/kol/.test(s)) return "kolo";
    if (/chuz|pes|pesky|walk/.test(s)) return "chuze";
    throw new Error("zapiš kolo nebo chůze");
  }
  function parseLines(v) {
    const list = v.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (!list.length) throw new Error("zapiš linky oddělené čárkou, např. A,B,1,2,25");
    return list;
  }
  const PARSERS = { coord: parseCoord, number: parseNumber, pace: parsePace, duration: parseDuration, mode: parseMode, lines: parseLines };

  const fmtNum = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
  function describe(key, val) {
    if (val == null) return "nenastaveno";
    switch (TYPES[key]) {
      case "coord": return `${val.lat.toFixed(5)}, ${val.lon.toFixed(5)}`;
      case "pace": return `${fmtNum(val)} min/km`;
      case "number": return fmtNum(val);
      case "duration": return `${fmtNum(val, 0)} s`;
      case "mode": return val === "kolo" ? "kolo" : "chůze";
      case "lines": return val.join(", ");
      default: return String(val);
    }
  }

  function parse(text) {
    const values = { ...DEFAULTS };
    const report = [];
    const seen = new Set();
    const taxi = {};
    const entries = String(text || "").split(/[\n;]+/);
    entries.forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) return;
      let k, v;
      const eq = line.indexOf("=");
      if (eq >= 0) { k = line.slice(0, eq); v = line.slice(eq + 1); }
      else {
        const m = line.match(/^(\S+)\s+(.+)$/);
        if (!m) { report.push({ ok: false, text: `„${line}“: chybí = hodnota` }); return; }
        k = m[1]; v = m[2];
      }
      v = v.replace(/\s(#|\/\/).*$/, "");          // komentář za hodnotou
      const key = normKey(k);
      // Místa pro taxi: taxi-N = název, taxi-N-gps = souřadnice
      const tm = key.match(/^taxi-?(\d+)(-gps)?$/);
      if (tm) {
        const n = Number(tm[1]);
        taxi[n] = taxi[n] || { n };
        if (tm[2]) {
          try { Object.assign(taxi[n], parseCoord(v.trim())); }
          catch (e) { report.push({ ok: false, text: `taxi ${n} GPS: ${e.message}` }); }
        } else {
          taxi[n].name = v.trim();
        }
        return;
      }
      if (!(key in TYPES)) { report.push({ ok: false, text: `„${k.trim()}“: neznámý název` }); return; }
      try {
        values[key] = PARSERS[TYPES[key]](v.trim());
        seen.add(key);
        report.push({ ok: true, text: `${LABELS[key]}: ${describe(key, values[key])}` });
      } catch (e) {
        report.push({ ok: false, text: `${LABELS[key]}: ${e.message}` });
      }
    });
    values.taxi = [];
    for (const t of Object.values(taxi).sort((a, b) => a.n - b.n)) {
      const name = t.name || `Taxi ${t.n}`;
      if (t.lat == null) {
        report.push({ ok: false, text: `taxi ${t.n} (${name}): chybí taxi-${t.n}-gps` });
        continue;
      }
      values.taxi.push({ n: t.n, name, lat: t.lat, lon: t.lon });
      report.push({ ok: true, text: `taxi ${t.n}: ${name} (${t.lat.toFixed(5)}, ${t.lon.toFixed(5)})` });
    }
    if (!values.taxi.length) report.push({ ok: null, text: "místa pro taxi: žádná (Uber a mapa vedou z/do doma)" });
    for (const key of Object.keys(DEFAULTS)) {
      if (seen.has(key)) continue;
      if (key === "doma" || key === "prace") report.push({ ok: null, text: `${LABELS[key]}: nenastaveno` });
      else if (key === "hlidane-linky") report.push({ ok: null, text: `${LABELS[key]}: všechny (výchozí)` });
      else report.push({ ok: null, text: `${LABELS[key]}: ${describe(key, DEFAULTS[key])} (výchozí)` });
    }
    return { values, report, ok: report.every((r) => r.ok !== false) };
  }

  // Přenos nastavení odkazem: JSON → UTF-8 → base64url
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  window.TabloSettings = { DEFAULTS, parse, encode, decode };
})();
