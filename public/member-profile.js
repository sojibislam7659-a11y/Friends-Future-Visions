import { supabase } from "./supabase-client.js";
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
 const adminControls=access.role==="super_admin"
  ? '<section class="section"><h2>সদস্যের Status ও Member No</h2><div class="field"><label for="memberStatus">Status</label><select id="memberStatus"><option value="pending" '+(m.status==="pending"?"selected":"")+' >Pending</option><option value="active" '+(m.status==="active"?"selected":"")+' >Active</option><option value="inactive" '+(m.status==="inactive"?"selected":"")+' >Inactive</option></select></div><p class="muted small">Pending সদস্যকে Active করলে Member No না থাকলে স্বয়ংক্রিয়ভাবে তৈরি হবে।</p><div class="field"><label for="memberNo">Member No</label><input id="memberNo" type="text" value="'+esc(m.member_no||"")+'" placeholder="যেমন: M-003" maxlength="30"></div><div class="form-actions"><button class="button" id="saveMemberNo" type="button">Member No Save</button></div></section>'
  : "";
 root.innerHTML='<div class="shell"><header class="topbar"><div class="brand"><img src="friends-future-vision-logo.svg" alt="Logo"><div><strong>ফ্রেন্ডস ফিউচার ভিশন ফরএভার</strong><small>Friends Future Vision Forever</small></div></div><div class="actions"><a class="button secondary" href="member-info.html">Member Info</a><a class="button secondary" href="dashboard.html">Dashboard</a></div></header><main class="page" style="margin-top:16px"><section class="member-profile-header">'+(photo||'<span class="member-profile-photo member-directory-fallback">FF</span>')+'<div><h1>'+esc(m.full_name_bn||m.full_name||"Member")+'</h1><p class="lead">'+esc(m.member_no||"Member No not assigned")+' · '+esc(m.status)+'</p>'+(m.joining_date?'<p class="muted small">যোগদানের তারিখ: '+esc(dateText(m.joining_date))+'</p>':"")+'</div></section>'+adminControls+'<div class="grid member-profile-summary">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"Not configured")+'</div>'+sections+(m.member_note?'<section class="section"><h2>নোট</h2><p>'+esc(m.member_note)+'</p></section>':"")+'</main><footer class="footer">Friends Future Vision Forever · Secure member profile</footer></div>';
 if(access.role==="super_admin"){
  const statusSelect=document.getElementById("memberStatus");
  statusSelect?.addEventListener("change",async()=>{
   const nextStatus=statusSelect.value;
   if(!["pending","active","inactive"].includes(nextStatus)){statusSelect.value=m.status;return}
   if(!confirm("এই সদস্যের Status "+nextStatus+" করবেন?")){statusSelect.value=m.status;return}
   statusSelect.disabled=true;
   const {error}=await supabase.from("members").update({status:nextStatus}).eq("id",m.id);
   if(error){alert("Status update হয়নি: "+error.message);statusSelect.disabled=false;statusSelect.value=m.status;return}
   alert(nextStatus==="active"&&!m.member_no?"সদস্য Active হয়েছে এবং Member No স্বয়ংক্রিয়ভাবে তৈরি হয়েছে।":"সদস্যের Status আপডেট হয়েছে।");
   location.reload();
  });
  document.getElementById("saveMemberNo")?.addEventListener("click",async()=>{
   const input=document.getElementById("memberNo");
   const nextNo=input.value.trim();
   if(!nextNo){alert("Member No খালি রাখা যাবে না।");input.focus();return}
   if(nextNo===String(m.member_no||"")){alert("Member No-তে কোনো পরিবর্তন করা হয়নি।");return}
   if(!confirm("এই সদস্যের Member No "+nextNo+" সেট করবেন?"))return;
   input.disabled=true;
   const saveButton=document.getElementById("saveMemberNo");
   saveButton.disabled=true;
   const {error}=await supabase.from("members").update({member_no:nextNo}).eq("id",m.id);
   if(error){alert("Member No Save হয়নি: "+error.message);input.disabled=false;saveButton.disabled=false;return}
   alert("Member No আপডেট হয়েছে।");
   location.reload();
  });
 }
}
main().catch(error=>{console.error(error);root.innerHTML='<div class="shell"><div class="error">'+esc(error.message||"Profile load failed")+'</div></div>'});
