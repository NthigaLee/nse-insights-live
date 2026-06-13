# NSE Insights — Session Handoff

**Purpose:** resume the NSE Insights work in a fresh Cowork session. This file is self-contained — read it first, then `DATA_UPDATE_LOG.md`.
**Last updated:** 2026-06-12

---

## 1. What this project is

NSE Insights (nseinsights.com) — a PWA showing Nairobi Securities Exchange company financials, prices, sector analysis, and valuation. 44 listed companies tracked.

**Architecture**
- **Frontend:** static site on **Cloudflare Pages** → serves nseinsights.com. Plain HTML/CSS/JS (no build step). Data comes from **static JSON/JS files**, NOT the API.
- **Backend:** **FastAPI on Render** (free tier) → api.nseinsights.com. Title "NSE Insights Payments." Handles payments + feedback only.
- **Auth + DB:** **Supabase** (project `ehpsvnhctqjenhyizidm`, region eu-central-2). Frontend talks to Supabase directly via anon key.
- **Market data:** static `prices.json` / `market.json` / `data.js` on Cloudflare — the dashboard does not depend on the backend for data.

**Live URLs**
- Site: https://nseinsights.com  (landing `/landing`, dashboard `/dashboard`, login `/login`, pricing, admin)
- API: https://api.nseinsights.com  (Swagger at `/docs`, health at `/api/health`)

---

## 2. Repo locations — IMPORTANT

The real repos live under `C:\Users\nthig\.claude\projects\` (`kenya-stocks` = working copy, `nse-insights` = deploy). **`~/.claude` is a protected path Cowork cannot mount.** Working copies were made in Documents:

- **`C:\Users\nthig\Documents\nse-insights-deploy`** ← **SOURCE OF TRUTH.** Git remote `github.com/NthigaLee/nse-insights-live`, last commit = the index→dashboard rename. Edit + push from here.
- `C:\Users\nthig\Documents\nse-insights-work` ← copy of `kenya-stocks` (no git remote, scratch files). Ignore unless needed.

> When done, the user will merge/replace the Documents copy back into the `.claude` repo themselves.

Editing flow: edit in `nse-insights-deploy`, push to GitHub `NthigaLee/nse-insights-live` → Cloudflare Pages auto-deploys the frontend; Render auto-deploys the backend.

Frontend files live in `nse-insights-deploy/frontend/`. Backend in `nse-insights-deploy/backend/` (`payments_server.py`, plus data-generation scripts `update_*.py`, `extract_insurance.py`).

---

## 3. Decisions already made (with the user)

1. **UI refresh = moderate restyle** — refresh palette/cards/chart styling/empty-states/mobile, keep layout & flows. (Not a full redesign.)
2. **Priority order = DATA FIRST**, then UI, then functionality.
3. **Latest data incl. Q1 2026** — Fable researches **public filings**; user verifies figures (via `DATA_UPDATE_LOG.md`) before deploy.
4. **Quarterly support = build it.** (See schema note — the key is `quarters`, and the frontend already reads it; most companies have some `quarters` data.)
5. **Volume = gracefully hide** the field (no reliable free NSE volume feed) rather than show "—".

---

## 4. Data schema (`frontend/data.js`)

- File is `const NSE_COMPANIES = { TICKER: {...} };` then `const NSE_INDEX = [...]` (44 tickers) and `const NSE_COMPANY_COUNT = 44;`. Header says "Auto-generated… Do not edit manually," **but the generator's input data is NOT in the repo, so edit `data.js` directly** (surgically; re-parse to validate after every change).
- Per-company keys: `name, ticker, exchange, sector, logo, description, staticNews[], currency, units, latestPrice(null), latestPeriod{}, annuals[], quarters[]`.
- **Bank** financial fields: `revenue, pat, pbt, nii, eps, dps, deposits, loans, totalAssets, totalEquity, interestIncome, interestExpense, loanLossProvision, provisionToInterestIncome, totalOpex, costToIncomeRatio`.
- **Telecom (SCOM)** fields: `revenue, pat, pbt, eps, dps, mpesa` (+ some years have `serviceRevenue, ebitda, operatingProfit, totalAssets, totalEquity`).
- Nulls are tolerated (e.g. `latestPrice: null`). Leave a field null rather than guess.
- **Quarterly data key is `quarters` (NOT `quarterlies`).** 40/44 companies have some `quarters`; only EAPC, CIC, LBTY, KNRE have none. `app.js` already renders `quarters` when the "Quarterly" toggle is on (`app.js` ~line 1389).
- `prices.json` = `{TICKER:{name,sector,prices:[[epoch_ms, close], …]}}` — **close price only, no volume.**
- `market.json` = small snapshot (nse20, nseAllShare, topGainer/Loser, stocksTracked, updated_at). Currently `updated_at` 2025-10-31 — stale, should refresh.
- To parse `data.js` in Python: slice between the first `{` after `NSE_COMPANIES` and `const NSE_INDEX`, then `json.loads`.

---

## 5. Data audit results (44 companies)

**Descriptions/news gaps:** only **SCOM** lacked both (now fixed). All others fine.

**Volume:** missing for everyone (no source in prices.json) → decision: hide field.

**Financial freshness (latest period before this session):**
- FY2025: 7 (CARB, EABL, KAPA, KEGN, KPLC, SCOM✅now FY2026, WTK)
- FY2024: 17 · FY2023 (stale): 12 · FY2021 or older: 5
- **Broken (0 annual records):** NBK (stuck H1 2019), SASN (Q1 2024), TPSE (H1 2023) — need rebuild.

**Other data smells:** Shareholders' Equity "5Y +596%" type anomalies from near-zero base years; company price-header shows a large period change next to daily change (label clarity). Minor — clean up during UI pass.

---

## 6. Work completed this session

- **SCOM (Safaricom) fully updated** in `frontend/data.js`: added description, 3 sourced `staticNews`, and **FY2026** to `latestPeriod` + `annuals[0]` (revenue 414,100,000 / pat 95,610,000 / eps 2.39 / dps 2.0 / mpesa 182,700,000; pbt null pending booklet). Validated: all 44 still parse. A timestamped `data.js.bak-*` backup exists in `frontend/`.
- **EQTY and KCB Q1 2026** figures researched + logged (not yet written to data.js).
- Created **`DATA_UPDATE_LOG.md`** (verification log — every figure + source link; user must verify before deploy).
- **Not yet deployed.** All changes are local to `nse-insights-deploy`. Nothing pushed.

---

## 7. Backend / functionality status (from live checks)

`GET https://api.nseinsights.com/api/health` returns:
```json
{"status":"ok","stripe_configured":false,"mpesa_configured":false,"supabase_configured":true,"mpesa_env":"sandbox"}
```
- **Render cold-starts** (~30–60s) after idle — first hit to checkout/feedback hangs. **Keepalive cron needed → ping `/api/health` (NOT `/health`, which 404s) every ~10–14 min.**
- **Stripe NOT configured** (keys needed). **M-Pesa NOT configured** (sandbox; full STK/status/callback routes already built — `/api/mpesa/*`). **Supabase configured.**
- API routes (`/docs`): `GET /api/health`, `POST /api/stripe/checkout`, `POST /api/stripe/webhook`, `POST /api/mpesa/stk|status|callback`, `POST /api/feedback`.
- **Google OAuth** is handled by **Supabase Auth**, not the Render backend — so wiring it = enable Google provider in Supabase + set redirect URLs. Button exists on `/login`.
- `frontend/config.js` holds `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public — fine IF RLS is on; verify), `PAYMENTS_API: https://api.nseinsights.com`, `FEEDBACK_EMAIL`.

Backlog items from the user: Stripe, Google OAuth, keepalive cron, SMTP (+ M-Pesa surfaced as also unconfigured).

---

## 8. Roadmap / task list

1. ✅ Audit frontend, backend, data schema, gaps
2. ⏳ **Research latest + Q1 2026 financials** (IN PROGRESS — SCOM done; EQTY/KCB logged)
3. ⏳ Fill data gaps (descriptions/news done for SCOM; volume → hide; rebuild NBK/SASN/TPSE)
4. ⏳ UI moderate restyle
5. ⏳ Wire functionality (keepalive cron → Google OAuth → Stripe → SMTP → M-Pesa)
6. ⏳ Verify end-to-end + push to GitHub, confirm Cloudflare + Render deploys green

**Suggested data sequencing (banks first — most have Q1 2026 out):** EQTY, KCB, COOP, ABSA, NCBA, CFC(Stanbic), DTK, IMH, SCBK, HFCK, BKG, NBK → then EABL, BATK, insurers (JUB/BRIT/CIC/SLAM/KNRE/LBTY), energy (KPLC/KEGN/UMME) → then stale long-tail.

---

## 9. How to resume (first moves for the new session)

1. Mount **`C:\Users\nthig\Documents\nse-insights-deploy`** (source of truth).
2. Read this file + `DATA_UPDATE_LOG.md`.
3. Continue the data backfill: write EQTY + KCB Q1 2026 (already in the log) into `data.js`, then proceed through the bank queue. For each company: research primary/credible source → log figures + URL → surgically edit `data.js` → re-parse to validate.
4. Verify visually with the Claude-in-Chrome browser tools against nseinsights.com (the extension must be connected); use `/api/health` to check backend config flags.
5. Only push to `NthigaLee/nse-insights-live` after the user verifies the logged figures.

**Tools available in Cowork that help here:** Supabase MCP (check RLS/advisors, Google auth provider, run SQL), Stripe MCP (configure/inspect payments), Cloudflare MCP (Pages/Workers/KV — e.g. for keepalive cron), Gmail MCP (SMTP/email), Claude-in-Chrome (live UI/console/network checks), WebSearch (filings research).

## 10. Guardrails
- Don't enter credentials/API keys into forms, change access controls, or push/deploy without the user's OK.
- Editing `data.js`: always re-parse after edits; keep the `.bak` backups.
- Prefer leaving a financial field `null` over guessing. Every published figure goes in `DATA_UPDATE_LOG.md` with a source for the user to verify before deploy.
