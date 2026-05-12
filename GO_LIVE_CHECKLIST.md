# Go-Live Checklist — your turn

Everything that can be prepped without your credentials is done. The
authoritative runbook is `CLOUDFLARE_DEPLOY.md`. This file is the
quick-glance checklist with the values you'll collect along the way.

---

## 0. One-time on your machine — clean git start

The sandbox left a partial `.git` folder. From a Windows terminal in the
project root (`C:\Users\nthig\.claude\projects\kenya-stocks`):

```powershell
# Remove the half-initialized git folder
rmdir /s /q .git

# Re-init and stage everything
git init -b main
git config user.email "carljlee047@gmail.com"
git config user.name  "Lee"
git add .
git status         # eyeball: should be ~hundreds of files, NOT data/nse, data/absa_ir, backend/venv
git commit -m "NSE Insights — full UI refresh + PWA + payments backend"
```

If `git status` shows anything inside `data/nse/`, `data/absa_ir/`, or
`backend/venv/`, the .gitignore wasn't picked up — paste it again and re-add.

Then create the GitHub remote:

```powershell
gh repo create nse-insights --public --source=. --push
# OR manually:
#   git remote add origin https://github.com/<you>/nse-insights.git
#   git push -u origin main
```

---

## 1. Supabase  (creates login + signup)

Account: https://supabase.com → New project → pick EU/US-East region.

Once provisioned, go to **Settings → API** and copy:

| Value | Save it as |
|---|---|
| Project URL | `SUPABASE_URL` |
| `anon` public key | `SUPABASE_ANON_KEY` |
| `service_role` secret key | `SUPABASE_SERVICE_KEY` (backend only — never to browser) |

Open **SQL Editor** and paste the SQL block from `CLOUDFLARE_DEPLOY.md §2`.
That creates the `profiles` table, RLS policies, the auto-trigger that
creates a profile on signup, and the `feedback` table.

Then under **Authentication → URL Configuration**:
- Site URL: `https://nseinsights.co.ke` (or whatever your real domain is)
- Redirect URLs: add `https://*.pages.dev` so preview deploys keep working.

---

## 2. Stripe  (subscription billing)

Account: https://stripe.com (test mode is on by default — use that first).

**Products** (Dashboard → Products → Add product). One per tier:

| Product | Monthly price | Yearly price | Save price IDs as |
|---|---|---|---|
| NSE Insights — Trader | KES 1,500 / month | KES 15,000 / year | `STRIPE_PRICE_TRADER_MO`, `STRIPE_PRICE_TRADER_YR` |
| NSE Insights — Professional | KES 4,500 / month | KES 45,000 / year | `STRIPE_PRICE_PRO_MO`, `STRIPE_PRICE_PRO_YR` |

(Use whatever pricing you want — these are just placeholders.)

From **Developers → API keys** copy:
- Publishable key (`pk_test_…`) — not used directly, just kept for reference
- Secret key (`sk_test_…`) → `STRIPE_SECRET_KEY`

We'll add the webhook secret after Render is up.

---

## 3. Daraja  (M-Pesa)

https://developer.safaricom.co.ke → Create app → enable "Lipa Na M-Pesa Online".

Copy:
- Consumer Key → `MPESA_CONSUMER_KEY`
- Consumer Secret → `MPESA_CONSUMER_SECRET`
- Sandbox shortcode `174379` (already defaulted in `render.yaml`)
- Lipa Na M-Pesa Online passkey → `MPESA_PASSKEY`

`MPESA_CALLBACK_URL` will be `https://nse-insights-api.onrender.com/api/mpesa/callback`
(set this after Render gives you the URL).

---

## 4. Render  (FastAPI backend)

https://render.com → New → **Blueprint** → connect your GitHub repo.

Render reads `render.yaml` and offers to create the `nse-insights-api`
service. Click create. Then in the service's **Environment** tab, fill in
all the `sync: false` variables you collected above:

```
FRONTEND_URL=https://nseinsights.co.ke
CORS_ORIGINS=https://nseinsights.co.ke,https://nse-insights.pages.dev
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=          (filled in step 6)
STRIPE_PRICE_TRADER_MO=price_...
STRIPE_PRICE_TRADER_YR=price_...
STRIPE_PRICE_PRO_MO=price_...
STRIPE_PRICE_PRO_YR=price_...
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_PASSKEY=...
MPESA_CALLBACK_URL=https://nse-insights-api.onrender.com/api/mpesa/callback
```

Hit "Save, rebuild" → wait ~3 min → visit
`https://nse-insights-api.onrender.com/api/health`. You should see:

```json
{"status":"ok","stripe_configured":true,"mpesa_configured":true,"supabase_configured":true,"mpesa_env":"sandbox"}
```

This URL is your `PAYMENTS_API`.

---

## 5. Cloudflare Pages  (frontend)

**Before you push: fill in `frontend/config.js`** with the three values
you've collected:

```js
window.NSE_CONFIG = {
  SUPABASE_URL:      "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",   // anon public key, not service_role
  PAYMENTS_API:      "https://nse-insights-api.onrender.com",
  FEEDBACK_EMAIL:    "feedback@nseinsights.co.ke",
};
```

Commit + push:

```powershell
git add frontend/config.js
git commit -m "wire prod Supabase + payments API"
git push
```

Then on https://dash.cloudflare.com/?to=/:account/pages → **Create →
Connect to Git** → pick `nse-insights`.

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | (leave blank) |
| Build output directory | `frontend` |
| Root directory | (leave blank) |

Deploy. After ~30 seconds you'll get a `https://nse-insights.pages.dev`
URL. Open it — you should see the new vivid-blue landing page.

---

## 6. Stripe webhook  (subscription state syncs back to Supabase)

Stripe Dashboard → **Developers → Webhooks → Add endpoint**.

| Field | Value |
|---|---|
| Endpoint URL | `https://nse-insights-api.onrender.com/api/stripe/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` |

Copy the signing secret (`whsec_…`) and put it in Render as
`STRIPE_WEBHOOK_SECRET`. Render will redeploy automatically.

---

## 7. Custom domain  (optional but recommended)

In Cloudflare DNS:

| Subdomain | Type | Target |
|---|---|---|
| `@` (apex) | CNAME (flattened) | `nse-insights.pages.dev` |
| `www` | CNAME | `nse-insights.pages.dev` |
| `api` | CNAME | `nse-insights-api.onrender.com` |

In Pages → Custom domains → add `nseinsights.co.ke` and `www.nseinsights.co.ke`.
In Render → Settings → Custom domain → add `api.nseinsights.co.ke`.

Then update everything that referenced the `*.pages.dev` URL to use the
real domain (Supabase Site URL, `FRONTEND_URL` on Render, `CORS_ORIGINS`
on Render, `frontend/config.js` `PAYMENTS_API` to `https://api.nseinsights.co.ke`).

---

## 8. Smoke test  (run through these in this order)

| # | Action | Pass criteria |
|---|---|---|
| 1 | Open `/landing.html` | Vivid-blue hero loads, twin phone mockups visible |
| 2 | Click "Sign up" → fill form → submit | Email confirmation arrives |
| 3 | Confirm email → land on `/login.html` | Login form works |
| 4 | Sign in | Redirects to `/index.html`, dashboard shows data |
| 5 | Open Supabase → Table Editor → `profiles` | Your row exists with `tier='free'` |
| 6 | `/pricing.html` → click "Subscribe (Trader, monthly)" | Stripe Checkout opens (test mode) |
| 7 | Pay with `4242 4242 4242 4242` (any future date, any CVC) | Redirects to checkout-success |
| 8 | Refresh `/account.html` | Tier shows "Trader" |
| 9 | Burger menu → Feedback → submit | Either email arrives or row in `feedback` table |

---

## 9. Going live (when ready)

1. Stripe → toggle to **live mode**, copy live keys (`sk_live_…`,
   `pk_live_…`, new `whsec_…`) into Render.
2. Set `MPESA_ENV=production` and swap to production Daraja credentials
   on Render. Update `MPESA_SHORTCODE` from `174379` to your real till/paybill.
3. On Render set `CORS_ORIGINS=https://nseinsights.co.ke,https://www.nseinsights.co.ke`
   (drop the `*.pages.dev` once you're sure custom domain is stable).
4. In `frontend/sw.js` bump `CACHE_VERSION = 'nse-insights-v3'` → `v4`.
   Push. Installed PWAs pick up the prod build on next visit.
5. Supabase → Auth URL → Site URL = `https://nseinsights.co.ke`.

---

## What's already done for you

- ✅ Repo prepped: `.gitignore` excludes 850 MB of source PDFs + venv
- ✅ Backend CORS reads from `CORS_ORIGINS` env var
- ✅ `render.yaml` Blueprint — Render auto-detects everything
- ✅ `frontend/_headers` — security headers + PWA cache rules
- ✅ `frontend/_redirects` — `/` → `/landing.html`, etc.
- ✅ `frontend/config.js` — single point to wire production keys
- ✅ All 12 HTML pages load `config.js` before `supabase-client.js`
- ✅ Supabase trigger SQL handles both `full_name` and `first_name`/`last_name`
- ✅ `frontend/sw.js` — PWA service worker with safe cache strategy
- ✅ `frontend/manifest.webmanifest` + icons — installable
- ✅ Backups in `frontend/_backup/` — restore old palette by copying back

You're roughly 60–90 minutes of paperwork from a live site. Most of that
is creating accounts and copy-pasting keys.
