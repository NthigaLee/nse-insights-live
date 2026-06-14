# ============================================================
#  NSE Insights — Full Deploy Guide
#  Run each block in PowerShell from the nse-insights-deploy folder.
#  Right-click PowerShell → "Run as Administrator" if you hit
#  permission errors on git operations.
# ============================================================

# ── STEP 1: Open PowerShell in the right folder ─────────────
#
#  Option A — File Explorer:
#    Navigate to C:\Users\nthig\Documents\nse-insights-deploy
#    Shift + Right-click in the folder → "Open PowerShell window here"
#
#  Option B — Run this one-liner from any PowerShell window:
Set-Location "C:\Users\nthig\Documents\nse-insights-deploy"


# ── STEP 2: Check your Git identity (first time only) ───────
git config user.name   # should print your name
git config user.email  # should print your email

# If blank, set them:
# git config --global user.name  "Your Name"
# git config --global user.email "your@email.com"


# ── STEP 3: Clear any stale Git lock (if Git was interrupted) ─
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
Write-Host "Lock cleared (or was already absent)." -ForegroundColor Green


# ── STEP 4: Reset index to HEAD ─────────────────────────────
#  Harmless if nothing is weirdly staged — ensures a clean slate.
git reset HEAD


# ── STEP 5: Stage all changes ───────────────────────────────
git add -A

# Quick sanity check — should list the frontend/* files changed:
git status --short


# ── STEP 6: Review what's staged (optional but recommended) ──
git diff --cached --stat
# Expected files:
#   frontend/tokens.css       — dark mode ink palette
#   frontend/styles.css       — light mode refresh + dark fixes
#   frontend/dashboard.html   — body class dark, topnav wired
#   frontend/login.html       — right panel dark
#   frontend/pricing.html     — nav dark, body dark, plan cards
#   frontend/admin_review.html — body dark, theme toggle fixed
#   frontend/app.js           — initTheme/toggleTheme defaults to dark
#   PUSH_NOW.ps1 / DEPLOY_STEPS.ps1


# ── STEP 7: Commit ──────────────────────────────────────────
git commit -m "UI: consistent dark + light themes across all pages

Dark mode (default):
- tokens.css: ink-900 (#0a1220) palette, rgba(255,255,255,0.08) borders,
  #e8edf5 text, #4ade80 / #f87171 gain/loss — matches landing exactly
- styles.css: topnav rgba(10,18,32,0.85), --bg-hover, dark accent overrides
- dashboard.html + admin_review.html: body class dark by default
- login.html: right panel dark ink (inputs, tabs, alerts, links)
- pricing.html: dark nav, body dark, gold featured plan, blue toggle

Light mode (toggle from dashboard):
- styles.css body.light: modern blue-white (#f0f5fb bg, white cards,
  blue-600 accent, slate text, vivid gain/loss colours — not dated cream)
- app.js: toggleTheme + initTheme default to dark; localStorage persists
- admin_review.html: same toggle pattern, sun/moon icons"


# ── STEP 8: Push to GitHub ───────────────────────────────────
git push origin main

# If this is your first push on a new machine you may be prompted
# to authenticate. Use your GitHub username + a Personal Access Token
# (not your password). Create one at: https://github.com/settings/tokens
# → "Generate new token (classic)" → check "repo" scope → copy it.


# ── STEP 9: Watch Cloudflare deploy ─────────────────────────
Write-Host ""
Write-Host "Push complete! Cloudflare Pages auto-deploys in ~60 seconds." -ForegroundColor Green
Write-Host "Check build status: https://dash.cloudflare.com" -ForegroundColor Cyan
Write-Host "Live site:          https://nseinsights.com"      -ForegroundColor Cyan
Write-Host ""
Write-Host "What to verify on the live site:" -ForegroundColor Yellow
Write-Host "  1. landing.html  — dark, animated chart, ticker tape"
Write-Host "  2. login.html    — dark left + dark right panel"
Write-Host "  3. pricing.html  — dark nav, dark cards, gold featured plan"
Write-Host "  4. /dashboard    — dark by default (body.dark)"
Write-Host "     - Click 'Light' toggle → clean blue-white mode"
Write-Host "     - Refresh — it remembers your choice (localStorage)"
Write-Host "  5. admin_review  — same dark default + ☀️/🌙 toggle"
Write-Host "  6. Free account  — only last 3 yrs of stock data visible"
Write-Host "  7. Paid account  — all data + Admin Review link in nav"


# ── TROUBLESHOOTING ──────────────────────────────────────────
#
#  "Updates were rejected because the remote contains work"
#    → git pull --rebase origin main   then re-run Step 8
#
#  "fatal: not a git repository"
#    → you're in the wrong folder; re-run Step 1
#
#  "Permission denied (publickey)"
#    → you're using SSH auth; run with HTTPS instead:
#      git remote set-url origin https://github.com/NthigaLee/nse-insights-live.git
#
#  "error: cannot lock ref" or ".git/index.lock exists"
#    → re-run Step 3 then retry
#
#  Cloudflare build fails
#    → Check dash.cloudflare.com → Pages → nse-insights-live → Deployments
#      The error log will pinpoint the issue (usually a missing file)
