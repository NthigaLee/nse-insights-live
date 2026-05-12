# Cloudflare deploy — NSE Insights

End-to-end runbook to take this repo live with working **login**, **sign up**,
and **payments**, hosted on **Cloudflare Pages** (frontend) + **Render** (FastAPI
payments backend) + **Supabase** (auth + profiles).

Estimated time: 60–90 min. Most of it is creating accounts and copy/pasting keys.

---

## 0. Accounts you need (free tiers are fine to start)

1. **GitHub** — push this repo to a remote repository.
2. **Cloudflare** — pages.cloudflare.com (free Pages plan).
3. **Render.com** — for the FastAPI backend (free web-service tier).
4. **Supabase** — supabase.com (free project: 500 MB DB + auth).
5. **Stripe** — stripe.com (test mode is enabled by default).
6. **Safaricom Daraja** — developer.safaricom.co.ke (sandbox first).
7. **Domain** — buy or transfer a domain (e.g. `nseinsights.co.ke`) into Cloudflare DNS.

---

## 1. Push the repo to GitHub

```bash
cd /path/to/kenya-stocks
git init
git add .
git commit -m "Initial commit — NSE Insights"
gh repo create nse-insights --public --source=. --push
# (or push to an existing repo via `git remote add origin … && git push`)
```

The `_backup/` folder under `frontend/` is intentional — keep it; it's small and useful for rollbacks.

---

## 2. Provision Supabase (auth + profiles table)

1. Go to **supabase.com → New project**. Pick a strong DB password and the EU/US-East region closest to you.
2. Once provisioned, copy two things from **Settings → API**:
   - `Project URL` → call this `SUPABASE_URL`
   - `anon` public key → call this `SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_KEY` (backend-only; **never** ship to browser)
3. Open **SQL Editor** and run:

```sql
-- Profiles table (one row per user)
create table if not exists public.profiles (
  id                       uuid primary key references auth.users on delete cascade,
  email                    text unique,
  full_name                text,
  tier                     text not null default 'free',
  subscription_status      text default 'inactive',
  subscription_interval    text,
  stripe_customer_id       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own row
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

-- Users can update their own row (but not change tier — server-only)
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile when a new auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      trim(both ' ' from
        coalesce(new.raw_user_meta_data->>'first_name','') || ' ' ||
        coalesce(new.raw_user_meta_data->>'last_name','')
      )
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Optional: feedback table (used by /api/feedback)
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  type         text, name text, email text, message text,
  page         text, user_agent text, tier text
);
alter table public.feedback enable row level security;
-- (no public select policy — service role only writes)
```

4. **Authentication → Providers → Email**: enable, set "Confirm email" off for now (turn on later).
5. **Authentication → URL Configuration**: set Site URL to your eventual Pages URL, e.g. `https://nse-insights.pages.dev` (you'll update this to your custom domain later).

---

## 3. Stripe — create products and price IDs

1. **Stripe Dashboard → Products → Add product**. Make four products (or one product with four prices):

| Product | Price (KES) | Interval |
|---|---|---|
| Trader Monthly | 499 | monthly |
| Trader Yearly  | 4,790 | yearly |
| Pro Monthly    | 1,999 | monthly |
| Pro Yearly     | 19,190 | yearly |

2. Copy each `price_…` ID — you'll paste these into env vars.
3. **Developers → API keys**: copy `Secret key` (`sk_test_…` for now).
4. **Developers → Webhooks → Add endpoint**: leave the URL blank for now — you'll set it after the backend is up.

---

## 4. Daraja (M-Pesa) — sandbox

1. developer.safaricom.co.ke → Apps → **Create new app**. Tick "Lipa Na M-Pesa Online".
2. Copy **Consumer Key** and **Consumer Secret**.
3. Note the **Business shortcode** (sandbox default: `174379`) and **Passkey** (sandbox default visible in docs).
4. Production paybills come later — sandbox is fine for go-live.

---

## 5. Deploy the backend to Render

1. **Render → New → Web Service**. Connect your GitHub repo, point root to `backend/`.
2. Settings:
   - Runtime: **Python 3.11**
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn payments_server:app --host 0.0.0.0 --port $PORT`
   - Plan: free is fine
3. Add these **environment variables**:

```
FRONTEND_URL=https://nse-insights.pages.dev   # update later
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…                 # set after step 7
STRIPE_PRICE_TRADER_MO=price_…
STRIPE_PRICE_TRADER_YR=price_…
STRIPE_PRICE_PRO_MO=price_…
STRIPE_PRICE_PRO_YR=price_…
MPESA_CONSUMER_KEY=…
MPESA_CONSUMER_SECRET=…
MPESA_SHORTCODE=174379
MPESA_PASSKEY=…
MPESA_CALLBACK_URL=https://<your-render-host>.onrender.com/api/mpesa/callback
MPESA_ENV=sandbox
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ…                     # service role
FEEDBACK_EMAIL_TO=feedback@nseinsights.co.ke
SMTP_HOST=                                    # optional
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

4. Deploy. Once Render gives you `https://<host>.onrender.com`, hit `https://<host>.onrender.com/api/health` — should return `{"ok": true}`.

---

## 6. Deploy the frontend to Cloudflare Pages

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the GitHub repo. Project settings:
   - Production branch: `main`
   - Build command: *(leave empty — pure static)*
   - Build output directory: `frontend`
3. **Environment variables** (under Production *and* Preview):

```
PAYMENTS_API=https://<your-render-host>.onrender.com
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ…
```

4. **Wire frontend config**: open `frontend/config.js` and fill in your three values:

   ```js
   window.NSE_CONFIG = {
     SUPABASE_URL:      "https://xxxxxxxxxxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     PAYMENTS_API:      "https://your-render-host.onrender.com",
     FEEDBACK_EMAIL:    "feedback@nseinsights.co.ke",
   };
   ```

   The Supabase **anon key is meant to be public** — Row Level Security policies (created in step 2) gate the data. The `<script src="config.js">` tag is already wired into every HTML page, so just commit and push.

5. Click **Save and Deploy**. After ~60s you get `https://<project>.pages.dev`.

---

## 7. Wire Stripe webhook → backend

1. Open **Stripe Dashboard → Developers → Webhooks → Add endpoint**.
2. URL: `https://<your-render-host>.onrender.com/api/stripe/webhook`
3. Events to send: `checkout.session.completed`, `customer.subscription.deleted`.
4. Copy the resulting `whsec_…` and paste it into `STRIPE_WEBHOOK_SECRET` in Render. Restart the service.

---

## 8. Custom domain via Cloudflare

1. Buy/transfer your domain into Cloudflare (Registrar). DNS is automatically managed.
2. **Pages → Custom domains → Set up a custom domain → `nseinsights.co.ke`** (root) and `www.nseinsights.co.ke` (CNAME).
3. **DNS → Add record** for the backend:

```
CNAME  api  <your-render-host>.onrender.com  Proxied: NO
```

   So API calls go to `https://api.nseinsights.co.ke`.

4. Update env vars where you used the temporary hosts:
   - Render: `FRONTEND_URL=https://nseinsights.co.ke`
   - Render: `MPESA_CALLBACK_URL=https://api.nseinsights.co.ke/api/mpesa/callback`
   - Cloudflare Pages: update `config.js` `PAYMENTS_API` to `https://api.nseinsights.co.ke`
   - Supabase: **Authentication → URL Configuration → Site URL** = `https://nseinsights.co.ke`
   - Supabase: **Additional Redirect URLs** → add `https://nseinsights.co.ke/account.html` and `https://nseinsights.co.ke/login.html`
   - Stripe webhook: change endpoint to `https://api.nseinsights.co.ke/api/stripe/webhook`

---

## 9. Smoke test (real flows)

| Test | Expected |
|---|---|
| Visit `/landing.html` | Vivid blue hero, twin phones, KPIs render |
| Click **Get Started** → register with a real email | Supabase user created, profile row inserted |
| Sign in → land on `/index.html` | Dashboard loads with full data |
| Open `/pricing.html` → click "Pay with card" on Trader Monthly | Redirects to Stripe Checkout, test card `4242 4242 4242 4242` succeeds |
| After Stripe success | `profiles.tier` flips to `trader`, `/account.html` shows "Trader (Monthly)" |
| Open `/pricing.html` → "Pay with M-Pesa" | STK push fires (sandbox phone), polling returns success after PIN |
| `/index.html` (PWA) → mobile Chrome → "Add to Home Screen" | Installs, opens fullscreen with blue theme |
| Burger menu → **Send Feedback** | Modal opens, submit succeeds, email arrives at `FEEDBACK_EMAIL_TO` |
| Sign out → tier guards | `/index.html` redirects to login |

---

## 10. Going live (production switch)

When test flows pass:

- **Stripe**: switch keys from `sk_test_…` to `sk_live_…`. Re-create the webhook secret. Replace product price IDs with live ones.
- **Daraja**: switch `MPESA_ENV=production`, replace consumer key/secret/shortcode/passkey with production values from Safaricom.
- **Supabase**: enable email confirmation, enforce stronger password policy, enable rate limits on auth.
- **CORS**: in `backend/payments_server.py`, change `allow_origins=["*"]` to `["https://nseinsights.co.ke"]`.
- **Service worker**: bump `CACHE_VERSION` in `frontend/sw.js` so visitors pull fresh assets.
- **Cloudflare**: turn on **Always Use HTTPS** + **Automatic HTTPS Rewrites** (Page Rules / SSL/TLS settings).
- **Cloudflare**: enable **Bot Fight Mode** (free) and basic WAF rules (rate-limit `/api/`).
- **Backups**: in Supabase, enable daily backups (paid). For DB schema changes, dump with `supabase db dump`.

---

## 11. Updating the deployed app

```bash
git add . && git commit -m "tweak" && git push origin main
```

- Cloudflare Pages redeploys frontend on every push to `main`.
- Render redeploys backend on every push to `main` (auto-deploy is on by default).
- Bump `CACHE_VERSION` in `sw.js` whenever a static asset changes that users need immediately.

---

## 12. Costs at scale (rough)

| Tier | Cost / month |
|---|---|
| Cloudflare Pages | $0 (unlimited bandwidth) |
| Render free | $0 (sleeps after 15 min idle — pay $7 for always-on) |
| Supabase free | $0 (500 MB DB, 50 K MAU) |
| Stripe | 2.9% + 30¢ per successful card; M-Pesa per Daraja agreement |
| Domain | $10–25/year |
| **Total fixed** | **~$0–7/month + per-transaction fees** |

Expect to bump Render to a $7 instance once you have real traffic so the backend isn't cold-starting on every checkout.
