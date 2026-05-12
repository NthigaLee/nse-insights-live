// frontend/config.example.js
// Copy this to `config.js` and fill in your project keys.
// `config.js` is git-ignored so secrets don't end up in version control.
//
// Required values come from:
//   SUPABASE_URL / SUPABASE_ANON_KEY  →  Supabase → Settings → API
//   PAYMENTS_API                       →  your Render backend URL
//   FEEDBACK_EMAIL                     →  optional; falls back to feedback@nseinsights.co.ke

window.NSE_CONFIG = {
  SUPABASE_URL:      "https://xxxxxxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  PAYMENTS_API:      "https://your-backend.onrender.com",
  FEEDBACK_EMAIL:    "feedback@nseinsights.co.ke",
};
