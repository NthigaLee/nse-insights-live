# Kenya Stocks — NSE Insights

Financial dashboard for Nairobi Securities Exchange (NSE) listed companies. Includes price charts (2013–2025), financial statements, sector-specific metrics, and valuation estimates.

**Live site:** [nthigalee.github.io/kenya-stocks](https://nthigalee.github.io/kenya-stocks/)

## Quick Start

### Frontend (Static)
```bash
cd frontend
python -m http.server 8080
# Open http://localhost:8080
```

### Backend API (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

## Admin Review Panel

An admin panel for reviewing and validating extracted financial records. Modeled after the bma-filings admin review workflow.

### How to Access

1. Start the review server:
   ```bash
   cd backend
   python review_server.py
   # Runs at http://localhost:8090
   ```

2. Open http://localhost:8090/admin_review.html

3. Log in with the admin password (default: `nse-admin-2024` for development). Set a custom password via the `ADMIN_PASSWORD` environment variable:
   ```bash
   ADMIN_PASSWORD=my-secure-password python review_server.py
   ```

4. You can also access the admin panel via the "Admin" link in the top-right corner of the main dashboard (requires the review server to be running).

### Review Statuses

| Status | Meaning |
|--------|---------|
| `unreviewed` | Record has not been reviewed (default) |
| `in_progress` | Currently being reviewed/investigated |
| `approved` | Data verified as correct |
| `needs_fix` | Data has errors that need correction |

### Features

- **Table view** of all financial records with sortable columns
- **Filter** by ticker, year, period type, and review status
- **Auto-detected issues** — flags records with missing fields, suspicious values, or parsing artifacts
- **Detail panel** showing all parsed fields (profitability, per share, balance sheet, banking metrics)
- **Comments** — add notes to records for future reference
- **Persistent state** — review state survives server restarts

### Where Review State is Stored

Review state is persisted in `data/nse/review_state.json`. This file is separate from the financial data (`data/nse/financials_complete.json`) and does not affect the public-facing dashboard.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth` | Authenticate with password, returns bearer token |
| GET | `/api/records` | List all records with review status (requires auth) |
| POST | `/api/review` | Update review status and comment for a record (requires auth) |

## Data Pipeline

```
PDF Reports → pdfplumber extraction → financials_complete.json
→ generate_frontend_data.py → data.js (static JS) → Browser renders UI
```

Price data sourced from Mendeley NSE datasets (2013–2025), sampled weekly.

## Project Structure

```
frontend/          Static HTML/JS/CSS dashboard
  index.html       Main dashboard
  admin_review.html  Admin review panel
  app.js           Dashboard logic
  data.js          Auto-generated financial data
  prices.json      Weekly price data (72 stocks)
  styles.css       Dark theme styles

backend/           Python data processing
  app.py           FastAPI server
  review_server.py Admin review server
  generate_frontend_data.py  Data pipeline
  extract_all.py   PDF extraction

data/nse/          Financial data
  financials_complete.json   Extracted financials
  review_state.json          Review status persistence

docs/              GitHub Pages deployment (mirrors frontend/)
```
