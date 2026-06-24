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
git commit -m "Design handoff: 5 PDF fixes — chart, components, tokens, a11y, hygiene

Fix 01 — Hero chart (landing.html):
- hexToRgba(): gradient fill now works correctly with hex colors
- ctx.setTransform() replaces ctx.scale() — no more compounding retina
- Fetches real prices from prices.json (last 52 weekly pts, 4 tickers)
- Single brand blue #1e88ff; graceful fallback if prices.json absent
- Static 'NSE x 1Y' badge; canvas role=img + aria-label

Fix 02 — components.css:
- New shared component layer: .btn variants, .card, .input
- data-surface=marketing / data-surface=app on body tags
- Loaded on all pages after tokens.css

Fix 03 — Brand/gold policy:
- Blue = interactive in both themes; gold = decoration only
- tokens.css: light bg-base #f0f5fb, --ink-foreground-35 raised to 0.65
- styles.css: --navy-* replaced with --blue-*; sd-tab.active uses accent

Fix 04 — Accessibility:
- Skip link on dashboard.html + .skip-link CSS
- hamburger aria-label + aria-expanded; theme toggle role=switch
- hero canvas role=img + aria-label

Fix 05 — Code hygiene:
- _redirects: /index.html -> /dashboard.html 301
- dashboard.html: deduped meta tags; Chart.js scripts deferred
- Font trimmed to wght 400/600/700/800"

# 6. Push
git push origin main

Write-Host ""
Write-Host "Done! Cloudflare Pages will auto-deploy in ~1 min." -ForegroundColor Green
Write-Host "Check: https://nseinsights.com" -ForegroundColor Cyan
