# JOURNAL

Dated work log for the `atome-prod-schedule` repo, newest entry first.

---

## 2026-07-26 — RLS lockdown phase 2 complete + login gate merged live (Sam)

Phase 1 (login gate on branch `security/supabase-auth-login`, below) shipped by
the dispatched agent, which correctly did NOT merge or touch RLS — no Supabase
admin access in its session and no working accounts yet (merging would've locked
out the whole team). Sam finished it out-of-band via the Supabase Management API
(personal access token found on disk, used transiently — never written anywhere).

Ordering held so the tool was never broken nor more open than before: created +
login-verified both accounts → merged the login gate to `main` (GitHub Pages,
live) → confirmed the live site serves the gate → only then flipped RLS.

- **Accounts**: `lucas@atomebakery.com` + shared `team@atomebakery.com`, both
  email-confirmed via GoTrue admin. Credentials handed to Lucas in chat, not stored.
- **Merged**: `security/supabase-auth-login` fast-forwarded into `main` (login gate
  live on all 4 Supabase-touching pages). The pre-existing WIP `git stash@{0}` was
  left untouched.
- **Policies flipped** (mirrored the old semantics, scoped to `authenticated`, not a
  blanket replace): `checks` → auth SELECT/UPDATE/INSERT + the 60-day `auth purge
  stale` DELETE (same date qual as the old anon purge policy, preserved); 
  `production_outputs` → auth SELECT/UPDATE/INSERT (no DELETE, as before). Revoked
  all anon table grants; authenticated grants kept.
- **Signup closed**: Management API `disable_signup=true`.
- **Verified live**: anon read/write on both tables → HTTP 401 permission denied;
  logged-in user read → 200, no-op write → 204; AND a real end-to-end browser login
  with the team account loaded the full schedule with live data.
- **Keepalive**: the agent's repoint to `/auth/v1/health` returns 200 with the
  publishable-key apikey header (how the workflow calls it) — survives the flip.
- Snapshot insurance at `~/Documents/atome/backups/supabase-snapshots-2026-07-26/`.

---

## 2026-07-26 — Supabase Auth login gate built; RLS flip blocked, needs Sam/Lucas (branch `security/supabase-auth-login`)

Dispatched by Sam (Lucas's assistant) after tonight's security audit found this app ships its Supabase anon (`sb_publishable_...`) key into browser JS with zero authentication, and RLS on `checks` + `production_outputs` (project `ktbbmtyesrprvxrseiph`) is effectively `USING (true)` — anyone with the URL can read/edit/delete the bakery's production data (~1,500 rows). Sam snapshotted both tables first (`~/Documents/atome/backups/supabase-snapshots-2026-07-26/`), so worst case is recoverable. Lucas approved the fix.

### Shipped (this branch, not yet merged to `main`)

- **`assets/auth.js`** (new): shared Supabase Auth gate. Loads supabase-js from the jsDelivr CDN, shows a full-screen email/password login overlay (curtain hides the rest of the page instantly, before any protected content can flash through) until `getSession()` resolves a valid session, then injects a small "signed in as … / Sign out" pill (bottom-right) on every gated page. `persistSession: true` + `autoRefreshToken: true` so shared bakery tablets stay logged in long-term. **No sign-up UI anywhere** — accounts are provisioned out-of-band only, by design.
- Wired into the **4 pages that actually touch Supabase** (checked every HTML entry point — `levain.html`, `mops.html`, `ai-planner/index.html` don't call Supabase at all, so left alone):
  - `index.html`, `kanban.html`, `outputs.html`, `headpaper/index.html` — each now includes the CDN script + `assets/auth.js` as early as possible in `<head>`, awaits `window.AtomeAuth.ready` before their init IIFE/`DOMContentLoaded` handler does anything, and sends the logged-in user's `access_token` as the `Authorization` bearer on `/rest/v1/checks` and `/rest/v1/production_outputs` calls (was the anon key). The `apikey` header stays the publishable key (Supabase gateway still needs it).
  - Left untouched on purpose: the 4 `/functions/v1/...` Edge Function calls in `index.html` (`trigger-refresh`, `github-products`, `github-shifts`) — those have `verify_jwt = false` in `supabase/config.toml` and don't touch the two RLS-tightened tables, so they're out of scope.
- **`.github/workflows/supabase-keepalive.yml`**: switched from pinging `checks` with the anon key (will start failing once RLS goes authenticated-only) to GoTrue's `/auth/v1/health`, which only needs the publishable key and is unaffected by table RLS either way. Verified live: `200` before this change, `200` after.

### Blocked — did NOT do, and did NOT touch RLS (escalating per my brief's explicit fallback)

The brief's ordering constraint requires shipping + deploying the login UI, then verifying a real authenticated login + read/write round-trip against production, **before** touching RLS at all — and only flipping policies once that's proven. I could not complete either prerequisite:

1. **No way to create the two accounts** (`lucas@atomebakery.com` + a shared `team@atomebakery.com`). Tried, in the order specified: (a) no Supabase MCP server is exposed to this session (`plugin-supabase-supabase` isn't in this subagent's tool list — only `cursor-app-control`, `cursor-ide-browser`, and the Google/Meta/Search-Console servers are); (b) searched this whole workspace (`prod-schedule-workspace/`) plus `~/.supabase`, the macOS keychain, shell env vars, and GitHub Actions repo secrets (only `ANTHROPIC_API_KEY`/`ODOO_*` exist there) for a `service_role` key or `SUPABASE_ACCESS_TOKEN` — found none. Per the brief, stopping here rather than improvising (e.g. self-serve `signUp()`, or raw SQL into `auth.users`, both explicitly out of bounds).
2. **RLS policy flip not attempted** — also needs `execute_sql` via the Supabase MCP, which isn't available here, and is blocked anyway on (1) above per the ordering constraint.
3. **Other tables/policies in the project** — couldn't enumerate. The project uses Supabase's newer key format, which now requires a *secret* key (not the publishable one) even to read the PostgREST OpenAPI schema (`GET /rest/v1/` → `403 Secret API key required`), so this needs the same admin access as (1)/(2).
4. **Deploy held on `main`** — deliberately did not merge/push this branch to `main` (which is what GitHub Pages serves — confirmed via `gh api repos/.../pages`: `source.branch = main`, `path = /`, `build_type = legacy`, so merging = instant live deploy). Shipping the login gate with zero valid accounts would lock out the entire bakery team with no way in, which is strictly worse than tonight's exposure. Pushed to `security/supabase-auth-login` instead: https://github.com/diesirae1908/atome-prod-schedule/pull/new/security/supabase-auth-login

### What Sam/Lucas need to do to finish this

1. Create the 2 accounts via the Supabase MCP (if it has user-admin tooling) or the dashboard (Authentication → Users → Add user), or hand this session a `service_role` key for a single `POST /auth/v1/admin/users` call each.
2. Merge `security/supabase-auth-login` → `main` (GitHub Pages deploys immediately).
3. Verify live: log in with each account, confirm a schedule check-box (writes `checks`) and an outputs entry (writes `production_outputs`) round-trip correctly.
4. Only then flip RLS: drop the permissive anon policies on `checks` and `production_outputs`, add `FOR ALL TO authenticated USING (true) WITH CHECK (true)` on both (via Supabase MCP `execute_sql`).
5. Verify: unauthenticated REST with the anon key now gets `401`/empty on both tables; logged-in app still works end-to-end. If it doesn't, restore the previous policies immediately and come back to Sam.

### Verification performed

- `node --check` on every inline `<script>` block extracted from the 4 edited HTML files, plus `assets/auth.js` directly — all clean.
- Confirmed (`curl`) both tables are still fully open to the anon key right now (pre-flip baseline, for before/after comparison later): `GET /rest/v1/checks` → `200` with live rows returned, `GET /rest/v1/production_outputs` → `200`.
- Served the branch locally (`python3 -m http.server`) — page loads, no syntax errors. Could not do a full interactive login round-trip test (no test account exists yet — see "Blocked" above); browser MCP tooling wasn't available in this session to drive a headless check either.
- `GET /auth/v1/health` (new keepalive target) → `200` both before and after the workflow edit.

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
