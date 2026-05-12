/**
 * NSE Insights — Supabase client initialisation
 * ---------------------------------------------
 * Fill in SUPABASE_URL and SUPABASE_ANON_KEY with your real project keys
 * (see DEPLOYMENT.md). If left blank, the app runs in DEMO MODE — forms
 * still work, sessions persist to localStorage, but no real accounts are
 * created.
 */

window.NSE_CONFIG = window.NSE_CONFIG || {};
window.NSE_CONFIG.SUPABASE_URL = window.NSE_CONFIG.SUPABASE_URL || '';      // e.g. "https://xyzcompany.supabase.co"
window.NSE_CONFIG.SUPABASE_ANON_KEY = window.NSE_CONFIG.SUPABASE_ANON_KEY || ''; // public anon key
window.NSE_CONFIG.PAYMENTS_API = window.NSE_CONFIG.PAYMENTS_API || 'http://localhost:8100';

const SUPABASE_URL  = window.NSE_CONFIG.SUPABASE_URL;
const SUPABASE_ANON = window.NSE_CONFIG.SUPABASE_ANON_KEY;
const DEMO_MODE     = !SUPABASE_URL || !SUPABASE_ANON;

let _supabase = null;

async function loadSupabase() {
  if (DEMO_MODE) return null;
  if (_supabase) return _supabase;
  // Dynamic ESM import so demo-mode pages don't pay for it.
  const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  _supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _supabase;
}

/* ─────────── Auth API (uniform interface) ─────────── */
const AuthAPI = {
  DEMO_MODE,

  async signUp({ email, password, firstName, lastName }) {
    if (DEMO_MODE) {
      const user = { email, firstName, lastName, tier: 'free', created: Date.now() };
      localStorage.setItem('nse_demo_user', JSON.stringify(user));
      localStorage.setItem('userTier', 'free');
      return { ok: true, user, demo: true };
    }
    const sb = await loadSupabase();
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { first_name: firstName, last_name: lastName } }
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: data.user };
  },

  async signIn({ email, password }) {
    if (DEMO_MODE) {
      const raw = localStorage.getItem('nse_demo_user');
      const existing = raw ? JSON.parse(raw) : null;
      const user = existing && existing.email === email ? existing : { email, tier: 'free' };
      localStorage.setItem('nse_demo_user', JSON.stringify(user));
      localStorage.setItem('userTier', user.tier || 'free');
      return { ok: true, user, demo: true };
    }
    const sb = await loadSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: data.user };
  },

  async signInWithGoogle() {
    if (DEMO_MODE) {
      const user = { email: 'demo@nseinsights.co.ke', firstName: 'Demo', tier: 'free' };
      localStorage.setItem('nse_demo_user', JSON.stringify(user));
      localStorage.setItem('userTier', 'free');
      window.location.href = 'index.html';
      return { ok: true, demo: true };
    }
    const sb = await loadSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/index.html' }
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async signOut() {
    if (DEMO_MODE) {
      localStorage.removeItem('nse_demo_user');
      localStorage.removeItem('userTier');
      return { ok: true };
    }
    const sb = await loadSupabase();
    await sb.auth.signOut();
    localStorage.removeItem('userTier');
    return { ok: true };
  },

  async resetPassword(email) {
    if (DEMO_MODE) return { ok: true, demo: true };
    const sb = await loadSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async getSession() {
    if (DEMO_MODE) {
      const raw = localStorage.getItem('nse_demo_user');
      if (!raw) return null;
      try { return { user: JSON.parse(raw), demo: true }; } catch { return null; }
    }
    const sb = await loadSupabase();
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async getUser() {
    const s = await this.getSession();
    return s ? (s.user || s) : null;
  },

  async getTier() {
    // Attempt Supabase profile lookup; fallback to localStorage.
    if (DEMO_MODE) return localStorage.getItem('userTier') || 'free';
    try {
      const sb = await loadSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) return 'free';
      const userId = sessionData.session.user.id;
      const { data, error } = await sb.from('profiles')
        .select('tier, subscription_status')
        .eq('id', userId)
        .single();
      if (error || !data) return 'free';
      return data.tier || 'free';
    } catch (e) {
      return localStorage.getItem('userTier') || 'free';
    }
  }
};

window.AuthAPI = AuthAPI;
