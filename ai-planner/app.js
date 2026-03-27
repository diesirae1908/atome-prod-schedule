/* ================================================================
   Atome Bakery — AI Planner app.js
   ================================================================ */

const REPO      = "diesirae1908/atome-prod-schedule";
const BASE_RAW  = `https://raw.githubusercontent.com/${REPO}/main`;
const API_BASE  = `https://api.github.com/repos/${REPO}`;
const WORKFLOW  = "generate_ai_plan.yml";

const SHIFT_CODES = ["S","M","V","P&P","Waffle","H","BD","Sick",""];
const CODE_LABEL  = { S:"Shaper", M:"Mixer", V:"Vacuum", "P&P":"Pick&Pack", Waffle:"Waffle", H:"Holiday", BD:"Birthday", Sick:"Sick", "":"Off" };
const DEFAULT_PW_HASH = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"; // "admin"

// ── State ──────────────────────────────────────────────────────
let selectedDate   = todayStr();
let shiftsData     = null;    // loaded from shifts.json
let planCache      = {};      // date → plan object
let shiftWeekStart = weekStart(new Date());
let isAdmin        = false;

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  renderWeekPills();
  await loadShifts();
  selectDate(selectedDate);
  bindUI();
});

// ── UI binding ──────────────────────────────────────────────────
function bindUI() {
  document.getElementById("btn-shift-table").addEventListener("click", openShiftTable);
  document.getElementById("btn-admin").addEventListener("click", () => openModal("modal-admin"));

  document.querySelectorAll(".modal-close").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.modal));
  });
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) closeModal(m.id); });
  });

  document.getElementById("prev-day").addEventListener("click", () => shiftSelectedDay(-1));
  document.getElementById("next-day").addEventListener("click", () => shiftSelectedDay(1));

  // Admin lock
  document.getElementById("btn-unlock").addEventListener("click", tryUnlock);
  document.getElementById("admin-password-input").addEventListener("keydown", e => {
    if (e.key === "Enter") tryUnlock();
  });
  document.getElementById("btn-lock").addEventListener("click", lockAdmin);
  document.getElementById("btn-save-pat").addEventListener("click", savePAT);
  document.getElementById("btn-save-password").addEventListener("click", savePassword);
  document.getElementById("btn-trigger-generate").addEventListener("click", triggerGenerate);

  // Shift table save
  document.getElementById("btn-save-shifts").addEventListener("click", saveShifts);
  document.getElementById("shift-prev-week").addEventListener("click", () => {
    shiftWeekStart = addDays(shiftWeekStart, -7);
    renderShiftTable();
  });
  document.getElementById("shift-next-week").addEventListener("click", () => {
    shiftWeekStart = addDays(shiftWeekStart, 7);
    renderShiftTable();
  });

  // Generate buttons
  document.getElementById("btn-generate-day").addEventListener("click", () => {
    openModal("modal-admin");
  });
  document.getElementById("btn-regenerate").addEventListener("click", () => {
    openModal("modal-admin");
  });
}

// ── Date helpers ────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function weekStart(d) {
  const copy = new Date(d);
  const day  = copy.getDay(); // 0=Sun
  copy.setDate(copy.getDate() - ((day + 6) % 7)); // Mon
  return copy;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function fmtDisplay(dateStr) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}
function fmtShort(d) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function shiftSelectedDay(n) {
  const d = addDays(new Date(selectedDate + "T12:00:00Z"), n);
  const ds = fmtDate(d);
  // If outside current 14-day window, re-centre
  const start = weekStart(new Date(selectedDate + "T12:00:00Z"));
  selectDate(ds);
  renderWeekPills();
}

// ── Week pills ──────────────────────────────────────────────────
function renderWeekPills() {
  const container = document.getElementById("week-days");
  container.innerHTML = "";
  const base = weekStart(new Date(selectedDate + "T12:00:00Z"));
  const limit = addDays(new Date(), 14);
  for (let i = 0; i < 14; i++) {
    const d  = addDays(base, i);
    const ds = fmtDate(d);
    if (d > limit) break;
    const pill = document.createElement("div");
    pill.className = "day-pill" + (ds === selectedDate ? " active" : "") + (planCache[ds] ? " has-plan" : "");
    pill.innerHTML = `<div>${d.toLocaleDateString("en-GB",{weekday:"short"})}</div><div class="pill-date">${d.getDate()} ${d.toLocaleDateString("en-GB",{month:"short"})}</div><div class="pill-dot"></div>`;
    pill.addEventListener("click", () => selectDate(ds));
    container.appendChild(pill);
  }
}

// ── Select a date ───────────────────────────────────────────────
async function selectDate(ds) {
  selectedDate = ds;
  renderWeekPills();
  document.getElementById("plan-date-title").textContent = fmtDisplay(ds);
  if (planCache[ds]) {
    renderPlan(planCache[ds]);
  } else {
    document.getElementById("plan-body").innerHTML = `<div class="loading-box"><div class="spinner"></div><p>Loading plan…</p></div>`;
    const plan = await fetchPlan(ds);
    if (plan) {
      planCache[ds] = plan;
      renderWeekPills();
      renderPlan(plan);
    } else {
      renderNoPlan(ds);
    }
  }
  // Show/hide admin generate buttons
  const btnGen = document.getElementById("btn-generate-day");
  const btnRegen = document.getElementById("btn-regenerate");
  if (isAdmin) {
    btnGen.style.display   = planCache[ds] ? "none"  : "inline-block";
    btnRegen.style.display = planCache[ds] ? "inline-block" : "none";
  } else {
    btnGen.style.display   = "none";
    btnRegen.style.display = "none";
  }
  // Pre-fill admin generate date
  document.getElementById("gen-date").value = ds;
}

// ── Fetch plan from GitHub ──────────────────────────────────────
async function fetchPlan(ds) {
  try {
    const url = `${BASE_RAW}/data/ai-plans/${ds}.json?_=${Date.now()}`;
    const r   = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Render plan — calendar grid view ────────────────────────────
function renderPlan(plan) {
  const body    = document.getElementById("plan-body");
  const bakers  = plan.bakers || [];
  const N       = bakers.length;

  // Time range: 07:00 → 17:30, 15-min slots
  const START   = 7 * 60;          // 420 min
  const END     = 17 * 60 + 30;    // 1050 min
  const SLOT    = 15;
  const SLOTS   = (END - START) / SLOT; // 42

  function timeToRow(t) {
    const [h, m] = t.split(":").map(Number);
    return Math.round((h * 60 + m - START) / SLOT) + 2; // +1 (1-indexed) +1 (header row)
  }

  let html = plan.notes
    ? `<div class="plan-notes">📝 ${escHtml(plan.notes)}</div>`
    : "";

  // Outer scroll wrapper so the grid can scroll horizontally
  html += `<div class="cal-scroll"><div class="cal-grid" style="grid-template-columns:52px repeat(${N},minmax(150px,1fr))">`;

  // ── Row 1: headers ──
  html += `<div class="cal-time-hdr">Time</div>`;
  bakers.forEach(b => {
    html += `<div class="cal-baker-hdr">
      <span class="cal-baker-name">${escHtml(b.name)}</span>
      <span class="baker-role-badge baker-role-${b.role}">${b.role}</span>
    </div>`;
  });

  // ── Rows 2+: time-slot background cells ──
  for (let s = 0; s < SLOTS; s++) {
    const mins    = START + s * SLOT;
    const h       = Math.floor(mins / 60);
    const m       = mins % 60;
    const isMajor = m === 0;
    const label   = isMajor ? `${h}:00` : (m === 30 ? `${h}:30` : "");
    html += `<div class="cal-time-slot${isMajor ? " major" : ""}">${label}</div>`;
    for (let c = 0; c < N; c++) {
      html += `<div class="cal-cell${isMajor ? " major" : ""}"></div>`;
    }
  }

  // ── Task overlays ──
  bakers.forEach((baker, ci) => {
    (baker.tasks || []).forEach(task => {
      const rStart = timeToRow(task.start);
      const rEnd   = timeToRow(task.end);
      const col    = ci + 2;
      html += `<div class="cal-task" style="grid-row:${rStart}/${rEnd};grid-column:${col};background:${task.color || "#94a3b8"}">
        <div class="cal-task-name">${escHtml(task.name)}</div>
        <div class="cal-task-time">${task.start}–${task.end}</div>
        ${task.description ? `<div class="cal-task-desc">${escHtml(task.description)}</div>` : ""}
      </div>`;
    });
  });

  html += `</div></div>`; // close cal-grid + cal-scroll

  const genAt = plan.generatedAt ? new Date(plan.generatedAt).toLocaleString("en-GB") : "";
  html += `<p style="font-size:11px;color:#94a3b8;margin-top:10px">Generated ${genAt}</p>`;

  body.innerHTML = html;
  document.getElementById("plan-status").textContent = "";
}

function renderNoPlan(ds) {
  const body = document.getElementById("plan-body");
  const dow  = new Date(ds + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long" });
  body.innerHTML = `
    <div class="empty-plan">
      <h2>No plan generated yet</h2>
      <p>There is no AI plan for ${dow}, ${ds}.</p>
      <p style="margin-top:8px;font-size:13px;color:#94a3b8">An admin can generate it from the Admin panel.</p>
    </div>`;
}

// ── Load shifts.json ────────────────────────────────────────────
async function loadShifts() {
  try {
    const url = `${BASE_RAW}/data/shifts.json?_=${Date.now()}`;
    const r   = await fetch(url);
    if (r.ok) shiftsData = await r.json();
  } catch { /* offline */ }
}

// ── Shift table ─────────────────────────────────────────────────
function openShiftTable() {
  shiftWeekStart = weekStart(new Date(selectedDate + "T12:00:00Z"));
  renderShiftTable();
  openModal("modal-shifts");
}

function renderShiftTable() {
  if (!shiftsData) return;
  const days = Array.from({ length: 7 }, (_, i) => addDays(shiftWeekStart, i));
  document.getElementById("shift-week-label").textContent =
    `${fmtShort(days[0])} — ${fmtShort(days[6])}`;

  const bakers = shiftsData.bakers || [];
  const sched  = shiftsData.schedule || {};

  let html = `<div style="overflow-x:auto"><table class="shift-table"><thead><tr>
    <th>Baker</th>`;
  for (const d of days) {
    html += `<th>${d.toLocaleDateString("en-GB",{weekday:"short"})}<br><small>${d.getDate()} ${d.toLocaleDateString("en-GB",{month:"short"})}</small></th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const baker of bakers) {
    html += `<tr><td class="td-name">${escHtml(baker.name)}</td>`;
    for (const d of days) {
      const ds   = fmtDate(d);
      const code = sched[ds]?.[baker.name] || "";
      html += `<td><select class="shift-cell ${shiftClass(code)}" data-baker="${escHtml(baker.name)}" data-date="${ds}" onchange="onShiftChange(this)">`;
      for (const c of SHIFT_CODES) {
        html += `<option value="${c}" ${c === code ? "selected" : ""}>${c || "off"}</option>`;
      }
      html += `</select></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  document.getElementById("shift-table-wrap").innerHTML = html;
}

function shiftClass(code) {
  const m = { S:"shift-S", M:"shift-M", V:"shift-V", "P&P":"shift-PP", Waffle:"shift-Waffle", H:"shift-H", BD:"shift-BD", Sick:"shift-Sick", "":"shift-off" };
  return m[code] || "shift-off";
}

function onShiftChange(sel) {
  const baker = sel.dataset.baker;
  const date  = sel.dataset.date;
  const code  = sel.value;
  if (!shiftsData.schedule[date]) shiftsData.schedule[date] = {};
  if (code === "") {
    delete shiftsData.schedule[date][baker];
  } else {
    shiftsData.schedule[date][baker] = code;
  }
  sel.className = `shift-cell ${shiftClass(code)}`;
  document.getElementById("shift-save-status").textContent = "Unsaved changes";
}

async function saveShifts() {
  const pat = getPAT();
  if (!pat) { alert("Enter your GitHub PAT in Admin settings first."); return; }
  const btn = document.getElementById("btn-save-shifts");
  const status = document.getElementById("shift-save-status");
  btn.disabled = true;
  status.textContent = "Saving…";

  try {
    // Get current file SHA
    const infoRes = await fetch(`${API_BASE}/contents/prod-schedule/data/shifts.json`, {
      headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" }
    });
    const info = await infoRes.json();

    shiftsData.meta = { ...shiftsData.meta, lastUpdated: new Date().toISOString() };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(shiftsData, null, 2))));

    const putRes = await fetch(`${API_BASE}/contents/prod-schedule/data/shifts.json`, {
      method: "PUT",
      headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update shifts via AI Planner", content, sha: info.sha })
    });
    if (!putRes.ok) throw new Error(await putRes.text());
    status.textContent = "✓ Saved to GitHub";
  } catch (e) {
    status.textContent = "✗ Save failed: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Admin ───────────────────────────────────────────────────────
async function tryUnlock() {
  const pw    = document.getElementById("admin-password-input").value;
  const hash  = await sha256(pw);
  const saved = localStorage.getItem("atome_pw_hash") || DEFAULT_PW_HASH;
  if (hash === saved) {
    isAdmin = true;
    document.getElementById("admin-lock").style.display     = "none";
    document.getElementById("admin-settings").style.display = "block";
    document.getElementById("lock-error").style.display     = "none";
    // Pre-fill PAT field placeholder
    const pat = getPAT();
    if (pat) document.getElementById("input-pat").placeholder = "ghp_••••• (saved)";
    // Show generate buttons
    const btnGen   = document.getElementById("btn-generate-day");
    const btnRegen = document.getElementById("btn-regenerate");
    btnGen.style.display   = planCache[selectedDate] ? "none"  : "inline-block";
    btnRegen.style.display = planCache[selectedDate] ? "inline-block" : "none";
    document.getElementById("gen-date").value = selectedDate;
  } else {
    document.getElementById("lock-error").style.display = "block";
  }
}

function lockAdmin() {
  isAdmin = false;
  document.getElementById("admin-lock").style.display     = "block";
  document.getElementById("admin-settings").style.display = "none";
  document.getElementById("admin-password-input").value   = "";
  document.getElementById("btn-generate-day").style.display = "none";
  document.getElementById("btn-regenerate").style.display   = "none";
  closeModal("modal-admin");
}

function savePAT() {
  const pat = document.getElementById("input-pat").value.trim();
  if (!pat) return;
  localStorage.setItem("atome_pat_enc", btoa(pat));
  document.getElementById("input-pat").value = "";
  document.getElementById("input-pat").placeholder = "ghp_••••• (saved)";
  alert("PAT saved locally.");
}

async function savePassword() {
  const pw = document.getElementById("input-new-password").value;
  if (!pw) return;
  const hash = await sha256(pw);
  localStorage.setItem("atome_pw_hash", hash);
  document.getElementById("input-new-password").value = "";
  alert("Password updated.");
}

function getPAT() {
  const enc = localStorage.getItem("atome_pat_enc");
  return enc ? atob(enc) : null;
}

async function triggerGenerate() {
  const pat  = getPAT();
  if (!pat) { alert("Save your GitHub PAT in settings first."); return; }
  const date = document.getElementById("gen-date").value;
  const days = document.getElementById("gen-days").value;
  if (!date) { alert("Select a date."); return; }

  const status = document.getElementById("gen-status");
  const btn    = document.getElementById("btn-trigger-generate");
  btn.disabled = true;
  status.textContent = "⏳ Triggering GitHub Actions…";

  try {
    const res = await fetch(`${API_BASE}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { date, days } })
    });
    if (res.status === 204) {
      status.textContent = `✓ Generation started for ${date} (${days} day(s)). Plans will appear in ~2 minutes. Refresh this page to see them.`;
    } else {
      const txt = await res.text();
      status.textContent = `✗ Error ${res.status}: ${txt}`;
    }
  } catch (e) {
    status.textContent = "✗ Failed: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Modal helpers ───────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  if (id === "modal-admin") {
    document.getElementById("admin-password-input").value = "";
  }
}

// ── Crypto helpers ──────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
