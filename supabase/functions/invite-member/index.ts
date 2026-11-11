import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://friends-future-visions-dev.sojibislam7659.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "Server configuration unavailable" }), { status: 500, headers: cors });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = req.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: cors });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: cors });

  const { data: caller, error: callerError } = await supabase
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (callerError || caller?.role !== "super_admin")
    return new Response(JSON.stringify({ error: "Super Admin permission required" }), { status: 403, headers: cors });

  let input: { member_id?: string; email?: string };
  try { input = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: cors }); }
  const memberId = String(input.member_id || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!memberId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return new Response(JSON.stringify({ error: "A valid member ID and email are required" }), { status: 400, headers: cors });

  const { data: member, error: memberError } = await supabase
    .from("members").select("id,full_name,email,status,auth_user_id").eq("id", memberId).maybeSingle();
  if (memberError || !member) return new Response(JSON.stringify({ error: "Member record not found" }), { status: 404, headers: cors });
  if (member.status !== "active") return new Response(JSON.stringify({ error: "Only active members can be invited" }), { status: 409, headers: cors });
  if (member.auth_user_id) return new Response(JSON.stringify({ error: "This member already has a linked login" }), { status: 409, headers: cors });
  if (member.email && member.email.toLowerCase() !== email)
    return new Response(JSON.stringify({ error: "Email does not match the member record. Update the member email first." }), { status: 409, headers: cors });

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: member.full_name },
    redirectTo: "https://friends-future-visions-dev.sojibislam7659.workers.dev/login.html"
  });
  if (inviteError || !invited.user)
    return new Response(JSON.stringify({ error: inviteError?.message || "Invitation failed" }), { status: 409, headers: cors });

  const newUserId = invited.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: newUserId, full_name: member.full_name, role: "member", email
  }, { onConflict: "id" });
  if (profileError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return new Response(JSON.stringify({ error: "Could not create member access profile" }), { status: 500, headers: cors });
  }

  const { data: linkedMember, error: linkError } = await supabase.from("members").update({
    auth_user_id: newUserId, email
  }).eq("id", member.id).is("auth_user_id", null).select("id").maybeSingle();
  if (linkError || !linkedMember) {
    await supabase.from("profiles").delete().eq("id", newUserId);
    await supabase.auth.admin.deleteUser(newUserId);
    return new Response(JSON.stringify({ error: "Could not link the member account" }), { status: 500, headers: cors });
  }

  return new Response(JSON.stringify({ success: true, message: "Invitation sent to the member email." }), { status: 200, headers: cors });
});