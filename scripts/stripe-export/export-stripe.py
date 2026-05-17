"""
export-stripe.py — Extrait tout Stripe MyeFarm en local et imprime un résumé
                   compact pour analyse.

Usage :
    cp .env.example .env
    nano .env          # mets STRIPE_KEY=rk_live_…
    python3 export-stripe.py

Sortie :
    - ./data/charges.json
    - ./data/customers.json
    - ./data/payouts.json
    - ./data/balance_transactions.json
    - ./data/refunds.json
    - ./data/subscriptions.json
    - résumé compact sur stdout (à coller dans le chat pour analyse)

Dépendances : `requests` uniquement (pas le SDK Stripe, pour rester léger).
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

import requests

STRIPE_BASE = "https://api.stripe.com/v1"
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_env() -> dict:
    env = {}
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith("STRIPE_")})
    return env


def paginate(path: str, key: str, params: dict | None = None, max_pages: int = 500):
    """Paginate Stripe with starting_after cursor. Returns flat list."""
    out = []
    params = dict(params or {})
    params.setdefault("limit", 100)
    last_id = None
    page = 0
    while page < max_pages:
        page += 1
        if last_id:
            params["starting_after"] = last_id
        url = f"{STRIPE_BASE}{path}"
        r = requests.get(url, params=params, auth=(key, ""), timeout=30)
        if r.status_code == 429:
            # Stripe rate limit — backoff and retry
            wait = int(r.headers.get("Retry-After", "2"))
            print(f"  [rate-limited, sleeping {wait}s]", file=sys.stderr)
            time.sleep(wait)
            continue
        if not r.ok:
            raise RuntimeError(f"Stripe {r.status_code} on {path}: {r.text}")
        body = r.json()
        data = body.get("data", [])
        out.extend(data)
        print(f"  page {page}: +{len(data)} (total {len(out)})", file=sys.stderr)
        if not body.get("has_more"):
            break
        if not data:
            break
        last_id = data[-1]["id"]
        # micro-pause pour ne pas tartiner l'API
        time.sleep(0.05)
    return out


def save_json(name: str, data: list):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"  saved → {path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path} ({len(data)} items)", file=sys.stderr)


def fmt_money(cents: int, currency: str = "EUR") -> str:
    return f"{cents / 100:,.2f} {currency}".replace(",", " ").replace(".", ",")


def to_dt(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def summarize(charges, customers, payouts, balance_txs, refunds, subscriptions):
    print("\n" + "=" * 60)
    print("STRIPE MYEFARM — FULL EXPORT SUMMARY")
    print("=" * 60)
    print(f"Generated: {datetime.now(timezone.utc).isoformat()}")
    print()

    # Detect live vs test mode from first item
    sample = charges or customers or payouts
    mode = "live" if (sample and not (sample[0].get("id") or "").startswith(("ch_test", "cus_test", "po_test"))) else "?"
    print(f"Mode: {mode}")
    print(f"Resources extracted:")
    print(f"  Charges            : {len(charges):>6}")
    print(f"  Customers          : {len(customers):>6}")
    print(f"  Payouts            : {len(payouts):>6}")
    print(f"  Balance txs        : {len(balance_txs):>6}")
    print(f"  Refunds            : {len(refunds):>6}")
    print(f"  Subscriptions      : {len(subscriptions):>6}")

    # === REVENUE ===
    paid = [c for c in charges if c.get("paid") and not c.get("refunded")]
    refunded_charges = [c for c in charges if c.get("refunded") or (c.get("amount_refunded") or 0) > 0]
    currency = (paid[0].get("currency") or "eur").upper() if paid else "EUR"

    gross_cents = sum((c.get("amount_captured") or c.get("amount") or 0) for c in paid)
    refunded_cents = sum((c.get("amount_refunded") or 0) for c in charges)
    net_cents = gross_cents - refunded_cents

    fees_cents = sum(
        (bt.get("fee") or 0)
        for bt in balance_txs
        if bt.get("type") in ("charge", "payment")
    )

    print()
    print("== REVENUE ==")
    print(f"Gross (paid)             : {fmt_money(gross_cents, currency)}")
    print(f"Refunded                 : -{fmt_money(refunded_cents, currency)}")
    print(f"Net                      : {fmt_money(net_cents, currency)}")
    print(f"Stripe fees              : -{fmt_money(fees_cents, currency)}")
    print(f"Net after fees           : {fmt_money(net_cents - fees_cents, currency)}")

    if paid:
        dates = [c.get("created") for c in paid if c.get("created")]
        print(f"Date range               : {to_dt(min(dates)).date()} → {to_dt(max(dates)).date()}")

    # === MONTHLY REVENUE ===
    monthly = defaultdict(int)
    monthly_count = defaultdict(int)
    for c in paid:
        if not c.get("created"):
            continue
        month = to_dt(c["created"]).strftime("%Y-%m")
        monthly[month] += (c.get("amount_captured") or c.get("amount") or 0)
        monthly_count[month] += 1

    print()
    print("== MONTHLY REVENUE ==")
    for m in sorted(monthly.keys()):
        print(f"  {m}: {fmt_money(monthly[m], currency):>16}  ({monthly_count[m]:>4} charges)")

    # === CUSTOMER METRICS ===
    customer_revenue = defaultdict(int)
    customer_charges = defaultdict(int)
    for c in paid:
        cid = c.get("customer")
        if cid:
            customer_revenue[cid] += (c.get("amount_captured") or c.get("amount") or 0)
            customer_charges[cid] += 1

    cust_by_email = {cu["id"]: (cu.get("email") or cu.get("name") or cu.get("id"))[:50] for cu in customers}
    multi = sum(1 for n in customer_charges.values() if n > 1)
    total_customers = len(customers)
    paying_customers = len(customer_revenue)
    repeat_rate = (multi / paying_customers * 100) if paying_customers else 0

    print()
    print("== CUSTOMER METRICS ==")
    print(f"Total customers          : {total_customers}")
    print(f"Paying customers         : {paying_customers}")
    print(f"With >1 charge           : {multi} ({repeat_rate:.1f} %)")
    if paying_customers:
        ltvs = sorted(customer_revenue.values())
        avg_ltv = sum(ltvs) / len(ltvs)
        print(f"Avg LTV                  : {fmt_money(int(avg_ltv), currency)}")
        print(f"Median LTV               : {fmt_money(int(median(ltvs)), currency)}")
        print(f"Max LTV                  : {fmt_money(ltvs[-1], currency)}")

    print()
    print("== TOP 10 CUSTOMERS BY REVENUE ==")
    top10 = sorted(customer_revenue.items(), key=lambda x: x[1], reverse=True)[:10]
    for i, (cid, rev) in enumerate(top10, 1):
        label = cust_by_email.get(cid, cid)[:40]
        pct = (rev / gross_cents * 100) if gross_cents else 0
        n_charges = customer_charges[cid]
        print(f"  {i:>2}. {label:<40} {fmt_money(rev, currency):>15} ({pct:>4.1f}%, {n_charges} charges)")

    top10_total = sum(r for _, r in top10)
    top10_pct = (top10_total / gross_cents * 100) if gross_cents else 0
    print(f"  ─ Top 10 = {top10_pct:.1f}% du CA")

    # === TRANSACTION METRICS ===
    print()
    print("== TRANSACTION METRICS ==")
    failed = [c for c in charges if not c.get("paid") and c.get("status") in ("failed", "canceled")]
    refund_count = len(refunded_charges)
    refund_rate = (refund_count / len(charges) * 100) if charges else 0
    fail_rate = (len(failed) / len(charges) * 100) if charges else 0
    print(f"Total charges            : {len(charges)}")
    print(f"  Paid (net of refunds)  : {len(paid)}")
    print(f"  Refunded               : {refund_count} ({refund_rate:.2f}%)")
    print(f"  Failed                 : {len(failed)} ({fail_rate:.2f}%)")
    if paid:
        amounts = sorted((c.get("amount_captured") or c.get("amount") or 0) for c in paid)
        avg = sum(amounts) / len(amounts)
        print(f"Avg charge               : {fmt_money(int(avg), currency)}")
        print(f"Median charge            : {fmt_money(int(median(amounts)), currency)}")
        print(f"Min / Max                : {fmt_money(amounts[0], currency)} / {fmt_money(amounts[-1], currency)}")

    # === PAYMENT METHODS ===
    pm_counter = Counter()
    for c in charges:
        pmd = (c.get("payment_method_details") or {})
        ptype = pmd.get("type") or "?"
        pm_counter[ptype] += 1
    print()
    print("== PAYMENT METHODS ==")
    for pm, n in pm_counter.most_common():
        pct = (n / len(charges) * 100) if charges else 0
        print(f"  {pm:<20} {n:>5} ({pct:.1f}%)")

    # === TEMPORAL ===
    print()
    print("== TEMPORAL PATTERNS ==")
    dow = Counter()
    hour = Counter()
    for c in paid:
        if not c.get("created"):
            continue
        d = to_dt(c["created"])
        dow[d.strftime("%A")] += 1
        hour[d.hour] += 1
    days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    fr_days = {"Monday": "lundi", "Tuesday": "mardi", "Wednesday": "mercredi", "Thursday": "jeudi",
               "Friday": "vendredi", "Saturday": "samedi", "Sunday": "dimanche"}
    print("Par jour de semaine :")
    for d in days_order:
        n = dow.get(d, 0)
        bar = "█" * (n * 30 // max(dow.values())) if dow.values() else ""
        print(f"  {fr_days[d]:<10} {n:>5} {bar}")
    if hour:
        best_h = hour.most_common(1)[0]
        print(f"Heure de pic             : {best_h[0]:02d}h ({best_h[1]} charges)")

    # === PAYOUTS ===
    print()
    print("== PAYOUTS (versements vers ta banque) ==")
    if payouts:
        paid_out = [p for p in payouts if p.get("status") == "paid"]
        total_payout = sum(p.get("amount", 0) for p in paid_out)
        print(f"Total versé              : {fmt_money(total_payout, currency)} ({len(paid_out)} payouts)")
        if paid_out:
            avg_p = total_payout / len(paid_out)
            print(f"Moyenne                  : {fmt_money(int(avg_p), currency)}")
        last = sorted(payouts, key=lambda p: p.get("arrival_date") or 0, reverse=True)[:5]
        print("5 derniers payouts :")
        for p in last:
            arr = datetime.fromtimestamp(p.get("arrival_date", 0), tz=timezone.utc).date() if p.get("arrival_date") else "?"
            print(f"  {arr}  {fmt_money(p.get('amount', 0), currency):>12}  status={p.get('status')}")
    else:
        print("Aucun payout.")

    # === SUBSCRIPTIONS ===
    if subscriptions:
        print()
        print("== SUBSCRIPTIONS ==")
        active = [s for s in subscriptions if s.get("status") == "active"]
        canceled = [s for s in subscriptions if s.get("status") == "canceled"]
        print(f"Actives                  : {len(active)}")
        print(f"Annulées                 : {len(canceled)}")
        if active:
            mrr_cents = 0
            for s in active:
                for item in (s.get("items") or {}).get("data", []):
                    price = item.get("price", {})
                    amt = price.get("unit_amount", 0) or 0
                    qty = item.get("quantity", 1)
                    interval = (price.get("recurring") or {}).get("interval", "month")
                    if interval == "year":
                        mrr_cents += (amt * qty) // 12
                    elif interval == "week":
                        mrr_cents += (amt * qty * 52) // 12
                    else:  # month default
                        mrr_cents += amt * qty
            print(f"MRR estimé               : {fmt_money(mrr_cents, currency)}")

    print()
    print("=" * 60)
    print("Données brutes sauvegardées dans ./data/*.json")
    print("Colle TOUT ce résumé dans le chat → analyse en profondeur derrière.")
    print("=" * 60)


def main():
    env = load_env()
    key = env.get("STRIPE_KEY")
    if not key:
        print("❌ STRIPE_KEY manquant dans .env ou environnement.", file=sys.stderr)
        return 2

    print("Fetching Stripe data (peut prendre 1-2 min selon volume)…", file=sys.stderr)

    print("\n• Charges…", file=sys.stderr)
    charges = paginate("/charges", key)
    save_json("charges", charges)

    print("\n• Customers…", file=sys.stderr)
    customers = paginate("/customers", key)
    save_json("customers", customers)

    print("\n• Payouts…", file=sys.stderr)
    payouts = paginate("/payouts", key)
    save_json("payouts", payouts)

    print("\n• Balance transactions…", file=sys.stderr)
    balance_txs = paginate("/balance_transactions", key)
    save_json("balance_transactions", balance_txs)

    print("\n• Refunds…", file=sys.stderr)
    refunds = paginate("/refunds", key)
    save_json("refunds", refunds)

    print("\n• Subscriptions…", file=sys.stderr)
    subscriptions = paginate("/subscriptions", key, params={"status": "all"})
    save_json("subscriptions", subscriptions)

    summarize(charges, customers, payouts, balance_txs, refunds, subscriptions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
