# JOURNAL

Dated work log for the `atome-prod-schedule` repo, newest entry first.

---

## 2026-07-23 — Deployed to main (Lucas's go, ~5:12 PM PT)

Merged `sam/baptiste-jul23` → main (`145e424`, after merging in the day's auto-refresh commits). GitHub Pages rebuilt successfully; refresh workflow triggered manually — live `data/schedule.json` now spans 5 weeks ahead (through Aug 23) and the waffle butter tasks verified in prod (4 WA3P-SGL MOs, butter-out on D-2 / cut-butter on D-1 for each). Note: `remind-rotate-api-key.yml` fails on every push (0s, pre-existing since ≤Jun 12) — unrelated, flagged for cleanup.

---

## 2026-07-23 — Baptiste's 4 requests (branch `sam/baptiste-jul23`)

Dispatched by Sam (Lucas's assistant) to implement 4 fixes Baptiste (ops) requested. Worked in an isolated git worktree (`../prod-schedule-baptiste`, branched from `origin/main` at `c250bcf`) because the primary working tree had unrelated uncommitted WIP (Apex bridge + sidebar refactor) that had to stay untouched, and was 281 commits behind `origin/main`.

### 1. Waffle butter tasks — done

- Found the waffle SKU: **`WA3P-SGL`** (Liège Waffle ×3) is the only product with `dough_type: "WAFFLES"` in `config/products.json`. It already had one premix task (`"Prep mix Waffles"` at D-1).
- The old `premix_offset`/`premix_label` fields only supported **one** pre-task per product. Extended `scripts/fetch_schedule.py` with a new `get_premix_tasks(cfg)` helper that reads an optional **list** form, `"premix_tasks": [{"offset": -1, "label": "..."}, ...]`, and still honors the legacy singular `premix_offset`/`premix_label` fields (both forms can even combine on the same product) — fully backward compatible, no other product config needed to change.
- Configured `WA3P-SGL` with three pre-tasks: `Prep mix Waffles` (D-1, unchanged), `Cut butter` (D-1, new), `Take butter out of the freezer` (D-2, new).
- No frontend change needed — `index.html`'s premix row already renders `day.premix` as a list, so multiple pills per day "just work."
- **Not extended:** the "setup-needed" modal (used when Odoo has an unconfigured SKU) still only writes a single `premix_offset`/`premix_label` pair. Supporting multi-pre-task entry there would be a UX addition — left as a follow-up, not required for this request.

### 2. Monthly cleaning tasks spacing — verified, no functional change needed

- Found the recurring-task mechanism: `RECURRING_TASKS` array in `index.html` (client-side, rendered in the SHAPING row of the weekly schedule). `divider_deep` fires on calendar day 1, `divider_inside` on day 15.
- **Checked the math carefully before touching anything:** day 1 and day 15 are always exactly 14 days apart within a month, and the cross-month gap (day 15 → next day 1) is always 14–17 days depending on month length. Since weeks are fixed 7-day blocks, any 14-day gap always lands in a *different* Monday–Sunday week — simulated this in Python across every month of 2025, 2026, and 2027: **never once landed in the same calendar week, gap never below 14 days.** This was clearly an intentional design choice from when the feature was first added (commit `a6d23b4`, Apr 21 2026).
- Given it's already correctly spaced, I did **not** change the `monthly_day` anchors (doing so — e.g. switching to a fixed-interval "anchor" system like the biweekly Levain-machine task — would change the cadence from "once a calendar month" to "every 4 weeks," a real behavior/UX change nobody asked for and I didn't want to guess at).
- What I did change: added a code comment documenting the verified invariant (so nobody "fixes" this into a bug later), and corrected the `divider_inside` label wording to match Baptiste's exact phrasing — `"(don't remove white blocks)"` instead of `"(keep white blocks)"`. Cosmetic only; the `slug` (used as the localStorage/Supabase check-state key) is unchanged, so no data migration needed.

### 3. Daily planner deletion bug — root cause fixed in code; data cleanup NOT done (escalating)

**Root cause found and fixed:** `headpaper/app.js`'s `deleteTask()` and `quickDeleteTask()` (delete a task from the task library) tried to remove that task's placed instances from `state.schedule` with `state.schedule[date][bakerIndex][time] === taskId`. But every scheduled slot actually stores an **instanceId** string (`taskId|startTime|bakerIndex|timestamp`, or old-format `taskId_startTime_bakerIndex`) — or an *array* of them for overlapping tasks — never the bare `taskId`. That comparison can never match, so deleting a task from the library left every already-placed instance of it dangling forever in `state.schedule` and `state.scheduledTaskInstances`, across every date it had ever been scheduled on. Added a `purgeTaskFromSchedule(taskId)` helper that correctly parses the instanceId (both formats, both single-value and array slots) and removes every matching instance + its `scheduledTaskInstances` entry, then wired it into both delete functions. Verified with a standalone Node test simulating exactly this scenario (single instance, array/overlap instance, old-format instance, instance on another date) — all assertions passed; unrelated tasks were untouched.

**Data cleanup — hit the tripwire, did NOT delete anything:**
- Searched the entire repo (`data/schedule.json`, `data/shifts.json`, `config/products.json`, `data/ai-plans/`, `data/plan-examples/`, all HTML/JS) for any task literally marked "DELETE" or similar. **Found none.**
- Traced `headpaper/index.html`'s actual persistence: it's **100% browser `localStorage`, per-device, with zero network calls** (confirmed no `fetch`/`supabase` references anywhere in `headpaper/app.js`). This is a real architectural gap for a shared daily-use tool — if Kasia (or anyone) uses it from more than one device/browser, or a browser clears storage, edits made on one device are invisible everywhere else and can look like "it came back." I did **not** attempt to redesign this into a synced store (that's a genuine UX/architecture decision — server-backed sync like `index.html`'s `checks` table, conflict resolution, etc. — outside a "fix a bug" scope) — flagging it for Lucas instead.
- The only *remote* store I could find that's structurally similar to what the task described (a Supabase table written from the browser) is `index.html`'s generic `checks` key/value table (used for pill-done checkboxes and the day Notes textarea) and a separate one-blob-per-board `checks` row used by `kanban.html`'s Projects/New Products boards. Neither stores individually-named, deletable "tasks" the way headpaper does, and I have no Supabase credentials in this environment to query the live `checks` table contents directly.
- **Per the tripwire in my brief: since I found zero accessible candidates and can't verify what (if anything) Kasia actually marked "DELETE," I did not guess or delete anything.** See "Open questions for Lucas" below.

### 4. Weekly schedule horizon → ~5 weeks ahead — done

- `.github/workflows/refresh.yml`: `fetch_schedule.py --weeks 3` → `--weeks 5`.
- `scripts/fetch_schedule.py`: default `--weeks` argparse value 3 → 5 (so local/manual runs match prod behavior without needing the flag).
- Lookback window (`lookback_weeks = 3`, i.e. 3 weeks of past MOs kept for continuity) is unchanged — only the forward horizon grew, so the added Odoo load is +2 weeks of MOs, not a doubling.
- Frontend: `index.html`'s week picker and next/prev navigation already derive their bounds from `scheduleData.week_end` (the real data), so no cap existed there. Updated two hardcoded "next 3 weeks" display strings (initial load + the 2-minute auto-refresh poll) to "next 5 weeks" for accuracy.

### Verification performed

- `python3 scripts/fetch_schedule.py --dry-run` — runs clean, generates a 3-weeks-back + 5-weeks-ahead date range as expected (`Fetching MOs from 2026-06-29 to 2026-08-23 (3w back + 5w ahead)`). No live Odoo credentials were available in this environment (no `.env` found), so the live-fetch path wasn't exercised — the offset/date-math logic is identical either way and was verified with synthetic MOs instead (see below).
- `python3 -c "import json; json.load(open('config/products.json'))"` — valid JSON.
- Fed a synthetic `WA3P-SGL` MO through `build_schedule()` directly: confirmed "Take butter out of the freezer" lands on D-2, "Cut butter" + "Prep mix Waffles" both land on D-1, as required.
- Fed a synthetic `CH-SGL` MO (existing single-premix product) through the same path: confirmed the legacy `premix_offset`/`premix_label` form still works unchanged ("Cut Cheese" pill).
- Simulated `divider_deep`/`divider_inside` week-spacing in Python across 2025–2027 — zero same-week collisions, gap always 14–17 days.
- Wrote a standalone Node test reproducing the exact "delete task → instance survives" bug against the new `purgeTaskFromSchedule` logic — all assertions passed (single instance removed, overlap array correctly collapsed, old-format instance on an unrelated task left alone, instance on a different date also removed, `scheduledTaskInstances` purged correctly).
- `node --check headpaper/app.js` — syntax OK.
- Served the worktree locally (`python3 -m http.server`) and visually verified in a real browser (via a temporary synthetic `data/schedule.json`, restored to the untouched committed version immediately after — never left modified): `index.html` renders all three waffle premix pills on the correct days ("Take butter out of the freezer" on Monday, "Cut butter" + "Prep mix Waffles" together on Tuesday, for a Wednesday MO), and `headpaper/index.html` loads its normal task grid with no visible errors.

### Open questions for Lucas

1. **Task 3b (DELETE-marked task cleanup):** I found no committed data anywhere matching "DELETE"-marked tasks, and headpaper's actual task data lives only in whichever browser/device Kasia uses (pure `localStorage`, no sync). Can you either (a) check Kasia's browser directly (DevTools → Application → Local Storage → key `bakerySchedule`) for any task named "DELETE" or similar, or (b) confirm whether there's a live Supabase `checks` table row I should be querying with real credentials? I don't want to guess at data I can't see.
2. **headpaper's local-only storage** is a structural risk for a shared daily-use tool (no cross-device sync, no backup beyond whatever's in one browser's storage). Worth a follow-up ticket to give it the same Supabase-backed sync `index.html` already has? Did not attempt this here — pure architecture/UX call, out of scope for "fix the bug."
3. Should the "setup-needed" modal in `index.html` (for configuring newly-seen Odoo SKUs) be extended to support entering multiple pre-tasks, to match the new `premix_tasks` list capability? Left as single-pre-task-only for now since it wasn't part of the ask.
