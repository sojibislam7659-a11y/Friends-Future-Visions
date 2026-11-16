const cors = {
  "Access-Control-Allow-Origin": "https://friends-future-visions.sojibislam7659.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({
    error: "Login invitation has been retired. Super Admin must create the member login account directly from the Admin Panel."
  }), { status: 410, headers: cors });
});
