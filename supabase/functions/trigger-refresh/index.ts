// Supabase Edge Function: trigger-refresh
// Calls GitHub Actions workflow_dispatch to refresh the production schedule.
// The GH_TOKEN secret is stored in Supabase — never exposed to the browser.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Retired 2026-11-08: Odoo is shut down, schedule lives in Apex. No dispatch.
  return new Response(
    JSON.stringify({ error: "Odoo is retired. Print labels and see the schedule in Apex: https://apex-atome.onrender.com" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
