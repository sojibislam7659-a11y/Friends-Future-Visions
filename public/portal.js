import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";
import { enablePush } from "./push.js";

const root=document.getElementById("app");
const page=document.body.dataset.page||"dashboard";
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB"):"—";
const monthText=v=>v?new Date(v+"-01T00:00:00").toLocaleDateString("bn-BD",{month:"long",year:"numeric"}):"—";
const localDate=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>localDate(new Date());
let access=null,lang="bn";
const t=(bn,en)=>lang==="bn"?bn:en;
function toast(message){let n=document.createElement("div");n.className="toast";n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),4200)}
function setPage(html){document.getElementById("pageContent").innerHTML=html}
function card(label,value,sub=""){return '<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div><small>'+esc(sub)+'</small></article>'}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>'}
function icon(name){
 const paths={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5M10 14l2 2 4-4"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6zM9 12l2 2 4-4"/>'};
 return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.data)+'</svg>';
}
function navItem(href,label,iconName){return '<a href="'+href+'" '+(page===href.replace(".html","")?'class="active"':'')+'>'+icon(iconName)+'<span>'+label+'</span></a>'}
function shell(){
 const isSuper=access.role==="super_admin",isPublic=access.role==="public";
 const nav=navItem("rules.html","RULES","rules")+navItem("member-info.html","MEMBER INFO","members")+navItem("data.html","DATA","data")+(isPublic?"":navItem("personal-due.html","PERSONAL DUE","due")+navItem("proof.html","PROOF","proof")+navItem("payment.html","PAYMENT","payment")+(isSuper?navItem("admin.html","SUPER ADMIN","admin"):"")+(access.role==="member"?navItem("member.html","MY PROFILE","profile"):""));
 root.innerHTML='<div class="shell"><header class="topbar"><div class="header-left"><a class="home-icon" href="dashboard.html" aria-label="Home" title="Home">'+icon("home")+'</a><div class="brand"><img src="friends-future-vision-logo.svg" alt="Friends Future Vision Forever"><div><strong>ফ্রেন্ডস ফিউচার ভিশন ফরএভার</strong><small>Friends Future Vision Forever</small></div></div></div><div class="actions">'+(isPublic?'<a class="button" href="login.html">LOGIN</a>':'<button class="icon-button" id="notificationBtn" aria-label="Notifications" title="Notifications">'+icon("bell")+'<span class="unread-count" id="unreadCount" hidden></span></button><button class="secondary menu-button" id="menuBtn">'+icon("menu")+' MENU</button><span class="role">'+(isSuper?"Super Admin":access.role==="admin"?"Admin · View only":"Member · View only")+'</span><button class="secondary" id="languageBtn">English</button><button class="secondary" id="logoutBtn">লগআউট</button>')+'</div></header><nav class="nav" id="mainNav" hidden>'+nav+'</nav><main class="page" id="pageContent"><div class="empty">তথ্য লোড হচ্ছে…</div></main><footer class="footer">Friends Future Vision Forever · Secure member portal</footer></div>';
 if(!isPublic){
  document.getElementById("menuBtn").addEventListener("click",()=>{const n=document.getElementById("mainNav");n.hidden=!n.hidden});
  document.getElementById("notificationBtn").addEventListener("click",()=>{if(page!=="dashboard"){location.href="dashboard.html";return}document.getElementById("inboxList")?.scrollIntoView({behavior:"smooth",block:"start"})});
  document.getElementById("logoutBtn").addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)toast(error.message);else location.replace("login.html")});
  document.getElementById("languageBtn").addEventListener("click",()=>{lang=lang==="bn"?"en":"bn";document.documentElement.lang=lang;document.getElementById("languageBtn").textContent=lang==="bn"?"English":"বাংলা";renderPage()});refreshUnreadCount();
 }
}
async function refreshUnreadCount(){if(!access?.session?.user?.id)return;const {count,error}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",access.session.user.id).is("read_at",null);if(error)return;const badge=document.getElementById("unreadCount");if(!badge)return;badge.textContent=count>99?"99+":String(count||0);badge.hidden=!(count>0)}
async function summary(){
 const {data,error}=await supabase.rpc("get_financial_summary");
 if(error)throw error;
 return data||{};
}
async function renderDashboard(){
 const s=await summary();
 setPage('<p class="lead">'+t("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ। সদস্যদের ব্যক্তিগত তথ্য এখানে প্রকাশ করা হয় না।","Verified committee-wide financial summary. Individual member details are not shown here.")+'</p><div class="grid">'+
 card(t("মোট সম্পদ","Total assets"),money(s.total_assets),t("নগদ + ব্যাংক + বিনিয়োগ","Cash + bank + investments"))+
 card(t("ব্যাংক ব্যালেন্স","Bank balance"),money(s.bank_balance))+
 card(t("হাতে নগদ","Cash in hand"),money(s.cash_balance))+
 card(t("মোট বিনিয়োগ","Investment balance"),money(s.investment_balance))+
 card(t("সদস্যদের মোট জমা","Member contributions"),money(s.total_contributions))+
 card(t("মোট ব্যয়","Total expenses"),money(s.total_expenses))+
 card(t("অন্যান্য আয় + বিনিয়োগ লাভ","Other income + investment profit"),money(Number(s.other_income||0)+Number(s.investment_profit||0)))+
 card(t("লেনদেন সংখ্যা","Transactions"),String(s.transaction_count||0),s.last_updated?t("সর্বশেষ আপডেট: ","Last updated: ")+new Date(s.last_updated).toLocaleString():"")
 +'</div><div class="notice">'+t("এই হিসাব Database-এর লেনদেন থেকে তৈরি। এখনো কোনো লেনদেন না থাকলে শূন্য দেখাবে; পুরোনো বা প্রাথমিক ব্যালেন্স Super Admin এন্ট্রি না করা পর্যন্ত এখানে যোগ হবে না।","Figures are calculated from database transactions. Zero means no ledger entries have been recorded; historical or opening balances must be entered by the Super Admin.")+'</div><section class="section"><div class="section-head"><h2>'+t("সাম্প্রতিক নোটিশ","Recent notices")+'</h2><span class="pill">'+t("লগইন করা সদস্যদের জন্য","For signed-in users")+'</span></div><div id="noticeList" class="list">'+empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))+'</div></section><section class="section"><h2>'+t("আপনার নোটিফিকেশন","Your notifications")+'</h2><div id="inboxList" class="list">'+empty(t("কোনো নোটিফিকেশন নেই।","No notifications."))+'</div></section><div class="notice">'+t("নোটিফিকেশনের বিস্তারিত দেখতে লগইন করো। Push alert শুধু সাধারণ বার্তা দেখাবে।","Sign in to view notification details. Push alerts display only a generic message.")+'</div><div class="form-actions"><button class="secondary" id="enablePush">এই ডিভাইসে Push চালু করুন</button></div>');
 document.getElementById("enablePush").addEventListener("click",async()=>{try{await enablePush(supabase,access.session.user.id);toast("এই ডিভাইসে Push চালু হয়েছে।")}catch(e){toast(e.message||"Push চালু করা যায়নি।")}});
 const [notices,inbox]=await Promise.all([
  supabase.from("notices").select("id,title,body,notice_type,meeting_at,published_at").eq("published",true).order("published_at",{ascending:false}).limit(8),
  supabase.from("notifications").select("id,title,body,notification_type,created_at,read_at").eq("user_id",access.session.user.id).order("created_at",{ascending:false}).limit(10)
 ]);
 if(!notices.error){document.getElementById("noticeList").innerHTML=notices.data.length?notices.data.map(n=>'<article class="list-item"><strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p><small>'+esc(n.notice_type==="meeting"&&n.meeting_at?new Date(n.meeting_at).toLocaleString():new Date(n.published_at).toLocaleString())+'</small></article>').join(""):empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))}
 if(!inbox.error){document.getElementById("inboxList").innerHTML=inbox.data.length?inbox.data.map(n=>'<article class="list-item"><div class="row"><strong>'+esc(n.title)+'</strong>'+(n.read_at?'<span class="pill">Read</span>':'<span class="pill">New</span>')+'</div><p>'+esc(n.body)+'</p><small>'+esc(new Date(n.created_at).toLocaleString())+'</small>'+(n.read_at?"":' <button class="secondary mark-read" data-id="'+esc(n.id)+'">পড়া হয়েছে</button>')+'</article>').join(""):empty(t("কোনো নোটিফিকেশন নেই।","No notifications."));document.querySelectorAll(".mark-read").forEach(b=>b.addEventListener("click",async()=>{const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",b.dataset.id);if(error)toast(error.message);else{renderDashboard();refreshUnreadCount()}}))}
}
async function renderData(){
 const s=await summary();
 const rows=s.monthly_trend||[];
 const halves=s.half_yearly_trend||[];
 setPage('<h1>'+t("কমিটির আর্থিক তথ্য","Committee financial data")+'</h1><p class="lead">'+t("সবার জন্য প্রকাশযোগ্য সামগ্রিক হিসাব। ব্যক্তিগত জমা ও বকেয়া এখানে দেখানো হয় না।","Committee-wide figures only. Personal deposits and dues are not shown here.")+'</p><div class="grid">'+
 card(t("মোট সম্পদ","Total assets"),money(s.total_assets))+
 card(t("মোট জমা","Total contributions"),money(s.total_contributions))+
 card(t("ব্যয়","Expenses"),money(s.total_expenses))+
 card(t("নিট পরিচালন ফল","Net operating result"),money(s.net_operating_result))+'</div><section class="section"><h2>'+t("মাসভিত্তিক রিপোর্ট","Monthly report")+'</h2>'+ (rows.length?'<div class="table-wrap"><table><thead><tr><th>Month</th><th>Contributions</th><th>Expenses</th><th>Other income + profit</th><th>Investment loss</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(monthText(r.month))+'</td><td>'+money(r.contributions)+'</td><td>'+money(r.expenses)+'</td><td>'+money(r.income)+'</td><td>'+money(r.investment_loss)+'</td></tr>').join("")+'</tbody></table></div>':empty(t("এখনো কোনো আর্থিক লেনদেন নেই। Super Admin প্রথম লেনদেন যোগ করলে মাসিক রিপোর্ট তৈরি হবে।","No financial transactions yet. Monthly reports will appear after the Super Admin records transactions.")))+'</section><section class="section"><h2>'+t("অর্ধবার্ষিক রিপোর্ট","Half-yearly report")+'</h2>'+(halves.length?'<div class="table-wrap"><table><thead><tr><th>Period</th><th>Contributions</th><th>Expenses</th><th>Other income + profit</th><th>Investment loss</th></tr></thead><tbody>'+halves.map(r=>'<tr><td>'+esc(String(r.year)+(lang==="bn"?(r.half===1?" · জানুয়ারি–জুন":" · জুলাই–ডিসেম্বর"):" · H"+r.half))+'</td><td>'+money(r.contributions)+'</td><td>'+money(r.expenses)+'</td><td>'+money(r.income)+'</td><td>'+money(r.investment_loss)+'</td></tr>').join("")+'</tbody></table></div>':empty(t("এখনো অর্ধবার্ষিক রিপোর্ট তৈরির মতো কোনো লেনদেন নেই।","No transactions are available for half-yearly reporting yet.")))+'</section><div class="notice">'+t("কোনো Demo বা অনুমানভিত্তিক অঙ্ক ব্যবহার করা হচ্ছে না।","No demo or estimated amounts are used.")+'</div>');
}
function monthCount(start){
 if(!start)return 0;
 const a=new Date(start+"T00:00:00"),b=new Date();
 return Math.max(0,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1);
}
async function renderDue(){
 let q=supabase.from("members").select("id,member_no,full_name,monthly_contribution,contribution_start_date,joined_at,status");
 if(access.role==="member")q=q.eq("auth_user_id",access.session.user.id);else if(access.role==="super_admin")q=q.eq("status","active");
 const {data:members,error}=await q.order("member_no");if(error)throw error;
 if(access.role==="admin"){setPage('<h1>Personal Due</h1>'+empty("এই Admin অ্যাকাউন্টের সঙ্গে কোনো সদস্য রেকর্ড যুক্ত নেই।"));return}
 if(!members.length){setPage('<h1>Personal Due</h1>'+empty("এই লগইন অ্যাকাউন্টের সঙ্গে কোনো সদস্য রেকর্ড যুক্ত নেই।"));return}
 const ids=members.map(m=>m.id);
 const [rr,tr]=await Promise.all([supabase.from("member_contribution_rates").select("member_id,monthly_amount,effective_from,effective_to").in("member_id",ids).order("effective_from"),supabase.from("financial_transactions").select("member_id,transaction_type,amount,transaction_date,created_at").in("member_id",ids).eq("transaction_type","contribution").eq("direction","in").lte("transaction_date",today())]);
 if(rr.error)throw rr.error;if(tr.error)throw tr.error;
 const rates={};(rr.data||[]).forEach(r=>(rates[r.member_id]??=[]).push(r));const paid={};(tr.data||[]).forEach(x=>{const start=rates[x.member_id]?.[0]?.effective_from;if(start&&x.transaction_date>=start)paid[x.member_id]=(paid[x.member_id]||0)+Number(x.amount)});
 const now=new Date(),nowIndex=now.getFullYear()*12+now.getMonth(),rows=members.map(m=>{
  const list=rates[m.id]||[],start=list[0]?.effective_from;let expected=0,months=0;
  if(start){const [y,mo]=start.split("-").map(Number),first=y*12+mo-1;months=Math.max(0,nowIndex-first+1);for(let k=0;k<months;k++){const d=new Date(y,mo-1+k,1),from=localDate(d),next=new Date(d.getFullYear(),d.getMonth()+1,1),to=localDate(new Date(next.getTime()-86400000)),rate=list.find(r=>r.effective_from<=from&&(!r.effective_to||r.effective_to>=to));if(rate)expected+=Number(rate.monthly_amount)}}
  const received=paid[m.id]||0;return {m,received,due:list.length?Math.max(0,expected-received):null,configured:list.length>0,months};
 });
 const sumPaid=rows.reduce((n,r)=>n+r.received,0),sumDue=rows.reduce((n,r)=>n+(r.due||0),0);
 const head=today()<"2026-12-01"?'<p class="lead">হিসাব শুরু হবে ১ ডিসেম্বর ২০২৬ থেকে।</p>':'<p class="lead">1 December, 2026 to '+esc(dateText(today()))+' · '+(access.role==="super_admin"?"Super Admin view":"শুধু আপনার নিজের হিসাব")+'</p>';
 const deposits=rows.map(r=>'<tr><td>'+esc(r.m.member_no||"—")+'</td><td>'+esc(r.m.full_name)+'</td><td>'+money(r.received)+'</td></tr>').join("");
 const dues=rows.map(r=>'<tr><td>'+esc(r.m.member_no||"—")+'</td><td>'+esc(r.m.full_name)+'</td><td>'+esc(r.configured?money(r.due):"Not configured")+'</td></tr>').join("");
 setPage('<h1>'+t("ব্যক্তিগত জমা ও বকেয়া","Personal deposits and dues")+'</h1>'+head+'<section class="section"><h2>মোট জমা</h2><div class="table-wrap"><table><thead><tr><th>SL / Member No.</th><th>Member Name</th><th>Total Deposit</th></tr></thead><tbody>'+deposits+'<tr class="total-row"><td colspan="2">TOTAL</td><td>'+money(sumPaid)+'</td></tr></tbody></table></div></section><section class="section"><h2>মোট বকেয়া</h2><div class="table-wrap"><table><thead><tr><th>SL / Member No.</th><th>Member Name</th><th>Total Due</th></tr></thead><tbody>'+dues+'<tr class="total-row"><td colspan="2">TOTAL</td><td>'+money(sumDue)+'</td></tr></tbody></table></div></section><div class="notice">বকেয়া হিসাবের জন্য প্রত্যেক সদস্যের মাসিক জমার হার ও কার্যকর তারিখ Super Admin-কে নির্ধারণ করতে হবে।</div>');
}async function renderMembers(){
 const {data,error}=await supabase.from("member_directory").select("member_id,member_no,full_name,full_name_bn,profile_photo_path").order("member_no");if(error)throw error;
 if(!data.length){setPage('<h1>Member Info</h1>'+empty(t("এখনো কোনো Active member নেই।","No active members yet.")));return}
 const own=access.role==="member"?await supabase.from("members").select("id").eq("auth_user_id",access.session.user.id).maybeSingle():{data:null};if(own.error)throw own.error;const ownId=own.data?.id||null;
 const cards=await Promise.all(data.map(async m=>{let photo="";if(m.profile_photo_path){const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(m.profile_photo_path,1800);if(u?.signedUrl)photo='<img loading="lazy" src="'+esc(u.signedUrl)+'" alt="">'}return '<button type="button" class="person person-button" title="Member No: '+esc(m.member_no||"")+'" data-member-id="'+esc(m.member_id)+'" data-member-name="'+esc(lang==="bn"?(m.full_name_bn||m.full_name):m.full_name)+'" data-member-no="'+esc(m.member_no||"")+'" data-member-photo="'+esc(photo)+'">'+(photo||'<div class="avatar">FF</div>')+'<strong>'+esc(lang==="bn"?(m.full_name_bn||m.full_name):m.full_name)+'</strong><small>'+esc(m.member_no||"")+'</small></button>'}));
 setPage('<h1>'+t("সদস্য পরিচিতি","Member directory")+'</h1><p class="lead">'+t("ছবি, নাম ও সদস্য নম্বর। ব্যক্তিগত তথ্য শুধু সংশ্লিষ্ট সদস্য ও Super Admin দেখতে পারবেন।","Photos, names and member numbers. Private details are restricted to the member and Super Admin.")+'</p><div class="members-grid">'+cards.join("")+'</div><div class="profile-backdrop" id="profileBackdrop" hidden><section class="profile-dialog" role="dialog" aria-modal="true"><button class="secondary profile-close" id="profileClose">Close</button><div id="profileDetails"></div></section></div>');
 document.querySelectorAll("[data-member-id]").forEach(b=>b.addEventListener("click",()=>{const details=document.getElementById("profileDetails");details.innerHTML=(b.dataset.memberPhoto||'<div class="avatar">FF</div>')+'<h2>'+esc(b.dataset.memberName)+'</h2><p class="pill">'+esc(b.dataset.memberNo)+'</p><p class="muted">ব্যক্তিগত তথ্য গোপন রাখা হয়েছে। নিজের বিস্তারিত প্রোফাইল দেখতে My Profile ব্যবহার করুন।</p>'+(b.dataset.memberId===ownId?'<a class="button" href="member.html">My Profile</a>':"");document.getElementById("profileBackdrop").hidden=false}));
 document.getElementById("profileClose").addEventListener("click",()=>{document.getElementById("profileBackdrop").hidden=true});
 document.getElementById("profileBackdrop").addEventListener("click",e=>{if(e.target.id==="profileBackdrop")e.currentTarget.hidden=true});
}async function renderProofs(){
 const {data,error}=await supabase.from("committee_proofs").select("id,proof_month,title,storage_path,note,created_at").eq("published",true).order("proof_month",{ascending:true});if(error)throw error;
 const counts={};(data||[]).forEach(p=>{const k=p.proof_month.slice(0,7);counts[k]=(counts[k]||0)+1});
 const months=[];for(let i=0;i<60;i++){const d=new Date(2026,11+i,1);months.push(localDate(d).slice(0,7))}
 const cards=months.map(k=>'<button type="button" class="proof-month-card" data-proof-month="'+k+'"><strong>'+esc(monthText(k))+'</strong><span>'+String(counts[k]||0)+' files</span></button>').join("");
 setPage('<h1>'+t("মাসিক জমা ও বিনিয়োগের প্রমাণ","Monthly deposit and investment proofs")+'</h1><p class="lead">ডিসেম্বর ২০২৬ থেকে নভেম্বর ২০৩১ · প্রতি মাসে একটি বা একাধিক রসিদ। শুধু নির্বাচিত মাসের ফাইল লোড হবে।</p><div class="proof-month-grid">'+cards+'</div><section class="section" id="proofMonthDetail">'+empty("ফাইল দেখতে অথবা আপলোড করতে একটি মাস নির্বাচন করুন।")+'</section>');
 document.querySelectorAll("[data-proof-month]").forEach(b=>b.addEventListener("click",()=>loadProofMonth(b.dataset.proofMonth,data)));
}
async function loadProofMonth(month,allProofs){
 const root=document.getElementById("proofMonthDetail");if(!root)return;const rows=(allProofs||[]).filter(p=>p.proof_month.slice(0,7)===month);
 root.innerHTML='<h2>'+esc(monthText(month))+'</h2><div class="muted small">'+rows.length+' file(s)</div><div id="proofFiles" class="list">'+empty("ফাইল লোড হচ্ছে…")+'</div>'+(access.role==="super_admin"?'<form id="proofUploadForm" class="section"><input type="hidden" name="month" value="'+month+'"><div class="field"><label>ছবি অথবা PDF — এক বা একাধিক ফাইল</label><label class="dropzone" id="proofDropzone">ফাইল এখানে Drop করুন অথবা Browse Files<input id="proofFilesInput" type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></label><small class="muted">প্রতি ফাইল সর্বোচ্চ 10MB। JPG, PNG, WEBP অথবা PDF।</small></div><div class="field"><label>সাধারণ নোট (ঐচ্ছিক)</label><input name="note" maxlength="500"></div><div class="form-actions"><button type="submit" id="proofUploadButton">Upload selected files</button><span id="proofUploadStatus" class="muted small"></span></div></form>':"");
 const fileBox=document.getElementById("proofFiles");
 if(rows.length){const rendered=await Promise.all(rows.map(async p=>{const {data:u,error:urlError}=await supabase.storage.from("committee-proofs").createSignedUrl(p.storage_path,1800);if(urlError||!u?.signedUrl)return '<article class="list-item"><strong>'+esc(p.title)+'</strong><span class="pill">File unavailable</span></article>';return '<article class="list-item"><div class="row"><strong>'+esc(p.title)+'</strong><span class="pill">'+esc(p.storage_path.toLowerCase().endsWith(".pdf")?"PDF":"Image")+'</span></div><p>'+esc(p.note||"")+'</p><a class="button secondary" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">Open proof</a></article>'}));fileBox.innerHTML=rendered.join("")}else fileBox.innerHTML=empty("এই মাসে এখনো কোনো রসিদ আপলোড করা হয়নি।");
 if(access.role==="super_admin"){
  const form=document.getElementById("proofUploadForm"),input=document.getElementById("proofFilesInput"),drop=document.getElementById("proofDropzone");
  drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("dragover")});drop.addEventListener("dragleave",()=>drop.classList.remove("dragover"));
  drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("dragover");if(e.dataTransfer?.files?.length){input.files=e.dataTransfer.files;drop.dataset.selected=e.dataTransfer.files.length+" file(s) selected"}});
  input.addEventListener("change",()=>{drop.dataset.selected=input.files.length?input.files.length+" file(s) selected":""});
  form.addEventListener("submit",async e=>{e.preventDefault();const files=Array.from(input.files||[]);if(!files.length){toast("কমপক্ষে একটি ফাইল নির্বাচন করুন।");return}const allowed=["image/jpeg","image/png","image/webp","application/pdf"],bad=files.find(f=>!allowed.includes(f.type)||f.size>10*1024*1024);if(bad){toast("ফাইলের ধরন বা সাইজ গ্রহণযোগ্য নয়: "+bad.name);return}const button=document.getElementById("proofUploadButton"),status=document.getElementById("proofUploadStatus");button.disabled=true;let success=0;
   for(const file of files){status.textContent=(success+1)+" / "+files.length+" uploading…";const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80),path=month+"/"+crypto.randomUUID()+"-"+safeName;const {error:upError}=await supabase.storage.from("committee-proofs").upload(path,file,{upsert:false,contentType:file.type});if(upError){toast(file.name+": "+upError.message);continue}const {error:rowError}=await supabase.from("committee_proofs").insert({proof_month:month+"-01",title:file.name,note:String(new FormData(form).get("note")||"").trim()||null,storage_path:path,published:true,uploaded_by:access.session.user.id});if(rowError){await supabase.storage.from("committee-proofs").remove([path]);toast(file.name+": "+rowError.message);continue}success++}
   toast(success+"টি ফাইল আপলোড হয়েছে।");renderProofs();
  });
 }
}async function renderPayment(){
 const isSuper=access.role==="super_admin";
 const mr=await supabase.from("payment_methods").select("id,method,account_name,account_number,qr_path,active").eq("active",true).order("method");
 if(mr.error)throw mr.error;
 const methods=mr.data||[];
 const cards=await Promise.all(methods.map(async m=>{
  const {data:u}=m.qr_path?await supabase.storage.from("payment-qr").createSignedUrl(m.qr_path,1800):{data:null};
  return '<article class="payment-method-card"><div class="row"><strong>'+esc(m.method.toUpperCase())+'</strong><span class="pill">Active</span></div><p>'+esc(m.account_name||"")+'</p><p class="payment-number">'+esc(m.account_number||"নম্বর সেট করা হয়নি")+'</p>'+(u?.signedUrl?'<img class="payment-qr" loading="lazy" src="'+esc(u.signedUrl)+'" alt="Payment QR">':"")+'</article>';
 }));
 const base='<h1>Payment</h1><p class="lead">bKash অথবা Nagad-এ টাকা পাঠানোর পর Transaction ID জমা দিন। Super Admin যাচাই করে অনুমোদন করবেন।</p><div class="payment-method-grid">'+(cards.join("")||empty("Super Admin এখনো bKash/Nagad নম্বর সেট করেননি।"))+'</div>';
 if(isSuper){
  setPage(base+'<section class="section"><h2>Payment account settings</h2><p class="muted">শুধু Super Admin নম্বর ও QR code পরিবর্তন করতে পারবেন।</p><div class="form-grid">'+["bkash","nagad"].map(m=>'<form class="payment-method-form card" data-method="'+m+'"><h3>'+m.toUpperCase()+'</h3><div class="field"><label>Account name</label><input name="account_name" required></div><div class="field"><label>Account number</label><input name="account_number" required inputmode="tel"></div><div class="field"><label>QR image (optional)</label><input name="qr" type="file" accept="image/jpeg,image/png,image/webp"></div><button type="submit">Save '+m.toUpperCase()+'</button></form>').join("")+'</div></section><section class="section"><h2>Pending payment submissions</h2><div id="pendingPayments" class="list">'+empty("লোড হচ্ছে…")+'</div></section>');
  for(const form of document.querySelectorAll(".payment-method-form")){
   const method=form.dataset.method,existing=methods.find(m=>m.method===method);
   if(existing){form.elements.account_name.value=existing.account_name||"";form.elements.account_number.value=existing.account_number||""}
   form.addEventListener("submit",async e=>{
    e.preventDefault();const fd=new FormData(form),name=String(fd.get("account_name")||"").trim(),number=String(fd.get("account_number")||"").trim(),file=fd.get("qr");
    if(!name||!number){toast("Account name ও number দিতে হবে।");return}
    let qrPath=existing?.qr_path||null;
    if(file?.size){
     if(file.size>2*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("QR image 2MB-এর মধ্যে JPG/PNG/WEBP হতে হবে।");return}
     const ext=(file.name.split(".").pop()||"png").toLowerCase();qrPath=method+"/"+crypto.randomUUID()+"."+ext;
     const {error:upError}=await supabase.storage.from("payment-qr").upload(qrPath,file,{upsert:false,contentType:file.type});
     if(upError){toast(upError.message);return}
    }
    const {error:saveError}=await supabase.from("payment_methods").upsert({method,account_name:name,account_number:number,qr_path:qrPath,active:true,updated_by:access.session.user.id},{onConflict:"method"});
    if(saveError){if(file?.size&&qrPath)await supabase.storage.from("payment-qr").remove([qrPath]);toast(saveError.message)}
    else{toast(method.toUpperCase()+" details saved.");renderPayment()}
   });
  }
  const pending=await supabase.from("payment_submissions").select("id,member_id,submitted_by,amount,payment_date,payment_method,reference_no,created_at,members(full_name,member_no)").eq("status","pending").order("created_at");
  const box=document.getElementById("pendingPayments");
  if(pending.error)box.textContent=pending.error.message;
  else if(!pending.data.length)box.innerHTML=empty("কোনো Pending payment নেই।");
  else box.innerHTML=pending.data.map(p=>'<article class="list-item"><strong>'+esc(p.members?.member_no||"")+' · '+esc(p.members?.full_name||"Member")+'</strong><p>'+money(p.amount)+' · '+esc(p.payment_method||"")+' · '+esc(p.payment_date)+'</p><p>Transaction ID: <strong>'+esc(p.reference_no)+'</strong></p><div class="field"><label>Ledger account</label><select data-payment-account="'+esc(p.id)+'"><option value="cash">Cash</option><option value="bank">Bank</option></select></div><div class="row"><button data-payment-approve="'+esc(p.id)+'">Approve & add to ledger</button><button class="danger" data-payment-reject="'+esc(p.id)+'">Reject</button></div></article>').join("");
  box.querySelectorAll("[data-payment-approve],[data-payment-reject]").forEach(b=>b.addEventListener("click",async()=>{
   const approved=b.hasAttribute("data-payment-approve"),id=approved?b.dataset.paymentApprove:b.dataset.paymentReject,note=prompt("Admin note (optional):")||null,account=document.querySelector('[data-payment-account="'+id+'"]')?.value||"cash";
   const {error}=await supabase.rpc("review_payment_submission",{p_submission_id:id,p_approved:approved,p_admin_note:note,p_account_type:account});
   if(error)toast(error.message);else{toast(approved?"Payment verified and added once to ledger.":"Payment rejected.");renderPayment()}
  }));
  return;
 }
 if(access.role!=="member"){setPage(base+empty("এই অ্যাকাউন্টে Payment submission করার অনুমতি নেই।"));return}
 const {data:member,error:memberError}=await supabase.from("members").select("id").eq("auth_user_id",access.session.user.id).maybeSingle();
 if(memberError)throw memberError;
 if(!member){setPage(base+empty("এই লগইন অ্যাকাউন্টের সঙ্গে Member record link করা নেই।"));return}
 const history=await supabase.from("payment_submissions").select("id,amount,payment_date,payment_method,reference_no,status,admin_note,created_at").eq("submitted_by",access.session.user.id).order("created_at",{ascending:false}).limit(20);
 if(history.error)throw history.error;
 setPage(base+'<section class="section"><h2>Payment submission</h2><form id="paymentSubmitForm" class="form-grid"><div class="field"><label>Amount (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>Payment method</label><select name="method" required>'+methods.map(m=>'<option value="'+esc(m.method)+'">'+esc(m.method.toUpperCase())+'</option>').join("")+'</select></div><div class="field"><label>Payment date</label><input name="date" type="date" max="'+today()+'" value="'+today()+'" required></div><div class="field"><label>Transaction ID</label><input name="reference" maxlength="100" required></div><div class="form-actions"><button type="submit">Submit for verification</button></div></form></section><section class="section"><h2>Your payment history</h2><div class="list">'+(history.data.map(p=>'<article class="list-item"><div class="row"><strong>'+money(p.amount)+'</strong><span class="pill">'+esc(p.status)+'</span></div><p>'+esc(p.payment_method||"")+' · '+esc(p.payment_date)+' · '+esc(p.reference_no)+'</p><small>'+esc(p.admin_note||"")+'</small></article>').join("")||empty("কোনো Payment submission নেই।"))+'</div></section>');
 document.getElementById("paymentSubmitForm").addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget),amount=Number(fd.get("amount")),reference=String(fd.get("reference")||"").trim();
  if(!(amount>0)||!reference){toast("সঠিক Amount ও Transaction ID দিন।");return}
  const {error}=await supabase.from("payment_submissions").insert({member_id:member.id,submitted_by:access.session.user.id,amount,payment_date:fd.get("date"),payment_method:fd.get("method"),reference_no:reference,status:"pending"});
  if(error)toast(error.message);else{toast("Payment যাচাইয়ের জন্য জমা হয়েছে।");renderPayment()}
 });
}

async function renderProfile(){
 const {data:m,error}=await supabase.from("members").select("*").eq("auth_user_id",access.session.user.id).maybeSingle();
 if(error)throw error;
 if(!m){setPage('<h1>My Profile</h1>'+empty("এই অ্যাকাউন্টের সঙ্গে কোনো সদস্য প্রোফাইল যুক্ত নেই।"));return}
 const fields=[["full_name","নাম"],["full_name_bn","বাংলা নাম"],["phone","মোবাইল"],["email","ইমেইল"],["profession","পেশা"],["present_address","বর্তমান ঠিকানা"],["permanent_address","স্থায়ী ঠিকানা"],["emergency_contact_name","জরুরি যোগাযোগের নাম"],["emergency_contact_phone","জরুরি যোগাযোগের নম্বর"],["nominee_name","নমিনির নাম"],["nominee_phone","নমিনির নম্বর"]];
 const inputs=fields.map(([key,label])=>'<div class="field"><label>'+label+'</label><input name="'+key+'" value="'+esc(m[key]||"")+'"></div>').join("");
 const [requests,docs]=await Promise.all([
  supabase.from("profile_change_requests").select("id,status,created_at,admin_note").eq("submitted_by",access.session.user.id).order("created_at",{ascending:false}).limit(10),
  supabase.from("member_private_documents").select("id,document_type,status,storage_path,admin_note,uploaded_at").eq("member_id",m.id).order("uploaded_at",{ascending:false}).limit(10)
 ]);
 if(requests.error)throw requests.error;if(docs.error)throw docs.error;
 const docRows=await Promise.all((docs.data||[]).map(async d=>{
  const {data:u}=await supabase.storage.from("member-private-documents").createSignedUrl(d.storage_path,900);
  return '<article class="list-item"><div class="row"><strong>'+esc(d.document_type==="member_nid"?"Member ID document":"Nominee ID document")+'</strong><span class="pill">'+esc(d.status)+'</span></div><small>'+esc(new Date(d.uploaded_at).toLocaleString())+'</small><p>'+esc(d.admin_note||"")+'</p>'+(u?.signedUrl?'<a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">View private document</a>':"")+'</article>';
 }));
 setPage('<h1>My Profile</h1><p class="lead">তথ্য পরিবর্তন ও পরিচয়পত্র আপলোডের অনুরোধ Super Admin অনুমোদন না করা পর্যন্ত মূল তথ্য পরিবর্তিত হবে না।</p><div class="grid">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"Not configured")+'</div><form id="profileRequest"><div class="form-grid">'+inputs+'</div><div class="field" style="margin-top:12px"><label>প্রোফাইল ছবি (JPG, PNG, WEBP · সর্বোচ্চ 5MB)</label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></div><div class="form-grid section"><div class="field"><label>নিজের NID / ID (JPG, PNG, WEBP, PDF · সর্বোচ্চ 10MB)</label><input type="file" name="member_nid" accept="image/jpeg,image/png,image/webp,application/pdf"></div><div class="field"><label>Nominee NID / ID (JPG, PNG, WEBP, PDF · সর্বোচ্চ 10MB)</label><input type="file" name="nominee_nid" accept="image/jpeg,image/png,image/webp,application/pdf"></div></div><div class="notice">আপনার ও Nominee-এর পরিচয়পত্র শুধু আপনি এবং Super Admin দেখতে পারবেন। অন্য সদস্যরা দেখতে পারবেন না।</div><div class="form-actions"><button type="submit">পরিবর্তনের অনুরোধ পাঠান</button></div></form><section class="section"><h2>Profile request history</h2><div class="list">'+((requests.data||[]).map(r=>'<article class="list-item"><strong>'+esc(r.status)+'</strong><small>'+esc(new Date(r.created_at).toLocaleString())+'</small><p>'+esc(r.admin_note||"")+'</p></article>').join("")||empty("কোনো অনুরোধ নেই।"))+'</div></section><section class="section"><h2>Private ID document status</h2><div class="list">'+(docRows.join("")||empty("কোনো ID document জমা দেওয়া হয়নি।"))+'</div></section>');
 document.getElementById("profileRequest").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),changes={};
  fields.forEach(([k])=>{const v=String(fd.get(k)||"").trim();if(v!==(m[k]||""))changes[k]=v});
  let photoPath=null;const photo=fd.get("photo");
  if(photo&&photo.size){if(photo.size>5*1024*1024){toast("ছবির আকার 5MB-এর বেশি।");return}const ext=(photo.name.split(".").pop()||"jpg").toLowerCase();photoPath=access.session.user.id+"/"+crypto.randomUUID()+"."+ext;const {error:upErr}=await supabase.storage.from("member-profile-photos").upload(photoPath,photo,{upsert:false,contentType:photo.type});if(upErr){toast(upErr.message);return}}
  const memberDoc=fd.get("member_nid"),nomineeDoc=fd.get("nominee_nid"),hasChanges=Object.keys(changes).length>0||Boolean(photoPath);
  if(!hasChanges&&!(memberDoc?.size)&&!(nomineeDoc?.size)){toast("কোনো পরিবর্তন বা ফাইল নির্বাচন করা হয়নি।");return}
  if(hasChanges){const {error:insErr}=await supabase.from("profile_change_requests").insert({member_id:m.id,submitted_by:access.session.user.id,requested_changes:changes,requested_photo_path:photoPath});if(insErr){if(photoPath)await supabase.storage.from("member-profile-photos").remove([photoPath]);toast(insErr.message);return}}
  for(const [docType,file] of [["member_nid",memberDoc],["nominee_nid",nomineeDoc]]){
   if(!file?.size)continue;
   if(file.size>10*1024*1024){toast(file.name+" 10MB-এর বেশি।");continue}
   if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)){toast("এই ফাইলের ধরন গ্রহণযোগ্য নয়।");continue}
   const ext=(file.name.split(".").pop()||"pdf").toLowerCase(),path=access.session.user.id+"/"+crypto.randomUUID()+"."+ext;
   const {error:upError}=await supabase.storage.from("member-private-documents").upload(path,file,{upsert:false,contentType:file.type});
   if(upError){toast(upError.message);continue}
   const {error:rowError}=await supabase.from("member_private_documents").insert({member_id:m.id,owner_user_id:access.session.user.id,document_type:docType,storage_path:path,status:"pending"});
   if(rowError){await supabase.storage.from("member-private-documents").remove([path]);toast(rowError.message)}
  }
  toast("অনুরোধ/ডকুমেন্ট জমা হয়েছে। Super Admin-এর অনুমোদনের অপেক্ষায় আছে।");renderProfile();
 });
}

async function renderPendingPrivateDocuments(){
 const box=document.getElementById("pendingDocuments");if(!box)return;
 const {data,error}=await supabase.from("member_private_documents").select("id,member_id,owner_user_id,document_type,storage_path,uploaded_at,members(full_name,member_no)").eq("status","pending").order("uploaded_at");
 if(error){box.textContent=error.message;return}
 if(!data.length){box.innerHTML=empty("কোনো Pending ID document নেই।");return}
 const cards=await Promise.all(data.map(async d=>{
  const {data:u}=await supabase.storage.from("member-private-documents").createSignedUrl(d.storage_path,900);
  return '<article class="list-item"><strong>'+esc(d.members?.member_no||"")+' · '+esc(d.members?.full_name||"Member")+'</strong><p>'+esc(d.document_type==="member_nid"?"Member NID / ID":"Nominee NID / ID")+'</p><small>'+esc(new Date(d.uploaded_at).toLocaleString())+'</small>'+(u?.signedUrl?'<p><a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">View private document</a></p>':"")+'<div class="row"><button data-doc-approve="'+esc(d.id)+'">Approve</button><button class="danger" data-doc-reject="'+esc(d.id)+'">Reject</button></div></article>';
 }));
 box.innerHTML=cards.join("");
 box.querySelectorAll("[data-doc-approve],[data-doc-reject]").forEach(b=>b.addEventListener("click",async()=>{
  const approved=b.hasAttribute("data-doc-approve"),id=approved?b.dataset.docApprove:b.dataset.docReject,note=prompt("Admin note (optional):")||null;
  const {error}=await supabase.from("member_private_documents").update({status:approved?"approved":"rejected",admin_note:note,reviewed_by:access.session.user.id,reviewed_at:new Date().toISOString()}).eq("id",id);
  if(error)toast(error.message);else{toast(approved?"Document approved.":"Document rejected.");renderPendingPrivateDocuments()}
 }));
}

async function renderAdmin(){
 if(access.role!=="super_admin"){setPage('<h1>Super Admin</h1>'+empty("এই পেজে শুধু Super Admin প্রবেশ করতে পারবেন।"));return}
 setPage('<h1>Super Admin Control Panel</h1><p class="lead">সব কমিটি ডেটা, আর্থিক লেনদেন, সদস্য, প্রমাণপত্র ও নোটিশ এখান থেকে নিয়ন্ত্রণ করো।</p><div class="notice">শুধু যাচাইকৃত তথ্য এন্ট্রি করবে। Opening balance, monthly contribution ও start date না দেওয়া পর্যন্ত সেগুলো শূন্য/অনির্ধারিত থাকবে।</div><section class="section"><h2>নতুন সদস্য যোগ</h2><form id="memberForm"><div class="form-grid"><div class="field"><label>Member ID</label><input name="member_no" placeholder="যেমন M-003"></div><div class="field"><label>পূর্ণ নাম *</label><input name="full_name" required></div><div class="field"><label>বাংলা নাম</label><input name="full_name_bn"></div><div class="field"><label>মোবাইল</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>মাসিক জমা (৳)</label><input name="monthly_contribution" type="number" min="0" step=".01"></div><div class="field"><label>জমা শুরু</label><input name="contribution_start_date" type="date"></div></div><div class="form-actions"><button type="submit">সদস্য যোগ করো</button></div></form><p class="muted small">Member account invitation পাঠালে Supabase Auth invite email যাবে; password কখনো এখানে রাখা হয় না।</p></section><section class="section"><h2>Member Login Invite</h2><form id="inviteForm"><div class="form-grid"><div class="field"><label>Active member</label><select id="inviteMember" name="member_id" required><option value="">সদস্য নির্বাচন করো</option></select></div><div class="field"><label>Member email</label><input id="inviteEmail" name="email" type="email" required></div></div><div class="form-actions"><button type="submit">Login invitation পাঠাও</button></div></form><p class="muted small">শুধু Active এবং এখনো Login account link হয়নি—এমন সদস্য নির্বাচন করা যাবে।</p></section><section class="section"><h2>মাসিক জমার হার নির্ধারণ/পরিবর্তন</h2><form id="rateForm"><div class="form-grid"><div class="field"><label>Active member</label><select id="rateMember" name="member_id" required><option value="">সদস্য নির্বাচন</option></select></div><div class="field"><label>মাসিক জমা (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>কার্যকর হবে (মাসের ১ তারিখ)</label><input name="effective_from" type="date" required></div></div><div class="form-actions"><button type="submit">জমার হার সংরক্ষণ</button></div></form><p class="muted small">আগের হার স্বয়ংক্রিয়ভাবে আগের মাসের শেষ দিনে বন্ধ হবে। কার্যকর তারিখ অবশ্যই মাসের ১ তারিখ হতে হবে।</p></section><section class="section"><h2>নতুন আর্থিক লেনদেন</h2><form id="transactionForm"><div class="form-grid"><div class="field"><label>লেনদেনের ধরন</label><select name="type"><option value="opening_balance">Opening balance</option><option value="contribution">Member contribution</option><option value="withdrawal">Withdrawal</option><option value="expense">Expense</option><option value="other_income">Other income</option><option value="investment_profit">Investment profit</option><option value="investment_loss">Investment loss</option><option value="transfer">Account transfer</option></select></div><div class="field"><label>Amount (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>তারিখ</label><input name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Account</label><select name="account"><option value="cash">Cash</option><option value="bank">Bank</option><option value="investment">Investment</option></select></div><div class="field"><label>Transfer destination (transfer হলে)</label><select name="destination"><option value="bank">Bank</option><option value="cash">Cash</option><option value="investment">Investment</option></select></div><div class="field"><label>সদস্য (ঐচ্ছিক; Contribution-এ বাধ্যতামূলক)</label><select name="member_id" id="transactionMember"><option value="">Select member</option></select></div><div class="field"><label>বিবরণ</label><input name="description" required></div><div class="field"><label>Reference No</label><input name="reference_no"></div></div><div class="form-actions"><button type="submit">লেনদেন সংরক্ষণ</button></div></form></section><section class="section"><h2>মাসিক প্রমাণপত্র</h2><p>মাস নির্বাচন করে Proof পেজে এক বা একাধিক ছবি/PDF Drop অথবা Browse করে আপলোড করুন।</p></section><section class="section"><h2>নোটিশ প্রকাশ</h2><form id="noticeForm"><div class="form-grid"><div class="field"><label>শিরোনাম</label><input name="title" required maxlength="180"></div><div class="field"><label>ধরন</label><select name="type"><option value="general">সাধারণ</option><option value="meeting">সভা</option><option value="reminder">স্মরণবার্তা</option></select></div><div class="field"><label>সভা হলে তারিখ ও সময়</label><input name="meeting_at" type="datetime-local"></div></div><div class="field" style="margin-top:12px"><label>বিস্তারিত</label><textarea name="body" required maxlength="5000"></textarea></div><div class="form-actions"><button type="submit">সবার জন্য প্রকাশ</button></div></form></section><section class="section"><h2>Pending profile changes</h2><div id="pendingRequests" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>Pending private ID documents</h2><div id="pendingDocuments" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>সদস্য তালিকা</h2><div id="adminMembers" class="table-wrap"></div></section><section class="section"><h2>সাম্প্রতিক লেনদেন</h2><div id="adminTransactions" class="table-wrap"></div></section>');
 const {data:members,error:mErr}=await supabase.from("members").select("id,member_no,full_name,email,status,monthly_contribution,contribution_start_date,auth_user_id").order("member_no");
 if(mErr)throw mErr;
 const rateSelect=document.getElementById("rateMember");
 members.filter(m=>m.status==="active").forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=(m.member_no||"")+" · "+m.full_name;rateSelect.append(o)});
 document.getElementById("rateForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),effective=d.get("effective_from");if(new Date(effective+"T00:00:00").getDate()!==1){toast("কার্যকর তারিখ মাসের ১ তারিখ হতে হবে।");return}const {error}=await supabase.rpc("set_member_contribution_rate",{p_member_id:rateSelect.value,p_amount:Number(d.get("amount")),p_effective_from:effective});if(error)toast(error.message);else{toast("মাসিক জমার হার সংরক্ষিত হয়েছে।");renderAdmin()}});
 const inviteSelect=document.getElementById("inviteMember");
 members.filter(m=>m.status==="active"&&!m.auth_user_id).forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=(m.member_no||"")+" · "+m.full_name;inviteSelect.append(o)});
 inviteSelect.addEventListener("change",()=>{const m=members.find(x=>x.id===inviteSelect.value);document.getElementById("inviteEmail").value=m?.email||""});
 document.getElementById("inviteForm").addEventListener("submit",async e=>{e.preventDefault();const member_id=inviteSelect.value,email=document.getElementById("inviteEmail").value.trim();const {data,error}=await supabase.functions.invoke("invite-member",{body:{member_id,email}});if(error)toast(error.message);else{toast("Member invitation পাঠানো হয়েছে।");renderAdmin()}});
 const memberSelect=document.getElementById("transactionMember");
 members.forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=(m.member_no||"")+(m.member_no?" · ":"")+m.full_name;memberSelect.append(o)});
 document.getElementById("adminMembers").innerHTML='<table><thead><tr><th>Member ID</th><th>Name</th><th>Status</th><th>Monthly</th><th>Start</th><th>Login link</th></tr></thead><tbody>'+members.map(m=>'<tr><td>'+esc(m.member_no||"—")+'</td><td>'+esc(m.full_name)+'</td><td>'+esc(m.status)+'</td><td>'+esc(m.monthly_contribution?money(m.monthly_contribution):"Not set")+'</td><td>'+esc(m.contribution_start_date||"—")+'</td><td>'+((m.auth_user_id)?'<span class="pill">Linked</span>':'<span class="pill">Not linked</span>')+'</td></tr>').join("")+'</tbody></table>';
 const tx=await supabase.from("financial_transactions").select("transaction_date,transaction_type,account_type,direction,amount,description").order("transaction_date",{ascending:false}).limit(20);
 document.getElementById("adminTransactions").innerHTML=tx.error?empty(tx.error.message):tx.data.length?'<table><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Flow</th><th>Amount</th><th>Description</th></tr></thead><tbody>'+tx.data.map(x=>'<tr><td>'+esc(x.transaction_date)+'</td><td>'+esc(x.transaction_type)+'</td><td>'+esc(x.account_type)+'</td><td>'+esc(x.direction)+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.description||"")+'</td></tr>').join("")+'</tbody></table>':empty("এখনো কোনো লেনদেন নেই।");
 const pending=await supabase.from("profile_change_requests").select("id,member_id,submitted_by,requested_changes,requested_photo_path,created_at,members(full_name,member_no)").eq("status","pending").order("created_at");
 const pBox=document.getElementById("pendingRequests");
 if(pending.error)pBox.textContent=pending.error.message;
 else if(!pending.data.length)pBox.innerHTML=empty("কোনো Pending request নেই।");
 else{
  pBox.innerHTML=pending.data.map(r=>'<article class="list-item request"><strong>'+esc(r.members?.member_no||"")+' '+esc(r.members?.full_name||"Member")+'</strong><small>'+esc(new Date(r.created_at).toLocaleString())+'</small><pre>'+esc(JSON.stringify(r.requested_changes,null,2))+'</pre><div id="photo-'+esc(r.id)+'"></div><div class="row"><button data-approve="'+esc(r.id)+'">Approve</button><button class="danger" data-reject="'+esc(r.id)+'">Reject</button></div></article>').join("");
  for(const r of pending.data){if(r.requested_photo_path){const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(r.requested_photo_path,3600);if(u?.signedUrl)document.getElementById("photo-"+r.id).innerHTML='<a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">Pending photo preview</a>'}}
  document.querySelectorAll("[data-approve],[data-reject]").forEach(b=>b.addEventListener("click",async()=>{const approved=b.hasAttribute("data-approve"),id=approved?b.dataset.approve:b.dataset.reject;const note=prompt("Admin note (optional):")||null;const {error}=await supabase.rpc("review_profile_change_request",{p_request_id:id,p_approved:approved,p_admin_note:note});if(error)toast(error.message);else{toast(approved?"Request approved.":"Request rejected.");renderAdmin()}}));
 }
 await renderPendingPrivateDocuments();
 document.getElementById("memberForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget);const amount=d.get("monthly_contribution");const payload={member_no:String(d.get("member_no")||"").trim()||null,full_name:String(d.get("full_name")).trim(),full_name_bn:String(d.get("full_name_bn")||"").trim()||null,phone:String(d.get("phone")||"").trim()||null,email:String(d.get("email")||"").trim()||null,status:"active",monthly_contribution:amount?Number(amount):null,contribution_start_date:d.get("contribution_start_date")||null};if(Boolean(amount)!==Boolean(payload.contribution_start_date)){toast("Monthly amount ও জমা শুরুর তারিখ—দুটিই দিতে হবে, অথবা দুটিই ফাঁকা রাখতে হবে।");return}if(payload.contribution_start_date&&new Date(payload.contribution_start_date+"T00:00:00").getDate()!==1){toast("জমা শুরুর তারিখ মাসের ১ তারিখ হতে হবে।");return}const {data:created,error}=await supabase.from("members").insert(payload).select("id").single();if(error)toast(error.message);else{if(amount&&payload.contribution_start_date){const {error:rateError}=await supabase.rpc("set_member_contribution_rate",{p_member_id:created.id,p_amount:Number(amount),p_effective_from:payload.contribution_start_date});if(rateError){toast("সদস্য যোগ হয়েছে, কিন্তু জমার হার সেট হয়নি: "+rateError.message);return}}toast("সদস্য যোগ হয়েছে।");renderAdmin()}});
 document.getElementById("transactionForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),type=d.get("type"),amount=Number(d.get("amount")),account=d.get("account"),date=d.get("date"),memberId=d.get("member_id")||null,desc=String(d.get("description")||"").trim();if(!(amount>0)){toast("Amount অবশ্যই 0-এর বেশি হতে হবে।");return}if(type==="contribution"&&!memberId){toast("Contribution-এর জন্য সদস্য নির্বাচন করো।");return}let payload;if(type==="transfer"){const destination=d.get("destination");if(account===destination){toast("Source ও destination account আলাদা হতে হবে।");return}const group=crypto.randomUUID();payload=[{transaction_type:"transfer",account_type:account,direction:"out",amount,transaction_date:date,description:desc,reference_no:d.get("reference_no")||null,transfer_group_id:group,created_by:access.session.user.id},{transaction_type:"transfer",account_type:destination,direction:"in",amount,transaction_date:date,description:desc,reference_no:d.get("reference_no")||null,transfer_group_id:group,created_by:access.session.user.id}]}else{const direction=["withdrawal","expense","investment_loss"].includes(type)?"out":"in";payload={transaction_type:type,account_type:account,direction,amount,transaction_date:date,member_id:memberId,description:desc,reference_no:d.get("reference_no")||null,created_by:access.session.user.id}}const {error}=await supabase.from("financial_transactions").insert(payload);if(error)toast(error.message);else{toast("লেনদেন সংরক্ষিত হয়েছে।");renderAdmin()}});
 document.getElementById("noticeForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),type=d.get("type"),meeting=d.get("meeting_at");if(type==="meeting"&&!meeting){toast("সভা হলে সময় দিতে হবে।");return}const {error}=await supabase.from("notices").insert({title:d.get("title"),body:d.get("body"),notice_type:type,meeting_at:meeting?new Date(meeting).toISOString():null,published:true,published_at:new Date().toISOString(),created_by:access.session.user.id});if(error)toast(error.message);else{toast("নোটিশ প্রকাশ হয়েছে।");renderAdmin()}});
}
async function renderRules(){
 setPage('<h1>'+t("সমিতির নিয়মাবলি","Committee rules")+'</h1><p class="lead">'+t("নিচের অংশগুলো সিস্টেমের বর্তমান পরিচালননীতি। আর্থিক শর্তাবলি ও চুক্তির ধারা Super Admin-এর অনুমোদিত মূল নথি থেকে যোগ করতে হবে।","These are the current system operating rules. Financial terms and deed clauses must be added from the owner-approved documents.")+'</p><section class="section"><h2>১. ডেটা ও হিসাব</h2><p>সব আর্থিক লেনদেন, ব্যালেন্স, প্রমাণপত্র ও সদস্য-তথ্য শুধু Super Admin আপডেট করবেন।</p></section><section class="section"><h2>২. সদস্য অ্যাক্সেস</h2><p>সদস্যরা অনুমোদিত সামগ্রিক হিসাব, প্রকাশিত নোটিশ, সদস্যদের নাম/ছবি এবং নিজেদের ব্যক্তিগত তথ্য দেখতে পারবেন। অন্য সদস্যের ব্যক্তিগত তথ্য দেখা যাবে না।</p></section><section class="section"><h2>৩. প্রোফাইল পরিবর্তন</h2><p>নিজের তথ্য পরিবর্তনের অনুরোধ বা ছবি জমা দেওয়া যাবে। Super Admin অনুমোদন না করা পর্যন্ত মূল প্রোফাইলে পরিবর্তন হবে না।</p></section><section class="section"><h2>৪. আর্থিক শর্তাবলি</h2><div class="notice">মাসিক জমার পরিমাণ, জমার শেষ তারিখ, বিলম্ব ফি, উত্তোলন, লাভ-ক্ষতি বণ্টন ও সদস্যপদ বাতিলের শর্ত এখনো এখানে নির্ধারণ করা হয়নি। অনুমোদিত লিখিত নিয়ম না পাওয়া পর্যন্ত কোনো শর্ত অনুমান করে প্রকাশ করা হবে না।</div></section>');
}
async function renderPage(){
 try{
  if(page==="dashboard")await renderDashboard();
  else if(page==="data")await renderData();
  else if(page==="personal-due")await renderDue();
  else if(page==="member-info")await renderMembers();
  else if(page==="proof")await renderProofs();
  else if(page==="member")await renderProfile();
  else if(page==="admin")await renderAdmin();
  else if(page==="rules")await renderRules();
  else if(page==="payment")await renderPayment();
 }catch(error){console.error(error);setPage('<h1>তথ্য লোড করা যায়নি</h1><div class="error">'+esc(error.message||"Unknown error")+'</div><p class="muted">Supabase connection, permissions and table setup পরীক্ষা করো।</p>')}
}
access=await requireRole(page==="admin"?["super_admin"]:["super_admin","admin","member"]);
if(access){shell();await renderPage();if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker registration failed",e))}}
