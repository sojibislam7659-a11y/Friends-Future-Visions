import "./password-visibility.js";
import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";
import { BRAND_LOGO_SVG } from "./brand-logo.js";
import { installPwa } from "./pwa.js";

const root=document.getElementById("app");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{maximumFractionDigits:2});
const card=(label,value)=>'<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div></article>';
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB"):"—";

async function compressMemberImage(file,maxBytes){
 if(!file||!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("শুধু JPG, PNG অথবা WebP ছবি আপলোড করা যাবে।");
 if(file.size>20*1024*1024)throw new Error("মূল ছবির সাইজ ২০ MB-এর বেশি।");
 if(typeof createImageBitmap!=="function")return file;
 const bitmap=await createImageBitmap(file);
 const maxEdge=maxBytes<=5*1024*1024?720:1400;
 const targetBytes=maxBytes<=5*1024*1024?400*1024:1500*1024;
 const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));
 canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext("2d");
 if(!ctx)throw new Error("ছবি প্রস্তুত করা যায়নি।");
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close?.();
 let blob=null;
 for(const quality of [0.92,0.88,0.84,0.80,0.76,0.72]){
  blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  if(blob&&blob.size<=targetBytes)break;
 }
 if(!blob||blob.size>maxBytes)throw new Error("Compress করার পরও ছবির সাইজ Storage সীমার মধ্যে আনা যায়নি।");
 const outputType=blob.type||"image/webp";
 const extension=outputType==="image/png"?"png":outputType==="image/jpeg"?"jpg":"webp";
 return new File([blob],"member-photo."+extension,{type:outputType,lastModified:Date.now()});
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
 let identityDocumentSection="",nomineeNidSection="";
 const canViewOwnPrivateDocuments=access.role==="super_admin"||m.auth_user_id===access.session.user.id;
 const renderIdentityDocument=async(path,label,type)=>{
  if(!canViewOwnPrivateDocuments||!path)return "";
  const {data:u,error:documentError}=await supabase.storage.from("member-private-documents").createSignedUrl(path,1800);
  if(documentError||!u?.signedUrl)return '<section class="section"><h2>'+esc(label)+'</h2><p class="muted small">ফাইলটি নিরাপদে খোলা যাচ্ছে না।</p></section>';
  const typeLabel={nid:"NID",birth_registration:"Birth Registration",passport:"Passport"}[type]||"Identity Document";
  const image=/\.(?:jpe?g|png|webp)$/i.test(path);
  const preview=image?'<a class="private-document-preview-link" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener"><img class="private-doc-thumb identity-document-preview" src="'+esc(u.signedUrl)+'" alt="'+esc(label)+'"></a>':"";
  return '<section class="section"><h2>'+esc(label)+' · '+esc(typeLabel)+'</h2>'+preview+'<a class="button secondary private-document-open" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">View '+esc(typeLabel)+'</a></section>';
 };
 identityDocumentSection=await renderIdentityDocument(m.member_identity_document_path,"Member Identity Document",m.member_identity_document_type);
 nomineeNidSection=await renderIdentityDocument(m.nominee_nid_path,"Nominee Identity Document",m.nominee_identity_document_type);
 const {data:financialRows,error:financialError}=await supabase.rpc("get_member_shared_financial_data_v2");
 if(financialError)throw financialError;
 const ownFinancial=(financialRows||[]).find(row=>row.member_id===m.id);
 const totalDeposit=Number(ownFinancial?.total_paid||0);
 const totalDue=ownFinancial?.due_configured?money(ownFinancial.total_due):"Rate not set";
 const contributionValue=m.monthly_contribution?money(m.monthly_contribution):"৳2,000 (default)";
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
  ["member_no","Member ID","text"],["status","Status","select"],
  ["full_name","পূর্ণ নাম","text"],["full_name_bn","বাংলা নাম","text"],
  ["father_name","পিতার নাম","text"],["mother_name","মাতার নাম","text"],["spouse_name","স্বামী/স্ত্রীর নাম","text"],
  ["date_of_birth","জন্মতারিখ","date"],["gender","লিঙ্গ","text"],["profession","পেশা","text"],
  ["phone","মোবাইল","text"],["alternate_phone","বিকল্প মোবাইল","text"],["whatsapp","WhatsApp","text"],["email","যোগাযোগের ইমেইল","email"],
  ["present_address","বর্তমান ঠিকানা","textarea"],["permanent_address","স্থায়ী ঠিকানা","textarea"],["district","জেলা","text"],["upazila","উপজেলা","text"],
  ["emergency_contact_name","জরুরি যোগাযোগের নাম","text"],["emergency_contact_relation","জরুরি যোগাযোগের সম্পর্ক","text"],["emergency_contact_phone","জরুরি যোগাযোগের মোবাইল","text"],
  ["nominee_name","নমিনির নাম","text"],["nominee_relation","নমিনির সম্পর্ক","text"],["nominee_phone","নমিনির মোবাইল","text"],["nominee_address","নমিনির ঠিকানা","textarea"],
  ["member_note","সদস্য সম্পর্কে নোট","textarea"],["joined_at","যোগদানের তারিখ","date"],["joining_date","রেকর্ডে যোগদানের তারিখ","date"],
  ["data_consent","তথ্য ব্যবহারের সম্মতি","textarea"],["account_consent","অ্যাকাউন্ট সংক্রান্ত সম্মতি","textarea"]
 ];
 const adminFieldEditor=access.role==="super_admin"
  ? '<section class="section"><h2>Member তথ্য সম্পাদনা</h2><p class="muted small">এই অংশটি শুধু Super Admin-এর জন্য। Row ID, Auth account link, created_at ও contribution_start_date (rate history) system-managed/read-only; মাসিক জমার হার effective date দিয়ে পরিবর্তন করতে হবে।</p><div class="member-profile-grid">'+editableMemberFields.map(([key,label,type])=>'<div class="field"><label for="edit_'+key+'">'+esc(label)+'</label>'+(type==="textarea"?'<textarea id="edit_'+key+'" data-member-field="'+key+'" rows="2">'+esc(m[key]??"")+'</textarea>':type==="select"?'<select id="edit_'+key+'" data-member-field="'+key+'"><option value="pending" '+(m[key]==="pending"?"selected":"")+'>Pending</option><option value="active" '+(m[key]==="active"?"selected":"")+'>Active</option><option value="inactive" '+(m[key]==="inactive"?"selected":"")+'>Inactive</option></select>':'<input id="edit_'+key+'" data-member-field="'+key+'" type="'+type+'" value="'+esc(m[key]??"")+'">')+'</div>').join("")+'</div><div class="member-profile-grid"><div class="field"><label for="edit_monthly_contribution">মাসিক জমার পরিমাণ (৳)</label><input id="edit_monthly_contribution" type="number" min="1" step="1" value="'+esc(m.monthly_contribution??2000)+'"></div><div class="field"><label for="edit_contribution_effective_date">নতুন জমার হার কার্যকর হওয়ার তারিখ (মাসের ১ তারিখ)</label><input id="edit_contribution_effective_date" type="date" min="2027-01-01" max="2031-12-01" value="" ></div><div class="field"><label for="edit_profile_photo">Profile Photo (JPG/PNG/WebP)</label><input id="edit_profile_photo" type="file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label for="edit_nominee_photo">Nominee Photo (JPG/PNG/WebP)</label><input id="edit_nominee_photo" type="file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label for="edit_member_identity_document_type">Member Identity Type</label><select id="edit_member_identity_document_type"><option value="">Select document type</option><option value="nid" '+(m.member_identity_document_type==="nid"?"selected":"")+'>NID</option><option value="birth_registration" '+(m.member_identity_document_type==="birth_registration"?"selected":"")+'>Birth Registration</option><option value="passport" '+(m.member_identity_document_type==="passport"?"selected":"")+'>Passport</option></select></div><div class="field"><label for="edit_member_identity_document">Member Identity Document (PDF/JPG/PNG/WebP)</label><input id="edit_member_identity_document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><button class="secondary" id="scan_member_identity_document" type="button">Scan / Crop &amp; Enhance Image</button></div><div class="field"><label for="edit_nominee_identity_document_type">Nominee Identity Type</label><select id="edit_nominee_identity_document_type"><option value="">Select document type</option><option value="nid" '+(m.nominee_identity_document_type==="nid"?"selected":"")+'>NID</option><option value="birth_registration" '+(m.nominee_identity_document_type==="birth_registration"?"selected":"")+'>Birth Registration</option><option value="passport" '+(m.nominee_identity_document_type==="passport"?"selected":"")+'>Passport</option></select></div><div class="field"><label for="edit_nominee_nid">Nominee Identity Document (PDF/JPG/PNG/WebP)</label><input id="edit_nominee_nid" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><button class="secondary" id="scan_nominee_nid" type="button">Scan / Crop &amp; Enhance Image</button></div></div><div class="form-actions"><button class="button" id="saveMemberFields" type="button">Save Changes</button><button class="secondary" id="cancelMemberEditor" type="button">Cancel</button></div></section>'
  : "";
 const combinedEditor=access.role==="super_admin" ? '<div id="memberFieldEditor" hidden>'+adminFieldEditor+'</div>' : "";
 const isSuper=access.role==="super_admin";
 const roleLabel=isSuper?"Super Admin":"Member";
  let profileLang="bn";try{profileLang=localStorage.getItem("ffv-lang")==="en"?"en":"bn"}catch{}
 const navIcon=(name)=>{
  const paths={menu:' <path d="M4 6h16M4 12h16M4 18h16"/>',home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5M10 14l2 2 4-4"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6zM9 12l2 2 4-4"/>'};
  return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.data)+'</svg>';
 };
 const item=(href,label,ico)=>'<a href="'+href+'"'+(href==="statement.html"?' class="member-statement-nav-link button secondary"':"")+'>'+navIcon(ico)+'<span>'+label+'</span></a>';
 const primaryNav=item("dashboard.html","হোম","home")+item("rules.html","RULES","rules")+item("member-info.html","MEMBER INFO","members")+item("data.html","DATA","data")+(isSuper?item("personal-due.html","PERSONAL DUE","due")+item("proof.html","PROOF","proof")+item("payment.html","PAYMENT","payment")+item("admin.html","SUPER ADMIN","admin"):item("personal-due.html","PERSONAL DUE","due")+item("proof.html","PROOF","proof")+item("payment.html","PAYMENT","payment")+item("statement.html","MY STATEMENT","data")+item("member.html","MY PROFILE","members"));
 const sidebarNav=isSuper?item("personal-due.html","PERSONAL DUE","due")+item("proof.html","PROOF","proof")+item("payment.html","PAYMENT","payment")+item("admin.html","SUPER ADMIN","admin"):item("personal-due.html","PERSONAL DUE","due")+item("proof.html","PROOF","proof")+item("payment.html","PAYMENT","payment")+item("statement.html","MY STATEMENT","data")+item("member.html","MY PROFILE","members");
 const bottomNav='<nav class="mobile-bottom-nav" aria-label="Quick navigation">'+item("dashboard.html","হোম","home")+item("member-info.html","সদস্য","members")+item("rules.html","নিয়ম","rules")+item("data.html","ডাটা","data")+'<button type="button" id="profileMobileMenuBtn" aria-label="Open menu">'+navIcon("menu")+'<span>আরও</span></button></nav>';
 root.innerHTML='<div class="shell"><header class="topbar member-profile-topbar"><button class="icon-button menu-button" id="profileMenuBtn" type="button" aria-label="Open menu" aria-expanded="false">☰</button><div class="brand topbar-brand">'+BRAND_LOGO_SVG+'<div class="topbar-identity"><strong>'+esc(String(m.full_name_bn||m.full_name||"Member"))+'</strong><small>Friends Future Visions Forever</small></div></div><div class="actions"><span class="role topbar-role">'+roleLabel+'</span></div></header><div class="site-ticker global-site-ticker" id="globalNoticeTicker" role="region" aria-label="Latest notice" hidden><strong class="site-ticker-label">নোটিশ</strong><div class="site-ticker-window"><span id="globalNoticeTickerText"></span></div></div><nav class="nav primary-nav" aria-label="Main navigation">'+primaryNav+'</nav><div class="drawer-backdrop" id="profileDrawerBackdrop" hidden></div><aside class="sidebar-panel" id="profileSidebar" aria-label="Main navigation" hidden><div class="sidebar-head"><a class="sidebar-brand" href="dashboard.html">'+BRAND_LOGO_SVG.replaceAll("ffvTopArcGrad","ffvTopArcGradSidebar")+'<span><strong>'+esc(String(m.full_name_bn||m.full_name||"Member"))+'</strong><small>'+roleLabel+'</small></span></a><button class="icon-button drawer-close" id="profileCloseMenu" type="button" aria-label="Close menu">×</button></div><nav class="nav sidebar-nav">'+sidebarNav+'</nav><div class="sidebar-footer"><div class="sidebar-account"><span class="account-role">'+roleLabel+'</span><span class="account-email">'+esc(access.session.user.email||"")+'</span></div><button class="secondary" id="profileThemeToggle" type="button">Dark / Light</button><button class="secondary" id="profileLanguageToggle" type="button">'+(profileLang==="bn"?"English":"বাংলা")+'</button>'+(isSuper?'<details class="export-menu sidebar-export-menu"><summary>EXPORT DATA</summary><div class="export-menu-panel"><button type="button" data-export-action="full-xlsx">সম্পূর্ণ Website · Excel</button><button type="button" data-export-action="full-docx">সম্পূর্ণ Website · Word</button></div></details>':'')+'<button class="secondary" id="sidebarInstallAppBtn" type="button">Install App</button><button class="secondary" id="profileLogoutBtn" type="button">লগআউট</button></div></aside><main class="page" id="memberProfileContent" style="margin-top:12px"><section class="member-profile-header">'+(photo||'<span class="member-profile-photo member-directory-fallback">FF</span>')+'<div><h1>'+esc(m.full_name_bn||m.full_name||"Member")+'</h1><p class="lead">'+esc(m.member_no||"Member No not assigned")+(isSuper?' · '+esc(m.status):"")+'</p>'+(m.joining_date?'<p class="muted small">যোগদানের তারিখ: '+esc(dateText(m.joining_date))+'</p>':"")+'</div></section>'+'<div class="grid member-profile-summary">'+card("Member ID",m.member_no||"—")+(isSuper?card("Status",m.status):"")+card("Monthly contribution",contributionValue)+card("Total Deposit",money(totalDeposit))+card("Total Due",totalDue)+'</div>'+sections+nomineePhoto+identityDocumentSection+nomineeNidSection+(m.member_note?'<section class="section"><h2>নোট</h2><p>'+esc(m.member_note)+'</p></section>':'')+'</main>'+(access.role==="super_admin"?'<button class="button" id="toggleMemberEditor" type="button" aria-controls="memberFieldEditor" aria-expanded="false" style="position:fixed;right:18px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:30;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.22)">✎ Edit Profile</button>':'')+combinedEditor+'<footer class="footer">Friends Future Visions Forever · Secure member profile</footer>'+bottomNav+'</div>';

 let profileTheme="light";try{profileTheme=localStorage.getItem("ffv-theme")==="dark"?"dark":"light"}catch{}
 document.body.classList.toggle("dark-theme",profileTheme==="dark");
 const themeButton=document.getElementById("profileThemeToggle");
 themeButton?.addEventListener("click",()=>{const next=document.body.classList.contains("dark-theme")?"light":"dark";document.body.classList.toggle("dark-theme",next==="dark");try{localStorage.setItem("ffv-theme",next)}catch{}themeButton.textContent=next==="dark"?"☀ Light":"☾ Dark"});
  document.getElementById("profileLanguageToggle")?.addEventListener("click",()=>{const next=profileLang==="bn"?"en":"bn";try{localStorage.setItem("ffv-lang",next)}catch{}location.reload()});
 const sidebar=document.getElementById("profileSidebar"),backdrop=document.getElementById("profileDrawerBackdrop");
 const closeMenu=()=>{sidebar.hidden=true;backdrop.hidden=true;document.getElementById("profileMenuBtn")?.setAttribute("aria-expanded","false");document.getElementById("profileMobileMenuBtn")?.setAttribute("aria-expanded","false")};
 const toggleMenu=()=>{const open=sidebar.hidden;closeMenu();sidebar.hidden=!open;backdrop.hidden=!open;document.getElementById("profileMenuBtn")?.setAttribute("aria-expanded",String(open));document.getElementById("profileMobileMenuBtn")?.setAttribute("aria-expanded",String(open))};
 document.getElementById("profileMenuBtn")?.addEventListener("click",toggleMenu);
 document.getElementById("profileMobileMenuBtn")?.addEventListener("click",toggleMenu);
 document.getElementById("profileCloseMenu")?.addEventListener("click",closeMenu);
 backdrop?.addEventListener("click",closeMenu);
 sidebar?.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeMenu));
 document.getElementById("sidebarInstallAppBtn")?.addEventListener("click",async()=>{try{const result=await installPwa();if(!result.available)alert("এই browser-এ Install prompt পাওয়া যায়নি। Chrome menu থেকে Add to Home screen ব্যবহার করুন।");else if(result.outcome==="accepted")alert("App install শুরু হয়েছে।")}catch(error){alert(error.message||"Install prompt চালু করা যায়নি।")}});
 document.getElementById("profileLogoutBtn")?.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)alert(error.message);else location.replace("login.html")});
 const ticker=document.getElementById("globalNoticeTicker"),tickerText=document.getElementById("globalNoticeTickerText");
 try{
  let notice="";
  const noticeResult=await supabase.from("notices").select("title,body").eq("published",true).order("published_at",{ascending:false}).limit(1).maybeSingle();
  if(!noticeResult.error&&noticeResult.data)notice=String(noticeResult.data.body||noticeResult.data.title||"").trim();
  if(!notice){
   const settingsResult=await supabase.from("site_settings").select("setting_key,setting_value").in("setting_key",["ticker_message","ticker_enabled"]);
   if(!settingsResult.error){const settings=Object.fromEntries((settingsResult.data||[]).map(row=>[row.setting_key,row.setting_value]));if(settings.ticker_enabled!=="false")notice=String(settings.ticker_message||"").trim()}
  }
  if(notice&&ticker&&tickerText){tickerText.textContent=notice;ticker.hidden=false}
 }catch(error){console.warn("Member profile notice ticker unavailable",error)}

 document.querySelectorAll("[data-export-action]").forEach(button=>button.addEventListener("click",async()=>{
  const action=button.dataset.exportAction,original=button.textContent;button.disabled=true;button.textContent="তৈরি হচ্ছে…";
  try{
   const tools=await import("./export-tools.js");
   if(action==="page-xlsx")await tools.exportCurrentPage("xlsx");
   else if(action==="page-docx")await tools.exportCurrentPage("docx");
   else{
    if(!confirm("সম্পূর্ণ Website Export-এ সদস্যদের ব্যক্তিগত তথ্য ও আর্থিক রেকর্ড থাকবে। ফাইলটি নিরাপদে রাখবেন। চালিয়ে যাবেন?"))return;
    await tools.exportFullWebsite(supabase,action==="full-docx"?"docx":"xlsx");
   }
   alert("Export file তৈরি হয়েছে। Download folder পরীক্ষা করুন।");
  }catch(error){console.error(error);alert("Export ব্যর্থ: "+(error.message||"Unknown error"))}
  finally{button.disabled=false;button.textContent=original}
 }));
 if(access.role==="super_admin"){
  const bindDocumentScanner=(inputId,buttonId)=>{
   const input=document.getElementById(inputId),scanButton=document.getElementById(buttonId);
   scanButton?.addEventListener("click",async()=>{
    const original=input?.files?.[0];
    if(!original){alert("আগে একটি পরিচয়পত্রের ছবি নির্বাচন করুন।");input?.focus();return}
    if(original.type==="application/pdf"){alert("PDF ফাইল সরাসরি Upload করুন। Scan/Crop শুধু JPG, PNG বা WebP ছবির জন্য।");return}
    scanButton.disabled=true;const oldLabel=scanButton.textContent;scanButton.textContent="Scanning…";
    try{
     const {scanDocumentImage}=await import("./document-scanner.js");
     const result=await scanDocumentImage(original,"color",0);
     const transfer=new DataTransfer();transfer.items.add(result.file);input.files=transfer.files;
     const before=(result.originalSize/1024/1024).toFixed(2),after=(result.outputSize/1024/1024).toFixed(2);
     scanButton.textContent=result.cornersDetected?"Scan/Crop complete":"Image enhanced";
     alert((result.cornersDetected?"Document edge detected and cropped. ":"Document edges were not detected; image was enhanced without perspective crop. ")+"Original "+before+" MB → processed "+after+" MB. Check readability before saving.");
    }catch(error){alert("Scan করা যায়নি: "+(error?.message||String(error)));}
    finally{scanButton.disabled=false;if(scanButton.textContent==="Scanning…")scanButton.textContent=oldLabel}
   });
  };
  bindDocumentScanner("edit_member_identity_document","scan_member_identity_document");
  bindDocumentScanner("edit_nominee_nid","scan_nominee_nid");
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
    if(key==="joined_at"&&!value){alert("যোগদানের তারিখ খালি রাখা যাবে না।");input.focus();return}
    if(key==="status"&&!["pending","active","inactive"].includes(value)){alert("Status সঠিক নয়।");input.focus();return}
    if(input.type==="date"&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)){alert("তারিখের Format সঠিক নয়।");input.focus();return}
    if(key==="date_of_birth"&&value&&value>new Date().toISOString().slice(0,10)){alert("জন্মতারিখ ভবিষ্যতের হতে পারে না।");input.focus();return}
    if(input.type==="email"&&value&&!input.checkValidity()){alert("যোগাযোগের ইমেইল সঠিক নয়।");input.focus();return}
    if(value!==String(m[key]??""))changes[key]=value===""?null:value;
   }
   const monthlyInput=document.getElementById("edit_monthly_contribution");
   const effectiveInput=document.getElementById("edit_contribution_effective_date");
   const monthlyChanged=Boolean(monthlyInput&&(monthlyInput.value!==String(m.monthly_contribution??2000)||effectiveInput?.value));
   if(monthlyChanged){
    const amount=Number(monthlyInput.value),effective=effectiveInput.value;
    if(!Number.isFinite(amount)||amount<=0){alert("মাসিক জমার পরিমাণ শূন্যের বেশি হতে হবে।");monthlyInput.focus();return}
    if(!effective||effective.length!==10||!effective.endsWith("-01")||effective<"2027-01-01"||effective>="2032-01-01"){alert("কার্যকর হওয়ার তারিখ মাসের ১ তারিখ এবং Jan 2027–Dec 2031-এর মধ্যে হতে হবে।");effectiveInput.focus();return}
   }
   const profileFile=document.getElementById("edit_profile_photo")?.files?.[0]||null;
   const nomineeFile=document.getElementById("edit_nominee_photo")?.files?.[0]||null;
   const identityFile=document.getElementById("edit_member_identity_document")?.files?.[0]||null;
   const nomineeNidFile=document.getElementById("edit_nominee_nid")?.files?.[0]||null;
   const identityType=document.getElementById("edit_member_identity_document_type")?.value||null;
   const nomineeIdentityType=document.getElementById("edit_nominee_identity_document_type")?.value||null;
   if(identityFile&&!identityType){alert("Member-এর পরিচয়পত্রের ধরন নির্বাচন করুন।");document.getElementById("edit_member_identity_document_type")?.focus();return}
   if(nomineeNidFile&&!nomineeIdentityType){alert("Nominee-এর পরিচয়পত্রের ধরন নির্বাচন করুন।");document.getElementById("edit_nominee_identity_document_type")?.focus();return}
   if(identityType!==m.member_identity_document_type)changes.member_identity_document_type=identityType;
   if(nomineeIdentityType!==m.nominee_identity_document_type)changes.nominee_identity_document_type=nomineeIdentityType;
   if(!Object.keys(changes).length&&!monthlyChanged&&!profileFile&&!nomineeFile&&!identityFile&&!nomineeNidFile){alert("কোনো পরিবর্তন করা হয়নি।");return}
   const button=document.getElementById("saveMemberFields");
   button.disabled=true;
   const uploaded=[];
   const uploadPhoto=async(file,bucket,field,prefix)=>{
    if(!file)return;
    const maxBytes=bucket==="member-profile-photos"?5*1024*1024:10*1024*1024;
    const prepared=await compressMemberImage(file,maxBytes);
    if(prepared.size>maxBytes)throw new Error("Compress করার পরও ছবির সাইজ Storage সীমার বেশি।");
    const ownerFolder=m.auth_user_id||access.session.user.id;
    const extension=prepared.type==="image/png"?"png":prepared.type==="image/jpeg"?"jpg":"webp";
    const path=ownerFolder+"/"+m.id+"/"+prefix+"-"+crypto.randomUUID()+"."+extension;
    const {error:uploadError}=await supabase.storage.from(bucket).upload(path,prepared,{contentType:prepared.type,upsert:false});
    if(uploadError)throw uploadError;
    uploaded.push({bucket,path,oldPath:m[field]||null});
    changes[field]=path;
   };
   const uploadDocument=async(file,field,prefix)=>{
    if(!file)return;
    const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type))throw new Error("পরিচয়পত্র PDF, JPG, PNG অথবা WebP হতে হবে।");
    if(file.size>10*1024*1024)throw new Error("পরিচয়পত্রের ফাইল ১০ MB-এর বেশি।");
    const ownerFolder=m.auth_user_id||access.session.user.id;
    const extension=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":file.type==="image/jpeg"?"jpg":"webp";
    const path=ownerFolder+"/"+m.id+"/"+prefix+"-"+crypto.randomUUID()+"."+extension;
    const {error:uploadError}=await supabase.storage.from("member-private-documents").upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    uploaded.push({bucket:"member-private-documents",path,oldPath:m[field]||null});
    changes[field]=path;
   };
   let databaseSaved=false;
   try{
    await uploadPhoto(profileFile,"member-profile-photos","profile_photo_path","profile");
    await uploadPhoto(nomineeFile,"member-private-documents","nominee_photo_path","nominee");
    await uploadDocument(identityFile,"member_identity_document_path","member-identity");
    await uploadDocument(nomineeNidFile,"nominee_nid_path","nominee-nid");
    const {error}=await supabase.rpc("save_member_admin_profile",{
     p_member_id:m.id,
     p_changes:changes,
     p_rate_amount:monthlyChanged?Number(monthlyInput.value):null,
     p_rate_effective_from:monthlyChanged?effectiveInput.value:null
    });
    if(error)throw error;
    databaseSaved=true;
    const cleanupFailures=[];
    for(const item of uploaded){
     if(item.oldPath&&item.oldPath!==item.path){
      let removed=false,lastError=null;
      for(let attempt=0;attempt<2&&!removed;attempt++){
       try{
        const {error:removeError}=await supabase.storage.from(item.bucket).remove([item.oldPath]);
        if(removeError)lastError=removeError;
        else removed=true;
       }catch(cleanupError){lastError=cleanupError}
      }
      if(!removed){
       cleanupFailures.push({bucket:item.bucket,path:item.oldPath,error:lastError});
       console.error("Old member upload cleanup failed",item.bucket,item.oldPath,lastError);
      }
     }
    }
    if(cleanupFailures.length){
     alert("নতুন তথ্য ও ফাইল Save হয়েছে, কিন্তু "+cleanupFailures.length+"টি আগের ফাইল Storage থেকে মুছতে পারেনি। আবার চেষ্টা করতে বা Super Admin-এর মাধ্যমে cleanup করতে হবে।");
    }else{
     alert("Member-এর সব পরিবর্তন Save হয়েছে এবং সংশ্লিষ্ট Upload Box-এর আগের ফাইল মুছে ফেলা হয়েছে।");
    }
    location.reload();
   }catch(error){
    if(!databaseSaved){
     for(const item of uploaded){
      try{await supabase.storage.from(item.bucket).remove([item.path])}
      catch(cleanupError){console.warn("Temporary photo cleanup failed",cleanupError)}
     }
    }
    alert("Save হয়নি: "+(error?.message||String(error))+". আগের তথ্য অক্ষত আছে; আবার পরীক্ষা করুন।");
    button.disabled=false;
   }
  });
  if(new URLSearchParams(location.search).get("edit")==="1")editorToggle?.click();

 }
}
main().catch(error=>{console.error(error);root.innerHTML='<div class="shell"><div class="error">'+esc(error.message||"Profile load failed")+'</div></div>'});
