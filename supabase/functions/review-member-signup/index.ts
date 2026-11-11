import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://friends-future-visions-dev.sojibislam7659.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);

  const bearer = req.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const { data: caller, error: callerError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (callerError || caller?.role !== "super_admin")
    return json({ error: "Super Admin permission required" }, 403);

  let input: { action?: string; user_id?: string };
  try { input = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const userId = String(input.user_id || "").trim();
  const action = String(input.action || "");
  if (!userId || !["approve", "reject", "reopen"].includes(action))
    return json({ error: "Valid user_id and action are required" }, 400);

  if (action === "approve") {
    const { data, error } = await admin.rpc("approve_member_signup", {
      p_user_id: userId,
      p_admin_user_id: authData.user.id
    });
    if (error) return json({ error: error.message }, 409);
    return json({ success: true, action, member: data?.[0] || null });
  }

  const { error } = await admin.rpc("reject_member_signup", {
    p_user_id: userId,
    p_admin_user_id: authData.user.id,
    p_reopen: action === "reopen"
  });
  if (error) return json({ error: error.message }, 409);
  return json({ success: true, action });
});