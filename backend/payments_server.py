"""
NSE Insights — Payments backend
================================

FastAPI service that handles:
  • Stripe Checkout session creation + webhook
  • Safaricom Daraja (M-Pesa) STK push + callback
  • Tier updates to a Supabase `profiles` table after successful payment

Env vars required (see .env.example):
  STRIPE_SECRET_KEY           sk_test_… or sk_live_…
  STRIPE_WEBHOOK_SECRET       whsec_…
  STRIPE_PRICE_TRADER_MO      price_…
  STRIPE_PRICE_TRADER_YR      price_…
  STRIPE_PRICE_PRO_MO         price_…
  STRIPE_PRICE_PRO_YR         price_…

  MPESA_CONSUMER_KEY
  MPESA_CONSUMER_SECRET
  MPESA_SHORTCODE             e.g. 174379 for sandbox
  MPESA_PASSKEY
  MPESA_CALLBACK_URL          https://your-backend/api/mpesa/callback
  MPESA_ENV                   sandbox | production

  SUPABASE_URL
  SUPABASE_SERVICE_KEY        service-role key (server-side only!)

  FRONTEND_URL                https://nseinsights.co.ke (for redirects)

Run locally:
  uvicorn payments_server:app --port 8001 --reload

In production put this behind HTTPS (Render, Fly.io, Railway, etc).
"""
from __future__ import annotations

import base64
import datetime as dt
import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

try:
    import stripe  # optional at import time so the service can still boot in demo mode
except ImportError:  # pragma: no cover
    stripe = None  # type: ignore


# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")
# Comma-separated list of allowed CORS origins, e.g.
#   "https://nseinsights.co.ke,https://nse-insights.pages.dev"
# Leave empty for dev to allow all origins.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

STRIPE_SECRET = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICES = {
    ("trader", "monthly"):       os.getenv("STRIPE_PRICE_TRADER_MO", ""),
    ("trader", "yearly"):        os.getenv("STRIPE_PRICE_TRADER_YR", ""),
    ("professional", "monthly"): os.getenv("STRIPE_PRICE_PRO_MO", ""),
    ("professional", "yearly"):  os.getenv("STRIPE_PRICE_PRO_YR", ""),
}

MPESA_CONSUMER_KEY    = os.getenv("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE       = os.getenv("MPESA_SHORTCODE", "174379")
MPESA_PASSKEY         = os.getenv("MPESA_PASSKEY", "")
MPESA_CALLBACK_URL    = os.getenv("MPESA_CALLBACK_URL", "")
MPESA_ENV             = os.getenv("MPESA_ENV", "sandbox").lower()
MPESA_BASE_URL        = (
    "https://sandbox.safaricom.co.ke"
    if MPESA_ENV == "sandbox"
    else "https://api.safaricom.co.ke"
)

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Feedback
FEEDBACK_EMAIL_TO = os.getenv("FEEDBACK_EMAIL_TO", "feedback@nseinsights.co.ke")
SMTP_HOST         = os.getenv("SMTP_HOST", "")
SMTP_PORT         = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER         = os.getenv("SMTP_USER", "")
SMTP_PASS         = os.getenv("SMTP_PASS", "")
SMTP_FROM         = os.getenv("SMTP_FROM", SMTP_USER or "noreply@nseinsights.co.ke")


PRICING_KES = {
    ("trader", "monthly"):        499,
    ("trader", "yearly"):       4_790,   # 20% off 12 × 499
    ("professional", "monthly"): 1_999,
    ("professional", "yearly"): 19_190,  # 20% off 12 × 1999
}

if STRIPE_SECRET and stripe:
    stripe.api_key = STRIPE_SECRET

# In-memory status store for STK pushes (use Redis in production)
MPESA_STATUS: Dict[str, Dict[str, Any]] = {}


# ------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------

app = FastAPI(title="NSE Insights Payments", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],   # set CORS_ORIGINS in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "stripe_configured": bool(STRIPE_SECRET and stripe),
        "mpesa_configured": bool(MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY),
        "mpesa_env": MPESA_ENV,
    }


# ==================================================================
#  STRIPE
# ==================================================================

class StripeCheckoutReq(BaseModel):
    plan: str = Field(pattern="^(trader|professional)$")
    interval: str = Field(pattern="^(monthly|yearly)$")
    email: Optional[EmailStr] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@app.post("/api/stripe/checkout")
async def stripe_checkout(body: StripeCheckoutReq) -> Dict[str, str]:
    if not (STRIPE_SECRET and stripe):
        raise HTTPException(503, "Stripe is not configured on this server")

    price_id = STRIPE_PRICES.get((body.plan, body.interval))
    if not price_id:
        raise HTTPException(400, f"No Stripe price configured for {body.plan}/{body.interval}")

    success = body.success_url or f"{FRONTEND_URL}/checkout-success.html?session_id={{CHECKOUT_SESSION_ID}}"
    cancel  = body.cancel_url  or f"{FRONTEND_URL}/checkout-cancel.html"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=body.email,
            success_url=success,
            cancel_url=cancel,
            metadata={"plan": body.plan, "interval": body.interval},
            allow_promotion_codes=True,
        )
    except Exception as e:      # pragma: no cover
        raise HTTPException(502, f"Stripe error: {e}")

    return {"url": session.url, "session_id": session.id}


@app.post("/api/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
) -> Dict[str, str]:
    if not (STRIPE_SECRET and stripe and STRIPE_WEBHOOK_SECRET):
        raise HTTPException(503, "Stripe webhook not configured")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature or "",
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except Exception as e:
        raise HTTPException(400, f"Invalid signature: {e}")

    etype = event["type"]
    data = event["data"]["object"]

    if etype == "checkout.session.completed":
        plan     = (data.get("metadata") or {}).get("plan")
        interval = (data.get("metadata") or {}).get("interval")
        email    = data.get("customer_email") or data.get("customer_details", {}).get("email")
        if plan and email:
            await _upgrade_tier_in_supabase(email=email, tier=plan, interval=interval, status="active")

    elif etype in ("customer.subscription.deleted", "customer.subscription.paused"):
        email = data.get("customer_email")
        if email:
            await _upgrade_tier_in_supabase(email=email, tier="free", status="cancelled")

    return {"received": "ok"}


# ==================================================================
#  M-PESA (Daraja)
# ==================================================================

class MpesaStkReq(BaseModel):
    plan: str = Field(pattern="^(trader|professional)$")
    interval: str = Field(pattern="^(monthly|yearly)$")
    phone: str                                   # already normalised to 2547…
    email: Optional[EmailStr] = None
    amount: Optional[int] = None


class MpesaStatusReq(BaseModel):
    checkout_request_id: str


async def _mpesa_access_token() -> str:
    if not (MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET):
        raise HTTPException(503, "M-Pesa is not configured")
    creds = base64.b64encode(f"{MPESA_CONSUMER_KEY}:{MPESA_CONSUMER_SECRET}".encode()).decode()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {creds}"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"M-Pesa auth failed: {r.text}")
    return r.json()["access_token"]


@app.post("/api/mpesa/stk")
async def mpesa_stk(body: MpesaStkReq) -> Dict[str, Any]:
    amount = body.amount or PRICING_KES.get((body.plan, body.interval))
    if not amount:
        raise HTTPException(400, "Could not determine amount")

    if not MPESA_CALLBACK_URL:
        raise HTTPException(503, "MPESA_CALLBACK_URL not configured")

    timestamp = dt.datetime.now().strftime("%Y%m%d%H%M%S")
    password  = base64.b64encode(f"{MPESA_SHORTCODE}{MPESA_PASSKEY}{timestamp}".encode()).decode()
    token     = await _mpesa_access_token()

    payload = {
        "BusinessShortCode": MPESA_SHORTCODE,
        "Password":          password,
        "Timestamp":         timestamp,
        "TransactionType":   "CustomerPayBillOnline",
        "Amount":            int(amount),
        "PartyA":            body.phone,
        "PartyB":            MPESA_SHORTCODE,
        "PhoneNumber":       body.phone,
        "CallBackURL":       MPESA_CALLBACK_URL,
        "AccountReference":  f"NSE-{body.plan[:3].upper()}",
        "TransactionDesc":   f"NSE Insights {body.plan} {body.interval}",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

    if r.status_code != 200:
        raise HTTPException(502, f"M-Pesa STK failed: {r.text}")

    data = r.json()
    checkout_id = data.get("CheckoutRequestID")
    if not checkout_id:
        raise HTTPException(502, f"M-Pesa did not return CheckoutRequestID: {data}")

    MPESA_STATUS[checkout_id] = {
        "status":   "pending",
        "plan":     body.plan,
        "interval": body.interval,
        "email":    body.email,
        "phone":    body.phone,
        "amount":   amount,
        "created":  time.time(),
    }

    return {
        "checkout_request_id": checkout_id,
        "merchant_request_id": data.get("MerchantRequestID"),
        "customer_message":    data.get("CustomerMessage", "Check your phone to approve"),
    }


@app.post("/api/mpesa/status")
async def mpesa_status(body: MpesaStatusReq) -> Dict[str, Any]:
    rec = MPESA_STATUS.get(body.checkout_request_id)
    if not rec:
        return {"status": "unknown"}
    return {
        "status":  rec.get("status", "pending"),
        "message": rec.get("message", ""),
        "receipt": rec.get("receipt"),
    }


@app.post("/api/mpesa/callback")
async def mpesa_callback(request: Request) -> Dict[str, str]:
    """Safaricom posts payment results here."""
    body = await request.json()
    stk = (body.get("Body") or {}).get("stkCallback") or {}
    cid = stk.get("CheckoutRequestID")
    result_code = stk.get("ResultCode")
    rec = MPESA_STATUS.get(cid or "", None)
    if not rec:
        return {"ok": "unknown id"}

    if result_code == 0:
        items = {
            i["Name"]: i.get("Value")
            for i in (stk.get("CallbackMetadata", {}).get("Item") or [])
        }
        rec["status"]  = "success"
        rec["receipt"] = items.get("MpesaReceiptNumber")
        rec["message"] = "Payment confirmed"
        if rec.get("email"):
            await _upgrade_tier_in_supabase(
                email=rec["email"],
                tier=rec["plan"],
                interval=rec["interval"],
                status="active",
            )
    else:
        rec["status"]  = "failed"
        rec["message"] = stk.get("ResultDesc") or "Payment cancelled"

    return {"ok": "ok"}


# ==================================================================
#  Supabase tier update (via REST)


# ==================================================================
# /api/feedback
# ==================================================================

class FeedbackReq(BaseModel):
    type:       str                = Field("suggestion", max_length=40)
    name:       Optional[str]      = Field(None, max_length=100)
    email:      EmailStr
    message:    str                = Field(..., min_length=3, max_length=4000)
    page:       Optional[str]      = Field(None, max_length=500)
    user_agent: Optional[str]      = Field(None, max_length=500)
    tier:       Optional[str]      = Field(None, max_length=40)


# Keep recent feedback in memory so ops can eyeball it even without SMTP
FEEDBACK_LOG: list[Dict[str, Any]] = []


@app.post("/api/feedback")
async def submit_feedback(req: FeedbackReq) -> Dict[str, Any]:
    entry = {
        "received_at": dt.datetime.utcnow().isoformat() + "Z",
        **req.dict(),
    }
    FEEDBACK_LOG.append(entry)
    # Keep only last 200 entries in memory
    del FEEDBACK_LOG[:-200]

    delivered_via: list[str] = []

    # 1. Try SMTP if configured
    if SMTP_HOST and SMTP_USER and SMTP_PASS:
        try:
            import smtplib
            from email.mime.text import MIMEText
            subject = f"[NSE Insights feedback] {req.type}: {(req.name or req.email)[:60]}"
            body = (
                f"Type:    {req.type}\n"
                f"From:    {req.name or '(anon)'} <{req.email}>\n"
                f"Tier:    {req.tier or '(unknown)'}\n"
                f"Page:    {req.page or '(unknown)'}\n"
                f"Agent:   {req.user_agent or '(unknown)'}\n"
                f"When:    {entry['received_at']}\n\n"
                f"----\n{req.message}\n"
            )
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = subject
            msg["From"]    = SMTP_FROM
            msg["To"]      = FEEDBACK_EMAIL_TO
            msg["Reply-To"] = req.email
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
                smtp.starttls()
                smtp.login(SMTP_USER, SMTP_PASS)
                smtp.sendmail(SMTP_FROM, [FEEDBACK_EMAIL_TO], msg.as_string())
            delivered_via.append("email")
        except Exception as exc:  # noqa: BLE001
            print(f"[feedback] SMTP send failed: {exc}")

    # 2. Optionally mirror to Supabase `feedback` table if service key present
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/feedback"
            headers = {
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type":  "application/json",
                "Prefer":        "return=minimal",
            }
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=entry, headers=headers)
            if r.status_code < 300:
                delivered_via.append("supabase")
            else:
                print(f"[feedback] Supabase insert failed ({r.status_code}): {r.text}")
        except Exception as exc:  # noqa: BLE001
            print(f"[feedback] Supabase insert error: {exc}")

    if not delivered_via:
        # Still log to stdout so ops sees it in container logs
        print(f"[feedback] (no transport configured) {entry}")
        delivered_via.append("log")

    return {"ok": True, "delivered_via": delivered_via}


@app.get("/api/feedback/recent")
async def recent_feedback(limit: int = 20, admin_token: str = "") -> Dict[str, Any]:
    """Peek at recent feedback. Requires SUPABASE_SERVICE_KEY as a bearer token."""
    if not SUPABASE_SERVICE_KEY or admin_token != SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="unauthorised")
    return {"items": FEEDBACK_LOG[-max(1, min(limit, 200)):]}


# ==================================================================

async def _upgrade_tier_in_supabase(
    *, email: str, tier: str, interval: Optional[str] = None, status: str = "active"
) -> None:
    if not (SUPABASE_URL and SUPABASE_SERVICE_KEY):
        print(f"[payments] (demo) would upgrade {email} → {tier}/{status}")
        return

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/profiles?email=eq.{email}"
    headers = {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal,resolution=merge-duplicates",
    }
    payload = {
        "email":               email,
        "tier":                tier,
        "subscription_status": status,
        "subscription_interval": interval,
        "updated_at":          dt.datetime.utcnow().isoformat(),
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.patch(url, json=payload, headers=headers)
    if r.status_code >= 300:
        print(f"[payments] Supabase upgrade failed ({r.status_code}): {r.text}")


# ------------------------------------------------------------------
# Dev entrypoint
# ------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    uvicorn.run("payments_server:app", host="0.0.0.0", port=8001, reload=True)
