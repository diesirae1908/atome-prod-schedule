/**
 * Atome Bakery – Production Schedule server
 * Serves the static app and proxies the Odoo lot-label PDF so bakers
 * don't need an active Odoo browser session to print.
 */
const express  = require("express");
const path     = require("path");
const { Readable } = require("stream");

const app = express();
app.use(express.json());

const ODOO_URL  = (process.env.ODOO_URL  || "").replace(/\/$/, "");
const ODOO_DB   = process.env.ODOO_DB   || "";
const ODOO_USER = process.env.ODOO_USER || "";
const ODOO_KEY  = process.env.ODOO_API_KEY || "";

// ── POST /api/print-label ─────────────────────────────────────────────────────
// Body: { lot_id: number, copies: number }
// Returns: application/pdf stream
app.post("/api/print-label", async (req, res) => {
  const { lot_id, copies } = req.body || {};
  const n = Math.min(Math.max(parseInt(copies) || 1, 1), 50);

  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_KEY) {
    return res.status(503).json({ error: "Odoo credentials not configured on the server." });
  }
  if (!lot_id) {
    return res.status(400).json({ error: "lot_id is required." });
  }

  try {
    // 1. Authenticate with Odoo — API key works as the password in Odoo 16+
    const authRes = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", method: "call", id: 1,
        params:  { db: ODOO_DB, login: ODOO_USER, password: ODOO_KEY },
      }),
    });
    const setCookie = authRes.headers.get("set-cookie") || "";
    const sessionMatch = setCookie.match(/session_id=([^;,\s]+)/);
    if (!sessionMatch) throw new Error("Odoo authentication failed — could not obtain session.");

    // 2. Fetch the lot-label PDF
    //    Repeat lot_id N times → Odoo produces N copies in one PDF
    const docids  = Array(n).fill(lot_id).join(",");
    const pdfRes  = await fetch(
      `${ODOO_URL}/report/pdf/stock.report_lot_label/${docids}`,
      { headers: { Cookie: `session_id=${sessionMatch[1]}` } }
    );
    if (!pdfRes.ok) throw new Error(`Odoo report error: HTTP ${pdfRes.status}`);

    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="label-${lot_id}.pdf"`);

    // Stream the response body straight through to the client
    Readable.fromWeb(pdfRes.body).pipe(res);

  } catch (err) {
    console.error("[print-label]", err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), { index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Atome schedule server on port ${PORT}`));
