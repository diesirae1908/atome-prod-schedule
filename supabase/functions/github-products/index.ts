// Supabase Edge Function: proxy GitHub Contents API for prod-schedule/config/products.json
// Browsers cannot call api.github.com with a user PAT (CORS). This forwards the request.
// Invoke with: Authorization: Bearer <Supabase anon key>, header X-GitHub-Token: <ghp_…>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-github-token",
};

const REPO = "diesirae1908/atome-prod-schedule";
const PATH = "config/products.json";
const GH_URL = `https://api.github.com/repos/${REPO}/contents/${PATH}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Never read GitHub PAT from Authorization — Supabase uses that for the anon JWT.
  const pat = (req.headers.get("X-GitHub-Token") || "").trim();
  if (!pat) {
    return new Response(
      JSON.stringify({ error: "Missing X-GitHub-Token (GitHub PAT)." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ghHeaders: Record<string, string> = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "atome-github-products-fn",
  };

  if (req.method === "GET") {
    const r = await fetch(GH_URL, { headers: ghHeaders });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "PUT") {
    const payload = await req.text();
    const r = await fetch(GH_URL, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: payload,
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
