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

  if (!profile || !["super_admin", "admin", "member"].includes(profile.role)) {
   await supabase.auth.signOut();
   location.replace("login.html");
   return null;
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
