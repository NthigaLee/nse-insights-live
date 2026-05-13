/* ============================================================
   NSE Insights — Frontend config
   Edit these values to point at your Supabase project + payments backend.
   The Supabase anon key is intentionally public (RLS protects data).
   ============================================================ */
window.NSE_CONFIG = {
  // Supabase — Project URL + anon (publishable) key
  SUPABASE_URL:      "https://ehpsvnhctqjenhyizidm.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVocHN2bmhjdHFqZW5oeWl6aWRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDczNjAsImV4cCI6MjA5MzMyMzM2MH0.NzJ5dqYXie0p9BML5PvoG17VsD10n6ZMp6mj2deKhTM",

  // FastAPI payments backend (fill in once Render is deployed)
  // Will be: https://api.nseinsights.com (after custom domain)
  // Or:      https://nse-insights-api.onrender.com (initial Render URL)
  PAYMENTS_API:      "https://api.nseinsights.com",

  // Where the burger-menu Feedback widget delivers messages (mailto fallback)
  FEEDBACK_EMAIL:    "feedback@nseinsights.com",
};
