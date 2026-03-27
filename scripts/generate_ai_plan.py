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
SYSTEM_PROMPT = """You are the production planner for Atome Bakery. Your ONLY job is to assign tasks to bakers for a given day.

━━━ ABSOLUTE CONSTRAINTS ━━━
1. ONLY use task names from the ALLOWED TASK LIST below. NEVER invent new task names.
2. Atome Bakery has NO OVEN. Never write any oven-related task.
3. Schedule EVERY baker listed — do not drop anyone.
4. Every baker's tasks must cover their FULL shift with NO gaps and NO overlaps.
5. Tasks must follow the TIMING RULES exactly.

━━━ ALLOWED TASK LIST (use ONLY these names, with product/batch details in description) ━━━

MIXER tasks (role M):
  - Mix LOAF
  - Mix WW
  - Mix CTY
  - Mix PIZ
  - Mix Ciabatta
  - Mix BGT (D+1)        ← baguette dough for next day, always
  - Mix PAC batter
  - Mix WAF dough
  - Fold LOAF / Fold WW / Fold CTY / Fold PIZ / Fold BGT
  - Refresh levain       ← every single day, no exception
  - Measuring future mixes
  - Clean Mixer
  - Dishes
  - Kitchen Organization
  - Vacuum/Box/Stick

SHAPER tasks (role S) and VACUUM morning assist (role V before 13:00):
  - Score LOAF D-1        ← always 09:00–09:30, all shapers together
  - Preshape BGT          ← 09:00–10:00, shapers + vacuum team together
  - Shape LOAF
  - Shape WW
  - Shape CTY
  - Shape PIZ
  - Shape Ciabatta
  - Shape BGT Trad
  - Shape BGT MG
  - Shape BGT Sesame
  - Shape BGT Poppy
  - Shape Cheese BGT      ← includes cheese cutting
  - Score BGT             ← after final shaping, ~11:30–12:00
  - Lamination PAC        ← 10:20–12:40
  - Shape PAC             ← 13:00–15:30 ONLY
  - Shape Bun             ← finish before 15:30
  - Shape Brioche
  - Shape Viennoiseries
  - Lunch                 ← 12:00–13:00 for shapers who need it
  - Vacuum/Box/Stick      ← 15:30 to end of shift, ALL bakers
  - Clean end of day

VACUUM team tasks (role V):
  - [Any SHAPER task above] before 13:00 — vacuum team helps with real production
  - Sticker prep / Bag & carton prep   ← 13:00–15:30
  - Vacuum/Box/Stick                   ← 15:30 to end of shift

WAFFLE tasks (role Waffle — Théo):
  - Setup WAF
  - Bake WAF
  - Packaging WAF
  - Lunch

━━━ TIMING RULES ━━━
- Mixer (M): works 07:00 – end of their shift (usually 12:00 or 15:30)
- Shapers (S): first task 09:00 (Score LOAF D-1), end of shift 17:30 or 15:30
- Vacuum (V): start at their shift start (07:00 or 09:00)
  • Before 13:00 → help with real production (Preshape BGT, Shape LOAF, Lamination PAC, etc.)
  • 13:00–15:30 → Sticker prep / Bag & carton prep
  • 15:30–end → Vacuum/Box/Stick
- Loaves/WW/CTY/PIZ/Ciabatta: mixed day-of starting 07:00 (mixer priority 1)
- Baguettes: ALWAYS mixed D+1 (i.e. today the mixer mixes tomorrow's baguette dough)
- PAC shaping: 13:00–15:30 ONLY — never in the morning
- Score LOAF D-1: always 09:00–09:30, all shapers present
- Preshape BGT: 09:00–10:00, all available bakers (shapers + vacuum) together
- Refresh levain: 10:00–11:00, mixer does this every day
- Final shape BGT: 10:00–12:00, 1 dedicated baker
- Score BGT: ~11:30–12:00
- Vacuum/Box/Stick: 15:30 to end of shift — EVERYONE switches to vacuum

━━━ SHAPING DURATIONS (exact — do not shorten) ━━━
- Shape LOAF:       1h00 per batch (20 kg flour)
- Shape WW:         1h20 per batch (20 kg flour)
- Shape CTY:        1h20 per batch (20 kg flour)
- Shape PIZ:        1h30 per batch (25 kg flour)
- Shape Ciabatta:   1h00 per batch (20 kg flour)
- Shape Cheese BGT: 2h10 total (40 min cheese cutting + 1h30 shaping), 1 baker
- Shape PAC:        2h30 total (13:00–15:30), 2–4 bakers
- Lamination PAC:   2h20 total (10:20–12:40), 1–2 bakers
- Shape Bun:        up to 5 baker-hours, finish by 15:30

━━━ WEEKEND RULE ━━━
Saturday/Sunday: ONLY Baguette Trad + Loaf Trad. No PAC, no waffles, no viennoiseries, no pastries.

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON — no markdown, no explanation, no comments.
"""

# ---------------------------------------------------------------------------
# FEW-SHOT EXAMPLES — two real representative days
# ---------------------------------------------------------------------------
FEW_SHOT_EXAMPLES = """
Below are two real daily plans from Atome Bakery. Use these as templates for structure, task names, timing, and coverage.

━━━ EXAMPLE 1 — Wednesday, full production day ━━━
Team: Kuba (M, 07:00–12:00), Lavish (M, 07:00–12:00), Alice (S, 09:00–17:30), Bob (S, 09:00–17:30), Carla (V, 07:00–15:30), Diana (V, 09:00–17:30)
MOs: LOAF Trad 80kg (4 batches), BGT Trad 60kg (3 batches D+1), PAC Chocolat 12 patons

{
  "date": "EXAMPLE-1",
  "dayOfWeek": "Wednesday",
  "notes": "Full day: 4 LOAF batches, PAC afternoon, baguette dough for tomorrow.",
  "bakers": [
    {
      "name": "Kuba",
      "role": "M",
      "tasks": [
        {"id": "k1","name":"Mix LOAF","start":"07:00","end":"08:00","color":"#6366f1","description":"Batch 1+2 — 40kg flour"},
        {"id": "k2","name":"Mix LOAF","start":"08:00","end":"09:00","color":"#6366f1","description":"Batch 3+4 — 40kg flour"},
        {"id": "k3","name":"Fold LOAF","start":"09:00","end":"09:30","color":"#6366f1","description":"All 4 batches"},
        {"id": "k4","name":"Refresh levain","start":"10:00","end":"11:00","color":"#8b5cf6","description":"Daily levain refresh"},
        {"id": "k5","name":"Mix BGT (D+1)","start":"11:00","end":"12:00","color":"#6366f1","description":"3 batches baguette dough for tomorrow"}
      ]
    },
    {
      "name": "Lavish",
      "role": "M",
      "tasks": [
        {"id": "l1","name":"Mix PAC batter","start":"07:00","end":"08:40","color":"#ec4899","description":"12 patons PAC Chocolat"},
        {"id": "l2","name":"Fold LOAF","start":"08:40","end":"09:00","color":"#6366f1","description":"Assist Kuba"},
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
        {"id": "a2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"Preshape baguettes with team"},
        {"id": "a3","name":"Shape LOAF","start":"10:00","end":"12:00","color":"#10b981","description":"Batch 1+2"},
        {"id": "a4","name":"Lunch","start":"12:00","end":"13:00","color":"#94a3b8","description":""},
        {"id": "a5","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Chocolat, 12 patons"},
        {"id": "a6","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Bob",
      "role": "S",
      "tasks": [
        {"id": "b1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":"Score yesterday's loaves"},
        {"id": "b2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"Preshape baguettes with team"},
        {"id": "b3","name":"Shape BGT Trad","start":"10:00","end":"12:00","color":"#f59e0b","description":"Final shape 3 batches"},
        {"id": "b4","name":"Score BGT","start":"12:00","end":"12:30","color":"#06b6d4","description":"Score all baguettes"},
        {"id": "b5","name":"Shape LOAF","start":"12:30","end":"13:00","color":"#10b981","description":"Batch 3+4"},
        {"id": "b6","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Chocolat assist"},
        {"id": "b7","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Carla",
      "role": "V",
      "tasks": [
        {"id": "c1","name":"Preshape BGT","start":"07:00","end":"10:00","color":"#f59e0b","description":"Prepare baguette dough from yesterday"},
        {"id": "c2","name":"Shape LOAF","start":"10:00","end":"12:00","color":"#10b981","description":"Assist shapers, batch 3+4"},
        {"id": "c3","name":"Sticker prep / Bag & carton prep","start":"13:00","end":"15:30","color":"#64748b","description":"Prepare vacuum station"},
        {"id": "c4","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Diana",
      "role": "V",
      "tasks": [
        {"id": "d1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":""},
        {"id": "d2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":""},
        {"id": "d3","name":"Lamination PAC","start":"10:20","end":"12:40","color":"#ec4899","description":"12 patons PAC Chocolat"},
        {"id": "d4","name":"Sticker prep / Bag & carton prep","start":"13:00","end":"15:30","color":"#64748b","description":""},
        {"id": "d5","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    }
  ]
}

━━━ EXAMPLE 2 — Friday, lighter day with WW + PAC ━━━
Team: Mehdi (M, 07:00–15:30), Natalia (S, 09:00–17:30), Joyie (S, 09:00–17:30), Ysaline (V, 07:00–15:30)
MOs: WW 40kg (2 batches), BGT MG 40kg (2 batches D+1), PAC Framboise 8 patons

{
  "date": "EXAMPLE-2",
  "dayOfWeek": "Friday",
  "notes": "2 WW batches, PAC afternoon, baguette MG dough for tomorrow.",
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
        {"id": "m6","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Natalia",
      "role": "S",
      "tasks": [
        {"id": "n1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":""},
        {"id": "n2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"BGT MG preshape"},
        {"id": "n3","name":"Shape WW","start":"10:00","end":"11:20","color":"#10b981","description":"Batch 1"},
        {"id": "n4","name":"Shape WW","start":"11:20","end":"12:40","color":"#10b981","description":"Batch 2"},
        {"id": "n5","name":"Lunch","start":"12:40","end":"13:00","color":"#94a3b8","description":""},
        {"id": "n6","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Framboise 8 patons"},
        {"id": "n7","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Joyie",
      "role": "S",
      "tasks": [
        {"id": "j1","name":"Score LOAF D-1","start":"09:00","end":"09:30","color":"#06b6d4","description":""},
        {"id": "j2","name":"Preshape BGT","start":"09:30","end":"10:00","color":"#f59e0b","description":"BGT MG preshape"},
        {"id": "j3","name":"Shape BGT MG","start":"10:00","end":"12:00","color":"#f59e0b","description":"Final shape 2 batches"},
        {"id": "j4","name":"Score BGT","start":"12:00","end":"12:30","color":"#06b6d4","description":""},
        {"id": "j5","name":"Shape PAC","start":"13:00","end":"15:30","color":"#ec4899","description":"PAC Framboise assist"},
        {"id": "j6","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    },
    {
      "name": "Ysaline",
      "role": "V",
      "tasks": [
        {"id": "y1","name":"Preshape BGT","start":"07:00","end":"10:00","color":"#f59e0b","description":"Prepare baguette dough from yesterday"},
        {"id": "y2","name":"Lamination PAC","start":"10:20","end":"12:40","color":"#ec4899","description":"8 patons PAC Framboise"},
        {"id": "y3","name":"Sticker prep / Bag & carton prep","start":"13:00","end":"15:30","color":"#64748b","description":""},
        {"id": "y4","name":"Vacuum/Box/Stick","start":"15:30","end":"17:30","color":"#64748b","description":""}
      ]
    }
  ]
}
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
    return "\n".join(lines) if lines else "No MOs specified — schedule only mandatory tasks: levain refresh + Mix BGT (D+1)."

def build_prompt(date_str: str, shifts: dict, day_data: dict, shifts_data: dict) -> str:
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

    return f"""{FEW_SHOT_EXAMPLES}

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

=== REMINDERS ===
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

def generate_plan(date_str: str) -> dict:
    client      = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    shifts_data = load_shifts_data()
    shifts      = shifts_data.get("schedule", {}).get(date_str, {})
    day_data    = load_schedule_for_date(date_str)

    prompt = build_prompt(date_str, shifts, day_data, shifts_data)

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8096,
        system=SYSTEM_PROMPT,
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
