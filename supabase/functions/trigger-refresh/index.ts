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

  const GH_TOKEN = Deno.env.get("GH_TOKEN");
  if (!GH_TOKEN) {
    return new Response(
      JSON.stringify({ error: "GH_TOKEN secret not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const resp = await fetch(
    "https://api.github.com/repos/diesirae1908/atome-prod-schedule/actions/workflows/refresh.yml/dispatches",
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  return new Response(
    JSON.stringify({ ok: resp.ok, status: resp.status }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
