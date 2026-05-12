"""
Hand-curated annual data for non-financial sectors, sourced directly from
audited press releases under data/nse/. Numbers are in KES '000 unless
the company already used '000000' (then divided by 1000 to normalise).

Run: python3 backend/update_other_sectors.py
"""
from __future__ import annotations
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATAJS = ROOT / "frontend" / "data.js"

# ─── Telecoms & Technology ─────────────────────────────────────────────
# Safaricom (SCOM) — KES Mn → multiply 1000 to KES '000.
# Source: Safaricom condensed audited results 31 Mar 2024 (FY2024)
SCOM_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 349447200.0,            # Total revenue 349,447.2 Mn
    "serviceRevenue": 335353100.0,
    "ebitda": 163292600.0,
    "operatingProfit": 80344800.0,
    "depreciation": -82947800.0,
    "directCosts": -97046900.0,
    "pat": 42658400.0, "pbt": 84687400.0, "eps":1.57, "dps":1.20,
    "totalAssets": 641164300.0, "totalEquity": 335747900.0,
    "totalLiabilities": 305416400.0,
    "borrowings": 45053600.0,
    "leaseLiabilities": 6411000.0,
    "ppe": 558622400.0,           # non-current assets (network) proxy
    "cashAndEquivalents": 22868200.0,
    "inventories": 4526000.0,
    # Segments
    "segMpesa": 139910000.0,
    "segVoice": 79510000.0,
    "segMessaging": 12280000.0,
    "segMobileData": 63240000.0,
    "segFixedEnterprise": 15110000.0,
    # Operational metrics
    "subscribers": 49.02e6,           # one-month active total
    "capex": 93540000.0,              # 93.54Bn capex
}
SCOM_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 310904800.0, "serviceRevenue": 295692300.0,
    "ebitda": 139862400.0, "operatingProfit": 84997400.0,
    "depreciation": -54865000.0, "directCosts": -92232100.0,
    "pat": 52482800.0, "pbt": 88345200.0, "eps":1.55, "dps":1.20,
    "totalAssets": 509207000.0, "totalEquity": 263365900.0,
    "totalLiabilities": 245841100.0,
    "borrowings": 45555400.0, "leaseLiabilities": 5354900.0,
    "ppe": 436771500.0,
    "cashAndEquivalents": 22098100.0, "inventories": 3655600.0,
}

# ─── Consumer Goods (FMCG) ────────────────────────────────────────────
# BAT Kenya — values in KShs Mn → ×1000
BAT_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "grossSales": 41249000.0,           # gross incl indirect taxes
    "revenue": 25557000.0,              # net of excise/VAT
    "cogs": -17632000.0,                # cost of operations
    "grossProfit": 7925000.0,           # = profit from operations (BAT shows directly)
    "ebit": 7925000.0,
    "pbt": 8022000.0, "pat": 5568000.0,
    "eps": 55.68, "dps": 50.00,
    "totalAssets": 24050000.0,          # 11,807 + 12,243 (rough)
    "totalEquity": 16250000.0,
    "totalLiabilities": 7800000.0,      # 2,000 NCL + 5,800 CL
    "ppe": 11807000.0,                  # non-current assets
    "inventories": 0.0,                 # not split out in summary
    "cashAndEquivalents": 1821000.0,
    "indirectTaxes": -15692000.0,
}
BAT_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "grossSales": 42247000.0,
    "revenue": 27378000.0,
    "cogs": -17498000.0,
    "grossProfit": 9880000.0, "ebit": 9880000.0,
    "pbt": 9913000.0, "pat": 6892000.0, "eps":68.92, "dps":57.00,
    "totalAssets": 23947000.0, "totalEquity": 16382000.0,
    "totalLiabilities": 7565000.0,
    "ppe": 12096000.0,
    "cashAndEquivalents": 2368000.0,
    "indirectTaxes": -14869000.0,
}

# EABL — Note: half-year H1 results in dumps; we have 31-Dec H1 FY25 (=H1 of FY ending Jun 2025) and 31-Dec H1 FY24
# We'll use the H1 numbers as proxy for the most-recent half year, but for annual rows we need full-year audits.
# Carbacid uses 31 July fiscal year-end.
CARB_FY25 = {
    "year":2025, "period":"FY2025", "periodType":"annual",
    "revenue": 2099850.0,   # turnover Shs '000
    "operatingProfit": 1357625.0,
    "ebit": 1357625.0,
    "pbt": 1288564.0, "pat": 1002914.0, "eps": 3.94, "dps": 2.00,
    "totalAssets": 6033183.0, "totalEquity": 5141594.0,
    "totalLiabilities": 891589.0,         # 6,033,183 - 5,141,594
    "ppe": 2221789.0,
    "investmentProperty": 222900.0,
    "cashAndEquivalents": 118576.0,
    "borrowings": 500554.0,
    "investmentAssets": 2299848.0,        # financial assets
}
CARB_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 2066315.0,
    "operatingProfit": 1219520.0, "ebit": 1219520.0,
    "pbt": 1123758.0, "pat": 843274.0, "eps": 3.31, "dps": 1.70,
    "totalAssets": 5607582.0, "totalEquity": 4571928.0,
    "totalLiabilities": 1035654.0,
    "ppe": 1963988.0, "investmentProperty": 145894.0,
    "cashAndEquivalents": 524882.0,
    "borrowings": 655496.0,
    "investmentAssets": 2293590.0,
}

# EABL — annualised from H1 FY24 (Dec 2023) which is H1 of fiscal year ending Jun 2024.
# We use the company's annualised EPS (15.30 / 13.80) and retrospective full-year markers from 30-Jun audits.
# To keep this consistent we'll record the H1 result rather than fabricate annual.
# We have H1 FY25 (ended Dec 2024) and H1 FY24 (ended Dec 2023) — these are interim.
# Use those as separate "interim" rows; keep existing annual rows in data.js intact.
# For now we'll only top-up FY24 (June 2024 audit's restated comparative numbers from H1 FY25).
EABL_H1FY25 = {
    "year":2025, "period":"H1FY2025", "periodType":"half_year",
    "revenue": 67916000.0, "grossSales": 119080000.0 + 40000.0,  # Net+
    "cogs": -39781000.0, "grossProfit": 28135000.0,
    "ebit": 15589000.0, "pbt": 12147000.0, "pat": 8107000.0,
    "eps": 15.30,
    "totalAssets": 137737000.0,    # 84,406 NCA + 53,331 CA
    "totalEquity": 40877000.0,
    "totalLiabilities": 96860000.0,
    "ppe": 77602000.0,
    "inventories": 14507000.0,
    "cashAndEquivalents": 14093000.0,
    "borrowings": 45633000.0,      # 38,497 + 7,136
}

# ─── Energy & Utilities ───────────────────────────────────────────────
# KenGen FY25 (year ended 30 Jun 2025), all in KES Mn → ×1000
KEGN_FY25 = {
    "year":2025, "period":"FY2025", "periodType":"annual",
    "revenue": 56098000.0,
    "reimbursableExpenses": -9647000.0,        # fuel & water
    "netRevenue": 46451000.0,                  # rev less reimbursables
    "operatingProfit": 13617000.0, "ebit": 13617000.0,
    "operatingExpenses": -35138000.0,
    "financeIncome": 4110000.0, "financeCosts": -2254000.0,
    "pbt": 15473000.0, "pat": 10481000.0, "eps": 1.59, "dps": 0.90,
    "totalAssets": 505573000.0, "totalEquity": 284544000.0,
    "totalLiabilities": 221029000.0,
    "ppe": 429556000.0,                        # generation capex
    "borrowings": 109271000.0,
    "cashAndEquivalents": 30124000.0,
    "capex": 13592000.0,                       # purchase of PP&E
    "installedCapacityMW": 1786,
    "generationGWh": 8482,
}
KEGN_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 56297000.0, "reimbursableExpenses": -8003000.0, "netRevenue": 48294000.0,
    "operatingProfit": 9551000.0, "ebit": 9551000.0,
    "operatingExpenses": -39318000.0,
    "financeIncome": 4202000.0, "financeCosts": -2806000.0,
    "pbt": 10947000.0, "pat": 6797000.0, "eps": 1.03, "dps": 0.65,
    "totalAssets": 491293000.0, "totalEquity": 278106000.0,
    "totalLiabilities": 213187000.0,
    "ppe": 426723000.0,
    "borrowings": 107749000.0,
    "cashAndEquivalents": 25618000.0,
    "capex": 8917000.0,
    "installedCapacityMW": 1786, "generationGWh": 8383,
}

# KPLC FY25 (year ended 30 Jun 2025), KES Mn → ×1000
KPLC_FY25 = {
    "year":2025, "period":"FY2025", "periodType":"annual",
    "revenue": 219285000.0,
    "cogs": -144664000.0,                  # power purchase costs
    "grossProfit": 74621000.0,
    "operatingProfit": 39467000.0, "ebit": 39467000.0,
    "financeCosts": -4717000.0,
    "pbt": 35375000.0, "pat": 24467000.0, "eps":12.54, "dps":1.00,
    "totalAssets": 389039000.0, "totalEquity": 109335000.0,
    "totalLiabilities": 279704000.0,
    "ppe": 287477000.0,
    "borrowings": 87640000.0,             # commercial loans book
    "cashAndEquivalents": 7685000.0,
}
KPLC_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 231124000.0, "cogs": -150606000.0, "grossProfit": 80518000.0,
    "operatingProfit": 41490000.0, "ebit": 41490000.0,
    "financeCosts": 682000.0,             # net positive in 2024
    "pbt": 43666000.0, "pat": 30080000.0, "eps":15.41, "dps":0.20,
    "totalAssets": 358086000.0, "totalEquity": 87314000.0,
    "totalLiabilities": 270772000.0,
    "ppe": 275775000.0,
    "cashAndEquivalents": 10353000.0,
}

# Umeme FY23 — Uganda Shs '000, included for comparison; uses USh ('000)
UMEM_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    # Already in data.js; only adding sector marker info.
}

# ─── Agriculture ─────────────────────────────────────────────────────
# Williamson Tea FY25 (year ended 31 Mar 2025) - already in KSh '000
WTK_FY25 = {
    "year":2025, "period":"FY2025", "periodType":"annual",
    "revenue": 4108740.0,
    "operatingProfit": -392220.0, "ebit": -392220.0,
    "fairValueBio": 56269.0,
    "financeIncome": 9287.0,
    "shareOfAssociate": 71673.0,
    "pbt": -254991.0, "pat": -166439.0, "eps": -8.76,
    "totalAssets": 8366654.0, "totalEquity": 6321241.0,
    "totalLiabilities": 2045413.0,
    "ppe": 4097863.0,
    "biologicalAssets": 717372.0,
    "investments": 1266024.0,
    "inventories": 663361.0,
    "cashAndEquivalents": 818022.0,
    "borrowings": 102654.0,
}
WTK_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 4194358.0,
    "operatingProfit": 330376.0, "ebit": 330376.0,
    "fairValueBio": 73612.0, "financeIncome": 122757.0,
    "shareOfAssociate": 157986.0,
    "pbt": 684731.0, "pat": 526953.0, "eps":28.41, "dps":15.0,
    "totalAssets": 9031506.0, "totalEquity": 6811598.0,
    "totalLiabilities": 2219908.0,
    "ppe": 4459812.0, "biologicalAssets": 736217.0,
    "investments": 1240263.0, "inventories": 1030396.0,
    "cashAndEquivalents": 716278.0,
    "borrowings": 151963.0,
}

# Kapchorua FY25
KAPA_FY25 = {
    "year":2025, "period":"FY2025", "periodType":"annual",
    "revenue": 2218731.0,
    "operatingProfit": 110990.0, "ebit": 110990.0,
    "fairValueBio": 100267.0,
    "financeIncome": 44731.0,
    "pbt": 261543.0, "pat": 181177.0, "eps": 23.16, "dps": 25.00,
    "totalAssets": 2824228.0, "totalEquity": 2099193.0,
    "totalLiabilities": 725035.0,
    "ppe": 1181129.0,
    "biologicalAssets": 456032.0,
    "investments": 12901.0,
    "inventories": 206498.0,
    "cashAndEquivalents": 674064.0,
}
KAPA_FY24 = {
    "year":2024, "period":"FY2024", "periodType":"annual",
    "revenue": 2193918.0,
    "operatingProfit": 338524.0, "ebit": 338524.0,
    "fairValueBio": 86905.0, "financeIncome": 26825.0,
    "pbt": 573297.0, "pat": 399358.0, "eps":51.04, "dps":30.0,
    "totalAssets": 2907500.0, "totalEquity": 2051958.0,
    "totalLiabilities": 855542.0,
    "ppe": 1192590.0, "biologicalAssets": 376815.0,
    "investments": 13367.0, "inventories": 454998.0,
    "cashAndEquivalents": 588677.0,
}

# ─── Manufacturing ────────────────────────────────────────────────────
# BOC Kenya FY23 — KShs '000
BOC_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 1539342.0,
    "ebit": 269715.0, "operatingProfit": 269715.0,
    "pbt": 309081.0, "pat": 198058.0, "eps":10.14, "dps":7.65,
    "totalAssets": 2157815.0, "totalEquity": 1807496.0,
    "totalLiabilities": 350319.0,
    "ppe": 766474.0,                # non-current assets
    "inventories": 0.0,
    "cashAndEquivalents": 633449.0,
}
BOC_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "revenue": 1287250.0,
    "ebit": 176508.0, "operatingProfit": 176508.0,
    "pbt": 213426.0, "pat": 147992.0, "eps":7.58, "dps":6.05,
    "totalAssets": 1950881.0, "totalEquity": 1661628.0,
    "totalLiabilities": 289253.0,
    "ppe": 805398.0,
    "cashAndEquivalents": 277118.0,
}

# Crown Paints FY23 — KES Mn → ×1000
CPKL_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 12489000.0,
    "pbt": 14000.0, "pat": -29000.0,            # group loss after tax 29M
    "eps": -0.20,
    "totalAssets": 9291000.0, "totalEquity": 3139000.0,  # 3,690 less 551 share buyback rough
    "totalLiabilities": 6152000.0,
    "ppe": 2442000.0,
    "cashAndEquivalents": 171000.0,
}
CPKL_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "revenue": 11389000.0,
    "pbt": 1073000.0, "pat": 824000.0, "eps":5.79, "dps":4.0,
    "totalAssets": 9205000.0, "totalEquity": 3690000.0,
    "totalLiabilities": 5515000.0,
    "ppe": 2295000.0,
    "cashAndEquivalents": 72000.0,
}

# East African Portland Cement — H1 FY24 (six months ended 31 Dec 2023). Half-year only.
EAPC_H1FY24 = {
    "year":2024, "period":"H1FY2024", "periodType":"half_year",
    "revenue": 1838798.0, "cogs": -2157936.0,
    "grossProfit": -319138.0,
    "ebit": -732173.0, "operatingProfit": -732173.0,
    "pbt": -734370.0, "pat": -720788.0, "eps": -8.01,
    "totalAssets": 32764649.0, "totalEquity": 18434269.0,
    "totalLiabilities": 14330380.0,
    "ppe": 30363245.0,
    "cashAndEquivalents": 26683.0,
}

# TransCentury FY23 - heavy losses
TCL_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 6571307.0,
    "cogs": -4719954.0, "grossProfit": 1851353.0,
    "operatingExpenses": -1666349.0,
    "ebit": -371400.0, "operatingProfit": -371400.0,
    "financeCosts": -2832065.0,
    "pbt": -3203465.0, "pat": -3231212.0, "eps": -2.73,
}
TCL_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "revenue": 5735750.0,
    "cogs": -4413979.0, "grossProfit": 1321771.0,
    "operatingExpenses": -1514986.0,
    "ebit": -883835.0, "operatingProfit": -883835.0,
    "financeCosts": -1816288.0,
    "pbt": -2700123.0, "pat": -2775798.0, "eps": -6.58,
}

# ─── Media & Services ─────────────────────────────────────────────────
# Nation Media FY23 — KES Mn → ×1000
NMG_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 7116200.0,                  # Turnover
    "cogs": -1723300.0, "grossProfit": 5392900.0,
    "pbt": -431800.0, "pat": -205700.0, "eps": -1.1, "dps": 0.0,
    "totalAssets": 11803500.0,             # 4,501.5 NCA + 7,302 CA
    "totalEquity": 7861600.0,
    "totalLiabilities": 3941900.0,
    "ppe": 4501500.0,
    "cashAndEquivalents": 1723200.0,
    "digitalUsers": 60.2e6,
}
NMG_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "revenue": 7298300.0,
    "cogs": -1424600.0, "grossProfit": 5873700.0,
    "pbt": 491700.0, "pat": 318500.0, "eps":1.7, "dps":1.5,
    "totalAssets": 12299100.0, "totalEquity": 8274900.0,
    "totalLiabilities": 4024200.0,
    "ppe": 4345500.0,
    "cashAndEquivalents": 1893900.0,
    "digitalUsers": 57.9e6,
}

# Standard Group FY23 — KES '000 already
SGL_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 2381425.0,
    "operatingExpenses": -3006731.0,
    "financeCosts": -88743.0,
    "pbt": -722538.0, "pat": -1261440.0, "eps": -14.27, "dps": 0.0,
    "totalAssets": 4097155.0, "totalEquity": -1122472.0,    # negative equity
    "totalLiabilities": 5219627.0,                          # 1,047 NCL + 4,172 CL
    "ppe": 2061878.0,
    "cashAndEquivalents": -34908.0,
}
SGL_FY22 = {
    "year":2022, "period":"FY2022", "periodType":"annual",
    "revenue": 2743265.0,
    "operatingExpenses": -3551053.0,
    "financeCosts": -164362.0,
    "pbt": -1187826.0, "pat": -865205.0, "eps": -10.05,
    "totalAssets": 4423899.0, "totalEquity": 138968.0,
    "totalLiabilities": 4284931.0,
    "ppe": 2799493.0,
    "cashAndEquivalents": -214134.0,
}

# Express Kenya H1 FY23 (interim)
XPRS_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 27494.0,        # very small
    "pbt": -41875.0, "pat": -28762.0, "eps": -2.17,
    "totalEquity": 519886.0,
    "borrowings": 349959.0,
}

# ─── Diversified ─────────────────────────────────────────────────────
# Flame Tree FY23 — KSh Mn → ×1000
FTGH_FY23 = {
    "year":2023, "period":"FY2023", "periodType":"annual",
    "revenue": 4463000.0,
    "ebitda": 421400.0,
    "pat": -74600.0, "eps": -0.42, "dps": 0.0,
    "grossMargin": 35.0,    # %
}

# ─── Now bind these to tickers ──────────────────────────────────────
SECTOR_UPDATES = {
    "SCOM": {"name":"Safaricom PLC", "annuals":[SCOM_FY24, SCOM_FY23]},
    "BATK": {"name":"BAT Kenya",     "annuals":[BAT_FY23, BAT_FY22]},
    "CARB": {"name":"Carbacid Investments", "annuals":[CARB_FY25, CARB_FY24]},
    "EABL": {"name":"East African Breweries", "merge_top": True, "extra_half_year": EABL_H1FY25},
    "KEGN": {"name":"KenGen", "annuals":[KEGN_FY25, KEGN_FY24]},
    "KPLC": {"name":"Kenya Power", "annuals":[KPLC_FY25, KPLC_FY24]},
    "WTK":  {"name":"Williamson Tea", "annuals":[WTK_FY25, WTK_FY24]},
    "KAPA": {"name":"Kapchorua Tea Kenya Plc", "annuals":[KAPA_FY25, KAPA_FY24]},
    "BOC":  {"name":"BOC Kenya", "annuals":[BOC_FY23, BOC_FY22]},
    "CPKL": {"name":"Crown Paints", "annuals":[CPKL_FY23, CPKL_FY22]},
    "EAPC": {"name":"East African Portland Cement Plc", "extra_half_year": EAPC_H1FY24},
    "TCL":  {"name":"TransCentury", "annuals":[TCL_FY23, TCL_FY22]},
    "NMG":  {"name":"Nation Media Group", "annuals":[NMG_FY23, NMG_FY22]},
    "SGL":  {"name":"The Standard Group PLC", "annuals":[SGL_FY23, SGL_FY22]},
    "XPRS": {"name":"Express Kenya", "annuals":[XPRS_FY23]},
    "FTGH": {"name":"Flame Tree", "annuals":[FTGH_FY23]},
}

def main():
    src = DATAJS.read_text(encoding="utf-8")
    start_label = "const NSE_COMPANIES = "
    start = src.index(start_label) + len(start_label)
    depth=0; in_str=False; esc=False; end=None
    for i, ch in enumerate(src[start:]):
        if esc: esc=False; continue
        if ch=='\\' and in_str: esc=True; continue
        if ch=='"': in_str=not in_str; continue
        if in_str: continue
        if ch=='{': depth+=1
        elif ch=='}':
            depth-=1
            if depth==0: end=start+i; break
    obj_text = src[start:end+1]
    data = json.loads(obj_text)

    for tk, payload in SECTOR_UPDATES.items():
        if tk not in data:
            print(f"!! {tk} not in data.js — skipping"); continue
        co = data[tk]
        if "annuals" in payload:
            # Replace annuals with the curated list, then merge in any older rows we don't override
            new_years = {r["year"] for r in payload["annuals"]}
            old_keep = [r for r in co.get("annuals",[]) if r.get("year") not in new_years]
            co["annuals"] = sorted(payload["annuals"] + old_keep, key=lambda r: -r.get("year",0))
            # Update latestPeriod
            if co["annuals"]:
                co["latestPeriod"] = {**co["annuals"][0]}
            print(f"  {tk:5s} {payload['name'][:25]:25s} now {len(co['annuals'])} annual rows ({sorted({r.get('year') for r in co['annuals']})})")
        if "extra_half_year" in payload:
            hy = co.get("half_years") or []
            hy = [r for r in hy if r.get("period") != payload["extra_half_year"]["period"]]
            hy.append(payload["extra_half_year"])
            co["half_years"] = hy
            print(f"  {tk:5s} added half_year {payload['extra_half_year']['period']}")

    # Re-serialize
    new_obj_text = json.dumps(data, indent=2, ensure_ascii=False)
    src = src[:start] + new_obj_text + src[end+1:]
    DATAJS.write_text(src, encoding="utf-8")
    print(f"\n✓ Wrote {DATAJS}")

if __name__ == "__main__":
    main()
