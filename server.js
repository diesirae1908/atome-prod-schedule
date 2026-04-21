/**
 * Atome Bakery – Production Schedule server
 * Serves the static app and proxies the Odoo lot-label PDF so bakers
 * don't need an active Odoo browser session to print.
 */
const express  = require("express");
const path     = require("path");

const app = express();
app.use(express.json());

const ODOO_URL  = (process.env.ODOO_URL      || "").replace(/\/$/, "");
const ODOO_DB   = process.env.ODOO_DB        || "";
const ODOO_USER = process.env.ODOO_USER      || "";
const ODOO_KEY  = process.env.ODOO_API_KEY   || "";
const ODOO_PASS = process.env.ODOO_PASSWORD  || "";

// ── POST /api/print-label ─────────────────────────────────────────────────────
// Body: { lot_id: number, copies: number }
// Returns: application/pdf stream
app.post("/api/print-label", async (req, res) => {
  const { lot_id, copies } = req.body || {};
  const n = Math.min(Math.max(parseInt(copies) || 1, 1), 50);

  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
    return res.status(503).json({ error: "Odoo credentials not configured on the server. ODOO_PASSWORD must be set." });
  }
  if (!lot_id) {
    return res.status(400).json({ error: "lot_id is required." });
  }

  try {
    // Step 1 — get a session cookie using the real user password.
    // Odoo 17 blocks API keys from web session auth; only actual passwords work here.
    const authRes  = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", method: "call", id: 1,
        params:  { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS },
      }),
    });
    const authData  = await authRes.json();
    let   sessionId = authData?.result?.session_id;
    if (!sessionId) {
      const m = (authRes.headers.get("set-cookie") || "").match(/session_id=([^;,\s]+)/);
      sessionId = m?.[1];
    }
    if (!sessionId) {
      const detail = JSON.stringify(authData?.error ?? authData).slice(0, 300);
      throw new Error(`Odoo authentication failed: ${detail}`);
    }

    // Step 2 — fetch the PDF. Repeat lot_id N times → N label copies in one PDF.
    const docids  = Array(n).fill(lot_id).join(",");
    const pdfRes  = await fetch(
      `${ODOO_URL}/report/pdf/stock.report_lot_label/${docids}`,
      { headers: { Cookie: `session_id=${sessionId}` } }
    );

    if (!pdfRes.ok) {
      const body = await pdfRes.text();
      throw new Error(`Odoo report HTTP ${pdfRes.status}: ${body.slice(0, 300)}`);
    }
    const ct = pdfRes.headers.get("content-type") || "";
    if (!ct.includes("pdf")) {
      const body = await pdfRes.text();
      throw new Error(`Odoo returned ${ct} instead of PDF: ${body.slice(0, 300)}`);
    }

    // Buffer the full PDF in memory before sending — avoids Web-Stream
    // compatibility issues with Readable.fromWeb on some Node versions.
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    res.set("Content-Type", "application/pdf");
    res.set("Content-Length", buffer.length);
    res.set("Content-Disposition", `inline; filename="label-${lot_id}.pdf"`);
    res.send(buffer);

  } catch (err) {
    console.error("[print-label]", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /api/trigger-refresh ─────────────────────────────────────────────────
// Dispatches the GitHub Actions refresh workflow so the schedule re-fetches Odoo data.
app.post("/api/trigger-refresh", async (req, res) => {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) return res.status(503).json({ error: "GITHUB_TOKEN not configured on server." });

  const ghRes = await fetch(
    "https://api.github.com/repos/diesirae1908/atome-prod-schedule/actions/workflows/refresh.yml/dispatches",
    {
      method:  "POST",
      headers: {
        Authorization:  `token ${token}`,
        Accept:         "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent":   "atome-prod-schedule-server",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!ghRes.ok) {
    const body = await ghRes.text();
    return res.status(ghRes.status).json({ error: `GitHub API error ${ghRes.status}: ${body.slice(0, 200)}` });
  }
  res.json({ ok: true });
});

const GH_SHIFTS_CONTENTS =
  "https://api.github.com/repos/diesirae1908/atome-prod-schedule/contents/data/shifts.json";

function githubPatFromRequest(req) {
  const x = String(req.headers["x-github-token"] || "").trim();
  if (x) return x;
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^(?:token|Bearer)\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

// ── GET /api/github-shifts-meta ─────────────────────────────────────────────
// Returns the GitHub Contents API JSON (includes sha) using the caller's PAT.
app.get("/api/github-shifts-meta", async (req, res) => {
  const pat = githubPatFromRequest(req);
  if (!pat) {
    return res.status(401).json({
      error: "Send your GitHub PAT as Authorization: token <pat> or X-GitHub-Token.",
    });
  }
  try {
    const ghRes = await fetch(GH_SHIFTS_CONTENTS, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "atome-prod-schedule-server",
      },
    });
    const body = await ghRes.text();
    res.status(ghRes.status).type("json").send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/github-shifts ──────────────────────────────────────────────────
// Body: { message, content, sha } — same as GitHub Contents API update file.
app.put("/api/github-shifts", async (req, res) => {
  const pat = githubPatFromRequest(req);
  if (!pat) {
    return res.status(401).json({
      error: "Send your GitHub PAT as Authorization: token <pat> or X-GitHub-Token.",
    });
  }
  try {
    const ghRes = await fetch(GH_SHIFTS_CONTENTS, {
      method: "PUT",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "atome-prod-schedule-server",
      },
      body: JSON.stringify(req.body || {}),
    });
    const body = await ghRes.text();
    res.status(ghRes.status).type("json").send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const GH_PRODUCTS_CONTENTS =
  "https://api.github.com/repos/diesirae1908/atome-prod-schedule/contents/config/products.json";

// ── GET /api/github-products-meta ───────────────────────────────────────────
// Returns the GitHub Contents API JSON for config/products.json (includes sha).
app.get("/api/github-products-meta", async (req, res) => {
  const pat = githubPatFromRequest(req);
  if (!pat) {
    return res.status(401).json({
      error: "Send your GitHub PAT as Authorization: token <pat> or X-GitHub-Token.",
    });
  }
  try {
    const ghRes = await fetch(GH_PRODUCTS_CONTENTS, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "atome-prod-schedule-server",
      },
    });
    const body = await ghRes.text();
    res.status(ghRes.status).type("json").send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/github-products ────────────────────────────────────────────────
// Body: { message, content, sha } — GitHub Contents API update file.
app.put("/api/github-products", async (req, res) => {
  const pat = githubPatFromRequest(req);
  if (!pat) {
    return res.status(401).json({
      error: "Send your GitHub PAT as Authorization: token <pat> or X-GitHub-Token.",
    });
  }
  try {
    const ghRes = await fetch(GH_PRODUCTS_CONTENTS, {
      method: "PUT",
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "atome-prod-schedule-server",
      },
      body: JSON.stringify(req.body || {}),
    });
    const body = await ghRes.text();
    res.status(ghRes.status).type("json").send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), { index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Atome schedule server on port ${PORT}`));
