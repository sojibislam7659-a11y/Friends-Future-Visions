import { createClient } from "npm:@supabase/supabase-js@2";

function tokenAal(token: string): string {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded).aal || "aal1";
  } catch {
    return "aal1";
  }
}

const allowedOrigins = new Set([
  "https://friends-future-visions.sojibislam7659.workers.dev",
  "https://development-friends-future-visions-dev.sojibislam7659.workers.dev"
]);
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
    ? origin
    : "https://friends-future-visions.sojibislam7659.workers.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin"
});

function makeTemporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return "Oo!" + token + "9a";
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration unavailable" }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bearer = req.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
  if (tokenAal(token) !== "aal2") return json({ error: "Super Admin MFA verification required" }, 403);

  const { data: caller, error: callerError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (callerError || caller?.role !== "super_admin")
    return json({ error: "Super Admin permission required" }, 403);

  let input: { member_id?: string; email?: string };
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const memberId = String(input.member_id || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!memberId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "Select a member and enter a valid email address" }, 400);

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id,member_no,full_name,email,status,auth_user_id")
    .eq("id", memberId).maybeSingle();
  if (memberError || !member) return json({ error: "Member record not found" }, 404);
  if (member.status !== "active") return json({ error: "Only active members can receive a login account" }, 409);

  const { data: memberEmailMatches, error: memberEmailError } = await admin
    .from("members").select("id,member_no").ilike("email", email).neq("id", member.id).limit(2);
  if (memberEmailError) return json({ error: "Could not check duplicate member email" }, 500);
  if (memberEmailMatches?.length) return json({ error: "এই Email অন্য সদস্যের Member record-এ ব্যবহৃত হচ্ছে। আলাদা Email দিন।" }, 409);

  const { data: emailProfiles, error: profileLookupError } = await admin
    .from("profiles").select("id,role,email").ilike("email", email).limit(2);
  if (profileLookupError) return json({ error: "Could not check existing account" }, 500);

  const otherProfile = (emailProfiles || []).find(p => p.id !== member.auth_user_id);
  if (otherProfile) {
    return json({
      error: otherProfile.role === "pending" || otherProfile.role === "rejected"
        ? "এই Email দিয়ে আগে Website Signup হয়েছে। Pending website signups থেকে সেটি Approve করুন।"
        : "এই Email অন্য একটি Login Account-এর সঙ্গে যুক্ত। অন্য Email ব্যবহার করুন।"
    }, 409);
  }

  const temporaryPassword = makeTemporaryPassword();
  let userId = member.auth_user_id;
  let createdNewUser = false;

  if (userId) {
    const { data: linkedProfile, error: linkedProfileError } = await admin
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    if (linkedProfileError || linkedProfile?.role !== "member") {
      return json({ error: "এই Member-এর linked account Super Admin/অন্যান্য Role-এর হতে পারে। নিরাপত্তার জন্য পরিবর্তন বন্ধ রাখা হয়েছে।" }, 409);
    }
    const { data: existingResult, error: existingError } = await admin.auth.admin.getUserById(userId);
    const existingUser = existingResult?.user;
    if (existingError || !existingUser) return json({ error: "Linked Auth Account পাওয়া যায়নি। আগে Member link যাচাই করুন।" }, 409);
    if (existingUser.last_sign_in_at) {
      return json({ error: "এই সদস্য আগে Login করেছে। নিরাপত্তার জন্য এখান থেকে তার Password Reset করা যাবে না; সদস্যকে Profile থেকে Password পরিবর্তন করতে বলুন।" }, 409);
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      password: temporaryPassword,
      user_metadata: { ...(existingUser.user_metadata || {}), full_name: member.full_name }
    });
    if (updateError) return json({ error: "Existing account update failed", details: updateError.message }, 409);
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: member.full_name }
    });
    if (createError || !created.user) return json({ error: createError?.message || "Account creation failed" }, 409);
    userId = created.user.id;
    createdNewUser = true;
  }

  const { error: upsertProfileError } = await admin.from("profiles").upsert({
    id: userId,
    full_name: member.full_name,
    email,
    role: "member",
    email_verified_at: new Date().toISOString(),
    must_change_password: true,
    password_change_required_at: new Date().toISOString()
  }, { onConflict: "id" });

  if (upsertProfileError) {
    if (createdNewUser) await admin.auth.admin.deleteUser(userId);
    return json({ error: "Auth account was prepared, but member profile could not be saved. Admin must inspect before retrying.", details: upsertProfileError.message }, 500);
  }

  const { error: linkError } = await admin.from("members").update({
    auth_user_id: userId
  }).eq("id", member.id).or(`auth_user_id.is.null,auth_user_id.eq.${userId}`);

  if (linkError) {
    if (createdNewUser) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    return json({ error: "Auth account was prepared, but Member link could not be saved. Inspect this member before retrying.", details: linkError.message }, 500);
  }

  return json({
    success: true,
    member_no: member.member_no,
    email,
    temporary_password: temporaryPassword,
    account_action: createdNewUser ? "created" : "existing_account_password_set",
    message: createdNewUser ? "Login account created and linked." : "Existing unused account updated and linked."
  });
});
