"""
NSE Insights — insurance sector extractor (v2, robust).

For each known audited PDF, we read full text, then for each financial-line
label we look for the row where the line BEGINS with that label, take only
the numeric tokens IMMEDIATELY after the label (stopping when a
non-numeric word appears — i.e. the next column's label in two-column
layouts), and accept just the first two as (current, prior).

Year-column order is detected from the date header e.g. "31 Dec 2024 31 Dec 2023"
or "2023 2022 Restated" near the top of the income-statement section.

Output: backend/insurance_extracted.json
"""
from __future__ import annotations
import json, os, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "nse"
OUT  = ROOT / "backend" / "insurance_extracted.json"

SOURCES = [
    ("BRIT", "Britam Holdings",          "2024/Britam_Holdings_Plc_31_Dec_2023_audited.pdf",                 2023, 2022),
    ("JUB",  "Jubilee Holdings",         "2022/Jubilee_Holdings_Limited_31_Dec_2021_audited.pdf",            2021, 2020),
    ("JUB",  "Jubilee Holdings",         "2024/Jubilee_Holdings_Limited_31_DECEMBER_2023_audited.pdf",       2023, 2022),
    ("JUB",  "Jubilee Holdings",         "2025/Jubilee_Holdings_Limited_31_Dec_2024_audited.pdf",            2024, 2023),
    ("SLAM", "Sanlam Kenya",             "2024/Sanlam_Kenya_Plc_31_Dec_2023_audited.pdf",                    2023, 2022),
    ("SLAM", "Sanlam Kenya",             "2025/Sanlam_Kenya_Plc_31_Dec_2024_audited.pdf",                    2024, 2023),
    ("CIC",  "CIC Insurance Group",      "2022/THE_DIRECTORS_OF_CIC_INSURANCE_GROUP_PLC_ARE_PLEAS_31_Dec_2021_audited.pdf", 2021, 2020),
    ("CIC",  "CIC Insurance Group",      "2025/CIC_INSURANCE_GROUP_PLC_31_Dec_2024_audited.pdf",             2024, 2023),
    ("LBTY", "Liberty Kenya Holdings",   "2020/Liberty_Kenya_Holdings_Plc_31_Dec_2020_audited.pdf",          2020, 2019),
    ("KNRE", "Kenya Re",                 "2025/Kenya_Re_Insurance_Corporation_Ltd_31_Dec_2024_audited.pdf",  2024, 2023),
]

# Row labels we want. Pattern is anchored to beginning of line via re.match.
FIELDS = [
    ("insurance_revenue",            r"Total insurance revenue\b|Insurance revenue\b|Gross earned premiums?\b|Gross written premiums?\b|Net earned premiums?\b|Insurance premiums\b"),
    ("insurance_service_result",     r"Insurance service result\b|Insurance Services result\b|Underwriting profit\b|Underwriting result\b"),
    ("insurance_service_expenses",   r"Insurance service expenses?\b|Insurance Service expenses?\b"),
    ("net_investment_income",        r"Net investment income\b|Total investment income\b|Net investment and insurance result\b"),
    ("interest_dividend_income",     r"Interest and dividend income\b"),
    ("profit_before_tax",            r"Profit before (?:income )?taxation\b|Profit before (?:income )?tax\b|Group profit before tax\b|Profit/\(loss\) before taxation\b|Profit/\(loss\) before tax\b"),
    ("profit_after_tax",             r"Profit for the year after tax\b|Profit for the year\b|Profit/\(loss\) for the year\b|Profit after tax(?:ation)?\b|Net profit\b"),
    ("total_equity",                 r"Total equity\b|Total capital and reserves\b"),
    ("total_assets",                 r"Total assets\b"),
    ("total_liabilities",            r"Total liabilities\b"),
    ("insurance_contract_liabilities", r"Insurance contract liabilities\b|Insurance and investment contract liabilities\b|Insurance liabilities\b"),
    ("cash_and_equivalents",         r"Cash and bank balances\b|Cash and cash equivalents at 31 December\b|Cash and cash equivalent at 31 December\b|Cash and cash equivalents\b"),
    ("eps_basic",                    r"Basic and diluted \(Shs per share\)|Earnings per share \(Shs\)|Earnings per share \(Kes\)|Basic earnings per share"),
]

# Tokens that look numeric (incl. parentheses for negatives)
TOKEN_RE = re.compile(r"\(?-?[\d,]+\.?\d*\)?")

def parse_num(t: str):
    t = t.strip()
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()").replace(",", "")
    if not t or t in ("-",): return None
    try:
        v = float(t)
        return -v if neg else v
    except ValueError:
        return None

def numeric_only(tok: str) -> bool:
    return bool(re.fullmatch(r"\(?-?[\d,]+\.?\d*\)?", tok))

def take_two_after_match(line: str, label_match: re.Match):
    """Take numeric tokens immediately after the label, stop at the first non-numeric token.
    En-dashes and lone hyphens are treated as nulls (skip but don't stop)."""
    tail = line[label_match.end():].strip()
    parts = tail.split()
    nums = []
    for tok in parts:
        # Treat dashes as null placeholders (skip without stopping)
        if tok in ("\u2013", "-", "\u2014"):
            nums.append(None)
            continue
        if numeric_only(tok):
            v = parse_num(tok)
            if v is not None:
                nums.append(v)
                continue
        break  # stop at first non-numeric token (= next column label)
    # Drop trailing Nones, return as list (callers expect first two)
    return nums

YEARS_RE = re.compile(r"\b(20\d{2})\b")

def detect_column_order(text: str, current_year: int, prior_year: int) -> bool:
    """True if column 1 is current_year, False if column 1 is prior_year."""
    cur_s, prev_s = str(current_year), str(prior_year)
    # Look for any line that has BOTH years adjacent
    pat_cur_first = re.compile(rf"\b{cur_s}\b[^0-9]+\b{prev_s}\b")
    pat_prev_first = re.compile(rf"\b{prev_s}\b[^0-9]+\b{cur_s}\b")
    cur_first_count = len(pat_cur_first.findall(text))
    prev_first_count = len(pat_prev_first.findall(text))
    if cur_first_count > prev_first_count: return True
    if prev_first_count > cur_first_count: return False
    return True  # default: current first

def is_year_or_tiny(v: float) -> bool:
    if v is None: return True
    av = abs(v)
    if 1900 < av < 2100: return True   # likely a year
    return False

def parse_pdf(text: str, current_year: int, prior_year: int):
    out = {current_year: {}, prior_year: {}}
    cur_first = detect_column_order(text, current_year, prior_year)
    lines = text.splitlines()
    for canon, pat_str in FIELDS:
        # Match either at line start (after optional whitespace) OR after a
        # whitespace gap (handles two-column layouts where the label sits
        # in the right column).
        pat = re.compile(r"(?:^|\s{2,}|\s)(?:" + pat_str + r")")
        for ln in lines:
            m = pat.search(ln)
            if not m: continue
            nums = take_two_after_match(ln, m)
            if len(nums) < 2:
                continue
            cur_v, prev_v = (nums[0], nums[1]) if cur_first else (nums[1], nums[0])
            if cur_v is None and prev_v is None:
                continue
            # EPS is small, others should be reasonable thousands
            if canon != "eps_basic":
                if is_year_or_tiny(cur_v) or is_year_or_tiny(prev_v):
                    continue
                # Reject suspiciously small thousands values for whole-group totals
                if abs(cur_v) < 1000 and abs(prev_v) < 1000:
                    continue
            if canon not in out[current_year]:
                out[current_year][canon] = cur_v
            if canon not in out[prior_year]:
                out[prior_year][canon] = prev_v
            break  # done with this field
    return out, cur_first

def normalize_numbers(text: str) -> str:
    """Some PDFs (Liberty 2020) use spaces as thousands separators:
    `11 176 458` → `11,176,458`. Normalise so the regex catches them."""
    # Match a 1-3 digit lead followed by one or more groups of exactly 3 digits
    # separated by single spaces.
    pat = re.compile(r"(?<![0-9.,])([0-9]{1,3})((?:[ \u00a0][0-9]{3})+)(?![0-9])")
    def repl(m):
        return m.group(1) + m.group(2).replace(" ", ",").replace("\u00a0", ",")
    return pat.sub(repl, text)

def extract_pdf_text(path: str) -> str:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        raw = "\n".join((p.extract_text() or "") for p in pdf.pages)
    return normalize_numbers(raw)

def main():
    extracted = {}; names = {}
    for ticker, name, rel, cur, prev in SOURCES:
        path = DATA / rel
        if not path.exists():
            print(f"!! missing: {rel}"); continue
        try:
            text = extract_pdf_text(str(path))
        except Exception as e:
            print(f"!! {rel}: extract failed: {e}"); continue
        if not text.strip():
            print(f"!! {rel}: empty"); continue
        per_year, cur_first = parse_pdf(text, cur, prev)
        names[ticker] = name
        bucket = extracted.setdefault(ticker, {})
        for yr, vals in per_year.items():
            existing = bucket.setdefault(yr, {})
            for k, v in vals.items():
                if k not in existing or existing[k] in (None, 0):
                    existing[k] = v
        order = "cur-first" if cur_first else "prev-first"
        print(f"OK {ticker:5s} {os.path.basename(rel)[:60]:60s}"
              f"  {cur}={len(per_year[cur])}f, {prev}={len(per_year[prev])}f  ({order})")

    payload = {"companies": []}
    for tk, by_year in extracted.items():
        rows = []
        for yr in sorted(by_year):
            r = {"fiscal_year": yr, "periodType": "annual", "audited": True}
            r.update(by_year[yr])
            rows.append(r)
        payload["companies"].append({"ticker": tk, "name": names[tk], "financials": rows})
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {OUT}: {len(payload['companies'])} companies")

if __name__ == "__main__":
    main()
