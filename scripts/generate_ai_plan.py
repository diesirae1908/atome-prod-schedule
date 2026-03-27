#!/usr/bin/env python3
"""
Atome Bakery — AI Daily Production Plan Generator
Usage:
  python generate_ai_plan.py --date 2026-03-26
  python generate_ai_plan.py --date 2026-03-26 --days 6
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import anthropic

# ---------------------------------------------------------------------------
# SYSTEM PROMPT — static rules fed once as system context
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_BASE = """You are the production planner for Atome Bakery. Your ONLY job is to assign tasks to bakers for a given day.

━━━ ABSOLUTE CONSTRAINTS ━━━
1. ONLY use task names from the ALLOWED TASK LIST for each role. NEVER invent new task names.
2. Atome Bakery has NO OVEN. Never write any oven-related task (no "enfournement", no proofing chamber).
3. Schedule EVERY baker listed — do not drop anyone.
4. Every baker's tasks must cover their FULL shift with NO gaps and NO overlaps.
5. ROLES ARE STRICTLY SEPARATE — never assign a task from another role's list.

━━━ ROLE DEFINITIONS & STRICT TASK LISTS ━━━

── ROLE M — MIXER ──────────────────────────────────────────────
Mixers work the MIXER station only. They NEVER shape bread.
Allowed tasks:
  Mix LOAF / Mix WW / Mix CTY / Mix PIZ / Mix Ciabatta
  Mix BGT (D+1)          ← baguette dough for next day — ALWAYS done
  Mix PAC batter
  Mix WAF dough
  Fold LOAF / Fold WW / Fold CTY / Fold PIZ / Fold BGT / Fold Ciabatta
  Refresh levain         ← EVERY day, no exception, ~10:00–11:00
  Measuring future mixes
  Clean Mixer
  Dishes
  Kitchen Organization

── ROLE S — SHAPER / BAKER ─────────────────────────────────────
Shapers work the SHAPING station. Production tasks only.
Shift start: 09:00 (never earlier, even if bakerHours shows an earlier time).
Allowed tasks:
  Score LOAF D-1         ← always first, 09:00–09:30
  Preshape BGT           ← 09:00–10:00 (or 09:30–10:00 after scoring)
  Shape LOAF / Shape WW / Shape CTY / Shape PIZ / Shape Ciabatta
  Shape BGT Trad / Shape BGT MG / Shape BGT Sesame / Shape BGT Poppy
  Shape Cheese BGT       ← includes cheese cutting
  Score BGT              ← ~11:30–12:00 after final shape
  Lamination PAC         ← 10:20–12:40
  Shape PAC              ← 13:00–15:30 ONLY
  Shape Bun / Shape Brioche / Shape Viennoiseries
  Lunch                  ← 12:00–13:00 when needed
  Clean end of day       ← end of shift close-out

── ROLE V — VACUUM TEAM ─────────────────────────────────────────
Vacuum team NEVER does bread shaping, scoring, preshaping, or mixing.
Their job is packaging and vacuum operations exclusively.
Shift start: use their actual start time from bakerHours.
Allowed tasks:
  Sticker prep / Bag & carton prep   ← from shift start until 15:30
  Vacuum/Box/Stick                   ← 15:30 to end of shift
  (On very light days, also: Dishes, Kitchen Organization)

── ROLE Waffle — THÉO ───────────────────────────────────────────
Allowed tasks: Setup WAF / Bake WAF / Packaging WAF / Lunch

━━━ TIMING RULES ━━━
- Mixer (M): 07:00 to end of their shift. Mixing tasks come first, then cleaning/admin.
- Shaper (S): 09:00 to end of shift (even if bakerHours shows earlier — do NOT start before 09:00).
- Vacuum (V): from their shift start → Sticker prep / Bag & carton prep all morning → Vacuum/Box/Stick from 15:30.
- Loaves/WW/CTY/PIZ/Ciabatta: mixed same day, starting 07:00 (mixer priority 1).
- Baguettes: ALWAYS mixed D+1 (mixer mixes tomorrow's baguette dough today).
- PAC shaping: 13:00–15:30 ONLY.
- Score LOAF D-1: 09:00–09:30, shapers only (NOT vacuum team).
- Preshape BGT: 09:00–10:00 or 09:30–10:00, shapers only.
- Refresh levain: 10:00–11:00, mixer every day.
- Final shape BGT: 10:00–12:00, 1 dedicated shaper.
- Score BGT: ~11:30–12:00, the shaper who shaped baguettes.

━━━ SHAPING DURATIONS (exact — never shorten) ━━━
- Shape LOAF:       1h00 per batch (20 kg flour)
- Shape WW:         1h20 per batch (20 kg flour)
- Shape CTY:        1h20 per batch (20 kg flour)
- Shape PIZ:        1h30 per batch (25 kg flour)
- Shape Ciabatta:   1h00 per batch (20 kg flour)
- Shape Cheese BGT: 2h10 total (40 min cutting + 1h30 shaping), 1 baker
- Shape PAC:        2h30 total (13:00–15:30), 2–4 bakers
- Lamination PAC:   2h20 total (10:20–12:40), 1–2 bakers
- Shape Bun:        up to 5 baker-hours, finish by 15:30

━━━ WEEKEND RULE ━━━
Saturday/Sunday: ONLY Baguette Trad + Loaf Trad. No PAC, no waffles, no viennoiseries.

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON — no markdown, no explanation, no comments.
"""

# ---------------------------------------------------------------------------
# FEW-SHOT EXAMPLES — two real representative days
# ---------------------------------------------------------------------------
FEW_SHOT_EXAMPLES = """
Below are two real daily plans from Atome Bakery. Study them carefully — especially the strict role separation.

KEY RULE illustrated by these examples:
  - Role M (Mixer): only mixing, folding, levain, cleaning tasks. Never shapes bread.
  - Role S (Shaper): only shaping, scoring, preshaping tasks. Starts at 09:00 always.
  - Role V (Vacuum): ONLY packaging tasks (Sticker prep / Bag & carton prep, Vacuum/Box/Stick). NEVER shapes or scores bread.

━━━ EXAMPLE 1 — Wednesday, full production day ━━━
Team: Kuba (M, 07:00–12:00), Lavish (M, 07:00–12:00), Alice (S, 09:00–17:30), Bob (S, 09:00–17:30), Carla (V, 07:00–15:30), Diana (V, 13:30–17:30)
MOs: LOAF Trad 80kg (4 batches), BGT Trad 60kg (3 batches D+1), PAC Chocolat 12 patons

{
  "date": "EXAMPLE-1",
  "dayOfWeek": "Wednesday",
  "notes": "Full day: 4 LOAF batches, PAC afternoon, baguette dough for tomorrow.",
  "warnings": [],
  "bakers": [
    {
      "name": "Kuba",
      "role": "M",
      "tasks": [
        {"id": "k1","name":"Mix LOAF","start":"07:00","end":"09:00","color":"#6366f1","description":"Batch 1+2+3+4 — 80kg flour"},
        {"id": "k2","name":"Fold LOAF","start":"09:00","end":"09:30","color":"#6366f1","description":"All 4 batches"},
        {"id": "k3","name":"Refresh levain","start":"10:00","end":"11:00","color":"#8b5cf6","description":"Daily levain refresh"},
        {"id": "k4","name":"Mix BGT (D+1)","start":"11:00","end":"12:00","color":"#6366f1","description":"3 batches baguette dough for tomorrow"}
      ]
    },
    {
      "name": "Lavish",
      "role": "M",
      "tasks": [
        {"id": "l1","name":"Mix PAC batter","start":"07:00","end":"08:40","color":"#ec4899","description":"12 patons PAC Chocolat"},
        {"id": "l2","name":"Fold LOAF","start":"08:40","end":"09:00","color":"#6366f1","description":"Assist Kuba on last batches"},
        {"id": "l3","name":"Clean Mixer","start":"09:00","end":"10:00","color":"#94a3b8","description":""},
        {"id": "l4","name":"Measuring future mixes","start":"10:00","end":"11:00","color":"#94a3b8","description":"Prepare tomorrow's ingredients"},
        {"id": "l5","name":"Dishes","start":"11:00","end":"12:00","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Alice",
      "role": "S",
      "tasks": [
        {"id": "a1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":"Score yesterday's loaves"},
        {"id": "a2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"Preshape baguettes with Bob"},
        {"id": "a3","name":"Shape LOAF","start":"10:00","end":"12:00","color":"#10b981","description":"Batch 1+2 — 40kg"},
        {"id": "a4","name":"Lunch","start":"12:00","end":"13:00","color":"#94a3b8","description":""},
        {"id": "a5","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Chocolat, 12 patons"},
        {"id": "a6","name":"Clean end of day","start":"15:30","end":"17:30","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Bob",
      "role": "S",
      "tasks": [
        {"id": "b1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":"Score yesterday's loaves"},
        {"id": "b2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"Preshape baguettes with Alice"},
        {"id": "b3","name":"Shape BGT Trad","start":"10:00","end":"12:00","color":"#f59e0b","description":"Final shape 3 batches"},
        {"id": "b4","name":"Score BGT","start":"12:00","end":"12:30","color":"#06b6d4","description":"Score all baguettes"},
        {"id": "b5","name":"Shape LOAF","start":"12:30","end":"13:00","color":"#10b981","description":"Batch 3+4 — 40kg"},
        {"id": "b6","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Chocolat assist"},
        {"id": "b7","name":"Clean end of day","start":"15:30","end":"17:30","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Carla",
      "role": "V",
      "tasks": [
        {"id": "c1","name":"Sticker prep / Bag & carton prep","start":"07:00","end":"15:30","color":"#64748b","description":"Prepare all vacuum station, labels, cartons, pouches"},
        {"id": "c2","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":"Vacuum and pack all products"}
      ]
    },
    {
      "name": "Diana",
      "role": "V",
      "tasks": [
        {"id": "d1","name":"Sticker prep / Bag & carton prep","start":"13:30","end":"15:30","color":"#64748b","description":"Set up vacuum station, stickers, cartons"},
        {"id": "d2","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    }
  ]
}

━━━ EXAMPLE 2 — Friday, lighter day ━━━
Team: Mehdi (M, 07:00–15:30), Natalia (S, 09:00–17:30), Joyie (S, 09:00–17:30), Ysaline (V, 07:00–15:30), Angele (V, 07:00–15:30)
MOs: WW 40kg (2 batches), BGT MG 40kg (2 batches D+1)

{
  "date": "EXAMPLE-2",
  "dayOfWeek": "Friday",
  "notes": "Light day: 2 WW batches + baguette MG dough for tomorrow. No PAC.",
  "warnings": [],
  "bakers": [
    {
      "name": "Mehdi",
      "role": "M",
      "tasks": [
        {"id": "m1","name":"Mix WW","start":"07:00","end":"09:00","color":"#6366f1","description":"2 batches — 40kg flour"},
        {"id": "m2","name":"Fold WW","start":"09:00","end":"09:30","color":"#6366f1","description":"Both batches"},
        {"id": "m3","name":"Refresh levain","start":"10:00","end":"11:00","color":"#8b5cf6","description":"Daily levain refresh"},
        {"id": "m4","name":"Mix BGT (D+1)","start":"11:00","end":"12:30","color":"#6366f1","description":"2 batches BGT MG for tomorrow"},
        {"id": "m5","name":"Clean Mixer","start":"12:30","end":"13:30","color":"#94a3b8","description":""},
        {"id": "m6","name":"Kitchen Organization","start":"13:30","end":"15:30","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Natalia",
      "role": "S",
      "tasks": [
        {"id": "n1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":""},
        {"id": "n2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"BGT MG preshape with Joyie"},
        {"id": "n3","name":"Shape WW","start":"10:00","end":"11:20","color":"#10b981","description":"Batch 1 — 20kg"},
        {"id": "n4","name":"Shape WW","start":"11:20","end":"12:40","color":"#10b981","description":"Batch 2 — 20kg"},
        {"id": "n5","name":"Clean end of day","start":"12:40","end":"15:30","color":"#94a3b8","description":""},
        {"id": "n6","name":"Clean end of day","start":"15:30","end":"17:30","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Joyie",
      "role": "S",
      "tasks": [
        {"id": "j1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":""},
        {"id": "j2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"BGT MG preshape with Natalia"},
        {"id": "j3","name":"Shape BGT MG","start":"10:00","end":"12:00","color":"#f59e0b","description":"Final shape 2 batches"},
        {"id": "j4","name":"Score BGT","start":"12:00","end":"12:30","color":"#06b6d4","description":""},
        {"id": "j5","name":"Clean end of day","start":"12:30","end":"15:30","color":"#94a3b8","description":""},
        {"id": "j6","name":"Clean end of day","start":"15:30","end":"17:30","color":"#94a3b8","description":""}
      ]
    },
    {
      "name": "Ysaline",
      "role": "V",
      "tasks": [
        {"id": "y1","name":"Sticker prep / Bag & carton prep","start":"07:00","end":"15:30","color":"#64748b","description":"Labels, cartons, pouches, vacuum station prep"},
        {"id": "y2","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Angele",
      "role": "V",
      "tasks": [
        {"id": "ag1","name":"Sticker prep / Bag & carton prep","start":"07:00","end":"15:30","color":"#64748b","description":"Labels, cartons, pouches, vacuum station prep"},
        {"id": "ag2","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    }
  ]
}
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
BASE = Path(__file__).parent.parent   # prod-schedule/

def load_production_guide() -> str:
    path = BASE / "data" / "production_guide.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""  # fallback: no guide available

def build_system_prompt() -> str:
    guide = load_production_guide()
    if guide:
        return SYSTEM_PROMPT_BASE + f"\n\n━━━ OFFICIAL PRODUCTION GUIDE (source of truth) ━━━\n{guide}"
    return SYSTEM_PROMPT_BASE

def load_recent_plans(before_date_str: str, max_days: int = 30) -> list[dict]:
    """Return up to max_days of existing AI plans strictly before the target date, newest first."""
    plans_dir = BASE / "data" / "ai-plans"
    if not plans_dir.exists():
        return []
    cutoff = datetime.strptime(before_date_str, "%Y-%m-%d").date()
    results = []
    for path in sorted(plans_dir.glob("*.json"), reverse=True):
        try:
            d = datetime.strptime(path.stem, "%Y-%m-%d").date()
        except ValueError:
            continue
        if d >= cutoff:
            continue
        try:
            with open(path) as f:
                results.append(json.load(f))
        except Exception:
            continue
        if len(results) >= max_days:
            break
    return results

def format_recent_plans_for_prompt(plans: list[dict]) -> str:
    if not plans:
        return ""
    lines = ["━━━ RECENT REAL PLANS (last days — learn from these patterns) ━━━",
             "These are actual plans used at Atome Bakery. Use them to calibrate task assignment,",
             "baker workload distribution, and typical day structure.",
             ""]
    for plan in plans[:10]:   # include at most 10 days to keep prompt size reasonable
        date  = plan.get("date", "?")
        dow   = plan.get("dayOfWeek", "")
        notes = plan.get("notes", "")
        lines.append(f"--- {date} ({dow}) — {notes}")
        for baker in plan.get("bakers", []):
            task_strs = [f"{t['start']}–{t['end']} {t['name']}" for t in baker.get("tasks", [])]
            lines.append(f"  {baker['name']} ({baker['role']}): {' | '.join(task_strs)}")
        lines.append("")
    return "\n".join(lines)

def load_schedule_for_date(date_str: str) -> dict:
    # Check both locations: data/schedule.json (primary) and schedule.json (legacy root)
    for path in [BASE / "data" / "schedule.json", BASE / "schedule.json"]:
        if not path.exists():
            continue
        with open(path) as f:
            schedule = json.load(f)
        days = schedule if isinstance(schedule, list) else schedule.get("days", [])
        for day in days:
            if day.get("date") == date_str:
                return day
    return {}

def load_shifts_data() -> dict:
    path = BASE / "data" / "shifts.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

def day_of_week(date_str: str) -> str:
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%A")

# ---------------------------------------------------------------------------
# Batch-size lookup (kg flour per batch) for shaping duration calculations
# ---------------------------------------------------------------------------
_BATCH_KG = {
    "LOAF_T": 20, "LOAF": 20,
    "WW": 20, "WHOLE_WHEAT": 20,
    "COUNTRY": 20, "CTY": 20,
    "CIABATTA": 20,
    "PIZZA": 25,
    "PAC_CR": 22.68, "PAC": 22.68, "CROISSANT": 22.68,
    "TRAD": 25, "MG": 25, "SESAME": 25, "POPPY": 25,
    "CHEESE": 25, "CHEESE_BGT": 25,
    "BRIOCHE": 22.68, "VIENNOISERIE": 22.68, "BUN": 22.68,
}
# Dough types that are baguettes → mixed D-1 (today mixer prepares for tomorrow)
_BAGUETTE_TYPES = {"TRAD", "MG", "SESAME", "POPPY", "CHEESE", "CHEESE_BGT"}

def _batches(total_kg: float, dough_type: str) -> str:
    size = _BATCH_KG.get(dough_type.upper(), 20)
    n    = max(1, round(total_kg / size + 0.49))  # round up
    return f"{n} batch{'es' if n != 1 else ''}"

def _friendly_name(dough_type: str, label: str) -> str:
    """Return a human-friendly product name."""
    dt = dough_type.upper()
    mapping = {
        "LOAF_T": "Loaf Trad", "LOAF": "Loaf Trad",
        "WW": "Whole Wheat (WW)", "WHOLE_WHEAT": "Whole Wheat (WW)",
        "COUNTRY": "Country (CTY)", "CTY": "Country (CTY)",
        "CIABATTA": "Ciabatta",
        "PIZZA": "Pizza",
        "PAC_CR": "PAC / Pain au Chocolat", "PAC": "PAC / Pain au Chocolat",
        "TRAD": "Baguette Trad",
        "MG": "Baguette MG",
        "SESAME": "Baguette Sesame",
        "POPPY": "Baguette Poppy",
        "CHEESE": "Cheese Baguette", "CHEESE_BGT": "Cheese Baguette",
        "BRIOCHE": "Brioche", "VIENNOISERIE": "Viennoiseries", "BUN": "Buns",
    }
    return mapping.get(dt, label or dough_type)

def summarise_mos(day_data: dict) -> str:
    """Parse the real schedule.json structure (mix/shaping/premix/vacuuming)."""
    if not day_data:
        return "No manufacturing orders found for this date."

    sections = []

    # ── MIX (what the mixer makes today) ────────────────────────────────────
    mix_lines = []
    for m in day_data.get("mix", []):
        dt    = m.get("dough_type", "")
        name  = _friendly_name(dt, m.get("label", ""))
        kg    = m.get("total_kg", 0)
        batch = _batches(kg, dt) if kg else ""
        is_bgt = dt.upper() in _BAGUETTE_TYPES
        suffix = " → mixed TODAY for tomorrow (D+1)" if is_bgt else " → mixed TODAY"
        mix_lines.append(f"  • {name}: {kg:.1f} kg ({batch}){suffix}")
    if mix_lines:
        sections.append("MIX TODAY (mixer tasks):\n" + "\n".join(mix_lines))

    # ── SHAPING (what gets shaped today) ────────────────────────────────────
    shape_lines = []
    for s in day_data.get("shaping", []):
        name = s.get("name", s.get("sku", "?"))
        kg   = s.get("total_kg", 0)
        packs= s.get("qty_packs", "")
        d0   = s.get("d0", "")
        # Detect product category for shaping note
        name_l = name.lower()
        if "ciabatta" in name_l:
            dt, note = "CIABATTA", "(1h00/batch)"
        elif "pizza" in name_l:
            dt, note = "PIZZA", "(1h30/batch)"
        elif "whole wheat" in name_l or "ww" in name_l:
            dt, note = "WW", "(1h20/batch)"
        elif "country" in name_l:
            dt, note = "COUNTRY", "(1h20/batch)"
        elif "loaf" in name_l or "trad" in name_l and "baguette" not in name_l:
            dt, note = "LOAF_T", "(1h00/batch)"
        elif "pain au chocolat" in name_l or "pac" in name_l:
            dt, note = "PAC_CR", "(afternoon only: 13h–15h30)"
        elif "sesame" in name_l:
            dt, note = "SESAME", "(2 bakers obligatory for final shape)"
        elif "poppy" in name_l:
            dt, note = "POPPY", "(2 bakers obligatory for final shape)"
        elif "cheese" in name_l:
            dt, note = "CHEESE_BGT", "(40 min cheese cutting + 1h30 shape)"
        elif "baguette" in name_l or "trad" in name_l:
            dt, note = "TRAD", "(1 baker for final shape)"
        else:
            dt, note = "", ""
        batch = _batches(kg, dt) if kg and dt else ""
        d0_str = f", ready {d0}" if d0 else ""
        shape_lines.append(f"  • {name}: {kg:.1f} kg ({batch}) {note}{d0_str}")
    if shape_lines:
        sections.append("SHAPE TODAY:\n" + "\n".join(shape_lines))

    # ── PREMIX / INGREDIENT PREP ─────────────────────────────────────────────
    premix_lines = []
    for p in day_data.get("premix", []):
        label = p.get("label", "")
        units = p.get("total_units", "")
        products = ", ".join(p.get("products", []))
        premix_lines.append(f"  • {label}: {units} units ({products}) — measure ingredients today")
    if premix_lines:
        sections.append("INGREDIENT PREP (mixer measures today for upcoming production):\n" + "\n".join(premix_lines))

    # ── VACUUMING QUEUE (for context) ────────────────────────────────────────
    vac_lines = []
    for v in day_data.get("vacuuming", []):
        name  = v.get("name", v.get("sku", "?"))
        packs = v.get("qty_packs", "")
        vac_lines.append(f"  • {name}: {packs} packs to vacuum/box/sticker")
    if vac_lines:
        sections.append("VACUUM QUEUE (15h30 onwards):\n" + "\n".join(vac_lines))

    if not sections:
        return "No MOs specified — schedule only mandatory tasks: levain refresh + Mix BGT (D+1)."
    return "\n\n".join(sections)

def build_prompt(date_str: str, shifts: dict, day_data: dict, shifts_data: dict,
                 recent_plans: list[dict] | None = None, feedback: str = "") -> str:
    dow         = day_of_week(date_str)
    is_weekend  = dow in ("Saturday", "Sunday")
    mo_summary  = summarise_mos(day_data)
    baker_hours = shifts_data.get("bakerHours", {})

    # Build baker detail lines — include EVERY working baker
    baker_detail_lines = []
    for baker, code in shifts.items():
        if code in ("P&P", "H", "BD", "Sick"):
            continue   # not on the floor
        hours = baker_hours.get(baker, {}).get(dow, "unknown hours")
        baker_detail_lines.append(f"  - {baker} ({code}): {hours}")

    baker_details = "\n".join(baker_detail_lines) if baker_detail_lines else "  (none)"
    baker_names   = [b for b, c in shifts.items() if c not in ("P&P", "H", "BD", "Sick")]
    baker_list    = ", ".join(baker_names)

    weekend_warning = (
        "\n⚠ WEEKEND: ONLY Baguette Trad + Loaf Trad today. "
        "No PAC, no waffles, no viennoiseries, no pastries whatsoever."
        if is_weekend else ""
    )

    recent_section   = format_recent_plans_for_prompt(recent_plans or [])
    feedback_section = (
        f"\n⚠ LEAD FEEDBACK (highest priority — incorporate this into the plan):\n{feedback}\n"
        if feedback.strip() else ""
    )

    return f"""{FEW_SHOT_EXAMPLES}

{recent_section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOW GENERATE THE REAL PLAN FOR THE FOLLOWING DAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DATE: {date_str} ({dow}){weekend_warning}

=== TEAM TODAY ===
(MANDATORY: every baker listed here MUST appear in the output)
{baker_details}
Required baker names in output: {baker_list}

=== MANUFACTURING ORDERS FOR TODAY ===
{mo_summary}

{feedback_section}=== REMINDERS ===
- Mix BGT (D+1): mixer ALWAYS mixes baguette dough for tomorrow — even if no BGT in today's MOs.
- Refresh levain: ALWAYS 10:00–11:00, done by the mixer.
- Score LOAF D-1: ALWAYS 09:00–09:30, ALL shapers.
- Preshape BGT: ALWAYS 09:00–10:00 (or 09:30–10:00 right after scoring), shapers + vacuum team.
- Vacuum team (V) before 13:00: assign real production tasks (Preshape BGT, Shape X, Lamination PAC).
- If no PAC in MOs: skip Lamination PAC and Shape PAC entirely.
- Vacuum/Box/Stick: 15:30–end of shift for EVERY baker, no exceptions.
- NEVER use task names not in the ALLOWED TASK LIST.

Return ONLY valid JSON (no markdown, no explanation). Schema:
{{
  "date": "{date_str}",
  "dayOfWeek": "{dow}",
  "generatedAt": "ISO8601",
  "notes": "one sentence summary for the team lead",
  "warnings": [
    "List any scheduling concerns here — e.g. tight timing, understaffing risk, tasks that may overflow 15h30.",
    "Leave this array EMPTY [] if the day looks fully feasible."
  ],
  "bakers": [
    {{
      "name": "ExactBakerName",
      "role": "M|S|V|Waffle",
      "tasks": [
        {{
          "id": "unique-id",
          "name": "Task name from allowed list",
          "start": "HH:MM",
          "end": "HH:MM",
          "color": "#hex",
          "description": "product, batch count, or brief detail"
        }}
      ]
    }}
  ]
}}

Colors: Mixer=#6366f1, Shaping=#10b981, Baguettes=#f59e0b, PAC=#ec4899,
        Vacuum=#64748b, Waffles=#f97316, Levain=#8b5cf6, Scoring=#06b6d4,
        Viennoiseries=#e879f9, Misc=#94a3b8
"""

def generate_plan(date_str: str, feedback: str = "") -> dict:
    client       = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    shifts_data  = load_shifts_data()
    shifts       = shifts_data.get("schedule", {}).get(date_str, {})
    day_data     = load_schedule_for_date(date_str)
    recent_plans = load_recent_plans(date_str, max_days=30)

    if recent_plans:
        print(f"  → Using {len(recent_plans)} recent plan(s) as context")
    if feedback.strip():
        print(f"  → Lead feedback included: {feedback[:80]}{'…' if len(feedback) > 80 else ''}")

    prompt = build_prompt(date_str, shifts, day_data, shifts_data, recent_plans, feedback)

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8096,
        system=build_system_prompt(),
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    plan = json.loads(raw)
    plan["generatedAt"] = datetime.utcnow().isoformat() + "Z"
    plan["shiftsUsed"]  = shifts
    return plan

def save_plan(plan: dict):
    out_dir  = BASE / "data" / "ai-plans"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{plan['date']}.json"
    with open(out_path, "w") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved → {out_path}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=1, help="Number of days to generate (1-6)")
    parser.add_argument("--feedback", default="", help="Lead feedback to incorporate (for regeneration)")
    args = parser.parse_args()

    # feedback can also come from env var (set by GitHub Actions workflow)
    feedback = args.feedback or os.environ.get("LEAD_FEEDBACK", "")

    args.days = max(1, min(6, args.days))
    start     = datetime.strptime(args.date, "%Y-%m-%d").date()

    for i in range(args.days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        print(f"Generating plan for {d}…")
        try:
            plan = generate_plan(d, feedback=feedback)
            save_plan(plan)
        except Exception as e:
            print(f"✗ Error for {d}: {e}", file=sys.stderr)
            sys.exit(1)
