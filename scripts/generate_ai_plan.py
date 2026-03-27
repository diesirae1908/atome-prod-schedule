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
SYSTEM_PROMPT_BASE = """You are the production planner for Atome Bakery, a sourdough bakery in Singapore.

Your job: given the team on shift and the day's manufacturing orders, produce the best possible daily production schedule.

You have two sources of truth — read both carefully before planning:
1. The PRODUCTION GUIDE below — the bakery's official operations manual covering roles, timings, task rules, and daily patterns.
2. The REAL EXAMPLE PLANS in the user message — actual schedules written by the lead baker, showing exactly how the team works in practice.

Use the guide to understand the rules. Use the examples to understand how those rules play out on the floor.

━━━ HOW TO PLAN ━━━
Do NOT just generate tasks blindly. Follow this process:

STEP 1 — DRAFT: Build an initial plan for each baker based on MOs, roles, and examples.

STEP 2 — SELF-REVIEW (ask yourself all of these):
  • Does each baker's day flow logically? No task starts before its dependency is ready (e.g. can't unload PAC before it's mixed).
  • Are all MOs covered? Every product in the manufacturing orders must be assigned to someone.
  • Does the shaping workload fit before 15:30? Count batches × time per batch ÷ number of shapers.
  • Is there a gap in any baker's day? Every minute of their shift must be accounted for.
  • Do lunches make sense? Stagger them — not everyone at the same time.
  • Did I forget anything? Levain refresh, Score LOAF D-1 (if applicable), Mix BGT D+1?
  • Are task names consistent with the real examples (not invented)?

STEP 3 — ADJUST: Fix any issues found in Step 2 before outputting.

STEP 4 — OUTPUT: Emit the final JSON only.

━━━ ABSOLUTE LIMITS ━━━
- M (Mixer) NEVER does Lamination PAC — lamination is a Shaper (S) task only.
- Atome has NO OVEN. Never write oven, baking, or proofing chamber tasks.
- Every baker must have a continuous schedule with no gaps.
- Output: valid JSON only — no markdown, no explanation, no thinking text.
"""

# ---------------------------------------------------------------------------
# REAL EXAMPLES — loaded dynamically from data/plan-examples/
# ---------------------------------------------------------------------------
def load_real_examples(date_str: str, mo_summary: str, max_examples: int = 4) -> list[dict]:
    """Load human-created plans that best match today's production type."""
    examples_dir = BASE / "data" / "plan-examples"
    if not examples_dir.exists():
        return []

    all_examples = []
    for path in sorted(examples_dir.glob("*.json")):
        try:
            with open(path) as f:
                data = json.load(f)
            if data.get("source") == "human":
                all_examples.append(data)
        except Exception:
            continue

    if not all_examples:
        return []

    mo_lower = mo_summary.lower()
    has_pac      = "pac" in mo_lower
    has_ww       = "whole wheat" in mo_lower or " ww" in mo_lower
    has_ciabatta = "ciabatta" in mo_lower
    has_pizza    = "pizza" in mo_lower
    has_bgt      = "baguette" in mo_lower or "bgt" in mo_lower
    has_brioche  = "brioche" in mo_lower or "viennois" in mo_lower or "bun" in mo_lower
    target_dow   = day_of_week(date_str)

    def score(ex: dict) -> int:
        s = 0
        notes = ex.get("notes", "").lower()
        if ex.get("dayOfWeek") == target_dow:
            s += 4
        if has_pac and "pac" in notes:        s += 3
        if has_ww and ("ww" in notes or "whole wheat" in notes): s += 3
        if has_ciabatta and "ciabatta" in notes: s += 3
        if has_pizza and "pizza" in notes:    s += 3
        if has_bgt and "bgt" in notes:        s += 1
        if has_brioche and ("brioche" in notes or "bun" in notes): s += 2
        return s

    all_examples.sort(key=score, reverse=True)
    return all_examples[:max_examples]


def format_real_examples(examples: list[dict]) -> str:
    """Format real human plans as plain-text few-shot examples."""
    if not examples:
        return ""

    lines = [
        "━━━ REAL HUMAN-CREATED PLANS — learn exactly from these ━━━",
        "These schedules were written by the lead baker at Atome Bakery.",
        "Copy their task names, timing patterns, lunch placement, and end-of-day structure.",
        "",
    ]
    for i, ex in enumerate(examples, 1):
        date  = ex.get("date", "?")
        dow   = ex.get("dayOfWeek", "")
        notes = ex.get("notes", "")
        lines.append(f"── REAL EXAMPLE {i}: {date} ({dow}) — {notes} ──")
        for baker in ex.get("bakers", []):
            role  = baker.get("role", "?")
            tasks = baker.get("tasks", [])
            task_str = "  |  ".join(
                f"{t['start']}–{t['end']} {t['name']}" for t in tasks
            )
            lines.append(f"  {baker['name']} ({role}): {task_str}")
        lines.append("")
    return "\n".join(lines)


# (real examples loaded dynamically — see load_real_examples / format_real_examples above)

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
        return (
            SYSTEM_PROMPT_BASE
            + "\n\n━━━ PRODUCTION GUIDE — read this fully before planning ━━━\n"
            + guide
            + "\n━━━ END OF PRODUCTION GUIDE ━━━\n"
        )
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

def _get_hours(name: str, dow: str, baker_hours: dict) -> str:
    """Normalise baker name (strip accents) and look up their shift hours for the given day."""
    def _norm(s: str) -> str:
        return s.lower().replace("è","e").replace("é","e").replace("ê","e").replace("à","a").replace("â","a")
    for key in baker_hours:
        if _norm(key) == _norm(name):
            h = baker_hours[key].get(dow)
            if h:
                return h
    return "07:00 - 17:30"   # safe default


def inject_v_bakers(plan: dict, shifts: dict, shifts_data: dict, dow: str):
    """
    Add V (Vacuum) baker entries to the plan programmatically.
    V bakers have a fixed packaging schedule — no AI reasoning needed.
    """
    baker_hours = shifts_data.get("bakerHours", {})
    for baker_name, code in shifts.items():
        if code != "V":
            continue
        hours = _get_hours(baker_name, dow, baker_hours)
        parts = [p.strip() for p in hours.replace("–", "-").split("-")]
        start = parts[0] if parts else "07:00"
        end   = parts[1] if len(parts) > 1 else "15:30"

        # Fixed V baker schedule: carton prep → lunch → sticker prep → vacuum
        slug = baker_name.lower().replace(" ", "-")
        plan["bakers"].append({
            "name": baker_name,
            "role": "V",
            "tasks": [
                {"id": f"{slug}-1", "name": "Carton prep / Box assembly",
                 "start": start, "end": "11:30",
                 "color": "#64748b", "description": "Assemble cartons and prepare boxes"},
                {"id": f"{slug}-2", "name": "Lunch",
                 "start": "11:30", "end": "12:00",
                 "color": "#94a3b8", "description": "Break"},
                {"id": f"{slug}-3", "name": "Sticker prep",
                 "start": "12:00", "end": "15:00",
                 "color": "#64748b", "description": "Print and prepare product stickers / labels"},
                {"id": f"{slug}-4", "name": "Vacuum/Box/Stick",
                 "start": "15:00", "end": end,
                 "color": "#64748b", "description": "Vacuum pack, box, and sticker products"},
            ]
        })


def build_prompt(date_str: str, shifts: dict, day_data: dict, shifts_data: dict,
                 recent_plans: list[dict] | None = None, feedback: str = "") -> str:
    dow         = day_of_week(date_str)
    is_weekend  = dow in ("Saturday", "Sunday")
    mo_summary  = summarise_mos(day_data)
    baker_hours = shifts_data.get("bakerHours", {})

    # Build baker detail lines — V bakers are injected AFTER AI generation, skip them here
    baker_detail_lines = []
    for baker, code in shifts.items():
        if code in ("P&P", "H", "BD", "Sick", "V"):
            continue
        hours = _get_hours(baker, dow, baker_hours)
        baker_detail_lines.append(f"  - {baker} ({code}): {hours}")

    baker_details = "\n".join(baker_detail_lines) if baker_detail_lines else "  (none)"
    # Only M/S/Waffle bakers go to AI; V bakers injected later
    baker_names   = [b for b, c in shifts.items() if c not in ("P&P", "H", "BD", "Sick", "V")]
    baker_list    = ", ".join(baker_names)

    weekend_warning = (
        "\n⚠ WEEKEND: ONLY Baguette Trad + Loaf Trad today. "
        "No PAC, no waffles, no viennoiseries, no pastries whatsoever."
        if is_weekend else ""
    )

    # Load real human examples matching today's production type
    real_examples    = load_real_examples(date_str, mo_summary, max_examples=4)
    examples_section = format_real_examples(real_examples)
    if real_examples:
        print(f"  → Using {len(real_examples)} real human plan(s) as examples: "
              f"{', '.join(e['date'] for e in real_examples)}")

    recent_section   = format_recent_plans_for_prompt(recent_plans or [])
    feedback_section = (
        f"\n⚠ LEAD FEEDBACK (highest priority — incorporate this into the plan):\n{feedback}\n"
        if feedback.strip() else ""
    )

    # Determine if there are D-1 loaves to score (only if loaves were shaped yesterday)
    has_loaf_d1 = any(
        s.get("name", "").lower() in ("loaf trad", "whole wheat", "country", "ciabatta")
        or any(k in s.get("name", "").lower() for k in ["loaf", "ww", "country", "ciabatta"])
        for s in load_schedule_for_date(
            (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        ).get("shaping", [])
    )
    score_loaf_rule = (
        "- Score LOAF D-1: 09:00–09:30 — loaves were shaped yesterday, score them first."
        if has_loaf_d1 else
        "- Score LOAF D-1: skip — no loaves were shaped yesterday."
    )

    return f"""{examples_section}

{recent_section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN THIS DAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DATE: {date_str} ({dow}){weekend_warning}

TEAM ON SHIFT (every person listed must appear in the output):
{baker_details}

MANUFACTURING ORDERS:
{mo_summary}

{feedback_section}CONTEXT:
{score_loaf_rule}
- The mixer always prepares tomorrow's baguette dough (Mix BGT D+1), even if baguettes aren't in today's MOs.
- PAC sequencing: the mixer mixes PAC first (ends ~09:10). Bakers CANNOT unload or touch PAC dough until ~09:15–09:20. Baker 09:00 first tasks must be Score LOAF D-1 or Preshape BGT — never "Unload PAC" at 09:00.
- Use the real examples above as your main reference for how this bakery actually works — task names, timing patterns, how bakers share work, when Mehdi transitions to shaping, etc.
- Flag any scheduling risks (tight timing, understaffing, tasks likely to overflow 15:30) in the warnings array. Leave warnings empty [] if the day looks fine.

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

    # Inject V baker schedules programmatically (never delegated to AI)
    dow = day_of_week(date_str)
    inject_v_bakers(plan, shifts, shifts_data, dow)

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
