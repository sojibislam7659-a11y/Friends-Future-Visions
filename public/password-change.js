import { BRAND_LOGO_SVG } from "./brand-logo.js";
import { supabase, supabaseReady } from "./supabase-client.js";

document.getElementById("passwordPageLogo").innerHTML = BRAND_LOGO_SVG;

const form = document.getElementById("passwordChangeForm");
const saveButton = document.getElementById("savePasswordButton");
const skipButton = document.getElementById("skipPasswordButton");
const message = document.getElementById("passwordMessage");
const emailLabel = document.getElementById("accountEmail");

function showMessage(text) {
  message.textContent = text;
  message.style.display = "block";
}

function setBusy(busy, label) {
  saveButton.disabled = busy;
  skipButton.disabled = busy;
  if (label) saveButton.textContent = label;
}

async function goToDashboard() {
  location.replace("dashboard.html");
}

async function initialize() {
  if (!supabaseReady || !supabase) {
    showMessage("Login service প্রস্তুত নয়। পরে আবার চেষ্টা করুন।");
    setBusy(true);
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.user?.id) {
    location.replace("login.html");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,email,must_change_password,password_change_prompt_seen_at")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "member") {
    showMessage("সদস্য অ্যাকাউন্ট যাচাই করা যায়নি। আবার লগইন করুন।");
    setBusy(true);
    return;
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("status")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (memberError || !member || member.status !== "active") {
    await supabase.auth.signOut();
    location.replace("login.html?reason=inactive");
    return;
  }

  if (!profile.must_change_password || profile.password_change_prompt_seen_at) {
    await goToDashboard();
    return;
  }

  // Atomically claim the one-time prompt before displaying it. This prevents
  // another tab/device from showing the same prompt after the first claim.
  const { data: claimed, error: claimError } = await supabase.rpc("claim_first_login_password_prompt");
  if (claimError) {
    showMessage("প্রথম লগইন যাচাই করা যায়নি। নিরাপত্তার জন্য Dashboard-এ প্রবেশের আগে আবার চেষ্টা করুন।");
    setBusy(true);
    return;
  }
  if (claimed !== true) {
    await goToDashboard();
    return;
  }

  emailLabel.textContent = session.user.email || profile.email || "ইমেইল পাওয়া যায়নি";
  document.getElementById("promptLoading").hidden = true;
  document.getElementById("promptContent").hidden = false;
}

async function dismissPrompt() {
  setBusy(true, "যাচাই হচ্ছে…");
  const { error } = await supabase.rpc("dismiss_first_login_password_prompt");
  if (error) {
    showMessage("Skip সংরক্ষণ করা যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।");
    setBusy(false, "Password পরিবর্তন করুন");
    return;
  }
  await goToDashboard();
}

skipButton.addEventListener("click", dismissPrompt);

form.addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password.length < 12) {
    showMessage("Password কমপক্ষে ১২ অক্ষরের হতে হবে।");
    return;
  }
  if (password !== confirmPassword) {
    showMessage("দুটি Password এক নয়।");
    return;
  }

  setBusy(true, "Password পরিবর্তন হচ্ছে…");
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    showMessage(passwordError.message || "Password পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।");
    setBusy(false, "Password পরিবর্তন করুন");
    return;
  }

  const { error: completeError } = await supabase.rpc("complete_required_password_change");
  if (completeError) {
    showMessage("Password পরিবর্তিত হয়েছে, কিন্তু নিরাপত্তা স্ট্যাটাস আপডেট হয়নি। আবার চেষ্টা করুন।");
    setBusy(false, "আবার চেষ্টা করুন");
    return;
  }

  const { error: seenError } = await supabase.rpc("dismiss_first_login_password_prompt");
  if (seenError) {
    showMessage("Password পরিবর্তিত হয়েছে, কিন্তু পেজটি একবার দেখানো হয়েছে—এটি সংরক্ষণ করা যায়নি। Skip বাটন দিয়ে আবার চেষ্টা করুন।");
    setBusy(false, "Password পরিবর্তন হয়েছে");
    return;
  }

  await supabase.auth.refreshSession();
  await goToDashboard();
});

initialize().catch(error => {
  console.error("First-login password prompt failed", error);
  showMessage("পেজটি লোড করা যায়নি। Reload করে আবার চেষ্টা করুন।");
});
