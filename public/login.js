import "./password-visibility.js";
import { BRAND_LOGO_SVG } from "./brand-logo.js";
document.getElementById("loginBrandLogo").innerHTML = BRAND_LOGO_SVG;
import {supabase,supabaseReady} from "./supabase-client.js";
const form=document.getElementById("loginForm"),btn=document.getElementById("loginButton"),msg=document.getElementById("message");
let lang="bn";
const copy={
 bn:{brandBn:"ফ্রেন্ডস ফিউচার ভিশন ফরএভার",title:"সদস্য লগইন",intro:"আপনার অনুমোদিত অ্যাকাউন্ট দিয়ে নিরাপদে প্রবেশ করুন।",emailLabel:"Email address",emailPlaceholder:"আপনার নিবন্ধিত ইমেইল",passwordLabel:"Password",passwordPlaceholder:"আপনার পাসওয়ার্ড",loginButton:"লগইন করুন →",security:"শুধু অনুমোদিত সদস্য ও Super Admin প্রবেশ করতে পারবেন",privacy:"আপনার লগইন তথ্য অন্য কারও সঙ্গে শেয়ার করবেন না।",newMember:"নতুন সদস্য?",forgot:"পাসওয়ার্ড ভুলে গেছেন?",emailRequired:"আগে আপনার নিবন্ধিত ইমেইল লিখুন।",resetSent:"রিসেট লিংক পাঠানো হয়েছে।",resetTitle:"নতুন পাসওয়ার্ড সেট করুন",resetIntro:"আপনার Gmail-এ পাঠানো ৬ সংখ্যার কোড লিখুন, তারপর নতুন Password দিন।",newPasswordLabel:"নতুন পাসওয়ার্ড",confirmPasswordLabel:"আবার লিখুন",savePassword:"কোড যাচাই করে Password পরিবর্তন করুন",createAccount:"নিজে অ্যাকাউন্ট তৈরি করুন",toggle:"English",checking:"যাচাই হচ্ছে…",service:"Login service configured নয়।",loginError:"লগইন করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",emailNotConfirmed:"আপনার ইমেইল এখনো যাচাই হয়নি। Inbox/Spam থেকে সর্বশেষ Verification বা Invitation link খুলে Email verify করুন।",invalidCredentials:"ইমেইল বা পাসওয়ার্ড সঠিক নয়। আবার যাচাই করুন।",resetRateLimited:"নিরাপত্তার কারণে অল্প সময়ের মধ্যে একাধিক Email পাঠানো যাচ্ছে না। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।",verificationSent:"যদি এই ইমেইলে অসম্পূর্ণ Signup থাকে, Verification link পাঠানো হয়েছে। Inbox/Spam দেখুন।",resendFailed:"Verification email পাঠানো যায়নি। ইমেইল ঠিক আছে কি না দেখুন এবং কিছুক্ষণ পর আবার চেষ্টা করুন।",pending:"আপনার অ্যাকাউন্ট এখনো Super Admin অনুমোদন করেননি।",rejected:"এই অ্যাকাউন্টের আবেদন অনুমোদিত হয়নি। Super Admin-এর সঙ্গে যোগাযোগ করুন।",pendingVerified:"আপনার ইমেইল যাচাই হয়েছে। এখন Super Admin-এর অনুমোদনের অপেক্ষায় আছেন।",noAccess:"এই অ্যাকাউন্টের কমিটি অনুমতি পাওয়া যায়নি।"},
 en:{brandBn:"Friends Future Vision Forever",title:"Member Login",intro:"Sign in securely with your approved account.",emailLabel:"Email address",emailPlaceholder:"Your registered email",passwordLabel:"Password",passwordPlaceholder:"Your password",loginButton:"Sign in →",security:"Access is restricted to approved members and the Super Admin.",privacy:"Do not share your login credentials with anyone.",newMember:"New member?",forgot:"Forgot password?",emailRequired:"Enter your registered email first.",resetSent:"Recovery code sent.",resetTitle:"Set a new password",resetIntro:"Enter the 6-digit code sent to your email, then choose a new password.",newPasswordLabel:"New password",confirmPasswordLabel:"Confirm new password",savePassword:"Verify code and update password",createAccount:"Create an account",toggle:"বাংলা",checking:"Checking…",service:"Login service is not configured.",loginError:"Unable to sign in. Check your details and try again.",emailNotConfirmed:"Your email is not verified yet. Open the latest verification or invitation link from your Inbox/Spam folder.",invalidCredentials:"The email or password is incorrect. Check your details and try again.",resetRateLimited:"For security, email requests are temporarily rate-limited. Wait a little before trying again.",verificationSent:"If this email has an unverified signup, a verification link has been sent. Check Inbox/Spam.",resendFailed:"Could not resend the verification email. Check the email address and try again later.",pending:"Your account is awaiting Super Admin approval.",rejected:"This application was not approved. Please contact the Super Admin.",pendingVerified:"Your email is verified. Your account is now awaiting Super Admin approval.",noAccess:"This account does not have committee access."}
};
function tr(key){return copy[lang][key]||copy.bn[key]||key}
function show(key){msg.textContent=tr(key);msg.style.display="block"}
function renderLanguage(){
 document.documentElement.lang=lang;
 document.querySelectorAll("[data-i18n]").forEach(node=>{const key=node.dataset.i18n;node.textContent=tr(key)});
 document.querySelectorAll("[data-i18n-placeholder]").forEach(node=>{node.placeholder=tr(node.dataset.i18nPlaceholder)});
 document.getElementById("languageToggle").textContent=tr("toggle");
 document.getElementById("forgotPasswordLink").textContent=tr("forgot");
 document.querySelectorAll("#resetPanel [data-i18n]").forEach(node=>{node.textContent=tr(node.dataset.i18n)});
 document.title=lang==="bn"?"সদস্য লগইন | Friends Future Vision Forever":"Member Login | Friends Future Vision Forever";
}
document.getElementById("languageToggle").addEventListener("click",()=>{lang=lang==="bn"?"en":"bn";renderLanguage();if(msg.style.display==="block")msg.textContent=msg.dataset.messageKey?tr(msg.dataset.messageKey):msg.textContent});
function showKey(key){msg.dataset.messageKey=key;show(key)}

const resetPanel=document.getElementById("resetPanel"),resetMessage=document.getElementById("resetMessage");
const mandatoryPanel=document.getElementById("mandatoryPasswordPanel");
const requiredPasswordMessage=document.getElementById("requiredPasswordMessage");
const showResetMessage=text=>{resetMessage.textContent=text;resetMessage.style.display="block"};
const showMandatoryPasswordChange=()=>{
 form.hidden=true;resetPanel.hidden=true;mandatoryPanel.hidden=false;
 document.getElementById("forgotPasswordLink").hidden=true;
 document.getElementById("resendVerificationLink").hidden=true;
 document.querySelector(".security-note").hidden=true;
 document.querySelectorAll(".login > p.small").forEach(node=>node.hidden=true);
 document.getElementById("requiredNewPassword").focus();
};
const mfaPanel=document.getElementById("superAdminMfaPanel");
const mfaMessage=document.getElementById("mfaMessage");
let activeMfaFactorId=null;
const showMfaMessage=text=>{mfaMessage.textContent=text;mfaMessage.style.display="block"};
const startSuperAdminMfa=async()=>{
 form.hidden=true;resetPanel.hidden=true;mandatoryPanel.hidden=true;mfaPanel.hidden=false;
 document.getElementById("forgotPasswordLink").hidden=true;
 document.getElementById("resendVerificationLink").hidden=true;
 document.querySelector(".security-note").hidden=true;
 document.querySelectorAll(".login > p.small").forEach(node=>node.hidden=true);
 const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
 if(aalError){showMfaMessage(aalError.message);return}
 if(aal?.currentLevel==="aal2"){location.replace("dashboard.html");return}
 const {data:factors,error:factorError}=await supabase.auth.mfa.listFactors();
 if(factorError){showMfaMessage(factorError.message);return}
 const totp=factors?.totp||[];
 const verified=totp.find(factor=>factor.status==="verified");
 if(verified){
  activeMfaFactorId=verified.id;
  document.getElementById("mfaQrCode").hidden=true;
  document.getElementById("mfaSecretWrap").hidden=true;
  document.getElementById("mfaInstruction").textContent="আপনার Authenticator App খুলে বর্তমান ৬ সংখ্যার Code দিন।";
 }else{
  const unverified=totp.find(factor=>factor.status==="unverified");
  if(unverified){
   const {error}=await supabase.auth.mfa.unenroll({factorId:unverified.id});
   if(error){showMfaMessage(error.message);return}
  }
  const {data:enrolled,error:enrollError}=await supabase.auth.mfa.enroll({
   factorType:"totp",
   friendlyName:"Friends Future Vision Super Admin"
  });
  if(enrollError||!enrolled?.id||!enrolled?.totp?.qr_code){
   showMfaMessage(enrollError?.message||"Authenticator setup could not start.");return;
  }
  activeMfaFactorId=enrolled.id;
  document.getElementById("mfaQrCode").src=enrolled.totp.qr_code;
  document.getElementById("mfaQrCode").hidden=false;
  document.getElementById("mfaSecret").textContent=enrolled.totp.secret||"";
  document.getElementById("mfaSecretWrap").hidden=false;
  document.getElementById("mfaInstruction").textContent="Google Authenticator, Microsoft Authenticator বা অন্য TOTP App দিয়ে QR code scan করুন। তারপর ৬ সংখ্যার Code দিন।";
 }
 document.getElementById("mfaCode").focus();
};
document.getElementById("forgotPasswordLink").addEventListener("click",async event=>{
 event.preventDefault();if(!supabaseReady)return;
 const email=document.getElementById("email").value.trim().toLowerCase();
 if(!email){msg.textContent=tr("emailRequired");msg.style.display="block";document.getElementById("email").focus();return}
 const link=document.getElementById("forgotPasswordLink");link.style.pointerEvents="none";
 try{
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:new URL("login.html",location.href).href});
  if(error?.code==="over_email_send_rate_limit")showKey("resetRateLimited");
  else if(error)showKey("loginError");
  else{
   form.hidden=true;
   document.getElementById("resendVerificationLink").hidden=true;
   link.hidden=true;
   resetPanel.hidden=false;
   resetMessage.textContent=lang==="bn"?"আপনার Email-এ ৬ সংখ্যার Recovery Code পাঠানো হয়েছে। Inbox/Spam দেখুন।":"A 6-digit recovery code has been sent if this email has an account. Check Inbox/Spam.";
   resetMessage.style.display="block";
   document.getElementById("recoveryCode").focus();
  }
 }catch(error){showKey("loginError")}
 finally{link.style.pointerEvents=""}
});
document.getElementById("resendVerificationLink").addEventListener("click",async event=>{
 event.preventDefault();
 if(!supabaseReady)return;
 const email=document.getElementById("email").value.trim().toLowerCase();
 if(!email){msg.textContent=tr("emailRequired");msg.style.display="block";document.getElementById("email").focus();return}
 const link=document.getElementById("resendVerificationLink");
 if(link.dataset.busy==="true")return;
 link.dataset.busy="true";link.style.pointerEvents="none";
 try{
  const {error}=await supabase.auth.resend({type:"signup",email,options:{emailRedirectTo:new URL("login.html",location.href).href}});
  if(error?.code==="over_email_send_rate_limit")showKey("resetRateLimited");
  else if(error)showKey("resendFailed");
  else showKey("verificationSent");
 }catch(error){showKey("resendFailed")}
 finally{delete link.dataset.busy;link.style.pointerEvents=""}
});
let recoverySessionReady=false;
supabase.auth.onAuthStateChange((event,session)=>{
 if(event==="PASSWORD_RECOVERY"&&session){
  recoverySessionReady=true;
  form.hidden=true;document.querySelector(".security-note").hidden=true;document.querySelectorAll("body > main > p").forEach(x=>x.hidden=true);
  resetPanel.hidden=false;document.getElementById("forgotPasswordLink").hidden=true;
  document.getElementById("resendVerificationLink").hidden=true;
  document.getElementById("recoveryCode").required=false;
 }
});
document.getElementById("resetForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const email=document.getElementById("email").value.trim().toLowerCase();
 const token=document.getElementById("recoveryCode").value.trim();
 const password=document.getElementById("newPassword").value,confirmPassword=document.getElementById("confirmNewPassword").value;
 if(password.length<12){showResetMessage(lang==="bn"?"পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।":"Password must be at least 12 characters.");return}
 if(password!==confirmPassword){showResetMessage(lang==="bn"?"দুটি পাসওয়ার্ড এক নয়।":"The passwords do not match.");return}
 const button=document.getElementById("resetButton");button.disabled=true;button.textContent=lang==="bn"?"যাচাই হচ্ছে…":"Verifying…";
 if(!recoverySessionReady){
  if(!email||!token){showResetMessage(lang==="bn"?"Email ও Verification Code দিন।":"Enter your email and verification code.");button.disabled=false;button.textContent=tr("savePassword");return}
  const {error:verifyError}=await supabase.auth.verifyOtp({email,token,type:"recovery"});
  if(verifyError){showResetMessage(lang==="bn"?"Verification Code সঠিক নয় বা মেয়াদ শেষ। আবার Code নিন।":"Invalid or expired verification code. Request a new code.");button.disabled=false;button.textContent=tr("savePassword");return}
  recoverySessionReady=true;
 }
 const {error}=await supabase.auth.updateUser({password});
 if(error){showResetMessage(error.message);button.disabled=false;button.textContent=tr("savePassword");return}
 const {data:resetUser}=await supabase.auth.getUser();
 if(resetUser.user){
  const {data:resetProfile}=await supabase.from("profiles").select("must_change_password").eq("id",resetUser.user.id).maybeSingle();
  if(resetProfile?.must_change_password){
   const {data:currentUser}=await supabase.auth.getUser();
 const {error:flagError}=await supabase.from("profiles").update({must_change_password:false}).eq("id",currentUser.user.id);
   if(flagError){showResetMessage("Password changed, but first-login access could not be unlocked. Sign in again and complete the required password change.");button.disabled=false;button.textContent=tr("savePassword");return}
  }
 }
 showResetMessage(lang==="bn"?"Password পরিবর্তন হয়েছে। নতুন Password দিয়ে Login করুন।":"Password updated. Sign in with your new password.");
 await supabase.auth.signOut();
 setTimeout(()=>location.replace("login.html"),1200);
});

const isPasswordRecovery=location.hash.includes('type=recovery');
if(!supabaseReady)showKey("service");
else{
 const {data}=await supabase.auth.getSession();
 if(data.session){
  const {data:profile}=await supabase.from("profiles").select("role,must_change_password").eq("id",data.session.user.id).maybeSingle();
  if(isPasswordRecovery){ /* Keep the recovery session active for updateUser(). */ }
  else if(profile?.role==="super_admin")await startSuperAdminMfa();
  else if(profile?.role==="member"&&profile.must_change_password)showMandatoryPasswordChange();
  else if(profile?.role==="member")location.replace("dashboard.html");
  else{
   await supabase.auth.signOut();
   if(profile?.role==="pending")showKey("pending");
   else if(profile?.role==="rejected")showKey("rejected");
  }
 }
}
document.getElementById("mfaForm").addEventListener("submit",async event=>{
 event.preventDefault();
 if(!activeMfaFactorId){showMfaMessage("Authenticator setup পাওয়া যায়নি। Page reload করে আবার চেষ্টা করুন।");return}
 const code=document.getElementById("mfaCode").value.trim();
 if(!/^[0-9]{6}$/.test(code)){showMfaMessage("৬ সংখ্যার Code দিন।");return}
 const button=document.getElementById("mfaVerifyButton");button.disabled=true;button.textContent="যাচাই হচ্ছে…";
 const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:activeMfaFactorId});
 if(challengeError){showMfaMessage(challengeError.message);button.disabled=false;button.textContent="Verify করে প্রবেশ করুন";return}
 const {error:verifyError}=await supabase.auth.mfa.verify({factorId:activeMfaFactorId,challengeId:challenge.id,code});
 if(verifyError){showMfaMessage("Code সঠিক নয় বা মেয়াদ শেষ। নতুন Code দিয়ে আবার চেষ্টা করুন।");button.disabled=false;button.textContent="Verify করে প্রবেশ করুন";return}
 const {data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
 if(assuranceError||assurance?.currentLevel!=="aal2"){showMfaMessage("MFA verification complete হয়নি। আবার চেষ্টা করুন।");button.disabled=false;button.textContent="Verify করে প্রবেশ করুন";return}
 await supabase.auth.refreshSession();
 location.replace("dashboard.html");
});
document.getElementById("mfaSignOut").addEventListener("click",async()=>{
 await supabase.auth.signOut();
 location.replace("login.html");
});

document.getElementById("mandatoryPasswordForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const password=document.getElementById("requiredNewPassword").value;
 const confirmPassword=document.getElementById("requiredConfirmPassword").value;
 if(password.length<12){requiredPasswordMessage.textContent="Password কমপক্ষে ১২ অক্ষরের হতে হবে।";requiredPasswordMessage.style.display="block";return}
 if(password!==confirmPassword){requiredPasswordMessage.textContent="দুটি Password এক নয়।";requiredPasswordMessage.style.display="block";return}
 const button=document.getElementById("requiredPasswordButton");button.disabled=true;button.textContent="পরিবর্তন হচ্ছে…";
 const {error}=await supabase.auth.updateUser({password});
 if(error){requiredPasswordMessage.textContent=error.message;requiredPasswordMessage.style.display="block";button.disabled=false;button.textContent="Password পরিবর্তন করুন";return}
 const {error:flagError}=await supabase.rpc("complete_required_password_change");
 if(flagError){requiredPasswordMessage.textContent="Password বদলেছে, কিন্তু account unlock হয়নি। আবার চেষ্টা করুন বা Super Admin-কে জানান।";requiredPasswordMessage.style.display="block";button.disabled=false;button.textContent="আবার চেষ্টা করুন";return}
 await supabase.auth.refreshSession();
 location.replace("dashboard.html");
});

form.addEventListener("submit",async e=>{
 e.preventDefault();if(!supabaseReady)return;
 btn.disabled=true;btn.textContent=tr("checking");msg.style.display="none";
 const {data,error}=await supabase.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});
 if(error){
  if(error.code==="email_not_confirmed")showKey("emailNotConfirmed");
  else if(error.code==="invalid_credentials")showKey("invalidCredentials");
  else showKey("loginError");
 }
 else{
  const {data:p,error:pe}=await supabase.from("profiles").select("role,must_change_password").eq("id",data.user.id).maybeSingle();
  if(!pe&&p?.role==="super_admin"){await startSuperAdminMfa();return}
  if(!pe&&p?.role==="member"&&p.must_change_password){showMandatoryPasswordChange();return}
  if(!pe&&p?.role==="pending"){await supabase.auth.signOut();showKey("pendingVerified")}
  else if(!pe&&p?.role==="rejected"){await supabase.auth.signOut();showKey("rejected")}
  else if(pe||!p||!["super_admin","member"].includes(p.role)){await supabase.auth.signOut();showKey("noAccess")}
  else location.replace("dashboard.html")
 }
 btn.disabled=false;btn.textContent=tr("loginButton");document.getElementById("password").value="";
});
renderLanguage();
