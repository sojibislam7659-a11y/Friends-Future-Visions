import { supabase, supabaseReady } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";

const root=document.getElementById("app");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{maximumFractionDigits:2});
const card=(label,value)=>'<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div></article>';
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB"):"—";

async function main(){
 const access=await requireRole(["super_admin","member"]);
 if(!access)return;
 const params=new URLSearchParams(location.search);
 let memberId=params.get("id");
 if(access.role==="member"){
  const {data:own,error:ownError}=await supabase.from("members").select("id").eq("auth_user_id",access.session.user.id).maybeSingle();
  if(ownError)throw ownError;
  if(!own?.id){root.innerHTML=empty("এই Login account-এর সঙ্গে কোনো Member Profile যুক্ত নেই।");return}
  if(memberId&&memberId!==own.id){root.innerHTML=empty("নিরাপত্তার কারণে অন্য সদস্যের Profile দেখার অনুমতি নেই।");return}
  memberId=own.id;
 }
 if(!memberId){root.innerHTML=empty("Member ID পাওয়া যায়নি।");return}
 const {data:m,error}=await supabase.from("members").select("*").eq("id",memberId).maybeSingle();
 if(error)throw error;
 if(!m){root.innerHTML=empty("Member Profile পাওয়া যায়নি।");return}
 if(access.role!=="super_admin"&&m.status!=="active"){root.innerHTML=empty("এই Profile এখনো Active নয়।");return}
 let photo="";
 if(m.profile_photo_path){
  const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(m.profile_photo_path,1800);
  if(u?.signedUrl)photo='<img class="member-profile-photo" src="'+esc(u.signedUrl)+'" alt="Profile photo">';
 }
 const groups=[
  {title:"ব্যক্তিগত তথ্য",fields:[["full_name","পূর্ণ নাম"],["full_name_bn","বাংলা নাম"],["father_name","পিতার নাম"],["mother_name","মাতার নাম"],["spouse_name","স্বামী/স্ত্রীর নাম"],["date_of_birth","জন্মতারিখ"],["gender","লিঙ্গ"],["profession","পেশা"]]},
  {title:"যোগাযোগ",fields:[["phone","মোবাইল"],["alternate_phone","বিকল্প মোবাইল"],["whatsapp","WhatsApp"],["email","ইমেইল"]]},
  {title:"ঠিকানা",fields:[["present_address","বর্তমান ঠিকানা"],["permanent_address","স্থায়ী ঠিকানা"],["district","জেলা"],["upazila","উপজেলা"]]},
  {title:"জরুরি যোগাযোগ",fields:[["emergency_contact_name","নাম"],["emergency_contact_relation","সম্পর্ক"],["emergency_contact_phone","মোবাইল"]]},
  {title:"Nominee",fields:[["nominee_name","নমিনির নাম"],["nominee_relation","সম্পর্ক"],["nominee_phone","মোবাইল"],["nominee_address","ঠিকানা"]]}
 ];
 const sections=groups.map(group=>{
  const rows=group.fields.filter(([key])=>m[key]!==null&&m[key]!==undefined&&String(m[key]).trim()!=="");
  if(!rows.length)return "";
  return '<section class="section"><h2>'+esc(group.title)+'</h2><div class="member-profile-grid">'+rows.map(([key,label])=>'<div class="member-profile-field"><small>'+esc(label)+'</small><strong>'+esc(m[key])+'</strong></div>').join("")+'</div></section>';
 }).join("");
 root.innerHTML='<div class="shell"><header class="topbar"><div class="brand"><img src="friends-future-vision-logo.svg" alt="Logo"><div><strong>ফ্রেন্ডস ফিউচার ভিশন ফরএভার</strong><small>Friends Future Vision Forever</small></div></div><div class="actions"><a class="button secondary" href="member-info.html">Member Info</a><a class="button secondary" href="dashboard.html">Dashboard</a></div></header><main class="page" style="margin-top:16px"><section class="member-profile-header">'+(photo||'<span class="member-profile-photo member-directory-fallback">FF</span>')+'<div><h1>'+esc(m.full_name_bn||m.full_name||"Member")+'</h1><p class="lead">'+esc(m.member_no||"")+' · '+esc(m.status)+'</p>'+(m.joining_date?'<p class="muted small">যোগদানের তারিখ: '+esc(dateText(m.joining_date))+'</p>':"")+'</div></section><div class="grid">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"Not configured")+'</div>'+sections+(m.member_note?'<section class="section"><h2>নোট</h2><p>'+esc(m.member_note)+'</p></section>':"")+'</main><footer class="footer">Friends Future Vision Forever · Secure member profile</footer></div>';
}
main().catch(error=>{console.error(error);root.innerHTML='<div class="shell"><div class="error">'+esc(error.message||"Profile load failed")+'</div></div>'});
