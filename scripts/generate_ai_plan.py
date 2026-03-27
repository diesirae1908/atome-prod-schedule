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
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic

# ---------------------------------------------------------------------------
# Embedded Guide de Production (static rules — never re-fetched)
# ---------------------------------------------------------------------------
GUIDE = """
=== ATOME BAKERY — PRODUCTION GUIDE ===

SHIFTS:
- Mixer (M):         07:00 → 12:00  (5h shift)
- Shaper/Baker (S):  09:00 → 17:30
- Vacuum (V):        13:30 → 17:30 (full switch at 15:30)
- Pick & Pack (P&P): variable — NOT in daily planner
- Waffles (Théo):    09:00 → end of baking

HARD RULES:
1. ALL production MUST finish by 15:30. Shapers switch to Vacuum 15:30-17:30.
2. Mixer starts at 07:00, ends 12:00. Max 3 batches simultaneous in mixer.
3. Bakers (S) start at 09:00.
4. FIRST task every morning (09:00-09:30): score loaves from J-1.
5. Baguettes are ALWAYS mixed the day before (D-1) by the mixer — never same day.
6. All loaves/WW/Country/Pizza/Ciabatta are mixed the day of — ALWAYS first priority for mixer.
7. PAC shaping is ALWAYS afternoon only (13:00-15:30). Never shape PAC in the morning.
8. Week-end (Sat/Sun): only Baguette Trad + Loaf Trad — NO pastries, NO waffles, NO PAC.

MIXER DAILY TASKS (every day):
- Refresh levain (~10:00-11:00)
- Mix loaves/WW/Country/Pizza/Ciabatta for today (priority 1)
- Mix baguette dough for TOMORROW (D-1) — after loaves
- If waffles scheduled: mix waffle dough in the morning
- If pastries tomorrow: measure ingredients in the afternoon

SHAPING TIMES:
- Whole Wheat (WW):  1h20 / batch (20kg flour)
- Country (CTY):     1h20 / batch (20kg flour)
- Loaf Trad:         1h00 / batch (20kg flour)
- Ciabatta:          1h00 / batch (20kg flour)
- Pizza:             1h30 / batch (25kg flour)
- Cheese Baguettes:  always 3 batches, ~1h30 total + 40 min cheese cutting (1 baker)
- Baguette Trad/MG:  pre-shape = multiple bakers together, final shape = 1 baker only
- Baguette Sesame/Poppy: pre-shape together, final shape = 2 bakers obligatory

BATCH SIZES:
- Pastries (brioches, viennoiseries, PAC): 22.68 kg
- Pizza: 25 kg pizza flour
- Loaf Trad / Country / Ciabatta / WW: 20 kg white flour

VIENNOISERIES:
- Brioches (200 pcs):   8h total — spread across viennois bakers
- Viennoiseries general: 8h total — spread
- Buns:                  5h total — finish before 15:30
- PAC lamination:        10:20-12:40 (1-2 bakers)
- PAC shaping:           13:00-15:30 (2-4 bakers simultaneously)

WAFFLES (Théo):
- 22.68 kg: Théo needs relay baker at noon during his break
- 15 kg: Théo manages alone, can stop during break
- No waffles on Sat/Sun

MEHDI: Flexible — can be Mixer (M) or Shaper (S).
When M: always has Kuba or Lavish alongside. Fill primary mixer first; Mehdi supports then switches to Shaper.

DAILY PATTERN (standard bread day):
07:00        Mixer starts — mix loaves + refresh levain
08:40-09:10  Mix PAC if PAC day (mixer)
09:00-09:30  Score loaves J-1 (1-2 bakers)
09:00-10:00  Pre-shape baguettes (2-3 bakers together)
09:30-13:00  Shape loaves/WW/Country/Pizza (1-2 bakers)
10:00-12:00  Shape baguettes Trad/MG (1 baker only)
10:00-11:30  Shape cheese baguettes if scheduled (1 baker)
11:30-12:00  Score baguettes
13:00-15:30  PAC shaping / viennoiseries / buns (if scheduled)
15:30-17:30  VACUUM — all bakers (sous vide, cartons, stickers)
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
BASE = Path(__file__).parent.parent   # prod-schedule/

def load_schedule_for_date(date_str: str) -> dict:
    """Load MOs from schedule.json for a specific date."""
    path = BASE / "schedule.json"
    if not path.exists():
        return {}
    with open(path) as f:
        schedule = json.load(f)
    days = schedule if isinstance(schedule, list) else schedule.get("days", [])
    for day in days:
        if day.get("date") == date_str:
            return day
    return {}

def load_shifts_for_date(date_str: str) -> dict:
    """Load baker shifts for a specific date from shifts.json."""
    path = BASE / "data" / "shifts.json"
    if not path.exists():
        return {}
    with open(path) as f:
        shifts = json.load(f)
    return shifts.get("schedule", {}).get(date_str, {})

def day_of_week(date_str: str) -> str:
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return d.strftime("%A")

def summarise_mos(day_data: dict) -> str:
    """Convert schedule day data to a readable MO summary."""
    if not day_data:
        return "No manufacturing orders found for this date."
    lines = []
    for mop in day_data.get("mops", []):
        name = mop.get("name") or mop.get("id", "Unknown")
        qty = mop.get("qty", "?")
        unit = mop.get("unit", "")
        batches = mop.get("batches", "")
        line = f"- {name}: {qty} {unit}"
        if batches:
            line += f" ({batches} batch{'es' if batches != 1 else ''})"
        lines.append(line)
    return "\n".join(lines) if lines else "No MOs specified."

def build_prompt(date_str: str, shifts: dict, day_data: dict) -> str:
    dow = day_of_week(date_str)
    is_weekend = dow in ("Saturday", "Sunday")
    mo_summary = summarise_mos(day_data)

    # Group bakers by role
    roles: dict[str, list] = {"M": [], "S": [], "V": [], "Waffle": [], "P&P": []}
    for baker, code in shifts.items():
        if code in roles:
            roles[code].append(baker)
        # ignore H, BD, Sick, P&P

    return f"""You are an expert bakery production planner for Atome Bakery.
Create a detailed daily production schedule for {date_str} ({dow}).

=== TEAM PRESENT TODAY ===
Mixers (M): {', '.join(roles['M']) or 'NONE'}
Shapers/Bakers (S): {', '.join(roles['S']) or 'NONE'}
Vacuum (V): {', '.join(roles['V']) or 'NONE (shapers cover vacuum from 15:30)'}
Waffles: {', '.join(roles['Waffle']) or 'None'}

=== MANUFACTURING ORDERS ===
{mo_summary}
{'⚠ WEEKEND: only Baguette Trad + Loaf Trad allowed. No pastries, waffles, PAC.' if is_weekend else ''}

=== PRODUCTION RULES ===
{GUIDE}

=== OUTPUT FORMAT ===
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{{
  "date": "{date_str}",
  "dayOfWeek": "{dow}",
  "generatedAt": "ISO8601 timestamp",
  "notes": "brief overall notes for team lead",
  "bakers": [
    {{
      "name": "BakerName",
      "role": "M|S|V|Waffle",
      "tasks": [
        {{
          "id": "unique-id",
          "name": "Task name",
          "start": "HH:MM",
          "end": "HH:MM",
          "color": "#hex",
          "description": "optional detail"
        }}
      ]
    }}
  ]
}}

Color guide: Mixer tasks=#6366f1, Shaping=#10b981, Baguettes=#f59e0b, PAC=#ec4899, Vacuum=#64748b, Waffles=#f97316, Levain=#8b5cf6, Scoring=#06b6d4, Viennoiseries=#e879f9, Misc=#94a3b8

Only include bakers who are actually present today. Ensure all tasks fit between each baker's shift start and 17:30. Production must finish by 15:30.
"""

def generate_plan(date_str: str) -> dict:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    shifts = load_shifts_for_date(date_str)
    day_data = load_schedule_for_date(date_str)

    prompt = build_prompt(date_str, shifts, day_data)

    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    plan = json.loads(raw)
    plan["generatedAt"] = datetime.utcnow().isoformat() + "Z"
    plan["shiftsUsed"] = shifts
    return plan

def save_plan(plan: dict):
    out_dir = BASE / "data" / "ai-plans"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{plan['date']}.json"
    with open(out_path, "w") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved plan → {out_path}")

# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="Start date YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=1, help="Number of days to generate (1-6)")
    args = parser.parse_args()

    args.days = max(1, min(6, args.days))
    start = datetime.strptime(args.date, "%Y-%m-%d").date()

    for i in range(args.days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        print(f"Generating plan for {d}…")
        try:
            plan = generate_plan(d)
            save_plan(plan)
        except Exception as e:
            print(f"✗ Error for {d}: {e}", file=sys.stderr)
            sys.exit(1)
