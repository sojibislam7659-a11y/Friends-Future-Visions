import { supabase, supabaseReady } from "./supabase-client.js";

const AUTH_TIMEOUT_MS = 15000;

function withTimeout(promise, label) {
 return Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(label + " timed out. Supabase connection পরীক্ষা করে Reload করুন।")), AUTH_TIMEOUT_MS))
 ]);
}

export async function requireRole(allowedRoles) {
 const panel = document.querySelector("[data-protected-panel]") || document.getElementById("app") || document.body;
 const fail = message => {
  panel.innerHTML = "";
  const wrap = document.createElement("section");
  wrap.className = "shell";
  const box = document.createElement("div");
  box.className = "error";
  const heading = document.createElement("h2");
  heading.textContent = "প্রবেশ যাচাই করা যায়নি";
  const detail = document.createElement("p");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.className = "secondary";
  retry.type = "button";
  retry.textContent = "আবার চেষ্টা করুন";
  retry.addEventListener("click", () => location.reload());
  const login = document.createElement("a");
  login.href = "login.html";
  login.textContent = "লগইন পেজে যান";
  box.append(heading, detail, retry, document.createTextNode(" "), login);
  wrap.append(box);
  panel.append(wrap);
 };

 if (!supabaseReady || !supabase) {
  fail("Login service প্রস্তুত নয়। Supabase URL ও publishable key পরীক্ষা করুন।");
  return null;
 }

 try {
  const { data: sessionData, error: sessionError } = await withTimeout(
   supabase.auth.getSession(),
   "Login session check"
  );
  if (sessionError) throw sessionError;
  const session = sessionData?.session;
  if (!session?.user?.id) {
   location.replace("login.html");
   return null;
  }

  const { data: profile, error: profileError } = await withTimeout(
   supabase.from("profiles").select("role,full_name").eq("id", session.user.id).maybeSingle(),
   "User permission check"
  );
  if (profileError) throw profileError;

  if (!profile || !["super_admin", "member"].includes(profile.role)) {
   await supabase.auth.signOut();
   location.replace("login.html");
   return null;
  }

  // Require an elevated assurance session for every protected Super Admin route.
  // Database RLS also checks AAL2; this client guard sends stale AAL1 sessions back
  // through the existing MFA login flow instead of rendering an empty admin shell.
  if (profile.role === "super_admin") {
   const { data: assurance, error: assuranceError } = await withTimeout(
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    "Super Admin MFA check"
   );
   if (assuranceError) throw assuranceError;
   if (assurance?.currentLevel !== "aal2") {
    location.replace("login.html?reason=mfa");
    return null;
   }
  }

  // A member must have exactly one linked, active member record to enter the portal.
  // Super Admin access remains independent of the members table.
  if (profile.role === "member") {
   const { data: member, error: memberError } = await withTimeout(
    supabase.from("members").select("status").eq("auth_user_id", session.user.id).maybeSingle(),
    "Member status check"
   );
   if (memberError) throw memberError;
   if (!member || member.status !== "active") {
    await supabase.auth.signOut();
    location.replace("login.html?reason=inactive");
    return null;
   }
  }

  if (!allowedRoles.includes(profile.role)) {
   location.replace(profile.role === "super_admin" ? "admin.html" : "dashboard.html");
   return null;
  }
  return { session, role: profile.role, profile };
 } catch (error) {
  console.error("Access check failed", error);
  fail(error?.message || "তোমার Login বা Role যাচাই করা যায়নি। নেটওয়ার্ক ও Supabase permission পরীক্ষা করো।");
  return null;
 }
}
