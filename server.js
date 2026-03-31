/**
 * Atome Bakery – Production Schedule server
 * Serves the static app and proxies the Odoo lot-label PDF so bakers
 * don't need an active Odoo browser session to print.
 */
const express  = require("express");
const path     = require("path");

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
    // Odoo 17 blocks API keys from being used as web session passwords.
    // HTTP Basic Auth (login:api_key) works for the /report/pdf/ controller instead.
    const basicAuth = Buffer.from(`${ODOO_USER}:${ODOO_KEY}`).toString("base64");

    // Repeat lot_id N times → Odoo produces N label copies in one PDF.
    const docids  = Array(n).fill(lot_id).join(",");
    const pdfRes  = await fetch(
      `${ODOO_URL}/report/pdf/stock.report_lot_label/${docids}`,
      { headers: { Authorization: `Basic ${basicAuth}` } }
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

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname), { index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Atome schedule server on port ${PORT}`));
