/*
 * OIKKO — page-level access guard.
 * This is a navigation safeguard only; Supabase RLS is the data-security boundary.
 */
import { supabase, supabaseReady } from "./supabase-client.js";

export async function requireRole(allowedRoles) {
  const panel = document.querySelector("[data-protected-panel]");
  const showFailure = (message) => {
    if (panel) {
      panel.innerHTML = "";
      const heading = document.createElement("h2");
      heading.textContent = "প্রবেশ যাচাই করা যায়নি";
      const detail = document.createElement("p");
      detail.className = "muted";
      detail.textContent = message;
      const link = document.createElement("a");
      link.className = "btn";
      link.href = "login.html";
      link.textContent = "লগইন পেজে যান";
      panel.append(heading, detail, link);
    }
  };

  if (!supabaseReady || !supabase) {
    showFailure("সিস্টেমের Login সংযোগ প্রস্তুত নয়। পরে আবার চেষ্টা করুন।");
    return null;
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;

    if (!session?.user?.id) {
      window.location.replace("login.html");
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || !allowedRoles.includes(profile.role)) {
      if (profile?.role === "member") {
        window.location.replace("member.html");
      } else if (profile?.role === "super_admin" || profile?.role === "admin") {
        window.location.replace("admin.html");
      } else {
        await supabase.auth.signOut();
        window.location.replace("login.html");
      }
      return null;
    }

    return { session, role: profile.role };
  } catch (error) {
    console.error("Oikko page access check failed:", error);
    showFailure("তোমার Login বা Role যাচাই করা যায়নি। নেটওয়ার্ক ও Supabase policy পরীক্ষা করে আবার চেষ্টা করো।");
    return null;
  }
}
