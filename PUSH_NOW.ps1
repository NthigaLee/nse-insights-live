# NSE Insights — Push script
# Run this from PowerShell in the nse-insights-deploy folder
# Right-click PowerShell → "Run as Administrator" if needed

Set-Location $PSScriptRoot

# 1. Clear the stale lock
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# 2. Reset the index to match HEAD (undo the accidental mass-delete staging)
git reset HEAD

# 3. Stage everything that actually changed
git add -A

# 4. Verify nothing catastrophic is staged
git status

# 5. Commit
git commit -m "Major update: data backfill + landing redesign + auth tier gating

Data:
- Cleaned 84 bad field values (year-as-value, absurd eps/dps, impossible equity)
- Added 9 new records from local PDF extraction + DATA_UPDATE_LOG
- FY2025 results: ABSA, KCB, EQTY, COOP, NCBA, DTK, CFC, HFCK, JUB, NMG
- Historical gap fill: BAMB FY2021-2023, UNGA FY2020-2021, NBK FY2021-2023,
  SASN FY2023-2024, TPSE FY2023, LBTY FY2023-2024, NSE FY2023 + H1 2024
- Fixed UMME currency KES->UGX
- Q1 2026: EQTY + KCB (from DATA_UPDATE_LOG)
- All 44 companies now parse clean

UI / Auth:
- Landing page fully redesigned: animated rotating price chart widget,
  ticker tape, dark theme, CTAs, pricing section
- Dashboard: auth guard (redirects unauthenticated users to landing)
- Nav: shows user name, tier badge, sign-out, admin link (paid only)
- tier-access.js v3: free=last 3 yrs stocks/all yrs sectors; paid=all+admin
- admin_review.html: requires paid tier
- app.js: applyTierFilter(), year-range banner for free users"

# 6. Push
git push origin main

Write-Host ""
Write-Host "Done! Cloudflare Pages will auto-deploy in ~1 min." -ForegroundColor Green
Write-Host "Check: https://nseinsights.com" -ForegroundColor Cyan
