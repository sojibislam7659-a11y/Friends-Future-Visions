import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://friends-future-visions.sojibislam7659.workers.dev",
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

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = req.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const { data: caller, error: callerError } = await supabase
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (callerError || caller?.role !== "super_admin")
    return json({ error: "Super Admin permission required" }, 403);

  let input: { member_id?: string; email?: string };
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const memberId = String(input.member_id || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!memberId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "A valid member ID and email are required" }, 400);

  const { data: member, error: memberError } = await supabase
    .from("members").select("id,full_name,email,status,auth_user_id").eq("id", memberId).maybeSingle();
  if (memberError || !member) return json({ error: "Member record not found" }, 404);
  if (member.status !== "active") return json({ error: "Only active members can be invited" }, 409);
  if (member.auth_user_id) return json({ error: "This member already has a linked login" }, 409);
  if (member.email && member.email.toLowerCase() !== email)
    return json({ error: "Email does not match the member record. Update the member email first." }, 409);

  // A member who has already signed up must complete email verification and be
  // approved from Pending website signups. Never convert that pending identity
  // into an invitation/member account from this separate invite flow.
  const { data: existingProfiles, error: existingProfileError } = await supabase
    .from("profiles").select("id,role").eq("email", email).limit(1);
  if (existingProfileError) return json({ error: "Could not verify whether this email already has an account" }, 500);
  if (existingProfiles?.length) {
    const role = existingProfiles[0].role;
    if (role === "pending" || role === "rejected")
      return json({
        error: "A website signup already exists for this email. Ask the member to verify the email, then use Pending website signups → Approve & Activate."
      }, 409);
    return json({ error: "An account already exists for this email. Do not send a duplicate invitation." }, 409);
  }

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: member.full_name },
    redirectTo: "https://friends-future-visions.sojibislam7659.workers.dev/login.html"
  });
  if (inviteError || !invited.user)
    return json({ error: inviteError?.message || "Invitation failed" }, 409);

  const newUserId = invited.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: newUserId, full_name: member.full_name, role: "member", email
  }, { onConflict: "id" });
  if (profileError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return json({ error: "Could not create member access profile" }, 500);
  }

  const { error: linkError } = await supabase.from("members").update({
    auth_user_id: newUserId, email
  }).eq("id", member.id).is("auth_user_id", null);
  if (linkError) {
    await supabase.from("profiles").delete().eq("id", newUserId);
    await supabase.auth.admin.deleteUser(newUserId);
    return json({ error: "Could not link the member account" }, 500);
  }

  return json({ success: true, message: "Invitation sent to the member email." });
});
