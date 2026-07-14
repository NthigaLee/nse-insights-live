# Live & Historical Price Updates — Feasibility + Design

**Date:** 2026-07-01 · **Status:** BUILT — see §0. Both §6 verifications resolved (kwayisi confirmed live; chart endpoint = `https://afx.kwayisi.org/chart/nse/<ticker>`, daily closes back to ~2016, format `[d("YYYY-MM-DD"),close]`).

## 0. What was built (2026-07-01)

- `backend/update_prices.py` — stdlib-only scraper. Daily mode: 1 request to kwayisi main table → updates `prices.json` (today's close per ticker) + `market.json` (NASI, top gainer/loser, updated_at). Backfill mode (`--backfill --since 2025-10-31`): pulls each ticker's chart feed (2s apart) and merges missing daily closes. `--dry-run` supported. Sanity guards: aborts if <40 tickers parse; skips any >50% single-day move.
- `.github/workflows/update-prices.yml` — REPLACED the previous workflow, which called `backend/fetch_prices.py`, a file that does not exist in the repo (why prices froze at Oct 31). New schedule: hourly 09:35–14:35 EAT + 15:10 EAT close run, Mon–Fri; manual `workflow_dispatch` with `mode=backfill`.
- Frontend cache fix (§5): `app.js` now fetches `prices.json`/`market.json` with a rolling hourly buster; `sw.js` serves `*.json` network-first and `CACHE_VERSION` bumped to v9; `app.js?v=34→35` in `dashboard.html`.
- Offline-verified: parser, NASI regex, chart-point regex (against real endpoint output), upsert logic, ticker mapping vs `prices.json` keys.

**To go live:** commit + push, then run the workflow once manually with `mode=backfill` (fills Nov 2025→today), then let the schedule take over. First scheduled run doubles as the live end-to-end test. FANB (Family Bank, listed Jun 2026) gets created by the first daily run; re-run backfill afterwards if you want its ~2 weeks of history.

---

## 1. What we need

- Backfill daily closes from **1 Nov 2025 → today** (prices.json currently ends **2025-10-31** for 67 tickers).
- Refresh prices **periodically every trading day** during NSE market hours (continuous session **09:30–15:00 EAT**, Mon–Fri).

## 2. Sources evaluated

| Source | Live prices | Historical | Access | Notes |
|---|---|---|---|---|
| **afx.kwayisi.org/nse/** | ✅ all 67 tickers, price + change + **volume**, one plain-HTML page | ❌ (accumulate going forward) | Trivially fetchable, no JS | **Primary candidate.** Freshness unverified — the copy fetched today showed a Dec 31 2025 trading summary alongside a "3 minutes ago" ticker; must confirm in a real browser. Volume is a bonus (we previously had no volume source). |
| **african-markets.com** company pages | ✅ EOD price/change/as-of per company (~68 NSE companies) | ⚠️ chart has 1Y+ range — AJAX endpoint not yet identified (browser tool was down) | Fetchable server-rendered HTML, 1 page per company | Good for EOD validation + the **Nov 2025→now backfill** once chart endpoint is captured. Check ToS before redistribution. |
| NSE official (nse.co.ke data services) | ✅ | ✅ | **Paid** license | The clean/legal route if the site monetizes market data display. |
| investing.com / tradingeconomics | major tickers only | partial | login/limits | Fallback backfill for SCOM, EQTY, KCB, EABL etc. only. |
| Mendeley/GitHub datasets | ❌ | ends 2024 | free | Doesn't cover our gap. |

## 3. Ticker mapping (our code → source code)

| Ours | african-markets | kwayisi |
|---|---|---|
| CFC (Stanbic) | SBIC | SBIC |
| CPKL (Crown Paints) | CRWN | CRWN |
| FANB (Family Bank) | FMLY | — (new, check) |
| KAPA (Kapchorua) | KAPC | KAPC |
| HBZE (Homeboyz) | HEL | HBE |
| BATK | BATK | BAT |
| EAPC | EAPC | PORT |
| NBK | — (delisted → freeze series) | — |

All other tickers match directly. **43/44 companies covered.**

## 4. Recommended pipeline — GitHub Actions cron

The frontend already auto-deploys from `NthigaLee/nse-insights-live` via Cloudflare Pages, so the cheapest reliable updater is a scheduled Action that commits refreshed JSON:

1. **Workflow** `.github/workflows/update-prices.yml`
   - `schedule:` `35 6-11 * * 1-5` (hourly 09:35–14:35 EAT) + `10 12 * * 1-5` (15:10 EAT close run). GitHub cron can lag ~5–15 min; that's fine.
   - Steps: checkout → run scraper → `git commit -am "prices: <date>" && push` only if files changed.
2. **Scraper** (`backend/update_prices.py`, requests + BeautifulSoup)
   - Fetch kwayisi table (1 request, all tickers) → map tickers per §3.
   - `prices.json`: append/replace **today's** `[epoch_ms, close]` per ticker (intraday runs overwrite same-day point; the close run finalizes it).
   - `market.json`: NASI/NSE-20, top gainer/loser, `stocksTracked`, `updated_at` (now).
   - Optionally store volume in a parallel key (`volumes` or `[ts, close, vol]` triples — decide with frontend).
   - Validate JSON parses + sane bounds (price > 0, |Δ| < 15%) before writing; abort on scrape shape change.
   - Cross-check 3–5 tickers against african-markets EOD once a day; log mismatches.
3. **Backfill Nov 2025 → today** (one-off): pull african-markets 1Y chart series per company once the endpoint is identified (§6), merge into prices.json. Gaps for illiquid tickers are acceptable (leave missing days absent).

**Why not alternatives:** Render cron on free tier sleeps and can't push cleanly; a Cloudflare Worker + KV is the "truly live" upgrade path (15-min updates, no commits) but more moving parts than "periodic daily updates" needs. Git commits also give a free audit trail of every price change.

## 5. ⚠️ Frontend change required (or updates will be invisible)

`app.js` fetches `prices.json?v=4` / `market.json?v=4` (hardcoded) and `sw.js` serves non-HTML assets **cache-first** — returning users would keep stale prices forever.

Fix in the same PR as the pipeline:
- In `app.js`, fetch with a rolling buster: `prices.json?d=<YYYYMMDDHH>` (or plain `prices.json` + SW change below).
- In `sw.js`, treat `*.json` as **network-first** (like HTML), falling back to cache offline.
- Bump `CACHE_VERSION` (v8 → v9) so existing users pick up the new sw/app.js.

## 6. Open verifications (blocked on browser tool outage today)

1. **kwayisi freshness** — load https://afx.kwayisi.org/nse/ in a browser and confirm the price table reflects the current/most recent session (compare KCB vs african-markets).
2. **african-markets chart endpoint** — open a company page with DevTools/network capture, grab the XHR the Highcharts chart calls, confirm it returns ≥1Y of daily closes → use for the Oct-2025→now backfill.

## 7. Compliance note

Both sources are third-party sites; neither offers a formal free API. Keep request volume minimal (≤ ~10 requests/day to kwayisi, 1/day validation to african-markets), set a UA identifying the site, and review their terms — if NSE Insights charges for market-data display, the licensed NSE data feed is the correct long-term source.
