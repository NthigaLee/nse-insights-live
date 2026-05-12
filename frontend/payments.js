/**
 * NSE Insights — Payments client
 * Handles Stripe Checkout redirect + M-Pesa Daraja STK Push flow.
 *
 * Configure the payments backend URL by setting:
 *   window.NSE_CONFIG = { PAYMENTS_API: 'https://your-backend.example.com' };
 * in supabase-client.js or an inline <script> before this file loads.
 *
 * If no backend is configured the module runs in DEMO_MODE and simulates
 * successful payments locally so the UI remains usable end-to-end.
 */

(function () {
  const CFG = window.NSE_CONFIG || {};
  const API = (CFG.PAYMENTS_API || '').replace(/\/$/, '');
  const DEMO = !API;

  if (DEMO) {
    console.info('[payments] Demo mode — set NSE_CONFIG.PAYMENTS_API to enable live payments.');
  }

  async function jsonFetch(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  /**
   * Start a Stripe Checkout session and redirect the browser.
   * Backend returns { url: 'https://checkout.stripe.com/...' }.
   */
  async function payWithStripe({ plan, interval, email, successUrl, cancelUrl }) {
    if (DEMO) {
      // Simulate success: upgrade tier locally and land on success page.
      localStorage.setItem('userTier', plan === 'professional' ? 'professional' : 'trader');
      localStorage.setItem('subscription_status', 'active');
      localStorage.setItem('subscription_plan', plan);
      localStorage.setItem('subscription_interval', interval);
      window.location.href = (successUrl || 'checkout-success.html') + `?demo=1&plan=${plan}`;
      return;
    }
    const data = await jsonFetch('/api/stripe/checkout', {
      plan,
      interval,
      email,
      success_url: successUrl || (window.location.origin + '/checkout-success.html'),
      cancel_url: cancelUrl || (window.location.origin + '/checkout-cancel.html'),
    });
    if (!data.url) throw new Error('Missing checkout URL');
    window.location.href = data.url;
  }

  /**
   * Trigger Safaricom Daraja STK Push. Backend returns
   *   { checkout_request_id, merchant_request_id, customer_message }
   * and we then poll /api/mpesa/status until completion.
   */
  async function payWithMpesa({ plan, interval, phone, email, amount, onStatus }) {
    const normalisedPhone = normalisePhone(phone);
    if (!normalisedPhone) throw new Error('Enter a valid Safaricom number (07… or 2547…).');

    if (DEMO) {
      await sleep(1500);
      if (onStatus) onStatus({ stage: 'sent', message: 'STK push simulated on your phone' });
      await sleep(2500);
      localStorage.setItem('userTier', plan === 'professional' ? 'professional' : 'trader');
      localStorage.setItem('subscription_status', 'active');
      localStorage.setItem('subscription_plan', plan);
      localStorage.setItem('subscription_interval', interval);
      if (onStatus) onStatus({ stage: 'success', message: 'Payment confirmed (demo)' });
      return { success: true, demo: true };
    }

    const data = await jsonFetch('/api/mpesa/stk', {
      plan,
      interval,
      phone: normalisedPhone,
      email,
      amount,
    });
    if (onStatus) onStatus({ stage: 'sent', message: data.customer_message || 'Check your phone to approve the payment' });

    const id = data.checkout_request_id;
    const started = Date.now();
    while (Date.now() - started < 120000) {
      await sleep(3000);
      try {
        const status = await jsonFetch('/api/mpesa/status', { checkout_request_id: id });
        if (status.status === 'success') {
          if (onStatus) onStatus({ stage: 'success', message: 'Payment confirmed' });
          return { success: true, receipt: status.receipt };
        }
        if (status.status === 'failed') {
          if (onStatus) onStatus({ stage: 'failed', message: status.message || 'Payment cancelled' });
          return { success: false, message: status.message };
        }
      } catch (err) {
        // keep polling
      }
    }
    if (onStatus) onStatus({ stage: 'failed', message: 'Timed out waiting for confirmation' });
    return { success: false, message: 'timeout' };
  }

  function normalisePhone(raw) {
    if (!raw) return null;
    const d = String(raw).replace(/\D/g, '');
    if (d.startsWith('254') && d.length === 12) return d;
    if (d.startsWith('0') && d.length === 10) return '254' + d.slice(1);
    if (d.startsWith('7') && d.length === 9) return '254' + d;
    if (d.startsWith('1') && d.length === 9) return '254' + d;
    return null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  window.Payments = {
    DEMO_MODE: DEMO,
    payWithStripe,
    payWithMpesa,
    normalisePhone,
  };
})();
