import { supabase, supabaseReady } from "./supabase-client.js";
export async function requireRole(allowedRoles) {
 const panel=document.querySelector("[data-protected-panel]");
 const fail=message=>{if(panel){panel.innerHTML="";const h=document.createElement("h2");h.textContent="প্রবেশ যাচাই করা যায়নি";const p=document.createElement("p");p.textContent=message;const a=document.createElement("a");a.href="login.html";a.textContent="লগইন পেজে যান";panel.append(h,p,a)}};
 if(!supabaseReady||!supabase){fail("Login service প্রস্তুত নয়।");return null}
 try{
  const {data:s,error:se}=await supabase.auth.getSession();if(se)throw se;
  const session=s.session;if(!session?.user?.id){location.replace("login.html");return null}
  const {data:profile,error:pe}=await supabase.from("profiles").select("role,full_name").eq("id",session.user.id).maybeSingle();if(pe)throw pe;
  if(!profile||!["super_admin","admin","member"].includes(profile.role)){await supabase.auth.signOut();location.replace("login.html");return null}
  if(!allowedRoles.includes(profile.role)){location.replace(profile.role==="super_admin"?"admin.html":"dashboard.html");return null}
  return {session,role:profile.role,profile}
 }catch(e){console.error("Access check failed",e);fail("তোমার Login বা Role যাচাই করা যায়নি। নেটওয়ার্ক ও Supabase permission পরীক্ষা করো।");return null}
}