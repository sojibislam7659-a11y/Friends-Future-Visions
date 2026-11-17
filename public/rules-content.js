import {supabase,supabaseReady} from "./supabase-client.js";
const root=document.getElementById("rulesContent");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
async function load(){
 if(!supabaseReady){root.innerHTML=empty("Rules service is unavailable.");return}
 const {data:sessionData}=await supabase.auth.getSession();
 const user=sessionData?.session?.user||null;
 let isSuper=false;
 if(user){
  const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profileError){root.innerHTML=empty(profileError.message);return}
  isSuper=profile?.role==="super_admin";
 }
 const {data:rules,error}=await supabase.from("committee_rules").select("id,rule_key,title,body,sort_order,is_active").order("sort_order");
 if(error){root.innerHTML=empty(error.message);return}
 if(!rules?.length){root.innerHTML=empty("এখনো কোনো নিয়ম প্রকাশ করা হয়নি।");return}
 if(!isSuper){
  root.innerHTML=rules.filter(rule=>rule.is_active).map(rule=>'<section class="section"><h2>'+esc(rule.title)+'</h2><p>'+esc(rule.body)+'</p></section>').join("")||empty("এখনো কোনো প্রকাশিত নিয়ম নেই।");
  return;
 }
 root.innerHTML='<form id="rulesEditForm"><div class="notice">Super Admin এখানে নিয়মের শিরোনাম ও বিবরণ সম্পাদনা করতে পারবেন। একবার Save Changes চাপলে সব নিয়ম একসঙ্গে সংরক্ষিত হবে।</div>'+rules.map(rule=>'<section class="section rules-editor-card"><input type="hidden" name="id" value="'+esc(rule.id)+'"><div class="field"><label>শিরোনাম</label><input name="title" maxlength="180" required value="'+esc(rule.title)+'"></div><div class="field"><label>বিবরণ</label><textarea name="body" rows="3" maxlength="5000" required>'+esc(rule.body)+'</textarea></div><div class="field"><label>ক্রম</label><input name="sort_order" type="number" min="1" max="999" step="1" value="'+Number(rule.sort_order)+'"></div><label class="inline-check"><input name="is_active" type="checkbox" '+(rule.is_active?"checked":"")+'> প্রকাশিত থাকবে</label></section>').join("")+'<div class="form-actions"><button type="submit" id="saveRules">Save Changes</button><span id="rulesSaveStatus" class="muted small"></span></div></form>';
 document.getElementById("rulesEditForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget,sections=[...form.querySelectorAll(".rules-editor-card")];
  const changes=sections.map(section=>({
   id:section.querySelector('[name="id"]').value,
   title:section.querySelector('[name="title"]').value.trim(),
   body:section.querySelector('[name="body"]').value.trim(),
   sort_order:Number(section.querySelector('[name="sort_order"]').value),
   is_active:section.querySelector('[name="is_active"]').checked
  }));
  if(changes.some(item=>!item.title||!item.body||!Number.isInteger(item.sort_order)||item.sort_order<1||item.sort_order>999)){
   alert("প্রতিটি নিয়মের শিরোনাম, বিবরণ ও সঠিক ক্রম দিতে হবে।");return;
  }
  const button=document.getElementById("saveRules"),status=document.getElementById("rulesSaveStatus");
  button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
  const {data,error}=await supabase.rpc("save_committee_rules",{p_changes:changes});
  if(error){status.textContent="Save হয়নি।";alert("Rules save error: "+error.message);button.disabled=false;return}
  status.textContent=(data?.saved||changes.length)+"টি নিয়ম সংরক্ষিত হয়েছে।";
  await load();
 });
}
load();
