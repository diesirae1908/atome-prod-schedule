#!/usr/bin/env python3
"""
Fetches Manufacturing Orders from Odoo SH via XML-RPC and generates
data/schedule.json for the production schedule web app.

Environment variables required:
  ODOO_URL      e.g. https://atome-bakery.odoo.com
  ODOO_DB       e.g. atome-bakery
  ODOO_USER     e.g. admin@atomebakery.com
  ODOO_API_KEY  API key generated in Odoo > Preferences > API Keys

Usage:
  python scripts/fetch_schedule.py [--weeks 2]
"""

import os
import json
import math
import re
import ssl
import xmlrpc.client
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import argparse

# Odoo returns datetimes in UTC; convert to local bakery timezone before extracting date
# so that MOs scheduled late in the day don't land on the wrong calendar day.
BAKERY_TZ = ZoneInfo("America/Vancouver")

# ── SSL context (Odoo SH uses a cert chain not in Python's default bundle) ─────
_ssl_ctx = ssl._create_unverified_context()

# ── paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_CFG = ROOT / "config" / "products.json"
OUTPUT = ROOT / "data" / "schedule.json"

# ── helpers ────────────────────────────────────────────────────────────────────
def week_number(d: date) -> int:
    return d.isocalendar()[1]

def iso(d: date) -> str:
    return d.isoformat()

def extract_sku(product_name: str) -> str | None:
    """Extract SKU from '[SKU] Product name' format."""
    m = re.match(r"^\[([^\]]+)\]", product_name or "")
    return m.group(1) if m else None

def compute_dluo(packaging_date: date, dluo_months: int | None) -> str | None:
    if dluo_months is None:
        return None
    month = packaging_date.month + dluo_months
    year = packaging_date.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    # last day of that month
    next_month = date(year, month, 1) + timedelta(days=32)
    last_day = date(next_month.year, next_month.month, 1) - timedelta(days=1)
    return iso(last_day)

# ── odoo connection ─────────────────────────────────────────────────────────────
def odoo_connect():
    url      = os.environ["ODOO_URL"].rstrip("/")
    db       = os.environ["ODOO_DB"]
    user     = os.environ["ODOO_USER"]
    api_key  = os.environ["ODOO_API_KEY"]

    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True, context=_ssl_ctx)
    uid = common.authenticate(db, user, api_key, {})
    if not uid:
        raise RuntimeError("Odoo authentication failed – check ODOO_URL / ODOO_DB / ODOO_USER / ODOO_API_KEY")

    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True, context=_ssl_ctx)
    return models, db, uid, api_key

def fetch_mos(models, db, uid, api_key, start: date, end: date) -> list[dict]:
    """Fetch confirmed/in-progress MOs with scheduled date in [start, end].
    Uses date_start (Odoo 18 field name; was date_planned_start in <=17).
    """
    domain = [
        ["state", "in", ["confirmed", "progress", "to_close"]],
        ["date_start", ">=", f"{iso(start)} 00:00:00"],
        ["date_start", "<=", f"{iso(end)} 23:59:59"],
    ]
    fields = [
        "name",
        "product_id",
        "product_qty",
        "date_start",
        "lot_producing_id",
        "state",
        "product_uom_id",
    ]
    result = models.execute_kw(
        db, uid, api_key,
        "mrp.production", "search_read",
        [domain],
        {"fields": fields, "order": "date_start asc"},
    )
    return result or []

# ── schedule builder ────────────────────────────────────────────────────────────
def build_schedule(mos: list[dict], products_cfg: dict, start: date, end: date) -> dict:
    products = products_cfg["products"]
    dough_types = products_cfg["dough_types"]

    # Build day map for the full range (and a bit before for mix look-ahead)
    day_map: dict[str, dict] = {}
    span_start = start - timedelta(days=3)  # enough headroom for mix offsets
    span_end = end + timedelta(days=1)
    cursor = span_start
    while cursor <= span_end:
        day_map[iso(cursor)] = {"premix": {}, "mix": {}, "shaping": [], "vacuuming": []}
        cursor += timedelta(days=1)

    for mo in mos:
        # D-0 = scheduled packaging/vacuuming date (field: date_start in Odoo 18)
        raw_dt = (mo.get("date_start") or "")
        if not raw_dt:
            continue
        # Odoo returns UTC naive strings — convert to bakery local date
        dt_utc = datetime.fromisoformat(raw_dt.replace(" ", "T")).replace(tzinfo=timezone.utc)
        d0 = dt_utc.astimezone(BAKERY_TZ).date()

        product_name = mo["product_id"][1] if mo.get("product_id") else ""
        sku = extract_sku(product_name)
        qty_packs = float(mo.get("product_qty") or 0)
        mo_ref = mo.get("name", "")

        # DLUO from Odoo lot, fallback to computed
        dluo_from_odoo = None
        if mo.get("lot_producing_id"):
            lot_name = mo["lot_producing_id"][1] if isinstance(mo["lot_producing_id"], (list, tuple)) else str(mo["lot_producing_id"])
            # Odoo stores DLUO as the lot name in format MM/DD/YYYY or YYYY-MM-DD
            try:
                for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
                    try:
                        dluo_from_odoo = iso(datetime.strptime(lot_name, fmt).date())
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Look up product config
        cfg = products.get(sku) if sku else None
        if cfg is None:
            # Unknown SKU – still show in vacuuming as packaging-only
            cfg = {
                "name": product_name,
                "dough_type": None,
                "mix_offset": None, "shape_offset": None,
                "score_offset": None, "vacuum_offset": 0,
                "dluo_months": None,
                "copacked": True,
                "units_per_pack": 1,
                "dough_kg_per_pack": None,
            }

        skip_prod = cfg.get("copacked", False) or cfg.get("mix_offset") is None

        units_per_pack = cfg.get("units_per_pack") or 1
        qty_units = qty_packs * units_per_pack

        # DLUO: Odoo lot name takes precedence, else compute from config
        dluo = dluo_from_odoo
        if dluo is None and cfg.get("dluo_months") is not None:
            dluo = compute_dluo(d0, cfg["dluo_months"])

        # ── VACUUMING (D-0) ───────────────────────────────────────────────────
        vac_offset = cfg.get("vacuum_offset") or 0
        vac_date = iso(d0 + timedelta(days=vac_offset))
        if vac_date in day_map:
            day_map[vac_date]["vacuuming"].append({
                "sku": sku or "?",
                "name": cfg.get("name") or product_name,
                "qty_packs": qty_packs,
                "qty_units": qty_units,
                "dluo": dluo,
                "mo_ref": mo_ref,
            })

        if skip_prod:
            continue

        # ── SHAPING (D-shape_offset) ──────────────────────────────────────────
        shape_offset = cfg.get("shape_offset") or 0
        shape_date = iso(d0 + timedelta(days=shape_offset))
        if shape_date in day_map:
            units_per_pack = cfg.get("units_per_pack") or 1
            weight_g = cfg.get("weight_g_per_unit")
            total_kg = round(qty_packs * units_per_pack * weight_g / 1000, 1) if weight_g else None

            day_map[shape_date]["shaping"].append({
                "sku": sku or "?",
                "name": cfg.get("name") or product_name,
                "qty_packs": int(round(qty_packs)),
                "qty_units": int(round(qty_units)),
                "total_kg": total_kg,
                "mo_ref": mo_ref,
                "d0": iso(d0),
            })

        # ── MIXING (D-mix_offset) ─────────────────────────────────────────────
        mix_offset = cfg.get("mix_offset") or 0
        mix_date = iso(d0 + timedelta(days=mix_offset))
        if mix_date in day_map and cfg.get("dough_type"):
            dough_type = cfg["dough_type"]
            dt_cfg = dough_types.get(dough_type, {})
            units_per_pack = cfg.get("units_per_pack") or 1
            weight_g = cfg.get("weight_g_per_unit")
            total_kg = (qty_packs * units_per_pack * weight_g / 1000) if weight_g else None
            prod_name = cfg.get("name") or sku or "?"

            # One mixing task per MO (keyed by mo_ref), not per dough type
            mix_key = mo_ref or f"{dough_type}_{prod_name}"
            if mix_key not in day_map[mix_date]["mix"]:
                day_map[mix_date]["mix"][mix_key] = {
                    "dough_type": dough_type,
                    "label": prod_name,
                    "unit": dt_cfg.get("unit", "kg"),
                    "total_kg": 0.0 if total_kg is not None else None,
                    "total_units": 0,
                    "mo_ref": mo_ref,
                    "products": [prod_name],
                }

            entry = day_map[mix_date]["mix"][mix_key]
            if total_kg is not None:
                if entry["total_kg"] is None:
                    entry["total_kg"] = 0.0
                entry["total_kg"] += total_kg
            entry["total_units"] += int(round(qty_packs * units_per_pack))

        # ── PRE-MIXING (premix_offset) ────────────────────────────────────────
        pm_offset = cfg.get("premix_offset")
        pm_label  = cfg.get("premix_label")
        if pm_offset is not None and pm_label:
            premix_date = iso(d0 + timedelta(days=pm_offset))
            if premix_date in day_map:
                upp = cfg.get("units_per_pack") or 1
                if pm_label not in day_map[premix_date]["premix"]:
                    day_map[premix_date]["premix"][pm_label] = {
                        "label": pm_label,
                        "total_units": 0,
                        "products": [],
                    }
                pm_entry = day_map[premix_date]["premix"][pm_label]
                pm_entry["total_units"] += int(round(qty_packs * upp))
                pm_prod = cfg.get("name") or sku or "?"
                if pm_prod not in pm_entry["products"]:
                    pm_entry["products"].append(pm_prod)

    # Round mix totals and convert dicts to sorted lists
    for day_str, day in day_map.items():
        # premix dict → sorted list
        day["premix"] = [v for _, v in sorted(day["premix"].items())]

        mix_list = []
        for dough_type, entry in sorted(day["mix"].items()):
            if entry["total_kg"] is not None:
                entry["total_kg"] = round(entry["total_kg"], 1)
            mix_list.append(entry)
        day["mix"] = mix_list

        # Sort shaping / vacuuming by name for consistency
        day["shaping"].sort(key=lambda x: x["name"])
        day["vacuuming"].sort(key=lambda x: x["name"])

    # Build final output (only include days in the requested window)
    day_labels = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
    days_out = []
    cursor = start
    while cursor <= end:
        d_str = iso(cursor)
        day = day_map.get(d_str, {"mix": [], "shaping": [], "vacuuming": []})
        days_out.append({
            "date": d_str,
            "label": day_labels[cursor.weekday()],
            "premix": day["premix"],
            "mix": day["mix"],
            "shaping": day["shaping"],
            "vacuuming": day["vacuuming"],
        })
        cursor += timedelta(days=1)

    return {
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "week_number": week_number(start),
        "week_start": iso(start),
        "week_end": iso(end),
        "days": days_out,
    }

# ── main ────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weeks", type=int, default=2,
                        help="How many weeks ahead to fetch (default: 2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Use sample data instead of calling Odoo (for testing)")
    args = parser.parse_args()

    # Load product config
    with open(PRODUCTS_CFG) as f:
        products_cfg = json.load(f)

    # Compute date range: current Monday → end of requested weeks
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    end = monday + timedelta(weeks=args.weeks) - timedelta(days=1)

    print(f"Fetching MOs from {iso(monday)} to {iso(end)}…")

    if args.dry_run:
        print("DRY RUN – using empty MO list")
        mos = []
    else:
        models, db, uid, api_key = odoo_connect()
        mos = fetch_mos(models, db, uid, api_key, monday, end)
        print(f"  → {len(mos)} MOs found")

    schedule = build_schedule(mos, products_cfg, monday, end)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(schedule, f, indent=2, ensure_ascii=False)

    print(f"  → Written to {OUTPUT}")

if __name__ == "__main__":
    main()
