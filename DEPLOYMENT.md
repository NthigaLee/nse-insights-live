# Deployment guide — NSE Insights

This guide takes you from a fresh clone to a fully live, payments-enabled
NSE Insights deployment. Typical setup time: **~2 hours** end-to-end.

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Static frontend         │   API  │  FastAPI backends        │
│  (Vercel / Netlify /     │ ─────► │   • app.py  (data)       │
│   GitHub Pages)          │        │   • payments_server.py   │
└──────────────────────────┘        └───────────┬──────────────┘
               ▲                                │
               │ auth / profiles                ▼
       ┌───────┴───────┐              ┌─────────────────────┐
       │   Supabase    │              │ Stripe + Safaricom  │
       │ (auth + db)   │              │     (payments)      │
       └───────────────┘              └─────────────────────┘
```

## 0. Prerequisites

* Node LTS and Python 3.10+ installed
* A domain you control (e.g. `nseinsights.co.ke`)
* Accounts: Supabase, Stripe, Safaricom Developer (Daraja)
* A hosting account for the backend — Render, Fly.io, Railway or similar

## 1. Supabase — auth + profiles

1. Create a project at <https://supabase.com>. Note the **URL** and the **anon** and **service-role** keys (*Settings → API*).
2. In the **SQL editor** run this migration:

   ```sql
   create table if not exists public.profiles (
     id                     uuid primary key references auth.users(id) on delete cascade,
     email                  text unique not null,
     full_name              text,
     tier                   text not null default 'free'
                             check (tier in ('free','trader','professional')),
     subscription_status    text not null default 'free'
                             check (subscription_status in ('free','active','cancelled','past_due')),
     subscription_interval  text,
     stripe_customer_id     text,
     mpesa_phone            text,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now()
   );

   alter table public.profiles enable row level security;

   create policy "profiles: user can read own row"
     on public.profiles for select
     using (auth.uid() = id);

   create policy "profiles: user can update own row"
     on public.profiles for update
     using (auth.uid() = id);

   -- Auto-create a profile when a user signs up
   create or replace function public.handle_new_user()
   returns trigger
   language plpgsql security definer set search_path = public
   as $$
   begin
     insert into public.profiles (id, email, full_name)
     values (new.id, new.email, new.raw_user_meta_data->>'full_name')
     on conflict (id) do nothing;
     return new;
   end;
   $$;

   drop trigger if exists on_auth_user_created on auth.users;
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute function public.handle_new_user();
   ```

3. **Auth → Providers → Google**: turn on and paste the OAuth credentials from <https://console.cloud.google.com>. Add the **Supabase callback URL** shown in the panel to your Google client as an authorised redirect URI.

4. **Auth → URL Configuration**: set the **Site URL** to your frontend domain and add redirect URLs for `…/index.html` and `…/checkout-success.html`.

## 2. Stripe — subscriptions

1. In the Stripe dashboard, enable **Billing**, then create one **Product** per tier:
   * *NSE Insights Trader* — two prices (KES 499 / month and KES 4,790 / year)
   * *NSE Insights Professional* — two prices (KES 1,999 / month and KES 19,190 / year)
2. Copy each **price ID** into the matching `STRIPE_PRICE_*` env var.
3. Add a **Webhook endpoint** at `https://<backend-host>/api/stripe/webhook` and subscribe to:
   * `checkout.session.completed`
   * `customer.subscription.deleted`
   * `customer.subscription.paused`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 3. Safaricom Daraja — M-Pesa

1. Sign up at <https://developer.safaricom.co.ke> and create an app with **Lipa Na M-Pesa Online** access.
2. Copy the sandbox **Consumer Key** and **Consumer Secret** into `.env`.
3. Configure the test **Shortcode** (`174379` for sandbox) and the **Lipa Na M-Pesa passkey**.
4. Set `MPESA_CALLBACK_URL` to a publicly reachable URL — during dev, run `ngrok http 8001` and paste the HTTPS URL.
5. When you go live, apply for a real paybill, change `MPESA_ENV=production` and rotate the keys.

## 4. Deploy the backend

Any Python host works. **Render** example:

1. Create a new **Web Service** pointing at this repo.
2. **Root directory**: `backend`. **Build command**: `pip install -r requirements.txt`. **Start command**:
   ```
   uvicorn payments_server:app --host 0.0.0.0 --port $PORT
   ```
3. Paste the env vars from `.env` into Render's dashboard.
4. (Optional) create a second service for `app.py` if you want to expose the data API.

Quick local run while you wire things up:

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env && $EDITOR .env
uvicorn payments_server:app --port 8001 --reload
```

## 5. Deploy the frontend

Any static host works — **Vercel** or **Netlify** recommended.

1. Point the host at the `frontend/` directory. Build command: none. Publish directory: `.`.
2. Add an environment variable or `public/config.js` that sets:

   ```html
   <script>
     window.NSE_CONFIG = {
       SUPABASE_URL: 'https://xxxxxxxxx.supabase.co',
       SUPABASE_ANON_KEY: 'eyJhbGciOi...',
       PAYMENTS_API: 'https://payments.nseinsights.co.ke'
     };
   </script>
   ```

   Add that block inside `<head>` on pages that need it (`login.html`, `pricing.html`, `account.html`). Alternatively, create `frontend/config.js` and load it before `supabase-client.js`.
3. Configure the 404 page to `404.html`.

## 6. DNS

| Record | Host | Points to |
|---|---|---|
| A / CNAME | `nseinsights.co.ke` | Vercel/Netlify target |
| CNAME | `payments.nseinsights.co.ke` | Render/Fly backend |

Force HTTPS everywhere. Both providers handle certificates automatically.

## 7. Smoke test

1. Open the site, create a free account, sign out, sign back in.
2. Visit `/pricing.html`, pick **Trader → Pay with card**. Use Stripe test card `4242 4242 4242 4242`. Verify redirect to `/checkout-success.html` and that `profiles.tier = 'trader'` in Supabase.
3. Pick **Trader → Pay with M-Pesa** with a sandbox-registered phone number. Approve the STK push. Verify the Daraja callback lands and the tier updates.
4. Cancel from `/account.html` and verify `subscription_status = 'cancelled'`.
5. Visit `/admin_review.html` while signed in as a `professional` user and confirm access is allowed; sign out and confirm it redirects.

## 8. Going live

- Switch Stripe keys from `sk_test_…` to `sk_live_…` and re-create the webhook secret.
- Switch `MPESA_ENV=production` and move to a real paybill.
- Rotate `SUPABASE_SERVICE_KEY` if it was ever exposed in test environments.
- Tighten `CORSMiddleware` in `payments_server.py` from `*` to your frontend domain.
- Enable Supabase **daily backups** and Stripe **radar** fraud protection.

## 9. Feedback channel

Users submit feedback via the burger menu → **Send Feedback**. The widget
(`feedback.js`) posts `{type, name, email, message, page, user_agent, tier}`
to `POST /api/feedback` on the payments backend.

Delivery fan-out (best effort, any that are configured will fire):

1. **Email (SMTP)** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM`, and `FEEDBACK_EMAIL_TO`. Any SMTP provider works (Gmail app
   passwords, SendGrid SMTP, Amazon SES SMTP, Mailgun, etc.).
2. **Supabase table** — create a `feedback` table in Supabase with columns
   matching the payload. The service-role key writes to it automatically.
3. **Stdout log + in-memory ring buffer** — always on. Read the last 200
   items at `GET /api/feedback/recent?admin_token=<SUPABASE_SERVICE_KEY>`.

If the backend is unreachable, the browser widget falls back to a `mailto:`
link to `FEEDBACK_EMAIL_TO` (override per-page with
`window.NSE_CONFIG.FEEDBACK_EMAIL`).

Optional SQL for the Supabase `feedback` table:

```sql
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  type         text,
  name         text,
  email        text,
  message      text,
  page         text,
  user_agent   text,
  tier         text
);
alter table public.feedback enable row level security;
-- only service role writes; no public select policy.
```

## File map (frontend)

| File | Role |
|---|---|
| `tokens.css` | Design tokens — Navy + Gold palette, single source of truth |
| `styles.css` | Legacy dashboard CSS (imports tokens.css) |
| `landing.html` | Marketing homepage |
| `login.html` | Sign in / create account (Supabase auth) |
| `pricing.html` | Tier table + Stripe/M-Pesa checkout |
| `account.html` | Profile + subscription management |
| `checkout-success.html` · `checkout-cancel.html` | Payment outcome pages |
| `index.html` | Main dashboard (tier-gated) |
| `admin*.html` | Admin tools (professional tier only) |
| `terms.html` · `privacy.html` · `404.html` | Legal + error |
| `supabase-client.js` | Auth wrapper (works in demo mode without keys) |
| `tier-access.js` | Feature gating, `requireAuth`, `requireTier` helpers |
| `payments.js` | Stripe/M-Pesa client helpers |
| `feedback.js` | In-app feedback widget (posts to /api/feedback) |

Have fun shipping.
