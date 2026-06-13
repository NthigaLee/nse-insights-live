/**
 * NSE Insights — Tier-Based Access Control  (v3)
 *
 * Tiers:   free  |  paid  |  admin
 *
 * free      — must be logged in; individual stock + sector dashboards
 *             limited to the most recent 3 years of data.
 *             Sector comparison pages can see ALL years.
 *             Cannot access admin review page.
 * paid      — all years of data on all pages (stocks, sectors, admin review).
 *             Subscribed via Stripe / M-Pesa.
 * admin     — same as paid + internal admin console.
 *
 * Tier source (descending priority):
 *   1. Supabase profiles.tier  (via AuthAPI.getTier)
 *   2. localStorage 'userTier'
 *   3. sessionStorage 'userTier'
 *   4. 'free'
 */

// ========================
// FREE-TIER YEAR WINDOW
// ========================
const FREE_YEAR_COUNT = 3;

function freeYears() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - FREE_YEAR_COUNT + 1; y <= currentYear; y++) years.push(y);
  return years;
}

const ALL_TRACKED_YEARS = [
  2013,2014,2015,2016,2017,2018,2019,
  2020,2021,2022,2023,2024,2025,2026
];

// ========================
// TIER DEFINITIONS
// ========================
const TIER_FEATURES = {
  free: {
    name: 'Free',
    stockYears: freeYears(),
    sectorYears: ALL_TRACKED_YEARS,
    canViewAdmin: false,
    canExport: false,
    description: 'Last 3 years · sector overview · all stocks'
  },
  paid: {
    name: 'Paid',
    stockYears: ALL_TRACKED_YEARS,
    sectorYears: ALL_TRACKED_YEARS,
    canViewAdmin: true,
    canExport: true,
    description: 'All data · sector deep-dive · admin review'
  },
  admin: {
    name: 'Admin',
    stockYears: ALL_TRACKED_YEARS,
    sectorYears: ALL_TRACKED_YEARS,
    canViewAdmin: true,
    canExport: true,
    description: 'Full access + internal console'
  },
  // Legacy names
  trader:       null,
  professional: null,
};

function resolvedTier(raw) {
  if (raw === 'trader') return 'paid';
  if (raw === 'professional') return 'admin';
  if (raw && TIER_FEATURES[raw] && TIER_FEATURES[raw] !== null) return raw;
  return 'free';
}

// ========================
// ACCESS CONTROL CLASS
// ========================
class TierAccessControl {
  constructor(rawTier = 'free') {
    this.userTier = resolvedTier(rawTier);
    this.features = TIER_FEATURES[this.userTier];
    try { sessionStorage.setItem('userTier', rawTier); } catch (e) {}
    console.log(`[tier-access] ${this.userTier.toUpperCase()}`);
  }

  stockYears()  { return this.features.stockYears; }
  sectorYears() { return this.features.sectorYears; }

  filterStock(records) {
    if (!Array.isArray(records)) return records;
    const allowed = new Set(this.features.stockYears.map(Number));
    return records.filter(r => allowed.has(Number(r.year)));
  }

  filterSector(records) { return records; }

  canViewAdmin()  { return this.features.canViewAdmin; }
  canExport()     { return this.features.canExport; }
  isPaid()        { return this.userTier !== 'free'; }
  isAdmin()       { return this.userTier === 'admin'; }
  getTierName()   { return this.features.name; }

  lockMessage() {
    if (this.isPaid()) return null;
    const f = this.features.stockYears;
    return `Free plan shows ${f[0]}–${f[f.length-1]}. Upgrade for full history.`;
  }

  // ── Legacy shims ──
  canAccessYear(year)          { return this.features.stockYears.includes(parseInt(year)); }
  getAccessibleYears(all)      { return all.filter(y => this.canAccessYear(y)); }
  canViewHistoricalData()      { return this.isPaid(); }
  canViewValuation()           { return true; }
  canExportData()              { return this.canExport(); }
  canAccessAdmin()             { return this.canViewAdmin(); }
  canViewSectors()             { return true; }
  canViewAdvancedMetrics()     { return this.isPaid(); }
  canCreateWatchlists()        { return this.isPaid(); }
  getChartUpdateFrequency()    { return this.isPaid() ? 300000 : 3600000; }
  getMaxCompanies()            { return 999; }
  getAvailableYears()          { return this.features.stockYears; }
  isProfessional()             { return this.isAdmin(); }
  isTrader()                   { return this.isPaid(); }
  filterDataByTier(data, field) {
    if (!Array.isArray(data)) return data;
    if (field === 'year') return data.filter(i => this.canAccessYear(i.year));
    return data;
  }
  applyDataLimits(data)        { return data; }
  getRestrictionMessage()      { return this.lockMessage() || ''; }
  getTierInfo()                { return this.features; }
}

// ========================
// GLOBAL INSTANCE
// ========================
function _readStoredTier() {
  try {
    return localStorage.getItem('userTier')
        || sessionStorage.getItem('userTier')
        || 'free';
  } catch (e) { return 'free'; }
}

let tierAccess = new TierAccessControl(_readStoredTier());

async function refreshTierFromServer() {
  if (!window.AuthAPI || !window.AuthAPI.getTier) return tierAccess.userTier;
  try {
    const remote = await window.AuthAPI.getTier();
    if (remote && remote !== tierAccess.userTier) {
      tierAccess = new TierAccessControl(remote);
      try { localStorage.setItem('userTier', remote); } catch (e) {}
      window.dispatchEvent(new CustomEvent('tierChanged', { detail: { tier: remote } }));
    }
    return tierAccess.userTier;
  } catch (e) {
    console.warn('[tier-access] refresh failed:', e);
    return tierAccess.userTier;
  }
}

function setUserTier(tier, _password) {
  tierAccess = new TierAccessControl(tier);
  try {
    localStorage.setItem('userTier', tier);
    sessionStorage.setItem('userTier', tier);
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('tierChanged', { detail: { tier } }));
  return true;
}

function getCurrentTier() { return tierAccess.userTier; }
function getTierAccess()  { return tierAccess; }

async function requireAuth(redirectTo = 'login.html') {
  if (!window.AuthAPI) return null;
  try {
    const user = await window.AuthAPI.getUser();
    if (!user && !window.AuthAPI.DEMO_MODE) {
      const next = encodeURIComponent(location.pathname.split('/').pop() || 'dashboard');
      window.location.href = `${redirectTo}?redirect=${next}`;
      return null;
    }
    return user;
  } catch (e) {
    console.warn('[requireAuth]', e);
    return null;
  }
}

async function requirePaid(redirectTo = 'pricing.html') {
  const user = await requireAuth();
  if (!user) return null;
  await refreshTierFromServer();
  if (!tierAccess.isPaid()) {
    window.location.href = redirectTo + '?reason=upgrade';
    return null;
  }
  return user;
}
