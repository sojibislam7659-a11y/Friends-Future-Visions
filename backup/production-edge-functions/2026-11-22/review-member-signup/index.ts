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
  if (!userId || !["approve", "reject", "reopen", "confirm_active"].includes(action))
    return json({ error: "Valid user_id and action are required" }, 400);

  if (action === "approve" || action === "confirm_active") {
    const { data: profile, error: profileError } = await admin
      .from("profiles").select("id,email,role").eq("id", userId).maybeSingle();
    const expectedRole = action === "approve" ? "pending" : "member";
    if (profileError || !profile || profile.role !== expectedRole)
      return json({ error: action === "approve" ? "Signup is not awaiting approval" : "Member account is not eligible for login confirmation" }, 409);
    if (!profile.email || !profile.email.trim())
      return json({ error: "Signup email is missing" }, 409);

    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(userId);
    const targetUser = targetResult?.user;
    if (targetError || !targetUser)
      return json({ error: "Auth account could not be found" }, 404);
    if ((targetUser.email || "").trim().toLowerCase() !== profile.email.trim().toLowerCase())
      return json({ error: "Auth email and profile email do not match" }, 409);

    let memberQuery = admin.from("members")
      .select("id,member_no,full_name,email,status,auth_user_id")
      .ilike("email", profile.email.trim())
      .eq("status", "active");
    if (action === "approve") {
      memberQuery = admin.from("members")
        .select("id,member_no,full_name,email,status,auth_user_id")
        .ilike("email", profile.email.trim())
        .in("status", ["pending", "active"])
        .or(`auth_user_id.is.null,auth_user_id.eq.${userId}`);
    } else {
      memberQuery = memberQuery.eq("auth_user_id", userId);
    }
    const { data: matches, error: matchError } = await memberQuery;
    if (matchError) return json({ error: "Could not verify the Google Form/member record" }, 500);
    if (!matches || matches.length === 0)
      return json({ error: "No matching active Google Form/member record found for this email and account" }, 409);
    if (matches.length > 1)
      return json({ error: "Multiple member records use this email; resolve duplicates first" }, 409);

    // Super Admin approval is the committee's manual identity check.
    // This bypasses email ownership verification only after a unique stored member match.
    if (!targetUser.email_confirmed_at) {
      const { error: confirmError } = await admin.auth.admin.updateUserById(userId, {
        email_confirm: true
      });
      if (confirmError)
        return json({ error: "Could not enable sign-in for this member", details: confirmError.message }, 502);
    }

    if (action === "approve") {
      const { data, error } = await admin.rpc("approve_member_signup", {
        p_user_id: userId,
        p_admin_user_id: authData.user.id
      });
      if (error)
        return json({
          error: "Email sign-in was enabled, but member approval did not finish. Check the member record and retry approval.",
          details: error.message
        }, 409);
      const { error: stampError } = await admin.from("profiles")
        .update({ email_verified_at: new Date().toISOString() }).eq("id", userId);
      if (stampError)
        return json({ success: true, action, member: data?.[0] || null, warning: "Login is enabled, but profile verification timestamp could not be saved." });
      return json({ success: true, action, member: data?.[0] || null });
    }

    const { error: stampError } = await admin.from("profiles")
      .update({ email_verified_at: new Date().toISOString() }).eq("id", userId);
    if (stampError)
      return json({ error: "Email sign-in is enabled, but profile status could not be updated. Retry this action.", details: stampError.message }, 500);
    return json({ success: true, action });
  }

  const { error } = await admin.rpc("reject_member_signup", {
    p_user_id: userId,
    p_admin_user_id: authData.user.id,
    p_reopen: action === "reopen"
  });
  if (error) return json({ error: error.message }, 409);
  return json({ success: true, action });
});
