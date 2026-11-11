import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";

const root=document.getElementById("app");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{maximumFractionDigits:2});
const card=(label,value)=>'<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div></article>';
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB"):"—";

async function compressMemberImage(file){
 if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("শুধু JPG, PNG অথবা WebP ছবি আপলোড করা যাবে।");
 if(file.size>10*1024*1024)throw new Error("ছবির সাইজ ১০ MB-এর বেশি।");
 if(typeof createImageBitmap!=="function")return file;
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));
 canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext("2d");
 if(!ctx)throw new Error("ছবি প্রস্তুত করা যায়নি।");
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.82));
 if(!blob)throw new Error("ছবি compress করা যায়নি।");
 return new File([blob],"member-photo.webp",{type:"image/webp",lastModified:Date.now()});
}

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
 let photo="",nomineePhoto="";
 if(m.profile_photo_path){
  const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(m.profile_photo_path,1800);
  if(u?.signedUrl)photo='<img class="member-profile-photo" src="'+esc(u.signedUrl)+'" alt="Profile photo">';
 }
 if(m.nominee_photo_path){
  const {data:u}=await supabase.storage.from("member-private-documents").createSignedUrl(m.nominee_photo_path,1800);
  if(u?.signedUrl)nomineePhoto='<section class="section"><h2>Nominee Picture</h2><img class="private-doc-thumb" src="'+esc(u.signedUrl)+'" alt="Nominee picture"></section>';
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
 const editableMemberFields=[
  ["full_name","পূর্ণ নাম","text"],["full_name_bn","বাংলা নাম","text"],
  ["father_name","পিতার নাম","text"],["mother_name","মাতার নাম","text"],["spouse_name","স্বামী/স্ত্রীর নাম","text"],
  ["date_of_birth","জন্মতারিখ","date"],["gender","লিঙ্গ","text"],["profession","পেশা","text"],
  ["phone","মোবাইল","text"],["alternate_phone","বিকল্প মোবাইল","text"],["whatsapp","WhatsApp","text"],["email","যোগাযোগের ইমেইল","email"],
  ["present_address","বর্তমান ঠিকানা","textarea"],["permanent_address","স্থায়ী ঠিকানা","textarea"],["district","জেলা","text"],["upazila","উপজেলা","text"],
  ["emergency_contact_name","জরুরি যোগাযোগের নাম","text"],["emergency_contact_relation","জরুরি যোগাযোগের সম্পর্ক","text"],["emergency_contact_phone","জরুরি যোগাযোগের মোবাইল","text"],
  ["nominee_name","নমিনির নাম","text"],["nominee_relation","নমিনির সম্পর্ক","text"],["nominee_phone","নমিনির মোবাইল","text"],["nominee_address","নমিনির ঠিকানা","textarea"],
  ["member_note","সদস্য সম্পর্কে নোট","textarea"],["joined_at","যোগদানের তারিখ","date"],["joining_date","রেকর্ডে যোগদানের তারিখ","date"],
  ["form_response_id","Google Form Response ID","text"],["data_consent","তথ্য ব্যবহারের সম্মতি","textarea"],["account_consent","অ্যাকাউন্ট সংক্রান্ত সম্মতি","textarea"]
 ];
 const adminFieldEditor=access.role==="super_admin"
  ? '<section class="section"><h2>Member তথ্য সম্পাদনা</h2><p class="muted small">এই অংশটি শুধু Super Admin-এর জন্য। Account ID ও system-created তথ্য নিরাপত্তার জন্য read-only থাকবে।</p><div class="member-profile-grid">'+editableMemberFields.map(([key,label,type])=>'<div class="field"><label for="edit_'+key+'">'+esc(label)+'</label>'+(type==="textarea"?'<textarea id="edit_'+key+'" data-member-field="'+key+'" rows="2">'+esc(m[key]??"")+'</textarea>':'<input id="edit_'+key+'" data-member-field="'+key+'" type="'+type+'" value="'+esc(m[key]??"")+'">')+'</div>').join("")+'</div><div class="member-profile-grid"><div class="field"><label for="edit_monthly_contribution">মাসিক জমার পরিমাণ (৳)</label><input id="edit_monthly_contribution" type="number" min="1" step="1" value="'+esc(m.monthly_contribution??"")+'"></div><div class="field"><label for="edit_contribution_effective_date">নতুন জমার হার কার্যকর হওয়ার তারিখ (মাসের ১ তারিখ)</label><input id="edit_contribution_effective_date" type="date" value="" ></div><div class="field"><label for="edit_profile_photo">Profile Photo (JPG/PNG/WebP)</label><input id="edit_profile_photo" type="file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label for="edit_nominee_photo">Nominee Photo (JPG/PNG/WebP)</label><input id="edit_nominee_photo" type="file" accept="image/jpeg,image/png,image/webp"></div></div><div class="form-actions"><button class="button" id="saveMemberFields" type="button">Confirm &amp; Save Changes</button><button class="secondary" id="cancelMemberEditor" type="button">Cancel</button></div></section>'
  : "";
 const adminControls=access.role==="super_admin"
  ? '<section class="section"><h2>সদস্যের Status ও Member No</h2><div class="field"><label for="memberStatus">Status</label><select id="memberStatus"><option value="pending" '+(m.status==="pending"?"selected":"")+' >Pending</option><option value="active" '+(m.status==="active"?"selected":"")+' >Active</option><option value="inactive" '+(m.status==="inactive"?"selected":"")+' >Inactive</option></select></div><p class="muted small">Pending সদস্যকে Active করলে Member No না থাকলে স্বয়ংক্রিয়ভাবে তৈরি হবে।</p><div class="field"><label for="memberNo">Member No</label><input id="memberNo" type="text" value="'+esc(m.member_no||"")+'" placeholder="যেমন: M-003" maxlength="30"></div><div class="form-actions"><button class="button" id="saveMemberNo" type="button">Member No Save</button></div></section>'
  : "";
 const combinedEditor=access.role==="super_admin" ? '<div id="memberFieldEditor" hidden>'+adminControls+adminFieldEditor+'</div>' : "";
 root.innerHTML='<div class="shell"><header class="topbar"><div class="brand"><img src="friends-future-vision-logo.svg" alt="Logo"><div><strong>ফ্রেন্ডস ফিউচার ভিশন ফরএভার</strong><small>Friends Future Vision Forever</small></div></div><div class="actions"><a class="button secondary" href="member-info.html">Member Info</a><a class="button secondary" href="dashboard.html">Dashboard</a></div></header><main class="page" style="margin-top:16px"><section class="member-profile-header">'+(photo||'<span class="member-profile-photo member-directory-fallback">FF</span>')+'<div><h1>'+esc(m.full_name_bn||m.full_name||"Member")+'</h1><p class="lead">'+esc(m.member_no||"Member No not assigned")+' · '+esc(m.status)+'</p>'+(m.joining_date?'<p class="muted small">যোগদানের তারিখ: '+esc(dateText(m.joining_date))+'</p>':"")+'</div></section>'<div class="grid member-profile-summary">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"Not configured")+'</div>'+sections+nomineePhoto+(m.member_note?'<section class="section"><h2>নোট</h2><p>'+esc(m.member_note)+'</p></section>':"")+'</main>'+(access.role==="super_admin"?'<button class="button" id="toggleMemberEditor" type="button" aria-controls="memberFieldEditor" aria-expanded="false" style="position:fixed;right:18px;bottom:18px;z-index:30;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.22)">✎ Edit Profile</button>':'')+combinedEditor+'<footer class="footer">Friends Future Vision Forever · Secure member profile</footer></div>';
 if(access.role==="super_admin"){
  const editor=document.getElementById("memberFieldEditor");
  const editorToggle=document.getElementById("toggleMemberEditor");
  editorToggle?.addEventListener("click",()=>{
   editor.hidden=!editor.hidden;
   editorToggle.setAttribute("aria-expanded",String(!editor.hidden));
   editorToggle.textContent=editor.hidden?"✎ Edit Profile":"✕ Close Editor";
   if(!editor.hidden)editor.scrollIntoView({behavior:"smooth",block:"start"});
  });
  document.getElementById("cancelMemberEditor")?.addEventListener("click",()=>{
   editor.hidden=true;
   editorToggle?.setAttribute("aria-expanded","false");
   if(editorToggle)editorToggle.textContent="✎ Edit Profile";
  });
  document.getElementById("saveMemberFields")?.addEventListener("click",async()=>{
   const fields=[...document.querySelectorAll("[data-member-field]")];
   const changes={};
   for(const input of fields){
    const key=input.dataset.memberField;
    const value=input.value.trim();
    if(key==="full_name"&&!value){alert("পূর্ণ নাম খালি রাখা যাবে না।");input.focus();return}
    if(input.type==="date"&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){alert("তারিখের Format সঠিক নয়।");input.focus();return}
    if(value!==String(m[key]??""))changes[key]=value===""?null:value;
   }
   const monthlyInput=document.getElementById("edit_monthly_contribution");
   const effectiveInput=document.getElementById("edit_contribution_effective_date");
   const monthlyChanged=monthlyInput&&monthlyInput.value!==String(m.monthly_contribution??"");
   if(monthlyChanged){
    const amount=Number(monthlyInput.value),effective=effectiveInput.value;
    if(!Number.isFinite(amount)||amount<=0){alert("মাসিক জমার পরিমাণ শূন্যের বেশি হতে হবে।");monthlyInput.focus();return}
    if(!effective||!/^\d{4}-\d{2}-01$/.test(effective)){alert("কার্যকর হওয়ার তারিখ মাসের ১ তারিখ হতে হবে।");effectiveInput.focus();return}
   }
   const profileFile=document.getElementById("edit_profile_photo")?.files?.[0]||null;
   const nomineeFile=document.getElementById("edit_nominee_photo")?.files?.[0]||null;
   if(!Object.keys(changes).length&&!monthlyChanged&&!profileFile&&!nomineeFile){alert("কোনো পরিবর্তন করা হয়নি।");return}
   const labels=Object.keys(changes).map(key=>editableMemberFields.find(field=>field[0]===key)?.[1]||key);
   const actions=[...labels];
   if(monthlyChanged)actions.push("মাসিক জমার হার");
   if(profileFile)actions.push("Profile Photo");
   if(nomineeFile)actions.push("Nominee Photo");
   if(!confirm("নিচের "+actions.length+"টি পরিবর্তন Save করবেন?\n\n"+actions.join(", ")))return;
   const button=document.getElementById("saveMemberFields");
   button.disabled=true;
   try{
    if(Object.keys(changes).length){
     const {error}=await supabase.from("members").update(changes).eq("id",m.id);
     if(error)throw error;
    }
    if(monthlyChanged){
     const {error}=await supabase.rpc("set_member_contribution_rate",{
      p_member_id:m.id,p_amount:Number(monthlyInput.value),p_effective_from:effectiveInput.value
     });
     if(error)throw error;
    }
    const uploadPhoto=async(file,bucket,field,prefix)=>{
     if(!file)return;
     const prepared=await compressMemberImage(file);
     const maxBytes=bucket==="member-profile-photos"?5*1024*1024:10*1024*1024;
     if(prepared.size>maxBytes)throw new Error("Compress করার পরও ছবির সাইজ এই Storage bucket-এর সীমার বেশি।");
     const ownerFolder=m.auth_user_id||access.session.user.id;
     const extension=prepared.type==="image/png"?"png":prepared.type==="image/jpeg"?"jpg":"webp";
     const path=ownerFolder+"/"+m.id+"/"+prefix+"-"+Date.now()+"."+extension;
     const {error:uploadError}=await supabase.storage.from(bucket).upload(path,prepared,{contentType:prepared.type,upsert:false});
     if(uploadError)throw uploadError;
     const oldPath=m[field];
     const {error:updateError}=await supabase.from("members").update({[field]:path}).eq("id",m.id);
     if(updateError){
      await supabase.storage.from(bucket).remove([path]);
      throw updateError;
     }
     if(oldPath&&oldPath!==path)await supabase.storage.from(bucket).remove([oldPath]);
    };
    await uploadPhoto(profileFile,"member-profile-photos","profile_photo_path","profile");
    await uploadPhoto(nomineeFile,"member-private-documents","nominee_photo_path","nominee");
    alert("Member-এর তথ্য সফলভাবে Save হয়েছে।");
    location.reload();
   }catch(error){
    alert("সব পরিবর্তন সম্পন্ন হয়নি: "+(error?.message||String(error))+". যেসব তথ্য আগে Save হয়েছে সেগুলো অপরিবর্তিত থাকতে পারে; পুনরায় পরীক্ষা করুন।");
    button.disabled=false;
   }
  });
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
