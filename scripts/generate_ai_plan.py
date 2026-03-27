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
# Embedded Guide de Production
# ---------------------------------------------------------------------------
GUIDE = """
=== ATOME BAKERY — STRICT PRODUCTION RULES ===

⚠ CRITICAL FACTS — NEVER IGNORE:
- Atome Bakery has NO OVEN. Do NOT schedule any oven-related tasks.
- Do NOT invent tasks. Every task must correspond to a real production action listed below.
- Do NOT add generic tasks like "check in", "check out", "facility inspection", "workspace prep",
  "inventory check", "equipment calibration", or any vague maintenance task unless there is literally
  nothing else to do that day.
- Do NOT underestimate shaping times. Use EXACTLY the durations specified below.
- Every baker must be scheduled from their shift START TIME until the end of their shift.

SHIFT START TIMES (use exact times from the baker info provided):
- Mixer (M): starts 07:00, ends 12:00
- Shaper/Baker (S): starts 09:00, ends 17:30
- Vacuum (V): starts 07:00 or 09:00 (see baker info), ends 15:30 or 17:30
  → In the MORNING (before 13:00), vacuum team members help with shaping, PAC lamination,
    pre-shaping baguettes, or any production task that needs extra hands.
  → From 13:00 onward: prepare vacuum station, organise bags and cartons, sticker prep.
  → From 15:30: full vacuum mode — all bakers switch to vacuum (sous vide, cartons, stickers).
- Waffles (Théo): starts 09:00

HARD RULES — ALWAYS APPLY:
1. ALL production finishes by 15:30. From 15:30 to end of shift: VACUUM for everyone.
2. Mixer: 07:00–12:00 max, maximum 3 batches simultaneously.
3. Baguettes are ALWAYS mixed the day BEFORE (D-1) by the mixer — NEVER the same day.
4. Loaves/WW/Country/Pizza/Ciabatta are mixed the DAY OF — ALWAYS first priority for mixer.
5. PAC shaping is ALWAYS 13:00–15:30 ONLY. Never in the morning.
6. First task for shapers at 09:00–09:30: score loaves from yesterday (J-1).
7. Weekend (Sat/Sun): ONLY Baguette Trad + Loaf Trad. No pastries, no waffles, no PAC.

MIXER DAILY TASK ORDER:
1. 07:00 → Mix loaves / WW / Country / Pizza / Ciabatta (whichever is in MOs today)
2. 10:00–11:00 → Refresh levain (every single day without exception)
3. After loaves → Mix baguette dough for TOMORROW (D-1)
4. If waffles scheduled: mix waffle dough early morning
5. If pastries tomorrow: measure ingredients before 12:00

EXACT SHAPING DURATIONS (do not shorten):
- Whole Wheat (WW):  1h20 per batch (20 kg flour per batch)
- Country (CTY):     1h20 per batch (20 kg flour per batch)
- Loaf Trad:         1h00 per batch (20 kg flour per batch)
- Ciabatta:          1h00 per batch (20 kg flour per batch)
- Pizza:             1h30 per batch (25 kg flour per batch)
- Cheese Baguettes:  3 batches fixed → 40 min cheese cutting + 1h30 shaping = 1 dedicated baker
- Baguette Trad/MG:  pre-shape (09:00–10:00, multiple bakers together) + final shape (1 baker, 10:00–12:00)
- Baguette Sesame/Poppy: pre-shape together + final shape with 2 bakers obligatory

VIENNOISERIES (baker-hours, spread across available viennois bakers):
- Brioches 200 pcs: 8 baker-hours total
- Viennoiseries: 8 baker-hours total
- Buns: 5 baker-hours total, must finish before 15:30
- PAC lamination: 10:20–12:40 (1–2 bakers)
- PAC shaping: 13:00–15:30 (2–4 bakers simultaneously)

WAFFLES (Théo only):
- 22.68 kg: needs 1 relay baker 12:00–13:00 during Théo's break
- 15 kg: Théo alone, no relay needed
- No waffles on Sat/Sun

MEHDI (flexible):
- When assigned M: works alongside Kuba or Lavish. Primary mixer fills their tasks first.
  When mixer is less needed, Mehdi switches to shaping (S) tasks.
- When assigned S: treat as a regular shaper.

VACUUM TEAM MORNING ROLE (important):
- Vacuum team (V) members arrive at their shift start (07:00 or 09:00).
- Before 13:00: they help with production — pre-shaping baguettes, PAC lamination,
  assisting shapers, or any task that needs extra hands based on the MOs.
- 13:00–15:30: set up vacuum station, prepare bags, cartons, stickers.
- 15:30–end: full vacuum (sous vide, cartons, stickers) with all bakers.

STANDARD DAILY PATTERN:
07:00        Mixer: start mixing loaves (priority 1)
08:40–09:10  Mixer: mix PAC batter if PAC day
09:00–09:30  All shapers: score loaves from yesterday (J-1)
09:00–10:00  Shapers + vacuum team: pre-shape baguettes together
09:30–13:00  Shapers: shape loaves/WW/Country/Pizza (1–2 bakers per product)
10:00–12:00  1 baker: final shape baguettes Trad/MG
10:00–11:30  1 baker: cheese baguettes (if scheduled)
10:00–11:00  Mixer: levain refresh
11:30–12:00  Score baguettes
13:00–15:30  Bakers: PAC shaping / viennoiseries / buns
15:30–17:30  EVERYONE: vacuum (sous vide, cartons, stickers)
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
BASE = Path(__file__).parent.parent   # prod-schedule/

def load_schedule_for_date(date_str: str) -> dict:
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

def load_shifts_data() -> dict:
    path = BASE / "data" / "shifts.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

def day_of_week(date_str: str) -> str:
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%A")

def summarise_mos(day_data: dict) -> str:
    if not day_data:
        return "No manufacturing orders found for this date."
    lines = []
    for mop in day_data.get("mops", []):
        name    = mop.get("name") or mop.get("id", "Unknown")
        qty     = mop.get("qty", "?")
        unit    = mop.get("unit", "")
        batches = mop.get("batches", "")
        line    = f"- {name}: {qty} {unit}"
        if batches:
            line += f" ({batches} batch{'es' if batches != 1 else ''})"
        lines.append(line)
    return "\n".join(lines) if lines else "No MOs specified — light day, only mandatory daily tasks."

def build_prompt(date_str: str, shifts: dict, day_data: dict, shifts_data: dict) -> str:
    dow        = day_of_week(date_str)
    is_weekend = dow in ("Saturday", "Sunday")
    mo_summary = summarise_mos(day_data)
    baker_hours = shifts_data.get("bakerHours", {})

    # Group bakers by role and look up their actual working hours
    roles: dict[str, list] = {"M": [], "S": [], "V": [], "Waffle": [], "P&P": []}
    baker_detail_lines = []
    for baker, code in shifts.items():
        if code in roles:
            roles[code].append(baker)
        hours = baker_hours.get(baker, {}).get(dow, "unknown hours")
        if code not in ("P&P", "H", "BD", "Sick"):
            baker_detail_lines.append(f"  - {baker} ({code}): {hours}")

    baker_details = "\n".join(baker_detail_lines) if baker_detail_lines else "  (none)"

    return f"""You are a strict production planner for Atome Bakery. Generate a precise daily schedule.

DATE: {date_str} ({dow})

=== TEAM TODAY (name, role, working hours) ===
{baker_details}

=== MANUFACTURING ORDERS FOR TODAY ===
{mo_summary}
{'⚠ WEEKEND RULES: ONLY Baguette Trad + Loaf Trad. Absolutely no pastries, waffles, PAC, or viennoiseries.' if is_weekend else ''}

=== PRODUCTION RULES — FOLLOW EXACTLY ===
{GUIDE}

=== INSTRUCTIONS ===
- Schedule EVERY baker from their shift start time shown above.
- Use EXACT shaping durations from the guide — never shorten them.
- Vacuum team (V) must have real production tasks in the morning, not fake tasks.
- If there are no MOs today: schedule only mandatory daily tasks (levain refresh, D-1 baguette mix,
  equipment cleaning if needed) and keep the plan minimal and honest.
- NEVER mention ovens, oven temperature, or any oven-related task.
- NEVER add "check in", "check out", "facility inspection", or invented admin tasks.
- Tasks must be specific and match real bakery work.

Return ONLY valid JSON (no markdown fences, no explanation):
{{
  "date": "{date_str}",
  "dayOfWeek": "{dow}",
  "generatedAt": "ISO8601",
  "notes": "one sentence summary for team lead",
  "bakers": [
    {{
      "name": "BakerName",
      "role": "M|S|V|Waffle",
      "tasks": [
        {{
          "id": "unique-id",
          "name": "Specific task name",
          "start": "HH:MM",
          "end": "HH:MM",
          "color": "#hex",
          "description": "brief detail if needed"
        }}
      ]
    }}
  ]
}}

Colors: Mixer=#6366f1, Shaping=#10b981, Baguettes=#f59e0b, PAC=#ec4899, Vacuum=#64748b, Waffles=#f97316, Levain=#8b5cf6, Scoring=#06b6d4, Viennoiseries=#e879f9, Misc=#94a3b8
"""

def generate_plan(date_str: str) -> dict:
    client      = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    shifts_data = load_shifts_data()
    shifts      = shifts_data.get("schedule", {}).get(date_str, {})
    day_data    = load_schedule_for_date(date_str)

    prompt = build_prompt(date_str, shifts, day_data, shifts_data)

    message = client.messages.create(
        model="claude-sonnet-4-5",   # Sonnet for better instruction-following
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
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
    args = parser.parse_args()

    args.days = max(1, min(6, args.days))
    start     = datetime.strptime(args.date, "%Y-%m-%d").date()

    for i in range(args.days):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        print(f"Generating plan for {d}…")
        try:
            plan = generate_plan(d)
            save_plan(plan)
        except Exception as e:
            print(f"✗ Error for {d}: {e}", file=sys.stderr)
            sys.exit(1)
