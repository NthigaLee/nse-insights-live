#!/usr/bin/env python3
"""NSE Insights — price updater.

Modes:
  daily     (default)  Fetch https://afx.kwayisi.org/nse/ (1 request), update
                       frontend/prices.json (today's close per ticker) and
                       frontend/market.json (NASI, top gainer/loser, updated_at).
  backfill             Fetch https://afx.kwayisi.org/chart/nse/<ticker> per
                       company (~44 requests, 2s apart) and merge full daily
                       history into prices.json. Run once (or rarely).

Usage:
  python update_prices.py [--backfill] [--dry-run] [--since 2025-10-31]

Zero third-party dependencies (stdlib only) so CI needs no pip install.
Data source: afx.kwayisi.org (free site — keep request volume low; daily mode
is 1 request/run, <= ~10 runs/day).
"""

import argparse
import datetime
import gzip
import json
import re
import sys
import time
import urllib.request
import zlib
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
PRICES = ROOT / "frontend" / "prices.json"
MARKET = ROOT / "frontend" / "market.json"

BASE = "https://afx.kwayisi.org"
UA = "NSEInsightsBot/1.0 (+https://nseinsights.com; data refresh)"
NAIROBI = ZoneInfo("Africa/Nairobi")

# kwayisi ticker -> our ticker (everything else maps 1:1)
TICKER_MAP = {
    "BAT": "BATK",     # British American Tobacco Kenya
    "SBIC": "CFC",     # Stanbic Holdings
    "PORT": "EAPC",    # East African Portland Cement
    "HBE": "HBZE",     # Homeboyz Entertainment
    "KAPC": "KAPA",    # Kapchorua Tea
    "FMLY": "FANB",    # Family Bank (listed Jun 2026)
}
# Never write these (delisted / no live source): series stay frozen as-is.
FROZEN = {"NBK", "KENO", "FAHR"}

# Sanity limits
MIN_ROWS = 40          # abort if the table parse finds fewer tickers
MAX_DAY_MOVE = 0.50    # skip a ticker if price moved >50% vs last stored point


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        enc = (resp.headers.get("Content-Encoding") or "").lower()
    if enc == "gzip" or data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    elif enc == "deflate":
        data = zlib.decompress(data, -zlib.MAX_WBITS)
    return data.decode("utf-8", "replace")


class TableParser(HTMLParser):
    """Collects text of <td>/<th> cells per <tr> for every table on the page.

    Handles minified HTML5 with implied closing tags (kwayisi omits </td>,
    </tr> etc.), so cells/rows are flushed when the NEXT tag starts, not only
    on explicit end tags.
    """

    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell = [], None, None

    def _flush_cell(self):
        if self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip())
        self._cell = None

    def _flush_row(self):
        self._flush_cell()
        if self._row:
            self.rows.append(self._row)
        self._row = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._flush_row()
            self._row = []
        elif tag in ("td", "th"):
            self._flush_cell()
            if self._row is not None:
                self._cell = []
        elif tag in ("table", "thead", "tbody", "tfoot"):
            self._flush_row()

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._flush_cell()
        elif tag in ("tr", "table", "thead", "tbody", "tfoot"):
            self._flush_row()

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)

    def close(self):
        super().close()
        self._flush_row()


def num(s: str):
    s = s.replace(",", "").replace("−", "-").strip()
    if not s or s in {"-", "--"}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_listing(html: str):
    """Rows of the main table: [ticker, name, volume, price, change]."""
    p = TableParser()
    p.feed(html)
    p.close()
    out = {}
    for row in p.rows:
        if len(row) < 4:
            continue
        ticker = row[0].strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9-]{1,9}", ticker):
            continue
        # volume may be empty (no trade today); price is the first numeric > 0
        price = num(row[3]) if len(row) >= 4 else None
        volume = num(row[2])
        change = num(row[4]) if len(row) >= 5 else None
        if price and price > 0:
            out[ticker] = {"price": price, "volume": volume, "change": change}
    return out


def parse_nasi(html: str):
    """NASI header e.g. 'NASI ... 186.58 (+1.21)'. Returns (value, change)."""
    text = re.sub(r"<[^>]+>", " ", html)  # strip tags: markup sits between label and value
    m = re.search(r"NASI[^0-9]{0,120}([0-9][0-9,]*\.?[0-9]*)\s*\(([+\-][0-9.]+)\)", text)
    if not m:
        return None
    value, chg = num(m.group(1)), num(m.group(2))
    if value is None or chg is None:
        return None
    return value, chg


def trading_day_ms(now=None) -> int:
    """Midnight UTC of today's date in Nairobi, in epoch ms (matches the
    [epoch_ms, close] convention already used in prices.json)."""
    d = (now or datetime.datetime.now(NAIROBI)).date()
    return int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def date_ms(iso: str) -> int:
    d = datetime.date.fromisoformat(iso)
    return int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data, dry: bool):
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    json.loads(text)  # re-validate before touching disk
    if dry:
        print(f"[dry-run] would write {path} ({len(text):,} bytes)")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"wrote {path} ({len(text):,} bytes)")


def upsert_point(series: list, ts: int, close: float):
    if series and series[-1][0] == ts:
        series[-1][1] = close
    else:
        series.append([ts, close])


def run_daily(dry: bool) -> int:
    html = fetch(f"{BASE}/nse/")
    rows = parse_listing(html)
    if len(rows) < MIN_ROWS:
        print(f"ABORT: parsed only {len(rows)} tickers (< {MIN_ROWS}) — page layout changed?", file=sys.stderr)
        return 1

    prices = load_json(PRICES)
    ts = trading_day_ms()
    updated = skipped = 0
    for src, row in sorted(rows.items()):
        ours = TICKER_MAP.get(src, src)
        if ours in FROZEN:
            continue
        entry = prices.get(ours)
        if entry is None:
            # new listing: create a minimal entry (name/sector enriched later)
            entry = prices[ours] = {"name": ours, "sector": "", "prices": []}
        series = entry.setdefault("prices", [])
        # Sanity guard only against a RECENT point (<=7 days): a stale series
        # (e.g. pre-backfill) can legitimately be far from today's price.
        week_ms = 7 * 86400 * 1000
        if series and series[-1][1] > 0 and ts - series[-1][0] <= week_ms:
            move = abs(row["price"] - series[-1][1]) / series[-1][1]
            if move > MAX_DAY_MOVE:
                print(f"skip {ours}: {series[-1][1]} -> {row['price']} (+{move:.0%}) exceeds sanity limit")
                skipped += 1
                continue
        upsert_point(series, ts, row["price"])
        updated += 1
    save_json(PRICES, prices, dry)

    market = load_json(MARKET)
    nasi = parse_nasi(html)
    if nasi:
        value, chg = nasi
        prev = value - chg
        market["nseAllShare"] = {"value": round(value, 2),
                                 "change_pct": round(chg / prev * 100, 2) if prev else 0}
    movers = {t: r for t, r in rows.items()
              if r["change"] is not None and r["price"] and TICKER_MAP.get(t, t) not in FROZEN}
    if movers:
        def pct(r):
            prev = r["price"] - r["change"]
            return (r["change"] / prev * 100) if prev else 0
        g = max(movers, key=lambda t: pct(movers[t]))
        l = min(movers, key=lambda t: pct(movers[t]))
        market["topGainer"] = {"ticker": TICKER_MAP.get(g, g), "price": movers[g]["price"],
                               "change_pct": round(pct(movers[g]), 2)}
        market["topLoser"] = {"ticker": TICKER_MAP.get(l, l), "price": movers[l]["price"],
                              "change_pct": round(pct(movers[l]), 2)}
    market["stocksTracked"] = len(rows)
    market["updated_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_json(MARKET, market, dry)

    print(f"daily: {updated} tickers updated, {skipped} skipped, NASI={'ok' if nasi else 'NOT FOUND'}")
    return 0


CHART_POINT = re.compile(r'\[d\("(\d{4}-\d{2}-\d{2})"\),([0-9.]+)\]')


def run_backfill(since: str, dry: bool) -> int:
    prices = load_json(PRICES)
    cutoff = date_ms(since)
    # invert the map: for each of OUR tickers find the kwayisi code
    inv = {v: k for k, v in TICKER_MAP.items()}
    failures = []
    targets = [t for t in prices.keys() if t not in FROZEN]
    for i, ours in enumerate(sorted(targets)):
        src = inv.get(ours, ours).lower()
        try:
            js = fetch(f"{BASE}/chart/nse/{src}")
            pts = [(date_ms(d), float(v)) for d, v in CHART_POINT.findall(js)]
        except Exception as e:
            print(f"{ours}: FAILED ({e})")
            failures.append(ours)
            continue
        pts = [p for p in pts if p[0] > cutoff]
        if not pts:
            print(f"{ours}: no points after {since}")
            continue
        series = prices[ours].setdefault("prices", [])
        have = {p[0] for p in series}
        added = [list(p) for p in pts if p[0] not in have]
        series.extend(added)
        series.sort(key=lambda p: p[0])
        print(f"{ours}: +{len(added)} points "
              f"(now through {datetime.datetime.utcfromtimestamp(series[-1][0]/1000).date()})")
        if i < len(targets) - 1:
            time.sleep(2)  # politeness
    save_json(PRICES, prices, dry)
    if failures:
        print(f"failed tickers: {', '.join(failures)}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="merge full history from chart endpoint")
    ap.add_argument("--since", default="2025-10-31", help="backfill: only merge points after this date")
    ap.add_argument("--dry-run", action="store_true", help="parse + report, write nothing")
    args = ap.parse_args()
    return run_backfill(args.since, args.dry_run) if args.backfill else run_daily(args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
