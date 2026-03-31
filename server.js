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
    // Odoo 16+ supports HTTP Basic Auth with API keys — no session cookie needed.
    // Format: "login:api_key" base64-encoded in the Authorization header.
    const basicAuth = Buffer.from(`${ODOO_USER}:${ODOO_KEY}`).toString("base64");

    const docids  = Array(n).fill(lot_id).join(",");
    const pdfRes  = await fetch(
      `${ODOO_URL}/report/pdf/stock.report_lot_label/${docids}`,
      { headers: { Authorization: `Basic ${basicAuth}` } }
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
