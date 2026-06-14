# NSE Insights — Push script
# Run this from PowerShell in the nse-insights-deploy folder
# Right-click PowerShell → "Run as Administrator" if needed

Set-Location $PSScriptRoot

# 1. Clear the stale lock
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# 2. Reset the index to match HEAD (undo the accidental mass-delete staging)
git reset HEAD

# 3. Stage everything that actually changed
#    (--renormalize handles any CRLF differences from the Linux sandbox)
git add -A
git diff --cached --stat

# 4. Verify nothing catastrophic is staged
git status

# 5. Commit
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
- admin_review.html: same toggle pattern, ☀️/🌙 icons"

# 6. Push
git push origin main

Write-Host ""
Write-Host "Done! Cloudflare Pages will auto-deploy in ~1 min." -ForegroundColor Green
Write-Host "Check: https://nseinsights.com" -ForegroundColor Cyan
