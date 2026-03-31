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
    // Step 1 — authenticate with Odoo and grab the session_id from the JSON body.
    // Reading from the body is more reliable than parsing Set-Cookie headers
    // (Odoo.sh sometimes doesn't echo the cookie back in the header).
    const authRes  = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", method: "call", id: 1,
        params:  { db: ODOO_DB, login: ODOO_USER, password: ODOO_KEY },
      }),
    });
    const authData  = await authRes.json();
    let   sessionId = authData?.result?.session_id;

    // Fallback: try the Set-Cookie header
    if (!sessionId) {
      const m = (authRes.headers.get("set-cookie") || "").match(/session_id=([^;,\s]+)/);
      sessionId = m?.[1];
    }

    if (!sessionId) {
      const detail = JSON.stringify(authData?.error ?? authData).slice(0, 300);
      throw new Error(`Odoo authentication failed: ${detail}`);
    }

    // Step 2 — fetch the lot-label PDF using the session.
    // Repeat lot_id N times → Odoo produces N label copies in one PDF.
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
      throw new Error(`Expected PDF but Odoo returned ${ct}: ${body.slice(0, 300)}`);
    }

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
