/**
 * NSE Insights — Tier-Based Access Control
 *
 * Tiers:   free  |  trader  |  professional
 *
 * Tier source (in order of preference):
 *   1. Supabase profile (profiles.tier) via window.AuthAPI.getTier()
 *   2. localStorage `userTier` (set by successful payment or admin override)
 *   3. sessionStorage `userTier` (last-known value this session)
 *   4. 'free'
 *
 * The legacy hard-coded password upgrade ("Ntigz") is retained only
 * as an admin/demo escape hatch when Supabase is not configured.
 */

// ========================
// TIER FEATURE DEFINITIONS
// ========================

const TIER_FEATURES = {
    free: {
        name: 'Free',
        maxCompanies: 20,
        availableYears: [2024, 2025],
        canViewHistoricalData: false,
        canViewValuation: false,
        canExportData: false,
        canAccessAdmin: false,
        canViewSectors: true,
        chartUpdateFrequency: 3600000,
        description: 'Dashboard view only — real-time prices'
    },
    trader: {
        name: 'Trader',
        maxCompanies: 60,
        availableYears: [2020, 2021, 2022, 2023, 2024, 2025],
        canViewHistoricalData: true,
        canViewValuation: true,
        canExportData: true,
        canAccessAdmin: false,
        canViewSectors: true,
        chartUpdateFrequency: 300000,
        description: 'Full dashboard with historical data & exports'
    },
    professional: {
        name: 'Professional',
        maxCompanies: 72,
        availableYears: [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
        canViewHistoricalData: true,
        canViewValuation: true,
        canExportData: true,
        canAccessAdmin: true,
        canViewSectors: true,
        canViewAdvancedMetrics: true,
        canCreateWatchlists: true,
        chartUpdateFrequency: 60000,
        description: 'Everything including admin console & advanced metrics'
    }
};

// ========================
// TIER ACCESS CONTROL CLASS
// ========================

class TierAccessControl {
    constructor(userTier = 'free') {
        this.userTier = TIER_FEATURES[userTier] ? userTier : 'free';
        this.features = TIER_FEATURES[this.userTier];
        try { sessionStorage.setItem('userTier', this.userTier); } catch (e) { /* noop */ }
        console.log(`[tier-access] initialised as: ${this.userTier.toUpperCase()}`);
    }

    canAccessCompany(company, selectedCompanies = []) {
        if (selectedCompanies.length >= this.features.maxCompanies) {
            return selectedCompanies.includes(company);
        }
        return true;
    }

    canAccessYear(year)        { return this.features.availableYears.includes(parseInt(year)); }
    getAccessibleCompanies(all){ return all.slice(0, this.features.maxCompanies); }
    getAccessibleYears(all)    { return all.filter(y => this.features.availableYears.includes(y)); }
    canViewHistoricalData()    { return this.features.canViewHistoricalData; }
    canViewValuation()         { return this.features.canViewValuation; }
    canExportData()            { return this.features.canExportData; }
    canAccessAdmin()           { return this.features.canAccessAdmin; }
    canViewSectors()           { return this.features.canViewSectors; }
    canViewAdvancedMetrics()   { return this.features.canViewAdvancedMetrics || false; }
    canCreateWatchlists()      { return this.features.canCreateWatchlists || false; }
    getChartUpdateFrequency()  { return this.features.chartUpdateFrequency; }
    getTierInfo()              { return this.features; }
    getMaxCompanies()          { return this.features.maxCompanies; }
    getAvailableYears()        { return this.features.availableYears; }
    isProfessional()           { return this.userTier === 'professional'; }
    isTrader()                 { return this.userTier === 'trader' || this.userTier === 'professional'; }

    filterDataByTier(data, field = 'ticker') {
        if (!Array.isArray(data)) return data;
        if (field === 'ticker') return data.filter(i => this.canAccessCompany(i.ticker || i.name));
        if (field === 'year')   return data.filter(i => this.canAccessYear(i.year));
        return data;
    }
    applyDataLimits(data) { return data.slice(0, this.features.maxCompanies); }
    getRestrictionMessage() {
        return `Your ${this.features.name} tier allows viewing up to ${this.features.maxCompanies} companies`;
    }
}

// ========================
// GLOBAL INSTANCE + HELPERS
// ========================

function _readStoredTier() {
    try {
        return localStorage.getItem('userTier')
            || sessionStorage.getItem('userTier')
            || 'free';
    } catch (e) {
        return 'free';
    }
}

// Start with the last-known tier so early page render isn't blocked
let tierAccess = new TierAccessControl(_readStoredTier());

/**
 * Refresh the tier from Supabase (or demo fallback).
 * Call this after a successful sign-in or on page load of a protected page.
 * @returns {Promise<string>} resolved tier
 */
async function refreshTierFromServer() {
    if (!window.AuthAPI || !window.AuthAPI.getTier) return tierAccess.userTier;
    try {
        const remote = await window.AuthAPI.getTier();
        if (remote && TIER_FEATURES[remote] && remote !== tierAccess.userTier) {
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

/**
 * Explicit tier assignment. Called from:
 *   - successful payment flows
 *   - admin console overrides
 *   - demo-mode upgrade (password fallback)
 */
function setUserTier(tier, password = null) {
    if (!TIER_FEATURES[tier]) {
        console.error(`Invalid tier: ${tier}`);
        return false;
    }

    // In demo mode (no Supabase) require the legacy password for paid tiers.
    const demo = !window.AuthAPI || window.AuthAPI.DEMO_MODE;
    if (demo && tier !== 'free' && password !== 'Ntigz') {
        console.error('Demo-mode password required for tier upgrade');
        return false;
    }

    tierAccess = new TierAccessControl(tier);
    try {
        localStorage.setItem('userTier', tier);
        sessionStorage.setItem('userTier', tier);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('tierChanged', { detail: { tier } }));
    console.log(`[tier-access] tier set to: ${tier.toUpperCase()}`);
    return true;
}

function getCurrentTier() { return tierAccess.userTier; }
function getTierAccess()  { return tierAccess; }

/**
 * Page-level guard. Use on protected pages:
 *   requireAuth().then(user => ...)  // throws/redirects if not signed in
 * Or:
 *   requireTier('trader').then(ok => ...)  // redirects to pricing if tier is lower
 */
async function requireAuth(redirectTo = 'login.html') {
    if (!window.AuthAPI || !window.AuthAPI.getUser) return null; // no auth wired, allow access
    try {
        const user = await window.AuthAPI.getUser();
        if (!user && !window.AuthAPI.DEMO_MODE) {
            const current = encodeURIComponent(location.pathname.split('/').pop() || '');
            window.location.href = `${redirectTo}?redirect=${current}`;
            return null;
        }
        return user;
    } catch (e) {
        console.warn('[tier-access] requireAuth failed:', e);
        return null;
    }
}

async function requireTier(minimum = 'trader', redirectTo = 'pricing.html') {
    await refreshTierFromServer();
    const order = ['free', 'trader', 'professional'];
    if (order.indexOf(tierAccess.userTier) < order.indexOf(minimum)) {
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

// Auto-refresh tier when auth changes (if the app wires up a listener)
window.addEventListener('authStateChanged', () => { refreshTierFromServer(); });

// Expose on window for legacy callers
window.tierAccess = tierAccess;
window.TIER_FEATURES = TIER_FEATURES;
window.setUserTier = setUserTier;
window.getCurrentTier = getCurrentTier;
window.getTierAccess = getTierAccess;
window.refreshTierFromServer = refreshTierFromServer;
window.requireAuth = requireAuth;
window.requireTier = requireTier;

// Kick off a server-side refresh in the background on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Defer slightly so supabase-client.js has a chance to load first.
        setTimeout(() => { refreshTierFromServer(); }, 150);
    });
}
