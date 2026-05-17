"""
analyze-products.py — Analyse produits MyeFarm depuis les JSON exportés.

Lit ./data/*.json (charges, customers, subscriptions, refunds) et croise
les données pour répondre à :
  - Quels articles se vendent le plus (volume + CA) ?
  - Quels produits par top client ?
  - Quel produit a le plus de refunds / fails ?
  - Patterns horaires par produit ?
  - Corrélations cachées (cohort, fréquence, etc.)

Si STRIPE_KEY est dans l'env, fetch les noms produits pour lisibilité.

Usage :
  cd scripts/stripe-export
  python analyze-products.py
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

import requests

DATA_DIR = Path(__file__).resolve().parent / "data"


def load(name: str):
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        print(f"❌ Manque {path}. Run export-stripe.py d'abord.", file=sys.stderr)
        sys.exit(2)
    return json.loads(path.read_text(encoding="utf-8"))


def get_stripe_key() -> str | None:
    if os.environ.get("STRIPE_KEY"):
        return os.environ["STRIPE_KEY"]
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("STRIPE_KEY="):
                v = line.partition("=")[2].strip()
                # gérer le bug "STRIPE_KEY=STRIPE_KEY=..."
                if v.startswith("STRIPE_KEY="):
                    v = v.partition("=")[2]
                return v
    return None


def fetch_products(key: str, ids: set) -> dict:
    out = {}
    for pid in ids:
        if not pid or pid in out:
            continue
        try:
            r = requests.get(f"https://api.stripe.com/v1/products/{pid}", auth=(key, ""), timeout=10)
            if r.ok:
                out[pid] = r.json()
            else:
                out[pid] = {"name": f"(produit {pid[:14]}…)", "_error": r.status_code}
        except Exception as e:
            out[pid] = {"name": pid, "_error": str(e)}
    return out


def fmt_money_cents(c: int, cur: str = "EUR") -> str:
    return f"{c/100:,.2f} {cur}".replace(",", " ").replace(".", ",")


def main():
    print("Loading local data…", file=sys.stderr)
    charges = load("charges")
    customers = load("customers")
    subs = load("subscriptions")
    refunds = load("refunds")

    paid_charges = [c for c in charges if c.get("paid") and not c.get("refunded")]

    print("\n" + "=" * 60)
    print("MYEFARM — ANALYSE PRODUITS & CORRÉLATIONS")
    print("=" * 60)

    # ============================================================
    # 1. DÉCOUVERTE — qu'est-ce qu'on a dans les charges ?
    # ============================================================
    print("\n[1] CONTENU DES CHARGES — qu'est-ce qu'on peut analyser ?")
    desc_filled = sum(1 for c in charges if c.get("description"))
    statement_filled = sum(1 for c in charges if c.get("statement_descriptor") or c.get("calculated_statement_descriptor"))
    meta_filled = sum(1 for c in charges if c.get("metadata"))
    invoice_filled = sum(1 for c in charges if c.get("invoice"))
    print(f"  charges totales         : {len(charges)}")
    print(f"  avec description        : {desc_filled}")
    print(f"  avec statement_desc     : {statement_filled}")
    print(f"  avec metadata           : {meta_filled}")
    print(f"  avec invoice (= abo)    : {invoice_filled}")
    print(f"  → {len(charges) - invoice_filled} charges sont des paiements one-shot (hors abo)")

    # ============================================================
    # 2. PRODUITS via subscriptions
    # ============================================================
    print("\n[2] PRODUITS via subscriptions")
    sub_product_ids = set()
    sub_to_prods = {}
    price_to_prod = {}
    for s in subs:
        prods = set()
        for item in (s.get("items") or {}).get("data", []):
            price = item.get("price", {}) or {}
            pid = price.get("product")
            price_id = price.get("id")
            if pid:
                sub_product_ids.add(pid)
                prods.add(pid)
                if price_id:
                    price_to_prod[price_id] = pid
        sub_to_prods[s["id"]] = prods

    # Fetch product names
    key = get_stripe_key()
    product_meta = {}
    if key and sub_product_ids:
        print(f"  Fetching {len(sub_product_ids)} product names from Stripe…", file=sys.stderr)
        product_meta = fetch_products(key, sub_product_ids)
    name_for = lambda pid: (product_meta.get(pid, {}).get("name") or pid)[:50]

    # Subscription stats per product
    print(f"\n  Distribution des subs par produit :")
    prod_sub_total = Counter()
    prod_sub_active = Counter()
    prod_sub_canceled = Counter()
    prod_price_cents = defaultdict(set)
    for s in subs:
        status = s.get("status")
        for item in (s.get("items") or {}).get("data", []):
            pid = (item.get("price", {}) or {}).get("product")
            amt = (item.get("price", {}) or {}).get("unit_amount") or 0
            interval = ((item.get("price", {}) or {}).get("recurring") or {}).get("interval", "")
            if pid:
                prod_sub_total[pid] += 1
                if status == "active":
                    prod_sub_active[pid] += 1
                elif status == "canceled":
                    prod_sub_canceled[pid] += 1
                prod_price_cents[pid].add((amt, interval))

    print(f"  {'Produit':<50} {'tot':>4} {'actifs':>7} {'churn':>7}  prix")
    for pid, n in prod_sub_total.most_common():
        active = prod_sub_active[pid]
        canceled = prod_sub_canceled[pid]
        churn_pct = (canceled / n * 100) if n else 0
        prices = ", ".join(f"{a/100:.2f}€/{i}" for a, i in sorted(prod_price_cents[pid]) if a)
        print(f"  {name_for(pid):<50} {n:>4} {active:>7} {canceled:>4} ({churn_pct:>3.0f}%)  {prices}")

    # ============================================================
    # 3. CHARGES par produit (via lien invoice → subscription → product)
    # ============================================================
    # Pour chaque charge avec invoice, on retrouve la sub via les customers
    sub_by_id = {s["id"]: s for s in subs}
    cust_to_subs = defaultdict(list)
    for s in subs:
        if s.get("customer"):
            cust_to_subs[s["customer"]].append(s)

    # Approximation : pour une charge donnée, on regarde la sub du client à la date de la charge
    # (suffisant quand un client n'a qu'1 sub à la fois)
    prod_charge_count = Counter()
    prod_charge_revenue = defaultdict(int)
    prod_charge_unique_customers = defaultdict(set)
    one_shot_revenue = 0
    one_shot_count = 0

    for c in paid_charges:
        amt = c.get("amount_captured") or c.get("amount") or 0
        cid = c.get("customer")
        invoice = c.get("invoice")
        prods_for_this_charge = set()
        if invoice and cid and cust_to_subs.get(cid):
            # Lien client → ses subs → leurs produits
            for s in cust_to_subs[cid]:
                prods_for_this_charge.update(sub_to_prods.get(s["id"], set()))
        if prods_for_this_charge:
            # Si plusieurs produits possibles, on attribue à chacun (approximation)
            for pid in prods_for_this_charge:
                prod_charge_count[pid] += 1 / len(prods_for_this_charge)
                prod_charge_revenue[pid] += amt // len(prods_for_this_charge)
                if cid:
                    prod_charge_unique_customers[pid].add(cid)
        else:
            one_shot_revenue += amt
            one_shot_count += 1

    print(f"\n[3] CHARGES par produit (attribuées via lien sub→client)")
    print(f"  {'Produit':<50} {'charges':>8} {'CA':>11}  uniq clients")
    for pid, n in sorted(prod_charge_count.items(), key=lambda x: -prod_charge_revenue[x[0]]):
        rev = prod_charge_revenue[pid]
        uniq = len(prod_charge_unique_customers[pid])
        print(f"  {name_for(pid):<50} {n:>8.0f} {fmt_money_cents(rev):>11}  {uniq}")
    if one_shot_count:
        print(f"  {'(charges hors abo / non attribuées)':<50} {one_shot_count:>8} {fmt_money_cents(one_shot_revenue):>11}")

    # ============================================================
    # 4. TOP CLIENTS — quels produits achètent-ils ?
    # ============================================================
    print(f"\n[4] AFFINITÉ TOP 10 CLIENTS × PRODUITS")
    cust_revenue = defaultdict(int)
    cust_count = defaultdict(int)
    cust_first = {}
    cust_last = {}
    for c in paid_charges:
        cid = c.get("customer")
        if not cid:
            continue
        amt = c.get("amount_captured") or c.get("amount") or 0
        cust_revenue[cid] += amt
        cust_count[cid] += 1
        ts = c.get("created")
        if ts:
            cust_first[cid] = min(cust_first.get(cid, ts), ts)
            cust_last[cid] = max(cust_last.get(cid, 0), ts)

    cust_email = {cu["id"]: (cu.get("email") or cu.get("name") or cu["id"])[:35] for cu in customers}
    top10 = sorted(cust_revenue.items(), key=lambda x: -x[1])[:10]

    print(f"  {'Client':<37} {'CA':>9} {'tx':>3} {'durée':>7}  produits abonnés")
    for cid, rev in top10:
        em = cust_email.get(cid, cid[:35])
        n = cust_count[cid]
        first = cust_first.get(cid)
        last = cust_last.get(cid)
        duration_days = (last - first) // 86400 if first and last else 0
        prods = set()
        for s in cust_to_subs.get(cid, []):
            prods.update(sub_to_prods.get(s["id"], set()))
        prod_str = ", ".join(name_for(p)[:18] for p in list(prods)[:3]) or "(pas d'abo)"
        print(f"  {em:<37} {fmt_money_cents(rev):>9} {n:>3} {duration_days:>4}j   {prod_str}")

    # ============================================================
    # 5. REFUNDS par produit
    # ============================================================
    print(f"\n[5] REFUNDS — quel produit est le plus reboursé ?")
    refund_per_prod = Counter()
    refund_total_per_prod = defaultdict(int)
    for c in charges:
        if (c.get("amount_refunded") or 0) == 0:
            continue
        cid = c.get("customer")
        if cid and cust_to_subs.get(cid):
            for s in cust_to_subs[cid]:
                for pid in sub_to_prods.get(s["id"], set()):
                    refund_per_prod[pid] += 1
                    refund_total_per_prod[pid] += c.get("amount_refunded", 0)
    if refund_per_prod:
        for pid, n in refund_per_prod.most_common():
            total_charges_for_prod = prod_charge_count.get(pid, 1)
            rate = (n / total_charges_for_prod * 100) if total_charges_for_prod else 0
            amt = refund_total_per_prod[pid]
            print(f"  {name_for(pid):<50} {n:>3} refunds  ({rate:>4.1f}%)  {fmt_money_cents(amt)}")
    else:
        print("  (pas de refunds attribuables à un produit)")

    # ============================================================
    # 6. PATTERNS HORAIRES par produit
    # ============================================================
    print(f"\n[6] PIC HORAIRE par produit (heure UTC où le produit se vend le plus)")
    prod_hour = defaultdict(Counter)
    for c in paid_charges:
        cid = c.get("customer")
        ts = c.get("created")
        if not (cid and ts and cust_to_subs.get(cid)):
            continue
        h = datetime.fromtimestamp(ts, tz=timezone.utc).hour
        for s in cust_to_subs[cid]:
            for pid in sub_to_prods.get(s["id"], set()):
                prod_hour[pid][h] += 1
    for pid, _ in prod_sub_total.most_common():
        if pid in prod_hour and prod_hour[pid]:
            peak = prod_hour[pid].most_common(1)[0]
            print(f"  {name_for(pid):<50} pic={peak[0]:02d}h ({peak[1]} charges)")

    # ============================================================
    # 7. COHORT — par mois d'acquisition, qui est encore là ?
    # ============================================================
    print(f"\n[7] COHORT — clients par mois d'acquisition + leur statut")
    cohort = defaultdict(list)
    for cid, first in cust_first.items():
        month = datetime.fromtimestamp(first, tz=timezone.utc).strftime("%Y-%m")
        cohort[month].append(cid)

    now = int(datetime.now(timezone.utc).timestamp())
    print(f"  {'Cohorte':<10} {'#nouveaux':>10} {'CA cumul':>11} {'encore actifs':>15}")
    for month in sorted(cohort.keys()):
        cids = cohort[month]
        n = len(cids)
        total_rev = sum(cust_revenue[cid] for cid in cids)
        # "Encore actif" = a fait une charge dans les 60 derniers jours
        still_active = sum(1 for cid in cids if cust_last.get(cid, 0) > now - 60 * 86400)
        retention_pct = (still_active / n * 100) if n else 0
        print(f"  {month:<10} {n:>10} {fmt_money_cents(total_rev):>11} {still_active:>5} ({retention_pct:>4.0f}%)")

    # ============================================================
    # 8. FRÉQUENCE — combien de jours entre 2 achats par client
    # ============================================================
    print(f"\n[8] FRÉQUENCE D'ACHAT (jours entre 2 charges, top clients réguliers)")
    cust_intervals = {}
    for cid in cust_revenue:
        charges_for_cust = sorted(
            (c.get("created") for c in paid_charges if c.get("customer") == cid and c.get("created"))
        )
        if len(charges_for_cust) < 2:
            continue
        intervals = [(charges_for_cust[i+1] - charges_for_cust[i]) // 86400 for i in range(len(charges_for_cust)-1)]
        if intervals:
            cust_intervals[cid] = intervals

    all_intervals = [i for ints in cust_intervals.values() for i in ints]
    if all_intervals:
        all_intervals.sort()
        print(f"  Tous clients confondus  :  médiane={median(all_intervals)}j  moy={sum(all_intervals)/len(all_intervals):.1f}j")
        print(f"  P25 / P75               :  {all_intervals[len(all_intervals)//4]}j / {all_intervals[3*len(all_intervals)//4]}j")

    # ============================================================
    # 9. INSIGHT — quel produit a la meilleure rétention ?
    # ============================================================
    print(f"\n[9] RÉTENTION par produit")
    print(f"  {'Produit':<50} churn  durée moy actif")
    for pid, total in prod_sub_total.most_common():
        active_subs = [s for s in subs if pid in sub_to_prods.get(s["id"], set()) and s.get("status") == "active"]
        canceled_subs = [s for s in subs if pid in sub_to_prods.get(s["id"], set()) and s.get("status") == "canceled"]
        churn_pct = (len(canceled_subs) / total * 100) if total else 0
        # Durée moyenne entre created et cancel pour les annulés
        durations = []
        for s in canceled_subs:
            cr = s.get("created")
            ca = s.get("canceled_at")
            if cr and ca:
                durations.append((ca - cr) // 86400)
        avg_dur = sum(durations) / len(durations) if durations else 0
        print(f"  {name_for(pid):<50} {churn_pct:>3.0f}%  {avg_dur:>5.0f} jours")

    print("\n" + "=" * 60)
    print("Analyse finie. Colle-moi tout le bloc pour qu'on analyse ensemble.")
    print("=" * 60)


if __name__ == "__main__":
    main()
