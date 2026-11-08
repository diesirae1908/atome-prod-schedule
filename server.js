/**
 * Atome Bakery – Production Schedule server
 * Serves the static app. Odoo proxies (print-label, trigger-refresh) are retired (410).
 */
const express  = require("express");
const path     = require("path");

const app = express();
app.use(express.json());

// ── Odoo retired 2026-11-08 ───────────────────────────────────────────────────
// /api/print-label (Odoo lot-label PDF proxy) and /api/trigger-refresh (refresh
// workflow dispatch) are retired. No ODOO_* env is read and Odoo is never called.
const ODOO_RETIRED_MSG = { error: "Odoo is retired. Print labels and see the schedule in Apex: https://apex-atome.onrender.com" };
app.post("/api/print-label",     (req, res) => res.status(410).json(ODOO_RETIRED_MSG));
app.post("/api/trigger-refresh", (req, res) => res.status(410).json(ODOO_RETIRED_MSG));

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
