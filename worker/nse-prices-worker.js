/**
 * NSE Insights — Cloudflare Worker: live price updates.
 *
 * scheduled(): cron during NSE market hours — fetches afx.kwayisi.org,
 *   parses the price table, upserts today's close into the full price
 *   history held in KV, and rebuilds market.json.
 * fetch(): serves /prices.json and /market.json from KV on nseinsights.com,
 *   falling back to the static files on Cloudflare Pages when KV is empty.
 *
 * KV binding required: PRICES_KV  (keys: "prices.json", "market.json")
 */

const SOURCE = "https://afx.kwayisi.org/nse/";
const SITE = "https://nseinsights.com";
const UA = "NSEInsightsBot/1.0 (+https://nseinsights.com; data refresh)";

// kwayisi ticker -> our ticker (everything else maps 1:1)
const TICKER_MAP = { BAT: "BATK", SBIC: "CFC", PORT: "EAPC", HBE: "HBZE", KAPC: "KAPA", FMLY: "FANB" };
// Delisted / no live source — never write
const FROZEN = new Set(["NBK", "KENO", "FAHR"]);

const MIN_ROWS = 40;
const MAX_DAY_MOVE = 0.5;
const WEEK_MS = 7 * 86400 * 1000;

// ---------- parsing ----------

function stripTags(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").trim();
}

function num(s) {
  s = (s || "").replace(/,/g, "").replace("−", "-").trim();
  if (!s || s === "-" || s === "--") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Parse the listing table from kwayisi's minified HTML (implied closing tags). */
function parseListing(html) {
  const out = {};
  // Each data row starts with <tr>; cells start with <td (closing tags optional).
  for (const rowHtml of html.split(/<tr[^>]*>/).slice(1)) {
    // Cut each cell at the first closing td/th/tr/table tag: with implied
    // closes, the final cell of the final row otherwise swallows the rest
    // of the document.
    const cells = rowHtml.split(/<t[dh][^>]*>/).slice(1)
      .map((c) => stripTags(c.split(/<\/t[dhr]|<\/table/)[0]));
    if (cells.length < 4) continue;
    const ticker = cells[0];
    if (!/^[A-Z][A-Z0-9-]{1,9}$/.test(ticker)) continue;
    const volume = num(cells[2]);
    const price = num(cells[3]);
    const change = cells.length > 4 ? num(cells[4]) : null;
    if (price && price > 0) out[ticker] = { price, volume, change };
  }
  return out;
}

function parseNasi(html) {
  const text = html.replace(/<[^>]+>/g, " ");
  const m = text.match(/NASI[^0-9]{0,120}([0-9][0-9,]*\.?[0-9]*)\s*\(([+\-][0-9.]+)\)/);
  if (!m) return null;
  const value = num(m[1]), chg = num(m[2]);
  return value != null && chg != null ? { value, chg } : null;
}

// ---------- time ----------

/** Midnight UTC of today's date in Nairobi (UTC+3, no DST), epoch ms. */
function tradingDayMs(now = Date.now()) {
  const eat = new Date(now + 3 * 3600 * 1000);
  return Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate());
}

// ---------- update ----------

async function fetchSource() {
  const resp = await fetch(SOURCE, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`source HTTP ${resp.status}`);
  return resp.text();
}

async function loadJson(env, key) {
  // KV first; fall back to the static file on Pages (seed / cold start).
  const kv = await env.PRICES_KV.get(key);
  if (kv) return JSON.parse(kv);
  const resp = await fetch(`${SITE}/${key}`, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`seed fetch ${key} HTTP ${resp.status}`);
  return resp.json();
}

async function runUpdate(env) {
  const html = await fetchSource();
  const rows = parseListing(html);
  if (Object.keys(rows).length < MIN_ROWS) {
    throw new Error(`parsed only ${Object.keys(rows).length} tickers — layout changed?`);
  }

  const prices = await loadJson(env, "prices.json");
  const ts = tradingDayMs();
  let updated = 0;

  for (const [src, row] of Object.entries(rows)) {
    const ours = TICKER_MAP[src] || src;
    if (FROZEN.has(ours)) continue;
    if (!prices[ours]) prices[ours] = { name: ours, sector: "", prices: [] };
    const series = prices[ours].prices || (prices[ours].prices = []);
    const last = series[series.length - 1];
    // Sanity guard only vs a RECENT point; a stale series legitimately differs.
    if (last && last[1] > 0 && ts - last[0] <= WEEK_MS) {
      if (Math.abs(row.price - last[1]) / last[1] > MAX_DAY_MOVE) continue;
    }
    if (last && last[0] === ts) last[1] = row.price;
    else series.push([ts, row.price]);
    updated++;
  }

  const market = await loadJson(env, "market.json").catch(() => ({}));
  const nasi = parseNasi(html);
  if (nasi) {
    const prev = nasi.value - nasi.chg;
    market.nseAllShare = {
      value: Math.round(nasi.value * 100) / 100,
      change_pct: prev ? Math.round((nasi.chg / prev) * 10000) / 100 : 0,
    };
  }
  const pct = (r) => { const p = r.price - r.change; return p ? (r.change / p) * 100 : 0; };
  const movers = Object.entries(rows).filter(([t, r]) => r.change != null && !FROZEN.has(TICKER_MAP[t] || t));
  if (movers.length) {
    movers.sort((a, b) => pct(b[1]) - pct(a[1]));
    const [gT, gR] = movers[0], [lT, lR] = movers[movers.length - 1];
    market.topGainer = { ticker: TICKER_MAP[gT] || gT, price: gR.price, change_pct: Math.round(pct(gR) * 100) / 100 };
    market.topLoser = { ticker: TICKER_MAP[lT] || lT, price: lR.price, change_pct: Math.round(pct(lR) * 100) / 100 };
  }
  market.stocksTracked = Object.keys(rows).length;
  market.updated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  await env.PRICES_KV.put("prices.json", JSON.stringify(prices));
  await env.PRICES_KV.put("market.json", JSON.stringify(market));
  return { updated, tickers: Object.keys(rows).length, nasi: !!nasi };
}

// ---------- entry points ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runUpdate(env).then(
        (r) => console.log("update ok:", JSON.stringify(r)),
        (e) => { console.error("update FAILED:", e.message); throw e; }
      )
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\//, "");
    if (key === "prices.json" || key === "market.json") {
      const body = await env.PRICES_KV.get(key);
      if (body) {
        return new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "X-Data-Source": "kv",
          },
        });
      }
    }
    return fetch(request); // fall through to Pages static assets
  },
};
