# NSE Insights — Data Folder Structure

This folder organises company data files by ticker symbol so annual reports and
financial documents can be dropped in manually and picked up by the admin panel.

---

## Directory Layout

```
data/
└── companies/
    ├── ABSA/
    │   └── documents/          ← Drop PDF annual reports here
    ├── EQTY/
    │   └── documents/
    ├── SCOM/
    │   └── documents/
    └── ... (41 companies total)
```

---

## How to Add a PDF Annual Report

1. Locate the company folder by ticker (e.g. `SCOM` = Safaricom).
2. Copy the PDF into its `documents/` subfolder.
3. Name the file using the convention:

   ```
   {TICKER}_Annual_Report_{YEAR}.pdf
   ```

   **Examples:**
   ```
   SCOM/documents/SCOM_Annual_Report_2024.pdf
   EQTY/documents/EQTY_Annual_Report_2024.pdf
   KCB/documents/KCB_Annual_Report_2023.pdf
   ```

4. The admin panel (`admin.html`) will automatically detect and display the file
   when that company is selected.

---

## Company Ticker Reference

| Ticker | Company                          | Sector            |
|--------|----------------------------------|-------------------|
| ABSA   | ABSA Bank Kenya                  | Banking           |
| BAMB   | Bamburi Cement                   | Construction      |
| BATK   | British American Tobacco Kenya   | Consumer Goods    |
| BKG    | BK Group                         | Banking           |
| BOC    | BOC Kenya                        | Manufacturing     |
| BRIT   | Britam Holdings                  | Insurance         |
| CARB   | Carbacid Investments             | Manufacturing     |
| CFC    | Stanbic Holdings                 | Banking           |
| COOP   | Co-operative Bank of Kenya       | Banking           |
| CPKL   | Crown Paints Kenya               | Manufacturing     |
| DTK    | Diamond Trust Bank               | Banking           |
| EABL   | East African Breweries           | Consumer Goods    |
| EAPC   | East African Portland Cement     | Construction      |
| EQTY   | Equity Group Holdings            | Banking           |
| FANB   | Family Bank                      | Banking           |
| FTGH   | Flame Tree Group                 | Agriculture       |
| HAFR   | Home Afrika                      | Real Estate       |
| HBZE   | Homebuyz Electronics             | Commercial        |
| HFCK   | Housing Finance                  | Banking           |
| IMH    | I&M Holdings                     | Banking           |
| JUB    | Jubilee Holdings                 | Insurance         |
| KAPA   | Kapchorua Tea Kenya              | Agriculture       |
| KCB    | KCB Group                        | Banking           |
| KEGN   | KenGen                           | Energy            |
| KPLC   | Kenya Power & Lighting           | Energy            |
| NBK    | National Bank of Kenya           | Banking           |
| NCBA   | NCBA Group                       | Banking           |
| NMG    | Nation Media Group               | Media             |
| NSE    | Nairobi Securities Exchange      | Financial Services|
| SASN   | Sasini                           | Agriculture       |
| SCAN   | Scangroup                        | Commercial        |
| SCBK   | Standard Chartered Bank Kenya    | Banking           |
| SCOM   | Safaricom PLC                    | Telecoms          |
| SGL    | Sanlam Kenya                     | Insurance         |
| SLAM   | Sameer Africa                    | Automobiles       |
| TCL    | Trans-Century                    | Diversified       |
| TPSE   | TPS Eastern Africa (Serena)      | Hospitality       |
| UMME   | Umeme                            | Energy            |
| UNGA   | UNGA Group                       | Consumer Goods    |
| WTK    | Williamson Tea Kenya             | Agriculture       |
| XPRS   | Express Kenya                    | Logistics         |

---

## Data Priority for 2025 Updates

Companies needing 2025 annual report data (highest priority first):

| Priority | Ticker | Company                    | Current Coverage |
|----------|--------|----------------------------|------------------|
| 🔴 HIGH  | EQTY   | Equity Group Holdings      | 2018–2024        |
| 🔴 HIGH  | KCB    | KCB Group                  | 2017–2024        |
| 🔴 HIGH  | SCBK   | Standard Chartered Bank    | 2019–2024        |
| 🔴 HIGH  | COOP   | Co-operative Bank          | 2019–2024        |
| 🔴 HIGH  | NCBA   | NCBA Group                 | 2019–2024        |
| 🔴 HIGH  | IMH    | I&M Holdings               | 2019–2024        |
| 🟡 MED   | NMG    | Nation Media Group         | 2020–2024        |
| 🟡 MED   | ABSA   | ABSA Bank Kenya            | 2019–2024        |
| 🟡 MED   | CFC    | Stanbic Holdings           | 2020–2024        |
| 🟡 MED   | BRIT   | Britam Holdings            | 2021–2024        |
| 🔴 HIGH  | KEGN   | KenGen                     | NO DATA          |
| 🔴 HIGH  | SASN   | Sasini                     | NO DATA          |

Companies with full coverage (no action needed):
- ✅ SCOM (2018–2025), EABL (2018–2025), KPLC (2020–2025), CARB (2019–2025)

---

## Notes

- The `data.js` file in the parent `frontend/` folder contains all financial data
  (income statements, balance sheets, ratios) for all 41 companies.
- PDF documents in this folder are for **admin review only** and are not served
  to end users.
- To update financial figures in the app, edit `data.js` directly or use the
  admin panel extraction workflow.
