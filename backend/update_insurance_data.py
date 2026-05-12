"""
Hand-curated insurance sector data, sourced directly from the audited
results press releases under data/nse/. Numbers are in KES '000 (matching
the existing data.js convention `units: "thousands"`).

Run this script to merge the curated data into frontend/data.js.
"""
from __future__ import annotations
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATAJS = ROOT / "frontend" / "data.js"

# ─── Curated insurance financials (KES '000) ──────────────
# Field map (consistent across companies):
#   year, period, periodType, revenue, pat, pbt, eps, dps,
#   totalAssets, totalEquity, totalLiabilities,
#   serviceResult              — insurance service result (IFRS 17 underwriting)
#   insuranceServiceExpense    — claims & LAE (negative)
#   netReinsExpense            — cession cost (negative)
#   netInvestmentIncome        — total investment income net of finance exp
#   interestIncome             — interest + dividend income (gross, where reported)
#   insuranceContractLiab      — technical reserves (loss & LAE reserves)
#   reinsuranceContractLiab    — reinsurance liabilities
#   reinsuranceContractAssets  — reinsurance assets (recoveries due)
#   investmentAssets           — investment assets composite
#   cashAndEquivalents
#   gwp                        — gross written premium
INSURANCE = {
    "BRIT": {
        "name": "Britam Holdings",
        "annuals": [
            {"year":2024,"period":"FY2024","periodType":"annual",
             "revenue":37600000.0, "pat":5030000.0, "pbt":7330000.0,
             "eps":1.98, "dps":0.0,
             "totalAssets":208500000.0, "totalEquity":29460000.0},
            {"year":2023,"period":"FY2023","periodType":"annual",
             "revenue":36436197.0, "pat":3279119.0, "pbt":4819495.0,
             "eps":1.29, "dps":0.0,
             "serviceResult":3750224.0,
             "insuranceServiceExpense":-26854848.0,
             "netReinsExpense":-5831125.0,
             "netInvestmentIncome":11611541.0,
             "interestIncome":15615953.0,
             "totalAssets":174393970.0, "totalEquity":25688397.0,
             "totalLiabilities":148705573.0,
             "insuranceContractLiab":133702453.0,
             "reinsuranceContractLiab":561024.0,
             "reinsuranceContractAssets":7788246.0,
             "investmentAssets":144621601.0,  # invest props + FVTPL + amortised cost + mortgage
             "cashAndEquivalents":10640881.0},
            {"year":2022,"period":"FY2022","periodType":"annual",
             "revenue":25769463.0, "pat":1660647.0, "pbt":2921402.0,
             "eps":0.62, "dps":0.0,
             "serviceResult":2322689.0,
             "insuranceServiceExpense":-20555206.0,
             "netReinsExpense":-2891568.0,
             "netInvestmentIncome":11322331.0,
             "interestIncome":13007944.0,
             "totalAssets":152874202.0, "totalEquity":22163482.0,
             "totalLiabilities":130710720.0,
             "insuranceContractLiab":118190592.0,
             "reinsuranceContractLiab":131841.0,
             "reinsuranceContractAssets":7168691.0,
             "investmentAssets":126349536.0,
             "cashAndEquivalents":7991854.0},
        ],
    },

    "JUB": {
        "name": "Jubilee Holdings",
        "annuals": [
            {"year":2024,"period":"FY2024","periodType":"annual",
             "revenue":25676005.0, "pat":4721821.0, "pbt":6224690.0,
             "eps":65.0, "dps":13.5,
             "serviceResult":699863.0,
             "insuranceServiceExpense":-24223450.0,
             "netReinsExpense":-752692.0,
             "totalAssets":213577754.0, "totalEquity":51182318.0,
             "totalLiabilities":162395436.0,
             "netInvestmentIncome":4068145.0,
             "insuranceContractLiab":153035847.0,
             "reinsuranceContractAssets":3968017.0,
             "investmentAssets":188607940.0,
             "cashAndEquivalents":11242772.0,
             "gwp":53000000.0},
            {"year":2023,"period":"FY2023","periodType":"annual",
             "revenue":22612853.0, "pat":2587683.0, "pbt":2780809.0,
             "eps":36.0, "dps":12.0,
             "serviceResult":583240.0,
             "insuranceServiceExpense":-21754027.0,
             "netReinsExpense":-275586.0,
             "totalAssets":190517430.0, "totalEquity":50248549.0,
             "totalLiabilities":140268881.0,
             "netInvestmentIncome":-275864.0,
             "insuranceContractLiab":130082335.0,
             "reinsuranceContractAssets":4295447.0,
             "investmentAssets":167850420.0,
             "cashAndEquivalents":9254873.0,
             "gwp":39600000.0},
            {"year":2022,"period":"FY2022","periodType":"annual",
             "revenue":21090871.0, "pat":5508882.0, "pbt":4361556.0,
             "eps":75.0, "dps":12.0,
             "serviceResult":1415709.0,
             "insuranceServiceExpense":-21825894.0,
             "netReinsExpense":-275585.0,
             "totalAssets":167261721.0, "totalEquity":45804070.0,
             "totalLiabilities":121457651.0,
             "netInvestmentIncome":6361616.0,
             "insuranceContractLiab":114549551.0,
             "reinsuranceContractAssets":3357998.0,
             "investmentAssets":150128496.0,
             "cashAndEquivalents":6150521.0},
            {"year":2021,"period":"FY2021","periodType":"annual",
             "revenue":29536678.0, "pat":6828655.0, "pbt":8431880.0,
             "eps":89.88,
             "netInvestmentIncome":15928210.0,
             "netReinsExpense":-7583908.0,
             "totalEquity":42278525.0,
             "gwp":30629255.0},
            {"year":2020,"period":"FY2020","periodType":"annual",
             "revenue":29815118.0, "pat":4087586.0, "pbt":5076895.0,
             "eps":50.06,
             "netInvestmentIncome":11295345.0,
             "netReinsExpense":-9674721.0,
             "gwp":29971547.0},
        ],
    },

    "SLAM": {
        "name": "Sanlam Kenya",
        "annuals": [
            {"year":2024,"period":"FY2024","periodType":"annual",
             "revenue":7359029.0, "pat":1054887.0, "pbt":1661132.0,
             "eps":6.67, "dps":0.0,
             "serviceResult":643515.0,
             "insuranceServiceExpense":-5672959.0,
             "netReinsExpense":-1042555.0,
             "netInvestmentIncome":5272785.0,
             "interestIncome":2965308.0,    # 413,872 + 2,551,436
             "totalAssets":39165932.0, "totalEquity":1921137.0,
             "totalLiabilities":37244795.0,
             "insuranceContractLiab":27535254.0,
             "cashAndEquivalents":2007596.0},
            {"year":2023,"period":"FY2023","periodType":"annual",
             "revenue":6936282.0, "pat":-126568.0, "pbt":242787.0,
             "eps":-1.12, "dps":0.0,
             "serviceResult":686099.0,
             "insuranceServiceExpense":-5048193.0,
             "netReinsExpense":-1201990.0,
             "netInvestmentIncome":1061226.0,
             "interestIncome":3001910.0,    # 244,768 + 2,757,142
             "totalAssets":35375343.0, "totalEquity":866250.0,
             "totalLiabilities":34509093.0,
             "insuranceContractLiab":27770379.0,
             "reinsuranceContractLiab":53586.0,
             "cashAndEquivalents":2039290.0},
            {"year":2022,"period":"FY2022","periodType":"annual",
             "revenue":8302078.0, "pat":-82943.0, "pbt":285765.0,
             "eps":-0.50, "dps":0.0,
             "serviceResult":-97468.0,
             "insuranceServiceExpense":-8167325.0,
             "netReinsExpense":-232221.0,
             "netInvestmentIncome":2044673.0,
             "interestIncome":2997553.0,
             "totalAssets":36717339.0, "totalEquity":992818.0,
             "totalLiabilities":35724521.0,
             "insuranceContractLiab":25938951.0,
             "reinsuranceContractLiab":33639.0,
             "cashAndEquivalents":1648082.0},
        ],
    },

    "CIC": {
        "ticker": "CIC", "name": "CIC Insurance Group",
        "exchange":"NSE", "sector":"Insurance", "logo":"🛡️",
        "description":"CIC Insurance Group is a leading Kenyan composite insurer offering general, life, asset management and microinsurance across Kenya, South Sudan, Uganda and Malawi. It originated as the insurance arm of the Kenyan co-operative movement and remains majority-owned by SACCOs.",
        "staticNews":[
            {"title":"CIC Insurance posts sharp rise in profit on improved underwriting and investment income","url":"","source":"Business Daily","date":"2025-03-28"},
            {"title":"CIC Group plans bonus share issue after profit doubles in 2024","url":"","source":"The Standard","date":"2025-03-28"},
        ],
        "currency":"KES","units":"thousands","latestPrice":None,
        "annuals":[
            {"year":2024,"period":"FY2024","periodType":"annual",
             "revenue":26348750.0, "pat":2854633.0, "pbt":3993720.0,
             "eps":1.04, "dps":0.13,
             "serviceResult":343983.0,
             "insuranceServiceExpense":-24231278.0,
             "netReinsExpense":-1773489.0,
             "netInvestmentIncome":8835654.0,
             "totalAssets":61937727.0, "totalEquity":11013835.0,
             "totalLiabilities":50923892.0,
             "insuranceContractLiab":41842105.0,
             "reinsuranceContractAssets":5058722.0,
             "investmentAssets":47008824.0,   # invest props 3,726,499 + financial 43,282,325
             "cashAndEquivalents":823330.0},
            {"year":2023,"period":"FY2023","periodType":"annual",
             "revenue":25400902.0, "pat":1441815.0, "pbt":2543993.0,
             "eps":0.57, "dps":0.13,
             "serviceResult":788227.0,
             "insuranceServiceExpense":-22549800.0,
             "netReinsExpense":-2062875.0,
             "netInvestmentIncome":2930838.0,
             "totalAssets":50299041.0, "totalEquity":7612178.0,
             "totalLiabilities":42686863.0,
             "insuranceContractLiab":34227277.0,
             "reinsuranceContractAssets":3733993.0,
             "investmentAssets":41987921.0,   # invest props 7,834,198 + financial 34,153,723
             "cashAndEquivalents":281765.0},
            {"year":2021,"period":"FY2021","periodType":"annual",
             "revenue":19535577.0, "pat":668437.0, "pbt":959712.0,
             "eps":0.23,
             "netInvestmentIncome":1666407.0,
             "netReinsExpense":-4832849.0,
             "totalAssets":41540836.0, "totalEquity":7984131.0,
             "totalLiabilities":33556705.0,
             "insuranceContractLiab":26890377.0,
             "investmentAssets":31249097.0,  # invest props 7,477,939 + other 23,771,158
             "cashAndEquivalents":221989.0,
             "gwp":19689202.0},
            {"year":2020,"period":"FY2020","periodType":"annual",
             "revenue":17244119.0, "pat":-296832.0, "pbt":-79544.0,
             "eps":-0.09,
             "netInvestmentIncome":1426444.0,
             "netReinsExpense":-3305141.0,
             "totalAssets":38786172.0, "totalEquity":7628469.0,
             "totalLiabilities":31157703.0,
             "insuranceContractLiab":25081487.0,
             "investmentAssets":28311330.0,  # invest props 7,465,411 + other 20,845,919
             "cashAndEquivalents":357403.0,
             "gwp":16988281.0},
        ],
        "quarters":[],
    },

    "LBTY": {
        "ticker":"LBTY", "name":"Liberty Kenya Holdings",
        "exchange":"NSE", "sector":"Insurance", "logo":"🛡️",
        "description":"Liberty Kenya Holdings is the holding company for Heritage Insurance and Liberty Life Assurance Kenya, offering general and life insurance products primarily in Kenya. It is part of the Liberty Holdings group of South Africa, ultimately owned by Standard Bank.",
        "staticNews":[
            {"title":"Liberty Kenya posts strong premium growth in life and general lines","url":"","source":"Business Daily","date":"2025-04-10"},
        ],
        "currency":"KES","units":"thousands","latestPrice":None,
        "annuals":[
            {"year":2020,"period":"FY2020","periodType":"annual",
             "revenue":11176458.0, "pat":675946.0, "pbt":1043897.0,
             "eps":1.23, "dps":0.0,
             "insuranceServiceExpense":-6792094.0,    # claims & policyholder benefits
             "netReinsExpense":-4490596.0,
             "interestIncome":506922.0,
             "netInvestmentIncome":131203.0,
             "totalAssets":39301229.0, "totalEquity":8705185.0,
             "totalLiabilities":30596044.0,
             "insuranceContractLiab":33597946.0,    # long-term + short-term + invest contracts
             "reinsuranceContractAssets":3165004.0,
             "investmentAssets":23357471.0,
             "cashAndEquivalents":5735467.0},
            {"year":2019,"period":"FY2019","periodType":"annual",
             "revenue":10957417.0, "pat":689615.0, "pbt":1126832.0,
             "eps":1.21,
             "insuranceServiceExpense":-6820897.0,
             "netReinsExpense":-4048265.0,
             "interestIncome":350840.0,
             "netInvestmentIncome":75102.0,
             "totalAssets":38221854.0, "totalEquity":7982114.0,
             "totalLiabilities":30239740.0,
             "insuranceContractLiab":34398450.0,
             "reinsuranceContractAssets":2739403.0,
             "investmentAssets":23843193.0,
             "cashAndEquivalents":4419078.0},
        ],
        "quarters":[],
    },

    "KNRE": {
        "ticker":"KNRE", "name":"Kenya Re",
        "exchange":"NSE", "sector":"Insurance", "logo":"🛡️",
        "description":"Kenya Reinsurance Corporation (Kenya Re) is the longest-established reinsurer in eastern and central Africa. It accepts mandatory and voluntary cessions from primary insurers across Kenya, Uganda, Tanzania, Sudan, Zambia, Côte d'Ivoire and other African markets, and the Middle East.",
        "staticNews":[
            {"title":"Kenya Re profit dips slightly on softer investment income but underwriting strengthens","url":"","source":"Business Daily","date":"2025-04-02"},
        ],
        "currency":"KES","units":"thousands","latestPrice":None,
        "annuals":[
            {"year":2024,"period":"FY2024","periodType":"annual",
             "revenue":18849176.0, "pat":4437152.0, "pbt":5648173.0,
             "eps":0.79, "dps":0.40,
             "serviceResult":2949090.0,
             "insuranceServiceExpense":-10493951.0,
             "netReinsExpense":-708418.0,
             "netInvestmentIncome":4666426.0,
             "interestIncome":4501757.0,
             "totalAssets":66813069.0, "totalEquity":49672460.0,
             "totalLiabilities":17140609.0,
             "insuranceContractLiab":13776637.0,
             "reinsuranceContractLiab":1022804.0,
             "reinsuranceContractAssets":606158.0,
             "investmentAssets":40559139.0,    # invest props + assoc + gov sec + quoted equity
             "cashAndEquivalents":7450706.0},
            {"year":2023,"period":"FY2023","periodType":"annual",
             "revenue":19568740.0, "pat":4973127.0, "pbt":7034987.0,
             "eps":0.89, "dps":0.20,
             "serviceResult":676956.0,
             "insuranceServiceExpense":-13101772.0,
             "netReinsExpense":-679538.0,
             "netInvestmentIncome":6583475.0,
             "interestIncome":3654035.0,
             "totalAssets":65978015.0, "totalEquity":48174785.0,
             "totalLiabilities":17803230.0,
             "insuranceContractLiab":14024143.0,
             "reinsuranceContractLiab":2484.0,
             "reinsuranceContractAssets":731500.0,
             "investmentAssets":35200449.0,
             "cashAndEquivalents":5144032.0},
        ],
        "quarters":[],
    },
}

def main():
    src = DATAJS.read_text(encoding="utf-8")
    start_label = "const NSE_COMPANIES = "
    start = src.index(start_label) + len(start_label)
    depth = 0; in_str = False; esc = False; end = None
    for i, ch in enumerate(src[start:]):
        if esc: esc = False; continue
        if ch == '\\' and in_str: esc = True; continue
        if ch == '"': in_str = not in_str; continue
        if in_str: continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = start + i; break
    obj_text = src[start:end+1]
    data = json.loads(obj_text)

    if data["NSE"].get("sector") == "Insurance":
        data["NSE"]["sector"] = "Diversified"

    for tk, payload in INSURANCE.items():
        if tk in data:
            for k, v in payload.items():
                if k == "annuals":
                    data[tk]["annuals"] = v
                else:
                    data[tk][k] = v
            if payload.get("annuals"):
                data[tk]["latestPeriod"] = {**payload["annuals"][0]}
            print(f"• Updated {tk}: {len(payload.get('annuals',[]))} annual rows")
        else:
            entry = dict(payload)
            if entry.get("annuals"):
                entry["latestPeriod"] = {**entry["annuals"][0]}
            data[tk] = entry
            print(f"• Added new ticker {tk}")

    idx_match = re.search(r'const NSE_INDEX\s*=\s*\[([^\]]*)\];', src)
    if idx_match:
        existing_idx = re.findall(r'"([^"]+)"', idx_match.group(1))
        new_tickers = [tk for tk in INSURANCE if tk not in existing_idx]
        if new_tickers:
            updated_idx = sorted(existing_idx + new_tickers)
            src = src.replace(idx_match.group(0),
                f'const NSE_INDEX = {json.dumps(updated_idx)};')
            src = re.sub(r'const NSE_COMPANY_COUNT\s*=\s*\d+;',
                         f'const NSE_COMPANY_COUNT = {len(updated_idx)};', src)

    new_obj_text = json.dumps(data, indent=2, ensure_ascii=False)
    src = src[:start] + new_obj_text + src[end+1:]
    DATAJS.write_text(src, encoding="utf-8")
    print(f"\n✓ Wrote {DATAJS}")

if __name__ == "__main__":
    main()
