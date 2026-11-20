import "./password-visibility.js";
import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";
import { enablePush } from "./push.js";
import { installPwa, registerPwa } from "./pwa.js";

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
async function optimizeImageFile(file,purpose="photo"){
 if(!file?.type?.startsWith("image/"))return file;
 if(file.size>20*1024*1024)throw new Error("Original image exceeds the 20MB upload-processing limit.");
 const maxEdge=purpose==="document"?2600:purpose==="qr"?1800:1400;
 const targetBytes=purpose==="document"?1500*1024:purpose==="qr"?1500*1024:650*1024;
 let source=null,cleanup=()=>{};
 try{
  if(typeof createImageBitmap==="function"){
   source=await createImageBitmap(file);
   cleanup=()=>source?.close?.();
  }else{
   const url=URL.createObjectURL(file),image=new Image();
   image.src=url;await image.decode();source=image;cleanup=()=>URL.revokeObjectURL(url);
  }
  const scale=Math.min(1,maxEdge/Math.max(source.width,source.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(source.width*scale));
  canvas.height=Math.max(1,Math.round(source.height*scale));
  const context=canvas.getContext("2d",{alpha:false});
  if(!context)throw new Error("Image processing canvas unavailable");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(source,0,0,canvas.width,canvas.height);
  const outputType=purpose==="qr"?"image/png":"image/webp";
  const encode=quality=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Image encoding failed")),outputType,quality));
  let blob;
  if(purpose==="qr")blob=await encode();
  else{
   for(const quality of [.92,.88,.84,.80,.76,.72]){
    const candidate=await encode(quality);blob=candidate;
    if(candidate.size<=targetBytes)break;
   }
  }
  if(!blob||blob.size>=file.size)return file;
  const extension=blob.type==="image/png"?"png":"webp";
  const base=file.name.replace(/\.[^.]+$/,"")||"upload";
  return new File([blob],base+"-optimized."+extension,{type:blob.type,lastModified:file.lastModified});
 }finally{cleanup()}
}
async function refreshUnreadCount(){
 const badge=document.getElementById("unreadCount");
 const userId=access?.session?.user?.id;
 if(!badge||!userId||!supabase)return;
 try{
  const {count,error}=await supabase.from("notifications")
   .select("id",{count:"exact",head:true})
   .eq("user_id",userId)
   .is("read_at",null);
  if(error)throw error;
  const total=Number(count||0);
  badge.textContent=total>99?"99+":String(total);
  badge.hidden=total<1;
 }catch(error){
  console.warn("Unread notification count unavailable",error);
  badge.hidden=true;
 }
}
function setPage(html){document.getElementById("pageContent").innerHTML=html}
function card(label,value,sub=""){return '<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div><small>'+esc(sub)+'</small></article>'}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>'}
function icon(name){
 const paths={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5M10 14l2 2 4-4"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6zM9 12l2 2 4-4"/>'};
 return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.data)+'</svg>';
}
function navItem(href,label,iconName){return '<a href="'+href+'" '+(page===href.replace(".html","")?'class="active"':'')+'>'+icon(iconName)+'<span>'+label+'</span></a>'}
const DEFAULT_TICKER="আপনাকে ফ্রেন্ডস ফিউচার ভিশন ফরইভার এ স্বাগতম। আপনাকে আমাদের কোম্পানির পার্টনারশিপ ও মেম্বার হওয়ার জন্য অনেক অনেক শুভেচ্ছা জানাই। নিজের আইডি পাসওয়ার্ড নিজের কাছে রাখুন। অন্যদের সাথে শেয়ার করা থেকে বিরত থাকুন। নিজের বকেয়া প্রতি মাসের নির্ধারিত সময় (মাসের ১৫ তারিখের মধ্যে) এর মধ্যে দায়িত্বপ্রাপ্তদের হাতে বুঝিয়ে দিন। ধন্যবাদ। ইন শাহ আল্লাহ আমাদের স্বপ্ন বাস্তব হবে সকলে একসাথে থাকলে।";
function applyTheme(theme){
 const dark=theme==="dark";
 document.body.classList.toggle("dark-theme",dark);
 const button=document.getElementById("themeToggle");
 if(button){button.textContent=dark?"☀ Light":"☾ Dark";button.setAttribute("aria-pressed",String(dark));button.title=dark?"Switch to light mode":"Switch to dark mode"}
}
function shell(){
 const isSuper=access.role==="super_admin",isPublic=access.role==="public";
 const roleLabel=isSuper?"Super Admin":"Member";
 const nav=navItem("dashboard.html",t("হোম","Home"),"home")+navItem("rules.html","RULES","rules")+navItem("member-info.html","MEMBER INFO","members")+navItem("data.html","DATA","data")+(isPublic?"":navItem("personal-due.html","PERSONAL DUE","due")+navItem("proof.html","PROOF","proof")+navItem("payment.html","PAYMENT","payment")+(isSuper?navItem("admin.html","SUPER ADMIN","admin"):"")+(access.role==="member"?navItem("statement.html","MY STATEMENT","data")+navItem("member.html","MY PROFILE","profile"):""));
 const exportMenu=isSuper?'<details class="export-menu"><summary>EXPORT</summary><div class="export-menu-panel"><button type="button" data-export-action="page-xlsx">এই পেজ · Excel</button><button type="button" data-export-action="page-docx">এই পেজ · Word</button><button type="button" data-export-action="full-xlsx">সম্পূর্ণ Website · Excel</button><button type="button" data-export-action="full-docx">সম্পূর্ণ Website · Word</button></div></details>':"";
 const initialName=access.profile?.full_name||access.session.user.email?.split("@")[0]||roleLabel;
 root.innerHTML='<div class="shell"><header class="topbar"><button class="icon-button menu-button" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="sidebarPanel">'+icon("menu")+'</button><div class="brand topbar-brand"><img src="friends-future-community-emblem-optimized.webp" alt="Friends Future Vision Forever" width="44" height="44" decoding="async"><div class="topbar-identity"><strong id="headerUserName">'+esc(String(initialName).toLocaleUpperCase("en-US"))+'</strong><small>Friends Future Vision Forever</small></div></div><div class="actions">'+exportMenu+'<button class="secondary install-app-button" id="installAppBtn" type="button">Install App</button><button class="secondary theme-toggle" id="themeToggle" type="button" aria-pressed="false">☾ Dark</button>'+(isPublic?'<a class="button" href="login.html">LOGIN</a>':'<span class="role topbar-role">'+roleLabel+'</span><button class="icon-button notification-trigger" id="notificationBtn" aria-label="Notifications" title="Notifications">'+icon("bell")+'<span class="unread-count" id="unreadCount" hidden></span></button>')+'</div></header><div class="site-ticker" id="siteTicker"><span class="site-ticker-label">NOTICE</span><div class="site-ticker-window"><span id="siteTickerText">'+esc(DEFAULT_TICKER)+'</span></div></div><nav class="nav primary-nav" id="primaryNav" aria-label="Main navigation">'+nav+'</nav><div class="drawer-backdrop" id="drawerBackdrop" hidden></div><aside class="sidebar-panel" id="sidebarPanel" aria-label="Main navigation" hidden><div class="sidebar-head"><a class="sidebar-brand" href="dashboard.html"><img src="friends-future-community-emblem-optimized.webp" alt="Friends Future Vision Forever" width="44" height="44" decoding="async"><strong>'+esc(String(initialName).toLocaleUpperCase("en-US"))+'</strong></a><button class="icon-button drawer-close" id="closeSidebar" aria-label="Close menu">×</button></div><nav class="nav sidebar-nav" id="mainNav">'+nav+'</nav><div class="sidebar-footer">'+(isPublic?'<a class="button" href="login.html">LOGIN</a>':'<div class="sidebar-account"><span class="account-role">'+roleLabel+'</span><span class="account-email">'+esc(access.session.user.email||"")+'</span></div><button class="secondary" id="languageBtn">'+(lang==="bn"?"English":"বাংলা")+'</button><button class="secondary" id="sidebarThemeToggle" type="button">Dark / Light</button><button class="secondary" id="logoutBtn">লগআউট</button>')+'</div></aside><aside class="notification-panel" id="notificationPanel" aria-label="Notifications" hidden><div class="notification-head"><strong>'+t("নোটিফিকেশন","Notifications")+'</strong><button class="icon-button" id="closeNotifications" aria-label="Close notifications">×</button></div><div class="notification-list" id="notificationList">'+empty(t("লোড হচ্ছে…","Loading…"))+'</div></aside><main class="page" id="pageContent"><div class="empty">তথ্য লোড হচ্ছে…</div></main><footer class="footer">Friends Future Vision Forever · Secure member portal</footer></div>';
 let savedTheme="light";try{savedTheme=localStorage.getItem("ffv-theme")==="dark"?"dark":"light"}catch{}
 applyTheme(savedTheme);
 document.getElementById("themeToggle").addEventListener("click",()=>{const next=document.body.classList.contains("dark-theme")?"light":"dark";try{localStorage.setItem("ffv-theme",next)}catch{}applyTheme(next)});
 document.getElementById("sidebarThemeToggle")?.addEventListener("click",()=>document.getElementById("themeToggle")?.click());
 document.getElementById("installAppBtn").addEventListener("click",async()=>{try{const result=await installPwa();if(!result.available)toast("Chrome menu ⋮ থেকে Install app / Add to Home screen নির্বাচন করুন। iPhone হলে Share → Add to Home Screen চাপুন।");else if(result.outcome==="accepted")toast("App install শুরু হয়েছে।")}catch(error){toast(error.message||"Install prompt চালু করা যায়নি।")}});
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
   toast("Export file তৈরি হয়েছে। Download folder পরীক্ষা করুন।");
  }catch(error){console.error(error);toast("Export ব্যর্থ: "+(error.message||"Unknown error"),true)}
  finally{button.disabled=false;button.textContent=original}
 }));
 if(!isPublic){
  const sidebar=document.getElementById("sidebarPanel"),panel=document.getElementById("notificationPanel"),backdrop=document.getElementById("drawerBackdrop");
  const closeDrawers=()=>{sidebar.hidden=true;panel.hidden=true;backdrop.hidden=true;document.getElementById("menuBtn").setAttribute("aria-expanded","false")};
  document.getElementById("menuBtn").addEventListener("click",()=>{const open=sidebar.hidden;closeDrawers();sidebar.hidden=!open;backdrop.hidden=!open;document.getElementById("menuBtn").setAttribute("aria-expanded",String(open))});
  document.getElementById("closeSidebar").addEventListener("click",closeDrawers);
  document.getElementById("closeNotifications").addEventListener("click",closeDrawers);
  backdrop.addEventListener("click",closeDrawers);
  document.getElementById("notificationBtn").addEventListener("click",async()=>{const open=panel.hidden;closeDrawers();if(open){panel.hidden=false;await loadNotificationPanel()}});
  document.getElementById("mainNav").addEventListener("click",e=>{if(e.target.closest("a"))closeDrawers()});
  document.getElementById("primaryNav").addEventListener("click",e=>{if(e.target.closest("a"))closeDrawers()});
  document.getElementById("logoutBtn").addEventListener("click",async()=>{try{sessionStorage.removeItem("ffv:member-photo-cache")}catch{}const {error}=await supabase.auth.signOut();if(error)toast(error.message);else location.replace("login.html")});
  document.getElementById("languageBtn").addEventListener("click",()=>{lang=lang==="bn"?"en":"bn";document.documentElement.lang=lang;shell();renderPage()});
  refreshUnreadCount();
 }
}
async function loadHeaderIdentity(){
 let name=access.profile?.full_name||"";
 if(access.role==="member"){
  const {data,error}=await supabase.from("members").select("full_name").eq("auth_user_id",access.session.user.id).maybeSingle();
  if(!error&&data?.full_name)name=data.full_name;
 }
 if(name){
  const label=name.toLocaleUpperCase("en-US");
  const target=document.getElementById("headerUserName");if(target)target.textContent=label;
  const side=document.querySelector(".sidebar-brand strong");if(side)side.textContent=label;
 }
}
async function loadTickerSettings(){
 const ticker=document.getElementById("siteTicker"),textNode=document.getElementById("siteTickerText");
 if(!ticker||!textNode)return;
 try{
  const {data,error}=await supabase.from("site_settings").select("setting_key,setting_value").in("setting_key",["ticker_message","ticker_enabled"]);
  if(error)throw error;
  const values=new Map((data||[]).map(row=>[row.setting_key,row.setting_value]));
  const message=String(values.get("ticker_message")||DEFAULT_TICKER).trim();
  textNode.textContent=message||DEFAULT_TICKER;
  ticker.hidden=values.get("ticker_enabled")==="false";
 }catch(error){console.warn("Ticker settings unavailable; using default message",error);textNode.textContent=DEFAULT_TICKER}
}
async function loadNotificationPanel(){
 const box=document.getElementById("notificationList");if(!box)return;
 box.innerHTML=empty(t("লোড হচ্ছে…","Loading…"));
 const {data,error}=await supabase.from("notifications").select("id,title,body,notification_type,created_at,read_at").eq("user_id",access.session.user.id).order("created_at",{ascending:false}).limit(25);
 if(error){box.innerHTML=empty(t("নোটিফিকেশন লোড করা যায়নি।","Could not load notifications."));return}
 box.innerHTML=data.length?data.map(n=>'<article class="notification-item '+(n.read_at?"is-read":"is-unread")+'"><div class="notification-item-top"><strong>'+esc(n.title)+'</strong>'+(n.read_at?'':'<span class="notification-dot"></span>')+'</div><p>'+esc(n.body)+'</p><small>'+esc(new Date(n.created_at).toLocaleString())+'</small>'+(n.read_at?'':'<button class="secondary mark-notification-read" data-id="'+esc(n.id)+'">'+t("পড়া হয়েছে","Mark as read")+'</button>')+'</article>').join(""):empty(t("এখনো কোনো নোটিফিকেশন নেই।","No notifications yet."));
 box.querySelectorAll(".mark-notification-read").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",button.dataset.id);if(error){toast(error.message);button.disabled=false;return}await loadNotificationPanel();refreshUnreadCount()}));
}

async function summary(){
 const {data,error}=await supabase.rpc("get_financial_summary");
 if(error)throw error;
 return data||{};
}
function dashboardChartMarkup(summaryData){
 const rows=(summaryData.monthly_trend||[]).slice(-12);
 const values=rows.map(r=>Number(r.contributions||0));
 const max=Math.max(1,...values);
 const bars=rows.map((r,i)=>"<div class=\"mini-bar-item\"><span>"+esc(String(r.month||"").slice(5))+"</span><i style=\"height:"+Math.max(3,100*values[i]/max)+"%\"></i></div>").join("");
 const pts=values.map((v,i)=>(12+i*476/Math.max(1,values.length-1))+","+(178-150*v/max)).join(" ");
 const line="<svg viewBox=\"0 0 500 200\" class=\"matrix-chart-svg\" role=\"img\" aria-label=\"Monthly contributions\"><polyline points=\""+pts+"\" fill=\"none\" stroke=\"#3976d2\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
 const parts=[{name:"Contributions",value:Number(summaryData.total_contributions||0),color:"#15966f"},{name:"Expenses",value:Number(summaryData.total_expenses||0),color:"#d56d72"},{name:"Investment",value:Number(summaryData.investment_balance||0),color:"#3976d2"}];
 const total=parts.reduce((n,x)=>n+x.value,0);let angle=0;const stops=parts.map(x=>{const start=angle;angle+=total?x.value/total*360:0;return x.color+" "+start+"deg "+angle+"deg"}).join(",");
 const pie="<div class=\"matrix-pie\" style=\"background:conic-gradient("+stops+")\"></div><div class=\"matrix-chart-legend\">"+parts.map(x=>"<span><i style=\"background:"+x.color+"\"></i>"+x.name+" · "+money(x.value)+"</span>").join("")+"</div>";
 return "<section class=\"section matrix-charts\"><h2>"+t("আর্থিক চার্ট","Financial charts")+"</h2><div class=\"matrix-chart-grid\"><article class=\"card\"><strong>"+t("মাসিক জমা · Column","Monthly contributions · Column")+"</strong><div class=\"mini-bars\">"+bars+"</div></article><article class=\"card\"><strong>"+t("জমার প্রবণতা · Line","Contribution trend · Line")+"</strong>"+line+"</article><article class=\"card\"><strong>"+t("আর্থিক অনুপাত · Pie","Financial mix · Pie")+"</strong>"+pie+"</article></div></section>";
}
async function renderDashboard(){
 const [s,dueResult,memberCountResult]=await Promise.all([
  Promise.race([
   summary(),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error("Dashboard data request timed out. Network বা Supabase connection পরীক্ষা করে Reload করুন।")),15000))
  ]),
  supabase.rpc("get_member_shared_financial_data_v2"),
  supabase.from("member_directory").select("member_id",{count:"exact",head:true})
 ]);
 const {data:dueRows,error:dueError}=dueResult;
 if(dueError)throw dueError;
 if(memberCountResult.error)throw memberCountResult.error;
 const activeMemberCount=memberCountResult.count||0;
 const dueByMember=new Map();
 (dueRows||[]).forEach(row=>{if(!dueByMember.has(row.member_id))dueByMember.set(row.member_id,{due:Number(row.total_due||0),paid:Number(row.total_paid||0),configured:Boolean(row.due_configured)});});
 const memberTotals=Array.from(dueByMember.values());
 const totalDue=memberTotals.reduce((sum,item)=>sum+(item.configured?item.due:0),0);
 const totalMemberPaid=memberTotals.reduce((sum,item)=>sum+item.paid,0);
 const contributionDifference=Number(s.total_contributions||0)-totalMemberPaid;
 const reconciliationNotice=access.role==="super_admin"&&Math.abs(contributionDifference)>0.01
  ?'<div class="error" role="alert"><strong>হিসাব মিলছে না — যাচাই প্রয়োজন</strong><p>Dashboard contribution ledger ও DATA matrix-এর মধ্যে '+money(Math.abs(contributionDifference))+' পার্থক্য আছে। '+(contributionDifference>0?'Ledger-এ বেশি':'DATA matrix-এ বেশি')+'. DATA এবং Financial Ledger মিলিয়ে সংশোধন করুন।</p></div>'
  :"";

 setPage('<p class="lead">'+t("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ। সদস্যদের ব্যক্তিগত তথ্য এখানে প্রকাশ করা হয় না।","Verified committee-wide financial summary. Individual member details are not shown here.")+'</p>'+reconciliationNotice+'<div class=\"grid\">'+
 card(t("মোট সম্পদ","Total assets"),money(s.total_assets),t("নগদ + ব্যাংক + বিনিয়োগ","Cash + bank + investments"))+
 card(t("ব্যাংক ব্যালেন্স","Bank balance"),money(s.bank_balance))+
 card(t("হাতে নগদ","Cash in hand"),money(s.cash_balance))+
 card(t("মোট বিনিয়োগ","Investment balance"),money(s.investment_balance))+
 card(t("মোট সদস্য","Total members"),String(activeMemberCount),t("অনুমোদিত সক্রিয় সদস্য","Approved active members"))+
 card(t("সদস্যদের মোট জমা","Member contributions"),money(s.total_contributions))+
 card(t("সদস্যদের মোট বকেয়া","Total member due"),money(totalDue))+
 card(t("মোট ব্যয়","Total expenses"),money(s.total_expenses))+
 card(t("অন্যান্য আয় + বিনিয়োগ লাভ","Other income + investment profit"),money(Number(s.other_income||0)+Number(s.investment_profit||0)))+
 card(t("লেনদেন সংখ্যা","Transactions"),String(s.transaction_count||0),s.last_updated?t("সর্বশেষ আপডেট: ","Last updated: ")+new Date(s.last_updated).toLocaleString():"")
 +'</div>'+dashboardChartMarkup(s)+(access.role==="super_admin"?'<div class="form-actions"><a class="button" href="admin.html#financial-entry">✎ '+t("Hand Cash / Bank / Investment যোগ বা সংশোধন","Add or edit cash, bank and investment")+'</a></div>':"")+'<div class="notice">'+t("এই হিসাব Database-এর লেনদেন থেকে তৈরি। এখনো কোনো লেনদেন না থাকলে শূন্য দেখাবে; পুরোনো বা প্রাথমিক ব্যালেন্স Super Admin এন্ট্রি না করা পর্যন্ত এখানে যোগ হবে না।","Figures are calculated from database transactions. Zero means no ledger entries have been recorded; historical or opening balances must be entered by the Super Admin.")+'</div><section class="section"><div class="section-head"><h2>'+t("সাম্প্রতিক নোটিশ","Recent notices")+'</h2><span class="pill">'+t("লগইন করা সদস্যদের জন্য","For signed-in users")+'</span></div><div id="noticeList" class="list">'+empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))+'</div></section><section class="section"><h2>'+t("আপনার নোটিফিকেশন","Your notifications")+'</h2><div id="inboxList" class="list">'+empty(t("কোনো নোটিফিকেশন নেই।","No notifications."))+'</div></section><div class="notice">'+t("নোটিফিকেশনের বিস্তারিত দেখতে লগইন করো। Push alert শুধু সাধারণ বার্তা দেখাবে।","Sign in to view notification details. Push alerts display only a generic message.")+'</div><div class="form-actions"><button class="secondary" id="enablePush">এই ডিভাইসে Push চালু করুন</button></div>');
 document.getElementById("enablePush").addEventListener("click",async()=>{try{await enablePush(supabase,access.session.user.id);toast("এই ডিভাইসে Push চালু হয়েছে।")}catch(e){toast(e.message||"Push চালু করা যায়নি।")}});
 const [notices,inbox]=await Promise.all([
  supabase.from("notices").select("id,title,body,notice_type,meeting_at,published_at").eq("published",true).order("published_at",{ascending:false}).limit(8),
  supabase.from("notifications").select("id,title,body,notification_type,created_at,read_at").eq("user_id",access.session.user.id).order("created_at",{ascending:false}).limit(10)
 ]);
 if(!notices.error){document.getElementById("noticeList").innerHTML=notices.data.length?notices.data.map(n=>'<article class="list-item"><strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p><small>'+esc(n.notice_type==="meeting"&&n.meeting_at?new Date(n.meeting_at).toLocaleString():new Date(n.published_at).toLocaleString())+'</small></article>').join(""):empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))}
 if(!inbox.error){document.getElementById("inboxList").innerHTML=inbox.data.length?inbox.data.map(n=>'<article class="list-item"><div class="row"><strong>'+esc(n.title)+'</strong>'+(n.read_at?'<span class="pill">Read</span>':'<span class="pill">New</span>')+'</div><p>'+esc(n.body)+'</p><small>'+esc(new Date(n.created_at).toLocaleString())+'</small>'+(n.read_at?"":' <button class="secondary mark-read" data-id="'+esc(n.id)+'">পড়া হয়েছে</button>')+'</article>').join(""):empty(t("কোনো নোটিফিকেশন নেই।","No notifications."));document.querySelectorAll(".mark-read").forEach(b=>b.addEventListener("click",async()=>{const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",b.dataset.id);if(error)toast(error.message);else{renderDashboard();refreshUnreadCount()}}))}
}
function monthCount(start){
 if(!start)return 0;
 const a=new Date(start+"T00:00:00"),b=new Date();
 return Math.max(0,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1);
}
async function renderDue(){
 const [sharedResult,rateResult]=await Promise.all([
  supabase.rpc("get_member_shared_financial_data_v2"),
  access.role==="super_admin"
   ? supabase.from("members").select("id,member_no,full_name,monthly_contribution").eq("status","active").order("member_no")
   : Promise.resolve({data:null,error:null})
 ]);
 const {data:sharedRows,error}=sharedResult;
 if(error)throw error;
 if(rateResult.error)throw rateResult.error;
 const byMember=new Map();
 (sharedRows||[]).forEach(row=>{
  if(!byMember.has(row.member_id)){
   byMember.set(row.member_id,{
    member_no:row.member_no,full_name:row.full_name,
    received:Number(row.total_paid||0),due:Number(row.total_due||0),
    configured:Boolean(row.due_configured)
   });
  }
 });
 const rows=Array.from(byMember.values()).sort((a,b)=>String(a.member_no||"").localeCompare(String(b.member_no||"")));
 if(!rows.length){setPage("<h1>Personal Due</h1>"+empty("এখনো কোনো Active Member পাওয়া যায়নি।"));return}
 const sumPaid=rows.reduce((n,r)=>n+r.received,0);
 const sumDue=rows.reduce((n,r)=>n+(r.configured?r.due:0),0);
 const dueClass=v=>v>5000?"due-high":v>2000?"due-medium":"due-low";
 const deposits=rows.map(r=>"<tr><td>"+esc(r.member_no||"—")+"</td><td>"+esc(r.full_name)+"</td><td>"+money(r.received)+"</td></tr>").join("");
 const dues=rows.map(r=>"<tr><td>"+esc(r.member_no||"—")+"</td><td>"+esc(r.full_name)+"</td><td>"+(r.configured?'<span class=\"due-chip '+dueClass(r.due)+'\">'+money(r.due)+'</span>':'<span class=\"due-chip due-unconfigured\">Rate not set</span>')+"</td></tr>").join("");
 let rateEditor="";
 if(access.role==="super_admin"){
  const rateMembers=rateResult.data||[];
  const effectiveDefault="2027-01-01";
  const rateRows=(rateMembers||[]).map(m=>{const currentRate=Number(m.monthly_contribution||2000);return '<tr><td>'+esc(m.member_no||"—")+'</td><td>'+esc(m.full_name)+'</td><td>'+esc(m.monthly_contribution?money(m.monthly_contribution):"৳2,000 (default)")+'</td><td><input class="due-rate-input" data-rate-member="'+esc(m.id)+'" data-current="'+currentRate+'" type="number" min="1" step="1" inputmode="numeric" value="'+currentRate+'" aria-label="New monthly rate for '+esc(m.full_name)+'"></td></tr>'}).join("");
  rateEditor='<section class="section"><div class="section-head"><h2>মাসিক জমার হার সম্পাদনা</h2><span class="pill">Super Admin only</span></div><p class="muted small">প্রত্যেক সদস্যের মাসিক হার আলাদাভাবে দিন। একবার Save করলে সব পরিবর্তন একসঙ্গে সংরক্ষিত হবে।</p><div class="field due-effective-field"><label for="dueEffectiveFrom">কার্যকর হওয়ার তারিখ (মাসের ১ তারিখ)</label><input id="dueEffectiveFrom" type="date" value="'+effectiveDefault+'"></div><div class="table-wrap"><table class="due-rate-table"><thead><tr><th>Member ID</th><th>Name</th><th>Current rate</th><th>New monthly rate</th></tr></thead><tbody>'+rateRows+'</tbody></table></div><div class="form-actions"><button type="button" id="saveDueRates">Save Changes</button><span id="dueRateStatus" class="muted small"></span></div></section>';
 }
 setPage("<h1>"+t("সদস্যদের জমা ও বকেয়া","Member deposits and dues")+"</h1>"+rateEditor+"<p class=\"lead\">"+t("সব সক্রিয় সদস্যের জমা ও বকেয়া দেখা যাচ্ছে। সদস্যরা শুধু দেখতে পারবেন; সম্পাদনা শুধু Super Admin করতে পারবেন।","All active members’ deposits and dues. Members have view-only access; only the Super Admin can edit.")+"</p><p class=\"small muted\">"+t("আগাম জমা Total Deposit-এ সঙ্গে সঙ্গে যোগ হবে; তবে Due কমবে সেই Accounting Month এ পৌঁছালে।","Advance payments are included in Total Deposit immediately; they reduce Due only when their accounting month arrives.")+"</p><section class=\"section\"><h2>"+t("মোট জমা","Total deposits")+"</h2><div class=\"table-wrap\"><table><thead><tr><th>Member ID</th><th>Member Name</th><th>Total Deposit</th></tr></thead><tbody>"+deposits+"<tr class=\"total-row\"><td colspan=\"2\">TOTAL</td><td>"+money(sumPaid)+"</td></tr></tbody></table></div></section><section class=\"section\"><h2>"+t("মোট বকেয়া","Total due")+"</h2><div class=\"table-wrap\"><table><thead><tr><th>Member ID</th><th>Member Name</th><th>Total Due</th></tr></thead><tbody>"+dues+"<tr class=\"total-row\"><td colspan=\"2\">TOTAL</td><td>"+money(sumDue)+"</td></tr></tbody></table></div><p class=\"small muted\">"+t("সবুজ: ৳২,০০০ পর্যন্ত · হলুদ: ৳২,০০০-এর বেশি থেকে ৳৫,০০০ পর্যন্ত · লাল: ৳৫,০০০-এর বেশি","Green: up to ৳2,000 · Yellow: above ৳2,000 to ৳5,000 · Red: above ৳5,000")+"</p></section>"+'<div class="notice">'+t("সবার জন্য ডিফল্ট মাসিক জমা ৳২,০০০। Super Admin প্রয়োজন হলে সদস্যভেদে হার পরিবর্তন করতে পারবেন; Due স্বয়ংক্রিয়ভাবে আপডেট হবে।","The default monthly contribution is ৳2,000 for every active member. The Super Admin can change each member’s rate; Due updates automatically.")+"</div>");
 if(access.role==="super_admin"){
  document.getElementById("saveDueRates")?.addEventListener("click",async()=>{
   const dateInput=document.getElementById("dueEffectiveFrom");
   const effectiveFrom=dateInput.value;
   if(!effectiveFrom||new Date(effectiveFrom+"T00:00:00").getDate()!==1||effectiveFrom<"2027-01-01"||effectiveFrom>="2032-01-01"){toast("কার্যকর তারিখ ১ তারিখ হতে হবে এবং Jan 2027–Dec 2031-এর মধ্যে হতে হবে।",true);dateInput.focus();return}
   const inputs=Array.from(document.querySelectorAll(".due-rate-input"));
   const changes=inputs.filter(input=>input.value.trim()!==""&&Number(input.value)!==Number(input.dataset.current||0))
    .map(input=>({member_id:input.dataset.rateMember,amount:Number(input.value),effective_from:effectiveFrom}));
   if(changes.some(change=>!(change.amount>0)||!Number.isFinite(change.amount))){toast("প্রত্যেক মাসিক হার শূন্যের বেশি হতে হবে।",true);return}
   if(!changes.length){toast("কোনো পরিবর্তন করা হয়নি।");return}
   const button=document.getElementById("saveDueRates"),status=document.getElementById("dueRateStatus");
   button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
   try{
    const {data,error}=await supabase.rpc("save_member_contribution_rates",{p_changes:changes});
    if(error)throw error;
    status.textContent=String(data?.saved||changes.length)+"টি হার সংরক্ষিত হয়েছে।";
    toast("মাসিক জমার হার সংরক্ষণ সম্পন্ন।");
    await renderDue();
   }catch(error){console.error(error);status.textContent="সংরক্ষণ হয়নি।";toast("Save error: "+(error.message||"Unknown error"),true)}
   finally{const current=document.getElementById("saveDueRates");if(current)current.disabled=false}
  });
 }
}
async function renderMembers(){
 const [directoryResult,ownResult]=await Promise.all([
  supabase.from("member_directory").select("member_id,member_no,full_name,full_name_bn,profile_photo_path").order("member_no"),
  access.role==="member"
   ? supabase.from("members").select("id").eq("auth_user_id",access.session.user.id).maybeSingle()
   : Promise.resolve({data:null,error:null})
 ]);
 const {data,error}=directoryResult;if(error)throw error;
 if(!data.length){setPage('<h1>Member Info</h1>'+empty(t("এখনো কোনো Active member নেই।","No active members yet.")));return}
 if(ownResult.error)throw ownResult.error;const ownId=ownResult.data?.id||null;
 const photoPaths=[...new Set(data.map(member=>member.profile_photo_path).filter(Boolean))];
 const photoUrlByPath=new Map();
 let photoCache={};
 try{photoCache=JSON.parse(sessionStorage.getItem("ffv:member-photo-cache")||"{}")}catch{}
 const missingPaths=[];
 for(const path of photoPaths){
  const cached=photoCache[path];
  if(cached?.url&&Number(cached.expiresAt)>Date.now()+5*60*1000)photoUrlByPath.set(path,cached.url);
  else missingPaths.push(path);
 }
 if(missingPaths.length){
  try{
   const {data:signed,error:signedError}=await supabase.storage.from("member-profile-photos").createSignedUrls(missingPaths,86400);
   if(signedError)throw signedError;
   (signed||[]).forEach((item,index)=>{
    const path=item.path||missingPaths[index];
    if(item.signedUrl){photoUrlByPath.set(path,item.signedUrl);photoCache[path]={url:item.signedUrl,expiresAt:Date.now()+23*60*60*1000}}
   });
   try{sessionStorage.setItem("ffv:member-photo-cache",JSON.stringify(photoCache))}catch{}
  }catch(batchError){
   console.warn("Batch profile photo URLs unavailable; using individual fallback",batchError);
   const fallback=await Promise.all(missingPaths.map(async path=>{
    const {data:signed}=await supabase.storage.from("member-profile-photos").createSignedUrl(path,86400);
    return {path,url:signed?.signedUrl||null};
   }));
   fallback.forEach(item=>{if(item.url){photoUrlByPath.set(item.path,item.url);photoCache[item.path]={url:item.url,expiresAt:Date.now()+23*60*60*1000}}});
   try{sessionStorage.setItem("ffv:member-photo-cache",JSON.stringify(photoCache))}catch{}
  }
 }
 const cards=data.map(m=>{
  const photoUrl=photoUrlByPath.get(m.profile_photo_path);
  const label=lang==="bn"?(m.full_name_bn||m.full_name):m.full_name;
  const canOpen=access.role==="super_admin"||m.member_id===ownId;
  const photo=photoUrl?'<img class="member-directory-avatar" loading="lazy" decoding="async" src="'+esc(photoUrl)+'" alt="'+esc(m.full_name||"Member")+'">':"";
  const inside=(photo||'<span class="member-directory-avatar member-directory-fallback">'+esc(String(label||"M").trim().slice(0,1).toUpperCase())+'</span>')+'<strong class="member-directory-name">'+esc(label)+'</strong>';
  return canOpen?'<div class="member-directory-person-wrap"><a class="member-directory-person" href="member-profile.html?id='+encodeURIComponent(m.member_id)+'" aria-label="'+esc("Open profile: "+label)+'">'+inside+'</a>'+(access.role==="super_admin"?'<a class="member-directory-edit" href="member-profile.html?id='+encodeURIComponent(m.member_id)+'&edit=1">✎ Edit Profile</a>':"")+'</div>':'<div class="member-directory-person">'+inside+'</div>';
 });
 setPage('<h1>'+t("সদস্য পরিচিতি","Member directory")+'</h1><p class="lead">'+t("সদস্যদের ছবি ও নাম। নিজের ছবি বা নাম চাপলে ব্যক্তিগত প্রোফাইল খুলবে। Super Admin যেকোনো সদস্যের প্রোফাইল খুলতে পারবেন।","Members are shown by photo and name. Members can open their own profile; Super Admin can open any profile.")+'</p><div class="member-directory-grid">'+cards.join("")+'</div>');
}
async function renderProofs(){
 let proofQuery=supabase.from("committee_proofs").select("id,proof_month,title,storage_path,note,published,created_at").order("proof_month",{ascending:true});
 if(access.role!=="super_admin")proofQuery=proofQuery.eq("published",true);
 const {data,error}=await proofQuery;if(error)throw error;
 const counts={};(data||[]).forEach(p=>{const k=p.proof_month.slice(0,7);counts[k]=(counts[k]||0)+1});
 const months=[];for(let i=0;i<60;i++){const d=new Date(2027,i,1);months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))}
 const cards=months.map(k=>'<button type="button" class="proof-month-card" data-proof-month="'+k+'"><strong>'+esc(monthText(k))+'</strong><span>'+String(counts[k]||0)+' files</span></button>').join("");
 setPage('<h1>'+t("মাসিক জমা ও বিনিয়োগের প্রমাণ","Monthly deposit and investment proofs")+'</h1><p class="lead">জানুয়ারি ২০২৭ থেকে ডিসেম্বর ২০৩১ · প্রতি মাসে একটি বা একাধিক রসিদ। শুধু নির্বাচিত মাসের ফাইল লোড হবে।</p><div class="proof-month-grid">'+cards+'</div><section class="section" id="proofMonthDetail">'+empty("ফাইল দেখতে অথবা আপলোড করতে একটি মাস নির্বাচন করুন।")+'</section>');
 document.querySelectorAll("[data-proof-month]").forEach(button=>button.addEventListener("click",()=>loadProofMonth(button.dataset.proofMonth,data)));
}
async function loadProofMonth(month,allProofs){
 const root=document.getElementById("proofMonthDetail");if(!root)return;
 const rows=(allProofs||[]).filter(p=>p.proof_month.slice(0,7)===month);
 const metaEditor=access.role==="super_admin"&&rows.length
  ?'<form id="proofMetaForm" class="section"><h3>এই মাসের Proof তথ্য সম্পাদনা</h3><p class="muted small">Title, note, month এবং প্রকাশের অবস্থা একবারে Save হবে।</p>'+rows.map(p=>'<div class="proof-meta-row" data-proof-meta-row><input type="hidden" name="id" value="'+esc(p.id)+'"><div class="field"><label>Title</label><input name="title" maxlength="180" required value="'+esc(p.title)+'"></div><div class="field"><label>Proof month</label><input name="proof_month" type="date" value="'+esc(p.proof_month)+'" required></div><div class="field"><label>Note</label><textarea name="note" rows="2" maxlength="500">'+esc(p.note||"")+'</textarea></div><label class="inline-check"><input name="published" type="checkbox" '+(p.published?"checked":"")+'> Published</label></div>').join("")+'<div class="form-actions"><button type="submit" id="saveProofMeta">Save Changes</button><span id="proofMetaStatus" class="muted small"></span></div></form>'
  :"";
 const uploadForm=access.role==="super_admin"
  ?'<form id="proofUploadForm" class="section"><input type="hidden" name="month" value="'+month+'"><h3>Upload new proof</h3><div class="field"><label>ছবি অথবা PDF — এক বা একাধিক ফাইল</label><label class="dropzone" id="proofDropzone">ফাইল এখানে Drop করুন অথবা Browse Files<input id="proofFilesInput" type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></label><small class="muted">Original ছবি সর্বোচ্চ 12MB; scan/compress হওয়ার পর 5MB-এর মধ্যে upload হবে। PDF সর্বোচ্চ 10MB। JPG, PNG, WEBP অথবা PDF।</small></div><div class="field"><label>Document Scanner</label><div class="scanner-controls"><select id="proofScanMode" aria-label="Scan output mode"><option value="bw">Black &amp; White · Recommended</option><option value="color">Keep original colour</option></select><select id="proofScanRotation" aria-label="Rotate document"><option value="0">Rotation: 0° (default)</option><option value="90">Rotate 90° clockwise</option><option value="180">Rotate 180°</option><option value="270">Rotate 90° counter-clockwise</option></select><button type="button" class="secondary" id="prepareProofScans">Scan &amp; Enhance Images</button><span id="proofScanStatus" class="muted small"></span></div><div id="proofScanPreview" class="scanner-preview" aria-live="polite"></div><small class="muted">Upload করলে ছবি স্বয়ংক্রিয়ভাবে scan ও optimize হবে; PDF অপরিবর্তিত থাকবে। Preview ও Manual Crop / Rotate চাইলে আগে Scan & Enhance Images চাপুন।</small></div><div class="field"><label>সাধারণ নোট (ঐচ্ছিক)</label><input name="note" maxlength="500"></div><div class="form-actions"><button type="submit" id="proofUploadButton">Upload selected files</button><span id="proofUploadStatus" class="muted small"></span></div></form>'
  :"";
 root.innerHTML='<h2>'+esc(monthText(month))+'</h2><div class="muted small">'+rows.length+' file(s)</div><div id="proofFiles" class="list">'+empty("ফাইল লোড হচ্ছে…")+'</div>'+metaEditor+uploadForm;
 const fileBox=document.getElementById("proofFiles");
 if(rows.length){
  const rendered=await Promise.all(rows.map(async proof=>{
   const {data:u,error:urlError}=await supabase.storage.from("committee-proofs").createSignedUrl(proof.storage_path,1800);
   if(urlError||!u?.signedUrl)return '<article class="list-item"><strong>'+esc(proof.title)+'</strong><span class="pill">File unavailable</span></article>';
   return '<article class="list-item"><div class="row"><strong>'+esc(proof.title)+'</strong><span class="pill">'+(proof.published?"Published":"Hidden")+'</span></div><p>'+esc(proof.note||"")+'</p><a class="button secondary" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">Open proof</a></article>';
  }));
  fileBox.innerHTML=rendered.join("");
 }else fileBox.innerHTML=empty("এই মাসে এখনো কোনো রসিদ আপলোড করা হয়নি।");
 if(access.role==="super_admin"){
  const metaForm=document.getElementById("proofMetaForm");
  metaForm?.addEventListener("submit",async event=>{
   event.preventDefault();
   const changes=[...metaForm.querySelectorAll("[data-proof-meta-row]")].map(row=>({
    id:row.querySelector('[name="id"]').value,
    title:row.querySelector('[name="title"]').value.trim(),
    proof_month:row.querySelector('[name="proof_month"]').value,
    note:row.querySelector('[name="note"]').value.trim(),
    published:row.querySelector('[name="published"]').checked
   }));
   if(changes.some(item=>!item.title||!item.proof_month||!/^\d{4}-\d{2}-01$/.test(item.proof_month))){toast("Title দিতে হবে এবং Proof month মাসের ১ তারিখ হতে হবে।",true);return}
   const button=document.getElementById("saveProofMeta"),status=document.getElementById("proofMetaStatus");
   button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
   const {data,error}=await supabase.rpc("save_committee_proof_metadata",{p_changes:changes});
   if(error){status.textContent="Save হয়নি।";toast(error.message,true);button.disabled=false;return}
   status.textContent=(data?.saved||changes.length)+"টি Proof record Save হয়েছে।";
   toast("Proof তথ্য সংরক্ষণ সম্পন্ন।");await renderProofs();[...document.querySelectorAll("[data-proof-month]")].find(button=>button.dataset.proofMonth===month)?.click();
  });
  const form=document.getElementById("proofUploadForm"),input=document.getElementById("proofFilesInput"),drop=document.getElementById("proofDropzone");
  let preparedFiles=null;
  const scanButton=document.getElementById("prepareProofScans");
  const scanStatus=document.getElementById("proofScanStatus");
  const scanPreview=document.getElementById("proofScanPreview");
  const scanPreviewUrls=[];
  const clearScanPreview=()=>{scanPreviewUrls.forEach(url=>URL.revokeObjectURL(url));scanPreviewUrls.length=0;scanPreview.replaceChildren()};
  const ensureCropper=async()=>{
   if(window.Cropper)return window.Cropper;
   if(!window.__ffvCropperPromise){
    window.__ffvCropperPromise=new Promise((resolve,reject)=>{
     if(!document.querySelector('link[data-ffv-cropper]')){const css=document.createElement("link");css.rel="stylesheet";css.href="https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css";css.dataset.ffvCropper="1";document.head.append(css)}
     const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js";script.async=true;script.onload=()=>window.Cropper?resolve(window.Cropper):reject(new Error("Crop tool did not initialize"));script.onerror=()=>reject(new Error("Crop tool could not load"));document.head.append(script);
    }).catch(error=>{window.__ffvCropperPromise=null;throw error});
   }
   return window.__ffvCropperPromise;
  };
  input.addEventListener("change",()=>{preparedFiles=null;clearScanPreview();scanStatus.textContent="";drop.dataset.selected=input.files.length?input.files.length+" file(s) selected":""});
  scanButton.addEventListener("click",async()=>{
   const originals=Array.from(input.files||[]);
   const tooLarge=originals.find(file=>file.type==="application/pdf"?file.size>10*1024*1024:file.size>12*1024*1024);
   if(tooLarge){toast("ফাইলের সাইজ সীমা অতিক্রম করেছে: "+tooLarge.name,true);return}
   const images=originals.filter(file=>file.type.startsWith("image/"));
   if(!originals.length){toast("আগে image অথবা PDF নির্বাচন করুন।");return}
   if(!images.length){scanStatus.textContent="নির্বাচিত ফাইলগুলো PDF; PDF অপরিবর্তিত upload হবে।";preparedFiles=originals;return}
   scanButton.disabled=true;scanStatus.textContent="Scanner engine load হচ্ছে…";clearScanPreview();preparedFiles=null;
   try{
    const {scanDocumentImage}=await import("./document-scanner.js");
    const scanned=new Map();
    const scanMode=document.getElementById("proofScanMode").value;
    const scanRotation=Number(document.getElementById("proofScanRotation").value);
    for(let index=0;index<originals.length;index++){
     const file=originals[index];
     if(!file.type.startsWith("image/"))continue;
     scanStatus.textContent="Scanning "+(scanned.size+1)+" / "+images.length+" · "+file.name;
     const result=await scanDocumentImage(file,scanMode,scanRotation);
     scanned.set(file,result.file);
     const card=document.createElement("article");card.className="scanner-preview-card";
     const image=document.createElement("img");image.loading="lazy";image.alt="Enhanced document preview";image.src=URL.createObjectURL(result.file);image.dataset.scanMode=scanMode;scanPreviewUrls.push(image.src);
     const details=document.createElement("div");
     const ratio=file.size?Math.round((1-result.outputSize/file.size)*100):0;
     const edgeText=result.cornersDetected?"Edges detected · perspective corrected":"Page edges not detected · image enhanced without perspective correction";
     details.textContent=edgeText+" · "+(result.outputSize/1024).toFixed(0)+" KB"+(ratio>0?" · "+ratio+"% smaller":"");
     const cropButton=document.createElement("button");cropButton.type="button";cropButton.className="button secondary scanner-crop-button";cropButton.textContent="Manual Crop / Rotate";
     cropButton.addEventListener("click",async()=>{
      if(cropButton.disabled)return;
      cropButton.disabled=true;
      let cropper=null,workspace=null;
      try{
       const CropperClass=await ensureCropper();
       workspace=document.createElement("div");workspace.className="scanner-crop-workspace";
       card.insertBefore(workspace,image);workspace.append(image);
       const controls=document.createElement("div");controls.className="scanner-crop-controls";
       const left=document.createElement("button"),right=document.createElement("button"),apply=document.createElement("button"),cancel=document.createElement("button");
       left.type=right.type=apply.type=cancel.type="button";left.textContent="↶ Rotate";right.textContent="Rotate ↷";apply.textContent="Apply Crop";cancel.textContent="Cancel";
       left.addEventListener("click",()=>cropper?.rotate(-90));right.addEventListener("click",()=>cropper?.rotate(90));
       controls.append(left,right,apply,cancel);workspace.append(controls);
       cropper=new CropperClass(image,{viewMode:1,dragMode:"crop",autoCropArea:.96,responsive:true,background:false,movable:true,zoomable:true,rotatable:true,scalable:false,guides:true,center:true,highlight:true,restore:false});
       cancel.addEventListener("click",()=>{cropper?.destroy();cropper=null;card.insertBefore(image,details);workspace.remove();cropButton.disabled=false});
       apply.addEventListener("click",async()=>{
        apply.disabled=true;apply.textContent="Processing…";
        try{
         const canvas=cropper.getCroppedCanvas({maxWidth:2800,maxHeight:2800,imageSmoothingEnabled:true,imageSmoothingQuality:"high"});
         if(!canvas)throw new Error("Crop output is empty");
         const toBlob=(type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not encode cropped image")),type,quality));
         const isBw=image.dataset.scanMode==="bw";
         let blob=await toBlob(isBw?"image/png":"image/webp",isBw?undefined:.93);
         const targetBytes=Math.min(file.size,1*1024*1024);
         if(blob.size>targetBytes){
          let highQuality=blob,smallest=blob;
          for(const quality of [.93,.9,.86,.82,.78,.74,.7,.66]){
           const candidate=await toBlob("image/webp",quality);smallest=candidate;
           if(candidate.size<=targetBytes){blob=candidate;break}
          }
          if(blob.size>targetBytes)blob=highQuality.size<=5*1024*1024?highQuality:smallest;
         }
         if(blob.size>5*1024*1024)throw new Error("Cropped image is still over 5MB");
         const ext=blob.type==="image/png"?"png":"webp";
         const updated=new File([blob],file.name.replace(/\.[^.]+$/,"")+"_scan."+ext,{type:blob.type,lastModified:Date.now()});
         cropper.destroy();cropper=null;
         const oldUrl=image.src;const nextUrl=URL.createObjectURL(updated);scanPreviewUrls.push(nextUrl);image.src=nextUrl;
         if(oldUrl.startsWith("blob:"))URL.revokeObjectURL(oldUrl);
         scanned.set(file,updated);preparedFiles=originals.map(original=>scanned.get(original)||original);
         const savedRatio=file.size?Math.round((1-updated.size/file.size)*100):0;
         details.textContent=edgeText+" · Manual crop applied · "+(updated.size/1024).toFixed(0)+" KB"+(savedRatio>0?" · "+savedRatio+"% smaller":"");
         card.insertBefore(image,details);workspace.remove();cropButton.disabled=false;cropButton.textContent="Adjust Crop / Rotate";
        }catch(error){console.error("Crop apply failed",error);apply.disabled=false;apply.textContent="Apply Crop";toast("Crop save হয়নি: "+(error.message||"Unknown error"),true)}
       });
      }catch(error){
       console.error("Manual crop failed",error);if(cropper)cropper.destroy();if(workspace){card.insertBefore(image,details);workspace.remove()}cropButton.disabled=false;toast("Manual crop চালু হয়নি: "+(error.message||"Unknown error"),true);
      }
     });
     card.append(image,details,cropButton);scanPreview.append(card);
    }
    preparedFiles=originals.map(file=>scanned.get(file)||file);
    scanStatus.textContent="Preview ready · "+scanned.size+" image(s) processed. Upload করলে এই enhanced files সংরক্ষিত হবে।";
   }catch(error){
    console.error("Document scanner failed",error);preparedFiles=null;clearScanPreview();scanStatus.textContent="Scan করা যায়নি: "+(error.message||"Unknown error");toast("Scanner কাজ করেনি। Original files এখনো অপরিবর্তিত আছে।",true);
   }finally{scanButton.disabled=false}
  });
  drop.addEventListener("dragover",event=>{event.preventDefault();drop.classList.add("dragover")});
  drop.addEventListener("dragleave",()=>drop.classList.remove("dragover"));
  drop.addEventListener("drop",event=>{event.preventDefault();drop.classList.remove("dragover");if(event.dataTransfer?.files?.length){input.files=event.dataTransfer.files;drop.dataset.selected=event.dataTransfer.files.length+" file(s) selected";input.dispatchEvent(new Event("change",{bubbles:true}))}});
  input.addEventListener("change",()=>{drop.dataset.selected=input.files.length?input.files.length+" file(s) selected":""});
  form.addEventListener("submit",async event=>{
   event.preventDefault();const files=Array.from(input.files||[]);
   if(!files.length){toast("কমপক্ষে একটি ফাইল নির্বাচন করুন।");return}
   const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
   const invalidOriginal=files.find(file=>!allowed.includes(file.type)||(file.type==="application/pdf"?file.size>10*1024*1024:file.size>12*1024*1024));
   if(invalidOriginal){toast("ফাইলের ধরন বা সাইজ গ্রহণযোগ্য নয়: "+invalidOriginal.name,true);return}
   const button=document.getElementById("proofUploadButton"),status=document.getElementById("proofUploadStatus");
   button.disabled=true;
   let uploadFiles=preparedFiles||files;
   if(!preparedFiles&&files.some(file=>file.type.startsWith("image/"))){
    status.textContent="ছবি স্বয়ংক্রিয়ভাবে scan ও optimize হচ্ছে…";
    try{
     const {scanDocumentImage}=await import("./document-scanner.js");
     const scanMode=document.getElementById("proofScanMode").value;
     const scanRotation=Number(document.getElementById("proofScanRotation").value);
     uploadFiles=await Promise.all(files.map(async file=>{
      if(!file.type.startsWith("image/"))return file;
      try{return (await scanDocumentImage(file,scanMode,scanRotation)).file}
      catch(scanError){console.warn("Automatic document scan failed; using compression",scanError);return await optimizeImageFile(file,"document").catch(()=>file)}
     }));
    }catch(scannerError){
     console.warn("Automatic scanner unavailable; compressing images only",scannerError);
     uploadFiles=await Promise.all(files.map(file=>file.type.startsWith("image/")?optimizeImageFile(file,"document").catch(()=>file):file));
     scanStatus.textContent="Scanner পাওয়া যায়নি; ছবি compress করে upload হবে।";
    }
   }
   const invalidProcessed=uploadFiles.find(file=>!allowed.includes(file.type)||(file.type==="application/pdf"?file.size>10*1024*1024:file.size>5*1024*1024));
   if(invalidProcessed){button.disabled=false;toast("প্রসেস করা ফাইলের ধরন বা সাইজ গ্রহণযোগ্য নয়: "+invalidProcessed.name,true);return}
   let success=0;
   for(const file of uploadFiles){
    status.textContent=(success+1)+" / "+uploadFiles.length+" uploading…";
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80),path=month+"/"+crypto.randomUUID()+"-"+safeName;
    const {error:upError}=await supabase.storage.from("committee-proofs").upload(path,file,{upsert:false,contentType:file.type});
    if(upError){toast(file.name+": "+upError.message,true);continue}
    const {error:rowError}=await supabase.from("committee_proofs").insert({proof_month:month+"-01",title:file.name,note:String(new FormData(form).get("note")||"").trim()||null,storage_path:path,published:true,uploaded_by:access.session.user.id});
    if(rowError){await supabase.storage.from("committee-proofs").remove([path]);toast(file.name+": "+rowError.message,true);continue}
    success++;
   }
   status.textContent=success+" / "+uploadFiles.length+" uploaded";
   preparedFiles=null;clearScanPreview();
   toast(success+"টি ফাইল আপলোড হয়েছে।");await renderProofs();[...document.querySelectorAll("[data-proof-month]")].find(button=>button.dataset.proofMonth===month)?.click();
  });
 }
}async function renderPayment(){
 const isSuper=access.role==="super_admin";
 let methodQuery=supabase.from("payment_methods").select("id,method,account_name,account_number,qr_path,active").order("method");
 if(!isSuper)methodQuery=methodQuery.eq("active",true);
 const mr=await methodQuery;
 if(mr.error)throw mr.error;
 const methods=mr.data||[];
 const activeMethods=methods.filter(m=>m.active);
 const cards=await Promise.all(activeMethods.map(async m=>{
  const {data:u}=m.qr_path?await supabase.storage.from("payment-qr").createSignedUrl(m.qr_path,1800):{data:null};
  return '<article class="payment-method-card"><div class="row"><strong>'+esc(m.method.toUpperCase())+'</strong><span class="pill">Active</span></div><p>'+esc(m.account_name||"")+'</p><p class="payment-number">'+esc(m.account_number||"নম্বর সেট করা হয়নি")+'</p>'+(u?.signedUrl?'<img class="payment-qr" loading="lazy" src="'+esc(u.signedUrl)+'" alt="Payment QR">':"")+'</article>';
 }));
 const base='<h1>Payment</h1><p class="lead">bKash অথবা Nagad-এ টাকা পাঠানোর পর Transaction ID জমা দিন। Super Admin যাচাই করে অনুমোদন করবেন।</p><div class="payment-method-grid">'+(cards.join("")||empty("Super Admin এখনো bKash/Nagad নম্বর সেট করেননি।"))+'</div>';
 if(isSuper){
  const settings=["bkash","nagad"].map(method=>{
   const existing=methods.find(m=>m.method===method);
   return '<fieldset class="payment-method-form card" data-method="'+method+'"><legend>'+method.toUpperCase()+'</legend><div class="field"><label>Account name</label><input name="'+method+'_account_name" value="'+esc(existing?.account_name||"")+'" required></div><div class="field"><label>Account number</label><input name="'+method+'_account_number" value="'+esc(existing?.account_number||"")+'" required inputmode="tel"></div><div class="field"><label>QR image (optional)</label><input name="'+method+'_qr" type="file" accept="image/jpeg,image/png,image/webp"></div><label class="inline-check"><input name="'+method+'_active" type="checkbox" '+(existing?.active===false?"":"checked")+'> Active</label><label class="inline-check"><input name="'+method+'_remove_qr" type="checkbox"> Remove current QR</label></fieldset>';
  }).join("");
  setPage(base+'<section class="section"><h2>Payment account settings</h2><p class="muted">bKash ও Nagad—দুটির পরিবর্তন একবারে Save হবে। শুধু Super Admin সম্পাদনা করতে পারবেন।</p><form id="paymentSettingsForm"><div class="form-grid">'+settings+'</div><div class="form-actions"><button type="submit" id="savePaymentSettings">Save Changes</button><span id="paymentSettingsStatus" class="muted small"></span></div></form></section><section class="section"><h2>Pending payment submissions</h2><div id="pendingPayments" class="list">'+empty("লোড হচ্ছে…")+'</div></section>');
  document.getElementById("paymentSettingsForm").addEventListener("submit",async event=>{
   event.preventDefault();
   const form=event.currentTarget,fd=new FormData(form),updates=[],uploads=[];
   for(const method of ["bkash","nagad"]){
    const existing=methods.find(m=>m.method===method);
    const name=String(fd.get(method+"_account_name")||"").trim();
    const number=String(fd.get(method+"_account_number")||"").trim();
    const active=fd.get(method+"_active")==="on";
    const file=fd.get(method+"_qr");
    const removeQr=fd.get(method+"_remove_qr")==="on";
    if(active&&(!name||!number)){toast(method.toUpperCase()+" Active রাখতে Account name ও number দিতে হবে।",true);return}
    if(file?.size&& (file.size>2*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))){toast(method.toUpperCase()+" QR image 2MB-এর মধ্যে JPG/PNG/WEBP হতে হবে।",true);return}
    updates.push({method,account_name:name||existing?.account_name||"",account_number:number||existing?.account_number||"",qr_path:removeQr?null:(existing?.qr_path||null),active,updated_by:access.session.user.id});
    if(file?.size)uploads.push({method,file,oldPath:existing?.qr_path||null});
   }
   const button=document.getElementById("savePaymentSettings"),status=document.getElementById("paymentSettingsStatus");
   button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
   const newPaths=[];
   let paymentSaved=false;
   try{
    for(const item of uploads){
     const uploadFile=await optimizeImageFile(item.file,"qr").catch(()=>item.file);
     const ext=uploadFile.type==="image/png"?"png":uploadFile.type==="image/jpeg"?"jpg":"webp";
     const path=item.method+"/"+crypto.randomUUID()+"."+ext;
     const {error}=await supabase.storage.from("payment-qr").upload(path,uploadFile,{upsert:false,contentType:uploadFile.type});
     if(error)throw error;
     item.newPath=path;newPaths.push(path);
     const row=updates.find(x=>x.method===item.method);row.qr_path=path;
    }
    const {error:saveError}=await supabase.from("payment_methods").upsert(updates,{onConflict:"method"});
    if(saveError)throw saveError;
    paymentSaved=true;
    for(const method of ["bkash","nagad"]){
     const existing=methods.find(m=>m.method===method),updated=updates.find(m=>m.method===method);
     if(existing?.qr_path&&existing.qr_path!==updated.qr_path){
      try{await supabase.storage.from("payment-qr").remove([existing.qr_path])}catch(cleanupError){console.warn("Old QR cleanup failed",cleanupError)}
     }
    }
    status.textContent="দুটি Payment method-এর পরিবর্তন Save হয়েছে।";
    toast("Payment settings সংরক্ষণ সম্পন্ন।");
    await renderPayment();
   }catch(error){
    if(!paymentSaved){
     for(const path of newPaths){try{await supabase.storage.from("payment-qr").remove([path])}catch(cleanupError){console.warn("Temporary QR cleanup failed",cleanupError)}}
     status.textContent="Save হয়নি।";
     toast("Payment settings save error: "+(error.message||"Unknown error"),true);
    }else{
     status.textContent="Database-এ Save হয়েছে; refresh-এ সমস্যা হয়েছে।";
     toast("Payment settings Save হয়েছে, তবে page refresh করতে সমস্যা হয়েছে।",true);
    }
    button.disabled=false;
   }
  });
  const pending=await supabase.from("payment_submissions").select("id,member_id,submitted_by,amount,payment_date,payment_method,reference_no,created_at,members(full_name,member_no)").eq("status","pending").order("created_at");
  const box=document.getElementById("pendingPayments");
  if(pending.error)box.textContent=pending.error.message;
  else if(!pending.data.length)box.innerHTML=empty("কোনো Pending payment নেই।");
  else box.innerHTML=pending.data.map(p=>'<article class="list-item"><strong>'+esc(p.members?.member_no||"")+' · '+esc(p.members?.full_name||"Member")+'</strong><p>'+money(p.amount)+' · '+esc(p.payment_method||"")+' · '+esc(p.payment_date)+'</p><p>Transaction ID: <strong>'+esc(p.reference_no)+'</strong></p><div class="field"><label>Ledger account</label><select data-payment-account="'+esc(p.id)+'"><option value="cash">Cash</option><option value="bank">Bank</option></select></div><div class="row"><button data-payment-approve="'+esc(p.id)+'">Approve & add to ledger</button><button class="danger" data-payment-reject="'+esc(p.id)+'">Reject</button></div></article>').join("");
  box.querySelectorAll("[data-payment-approve],[data-payment-reject]").forEach(button=>button.addEventListener("click",async()=>{
   const approved=button.hasAttribute("data-payment-approve"),id=approved?button.dataset.paymentApprove:button.dataset.paymentReject,note=prompt("Admin note (optional):")||null,account=document.querySelector('[data-payment-account="'+id+'"]')?.value||"cash";
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
 setPage(base+'<section class="section"><h2>Payment submission</h2><form id="paymentSubmitForm" class="form-grid"><div class="field"><label>Amount (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>Payment method</label><select name="method" required>'+activeMethods.map(m=>'<option value="'+esc(m.method)+'">'+esc(m.method.toUpperCase())+'</option>').join("")+'</select></div><div class="field"><label>Payment date</label><input name="date" type="date" max="'+today()+'" value="'+today()+'" required></div><div class="field"><label>Transaction ID</label><input name="reference" maxlength="100" required></div><div class="form-actions"><button type="submit">Submit for verification</button></div></form></section><section class="section"><h2>Your payment history</h2><div class="list">'+(history.data.map(p=>'<article class="list-item"><div class="row"><strong>'+money(p.amount)+'</strong><span class="pill">'+esc(p.status)+'</span></div><p>'+esc(p.payment_method||"")+' · '+esc(p.payment_date)+' · '+esc(p.reference_no)+'</p><small>'+esc(p.admin_note||"")+'</small></article>').join("")||empty("কোনো Payment submission নেই।"))+'</div></section>');
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
 const [requests,docs,profilePhoto,nomineePhoto]=await Promise.all([
  supabase.from("profile_change_requests").select("id,status,created_at,admin_note").eq("submitted_by",access.session.user.id).order("created_at",{ascending:false}).limit(10),
  supabase.from("member_private_documents").select("id,document_type,status,storage_path,admin_note,uploaded_at").eq("member_id",m.id).order("uploaded_at",{ascending:false}).limit(20),
  m.profile_photo_path?supabase.storage.from("member-profile-photos").createSignedUrl(m.profile_photo_path,900):Promise.resolve({data:null}),
  m.nominee_photo_path?supabase.storage.from("member-private-documents").createSignedUrl(m.nominee_photo_path,900):Promise.resolve({data:null})
 ]);
 if(requests.error)throw requests.error;if(docs.error)throw docs.error;
 const docLabel=type=>({member_nid:"নিজের NID",nominee_nid:"Nominee NID",nominee_photo:"Nominee Picture"}[type]||"Private document");
 const docRows=await Promise.all((docs.data||[]).map(async d=>{
  const {data:u}=await supabase.storage.from("member-private-documents").createSignedUrl(d.storage_path,900);
  const preview=d.document_type==="nominee_photo"&&u?.signedUrl?'<img class="private-doc-thumb" src="'+esc(u.signedUrl)+'" alt="Nominee photo">':"";
  return '<article class="list-item"><div class="row"><strong>'+esc(docLabel(d.document_type))+'</strong><span class="pill">'+esc(d.status)+'</span></div><small>'+esc(new Date(d.uploaded_at).toLocaleString())+'</small>'+preview+'<p>'+esc(d.admin_note||"")+'</p>'+(u?.signedUrl?'<a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">ফাইল দেখুন</a>':"")+'</article>';
 }));
 const photoPreview=profilePhoto.data?.signedUrl?'<img class="profile-upload-preview" src="'+esc(profilePhoto.data.signedUrl)+'" alt="Current approved profile photo">':'<div class="profile-upload-placeholder">ছবি নেই</div>';
 const nomineePreview=nomineePhoto.data?.signedUrl?'<img class="profile-upload-preview nominee-preview" src="'+esc(nomineePhoto.data.signedUrl)+'" alt="Current approved nominee photo">':'<div class="profile-upload-placeholder">ছবি নেই</div>';
 setPage('<h1>My Profile</h1><p class="lead">আপনার তথ্য ও ছবি পরিবর্তনের অনুরোধ Super Admin অনুমোদন না করা পর্যন্ত মূল Profile-এ কার্যকর হবে না। NID ও Nominee-এর ফাইল শুধু আপনি এবং Super Admin দেখতে পারবেন।</p><div class="grid">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"৳2,000 (default)")+'</div><form id="profileRequest"><section class="section"><h2>ব্যক্তিগত তথ্য</h2><div class="form-grid">'+inputs+'</div></section><section class="section"><h2>Profile Picture</h2><div class="upload-card"><div class="upload-preview-wrap">'+photoPreview+'</div><div class="field"><label>নিজের Profile Picture · JPG, PNG বা WEBP · সর্বোচ্চ 5MB</label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><small class="muted">Personal Profile-এ ছবি Rectangular দেখাবে। নতুন ছবি Approve না হওয়া পর্যন্ত পুরোনো ছবিই থাকবে।</small></div></div></section><section class="section"><h2>পরিচয়পত্র ও Nominee-এর ছবি</h2><div class="upload-grid"><div class="upload-card"><strong>নিজের NID</strong><label class="dropzone">NID ছবি/PDF নির্বাচন করুন<input type="file" name="member_nid" accept="image/jpeg,image/png,image/webp,application/pdf"></label><small class="muted">JPG, PNG, WEBP বা PDF · সর্বোচ্চ 10MB</small></div><div class="upload-card"><strong>Nominee NID</strong><label class="dropzone">Nominee NID ছবি/PDF নির্বাচন করুন<input type="file" name="nominee_nid" accept="image/jpeg,image/png,image/webp,application/pdf"></label><small class="muted">JPG, PNG, WEBP বা PDF · সর্বোচ্চ 10MB</small></div><div class="upload-card"><strong>Nominee Picture</strong><div class="upload-preview-wrap">'+nomineePreview+'</div><label class="dropzone">Nominee-এর ছবি নির্বাচন করুন<input type="file" name="nominee_photo" accept="image/jpeg,image/png,image/webp"></label><small class="muted">JPG, PNG বা WEBP · সর্বোচ্চ 5MB</small></div></div></section><div class="notice">সব নতুন ফাইল প্রথমে Pending Approval থাকবে। অনুমোদনের আগে অন্য সদস্য বা আপনার সক্রিয় Profile-এ নতুন ফাইল দেখানো হবে না। NID এবং Nominee NID অন্য কোনো সদস্য দেখতে পারবেন না।</div><div class="form-actions"><button type="submit" id="profileSubmit">পরিবর্তন ও ফাইল জমা দিন</button></div></form><section class="section"><h2>Password পরিবর্তন</h2><form id="passwordChangeForm"><div class="form-grid"><div class="field"><label for="currentPassword">Current Password</label><input id="currentPassword" name="current_password" type="password" autocomplete="current-password" required></div><div class="field"><label for="newPasswordProfile">New Password</label><input id="newPasswordProfile" name="new_password" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label for="confirmPasswordProfile">Confirm New Password</label><input id="confirmPasswordProfile" name="confirm_password" type="password" autocomplete="new-password" minlength="8" required></div></div><div class="form-actions"><button type="submit" id="passwordChangeButton">Password পরিবর্তন করুন</button></div></form><p class="muted small">Password কমপক্ষে ৮ অক্ষরের হতে হবে।</p></section><section class="section"><h2>Profile request history</h2><div class="list">'+((requests.data||[]).map(r=>'<article class="list-item"><strong>'+esc(r.status)+'</strong><small>'+esc(new Date(r.created_at).toLocaleString())+'</small><p>'+esc(r.admin_note||"")+'</p></article>').join("")||empty("কোনো অনুরোধ নেই।"))+'</div></section><section class="section"><h2>আপনার Upload Status</h2><div class="list">'+(docRows.join("")||empty("কোনো NID বা Nominee ফাইল জমা দেওয়া হয়নি।"))+'</div></section>');
 const passwordForm=document.getElementById("passwordChangeForm");
 passwordForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const currentPassword=document.getElementById("currentPassword").value;
  const newPassword=document.getElementById("newPasswordProfile").value;
  const confirmPassword=document.getElementById("confirmPasswordProfile").value;
  if(newPassword.length<8){toast("New Password কমপক্ষে ৮ অক্ষরের হতে হবে।");return}
  if(newPassword!==confirmPassword){toast("New Password এবং Confirm Password মিলছে না।");return}
  if(newPassword===currentPassword){toast("নতুন Password আগের Password থেকে আলাদা হতে হবে।");return}
  const button=document.getElementById("passwordChangeButton");button.disabled=true;button.textContent="যাচাই হচ্ছে…";
  const {error:verifyError}=await supabase.auth.signInWithPassword({email:access.session.user.email,password:currentPassword});
  if(verifyError){toast("Current Password সঠিক নয়।");button.disabled=false;button.textContent="Password পরিবর্তন করুন";return}
  const {error:updateError}=await supabase.auth.updateUser({password:newPassword});
  if(updateError){toast("Password পরিবর্তন হয়নি: "+updateError.message);button.disabled=false;button.textContent="Password পরিবর্তন করুন";return}
  toast("Password সফলভাবে পরিবর্তন হয়েছে।");
  passwordForm.reset();button.disabled=false;button.textContent="Password পরিবর্তন করুন";
 });
 document.querySelectorAll('#profileRequest input[type="file"]').forEach(input=>input.addEventListener("change",()=>{const label=input.closest("label");if(label)label.dataset.selected=input.files?.[0]?.name||""}));
 document.getElementById("profileRequest").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),changes={};
  fields.forEach(([k])=>{const v=String(fd.get(k)||"").trim();if(v!==(m[k]||""))changes[k]=v});
  const photo=fd.get("photo"),memberDoc=fd.get("member_nid"),nomineeDoc=fd.get("nominee_nid"),nomineePic=fd.get("nominee_photo");
  const selected=[photo,memberDoc,nomineeDoc,nomineePic].filter(f=>f&&f.size);
  if(!Object.keys(changes).length&&!selected.length){toast("কোনো পরিবর্তন বা ফাইল নির্বাচন করা হয়নি।");return}
  for(const f of selected){
   const isPhoto=f===photo||f===nomineePic,limit=isPhoto?5*1024*1024:10*1024*1024;
   const allowed=isPhoto?["image/jpeg","image/png","image/webp"]:["image/jpeg","image/png","image/webp","application/pdf"];
   if(f.size>limit){toast(f.name+" ফাইলের আকার সীমার বেশি।");return}
   if(!allowed.includes(f.type)){toast(f.name+" ফাইলের ধরন গ্রহণযোগ্য নয়।");return}
  }
  const button=document.getElementById("profileSubmit");button.disabled=true;button.textContent="জমা হচ্ছে…";
  try{
   let photoPath=null;
   if(photo?.size){
    const uploadPhoto=await optimizeImageFile(photo,"photo").catch(()=>photo);
    const ext=uploadPhoto.type==="image/png"?"png":uploadPhoto.type==="image/webp"?"webp":"jpg";
    photoPath=access.session.user.id+"/"+crypto.randomUUID()+"."+ext;
    const {error:upErr}=await supabase.storage.from("member-profile-photos").upload(photoPath,uploadPhoto,{upsert:false,contentType:uploadPhoto.type});
    if(upErr)throw upErr;
   }
   if(Object.keys(changes).length||photoPath){
    const {error:insErr}=await supabase.from("profile_change_requests").insert({member_id:m.id,submitted_by:access.session.user.id,requested_changes:changes,requested_photo_path:photoPath});
    if(insErr){if(photoPath)await supabase.storage.from("member-profile-photos").remove([photoPath]);throw insErr}
   }
   const uploads=[["member_nid",memberDoc],["nominee_nid",nomineeDoc],["nominee_photo",nomineePic]];
   let uploaded=0;
   for(const [docType,file] of uploads){
    if(!file?.size)continue;
    const uploadFile=file.type.startsWith("image/")?await optimizeImageFile(file,docType==="nominee_photo"?"photo":"document").catch(()=>file):file;
    const ext=uploadFile.type==="application/pdf"?"pdf":uploadFile.type==="image/png"?"png":uploadFile.type==="image/webp"?"webp":"jpg";
    const path=access.session.user.id+"/"+crypto.randomUUID()+"."+ext;
    const {error:upError}=await supabase.storage.from("member-private-documents").upload(path,uploadFile,{upsert:false,contentType:uploadFile.type});
    if(upError)throw upError;
    const {error:rowError}=await supabase.from("member_private_documents").insert({member_id:m.id,owner_user_id:access.session.user.id,document_type:docType,storage_path:path,status:"pending"});
    if(rowError){await supabase.storage.from("member-private-documents").remove([path]);throw rowError}
    uploaded++;
   }
   toast("জমা হয়েছে। "+(uploaded?"ডকুমেন্ট/ছবি":"") +" Super Admin-এর Approval-এর অপেক্ষায় আছে।");await renderProfile();
  }catch(err){console.error(err);toast("Upload/Save হয়নি: "+(err.message||"Unknown error"))}
  finally{const b=document.getElementById("profileSubmit");if(b){b.disabled=false;b.textContent="পরিবর্তন ও ফাইল জমা দিন"}}
 });
}
async function renderPendingPrivateDocuments(){
 const box=document.getElementById("pendingDocuments");if(!box)return;
 const {data,error}=await supabase.from("member_private_documents").select("id,member_id,owner_user_id,document_type,storage_path,uploaded_at,members(full_name,member_no)").eq("status","pending").order("uploaded_at");
 if(error){box.textContent=error.message;return}
 if(!data.length){box.innerHTML=empty("কোনো Pending private upload নেই।");return}
 const label=type=>({member_nid:"Member NID",nominee_nid:"Nominee NID",nominee_photo:"Nominee Picture"}[type]||type);
 const cards=await Promise.all(data.map(async d=>{
  const {data:u}=await supabase.storage.from("member-private-documents").createSignedUrl(d.storage_path,900);
  const preview=u?.signedUrl?(d.document_type==="nominee_photo"?'<p><img class="private-doc-thumb" src="'+esc(u.signedUrl)+'" alt="Nominee picture preview"></p>':'<p><a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">Private document দেখুন</a></p>'):"<p class='muted small'>Preview তৈরি করা যায়নি।</p>";
  return '<article class="list-item"><strong>'+esc(d.members?.member_no||"")+' · '+esc(d.members?.full_name||"Member")+'</strong><p>'+esc(label(d.document_type))+'</p><small>'+esc(new Date(d.uploaded_at).toLocaleString())+'</small>'+preview+'<div class="row"><button data-doc-approve="'+esc(d.id)+'">Approve</button><button class="danger" data-doc-reject="'+esc(d.id)+'">Reject</button></div></article>';
 }));
 box.innerHTML=cards.join("");
 box.querySelectorAll("[data-doc-approve],[data-doc-reject]").forEach(b=>b.addEventListener("click",async()=>{
  const approved=b.hasAttribute("data-doc-approve"),id=approved?b.dataset.docApprove:b.dataset.docReject,note=prompt("Admin note (optional):")||null;
  b.disabled=true;
  const {error}=await supabase.rpc("review_private_document",{p_document_id:id,p_approved:approved,p_admin_note:note});
  if(error){toast(error.message);b.disabled=false}else{toast(approved?"Upload approved.":"Upload rejected.");await renderPendingPrivateDocuments()}
 }));
}
async function renderAdmin(){
 if(access.role!=="super_admin"){setPage('<h1>Super Admin</h1>'+empty("এই পেজে শুধু Super Admin প্রবেশ করতে পারবেন।"));return}
 setPage('<h1>Super Admin Control Panel</h1><p class="lead">সব কমিটি ডেটা, আর্থিক লেনদেন, সদস্য, প্রমাণপত্র ও নোটিশ এখান থেকে নিয়ন্ত্রণ করো।</p><div class="notice">সমিতির হিসাব ১ জানুয়ারি ২০২৭ থেকে। Opening balance দিতে হলে New Financial Transaction-এ Opening balance নির্বাচন করে Cash, Bank ও Investment-এর প্রতিটি প্রাথমিক অঙ্ক আলাদাভাবে এন্ট্রি করুন। এরপর সব পরিবর্তন ledger-এ সংরক্ষিত হবে।</div><section class="section"><h2>Login Account তৈরি/সেট</h2><form id="loginAccountForm"><div class="form-grid"><div class="field"><label>Active member</label><select id="loginAccountMember" required><option value="">সদস্য নির্বাচন করো</option></select></div><div class="field"><label>Login Gmail / Email</label><input id="loginAccountEmail" type="email" autocomplete="off" required placeholder="সদস্যের Gmail লিখুন"></div></div><div class="form-actions"><button type="submit" id="loginAccountButton">Login ID তৈরি / Temporary Password সেট</button></div></form><div id="loginAccountResult"></div><p class="muted small">শুধু Active member নির্বাচন করুন। নতুন Account তৈরি হবে, অথবা আগে তৈরি কিন্তু কখনো Login না করা Account-এর Temporary Password সেট হবে। Password একবারই দেখানো হবে—কপি করে সদস্যকে দিন। সদস্য পরে Profile থেকে Password পরিবর্তন করতে পারবে।</p></section><section class="section"><h2>মাসিক জমার হার নির্ধারণ/পরিবর্তন</h2><form id="rateForm"><div class="form-grid"><div class="field"><label>Active member</label><select id="rateMember" name="member_id" required><option value="">সদস্য নির্বাচন</option></select></div><div class="field"><label>মাসিক জমা (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>কার্যকর হবে (মাসের ১ তারিখ)</label><input name="effective_from" type="date" required></div></div><div class="form-actions"><button type="submit">জমার হার সংরক্ষণ</button></div></form><p class="muted small">আগের হার স্বয়ংক্রিয়ভাবে আগের মাসের শেষ দিনে বন্ধ হবে। কার্যকর তারিখ অবশ্যই মাসের ১ তারিখ হতে হবে।</p></section><section class="section" id="financial-entry"><h2>নতুন আর্থিক লেনদেন</h2><p class="muted small">Hand Cash, Bank বা Investment-এর প্রাথমিক ব্যালেন্স দিতে Opening balance নির্বাচন করুন। পরবর্তী জমা/উত্তোলন/ব্যয়ও এখানেই যোগ হবে। পুরোনো লেনদেন নিচের Financial Ledger থেকে সংশোধন করুন; DATA Matrix-এর জমা DATA পেজ থেকে সম্পাদনা করুন।</p><form id="transactionForm"><div class="form-grid"><div class="field"><label>লেনদেনের ধরন</label><select name="type"><option value="opening_balance">Opening balance</option><option value="contribution">Member contribution</option><option value="withdrawal">Withdrawal</option><option value="expense">Expense</option><option value="other_income">Other income</option><option value="investment_profit">Investment profit</option><option value="investment_loss">Investment loss</option><option value="transfer">Account transfer</option></select></div><div class="field"><label>Amount (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>তারিখ</label><input name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Account</label><select name="account"><option value="cash">Cash</option><option value="bank">Bank</option><option value="investment">Investment</option></select></div><div class="field"><label>Transfer destination (transfer হলে)</label><select name="destination"><option value="bank">Bank</option><option value="cash">Cash</option><option value="investment">Investment</option></select></div><div class="field"><label>সদস্য (ঐচ্ছিক; Contribution-এ বাধ্যতামূলক)</label><select name="member_id" id="transactionMember"><option value="">Select member</option></select></div><div class="field"><label>বিবরণ</label><input name="description" required></div><div class="field"><label>Reference No</label><input name="reference_no"></div></div><div class="form-actions"><button type="submit">লেনদেন সংরক্ষণ</button></div></form></section><section class="section"><h2>মাসিক প্রমাণপত্র</h2><p>মাস নির্বাচন করে Proof পেজে এক বা একাধিক ছবি/PDF Drop অথবা Browse করে আপলোড করুন।</p></section><section class="section"><h2>নোটিশ প্রকাশ</h2><form id="noticeForm"><div class="form-grid"><div class="field"><label>শিরোনাম</label><input name="title" required maxlength="180"></div><div class="field"><label>ধরন</label><select name="type"><option value="general">সাধারণ</option><option value="meeting">সভা</option><option value="reminder">স্মরণবার্তা</option></select></div><div class="field"><label>সভা হলে তারিখ ও সময়</label><input name="meeting_at" type="datetime-local"></div></div><div class="field" style="margin-top:12px"><label>বিস্তারিত</label><textarea name="body" required maxlength="5000"></textarea></div><div class="form-actions"><button type="submit">সবার জন্য প্রকাশ</button></div></form></section><section class="section"><h2>প্রকাশিত নোটিশ সম্পাদনা</h2><div id="adminNoticeEditor" class="list">লোড হচ্ছে…</div></section><section class="section"><h2>Pending Google Form registrations</h2><div id="pendingMembers" class="list"></div></section><section class="section"><h2>Pending website signups</h2><p class="muted small">সদস্যরা নিজেরা অ্যাকাউন্ট তৈরি করলে এখানে দেখা যাবে। Google Form-এর সঙ্গে একই Email মিললে Super Admin Approval-এর পর সদস্য Login করতে পারবে। Email Verification আলাদা করে করতে হবে না।</p><div id="pendingSignups" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>Pending profile changes</h2><div id="pendingRequests" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>Pending private ID documents</h2><div id="pendingDocuments" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>সদস্য তালিকা</h2><div id="adminMembers" class="table-wrap"></div></section><section class="section" id="financial-ledger"><h2>সাম্প্রতিক লেনদেন</h2><div id="adminTransactions" class="table-wrap"></div></section>');
 const [membersResult,signupResult,txResult,pendingResult,noticeRowsResult]=await Promise.all([
  supabase.from("members").select("id,member_no,full_name,phone,email,status,monthly_contribution,contribution_start_date,auth_user_id").order("member_no"),
  supabase.from("profiles").select("id,full_name,email,email_verified_at,role,created_at").in("role",["pending","rejected"]).order("created_at",{ascending:false}),
  supabase.from("financial_transactions").select("id,transaction_date,transaction_type,account_type,direction,amount,description,reference_no,transfer_group_id").order("transaction_date",{ascending:false}).limit(100),
  supabase.from("profile_change_requests").select("id,member_id,submitted_by,requested_changes,requested_photo_path,created_at,members(full_name,member_no)").eq("status","pending").order("created_at"),
  supabase.from("notices").select("id,title,body,notice_type,meeting_at,published,created_at").order("created_at",{ascending:false}).limit(50)
 ]);
 const {data:members,error:mErr}=membersResult;if(mErr)throw mErr;
 const {data:signupProfiles,error:signupError}=signupResult;if(signupError)throw signupError;
 const linkedAuthIds=members.map(m=>m.auth_user_id).filter(Boolean);
 const {data:loginProfiles,error:loginProfilesError}=linkedAuthIds.length
  ?await supabase.from("profiles").select("id,email").in("id",linkedAuthIds)
  :{data:[],error:null};
 if(loginProfilesError)throw loginProfilesError;
 const loginEmailByUserId=new Map((loginProfiles||[]).map(p=>[p.id,p.email]));
 const loginMemberSelect=document.getElementById("loginAccountMember");
 members.filter(m=>m.status==="active").forEach(m=>{const option=document.createElement("option");option.value=m.id;option.textContent=(m.member_no||"")+" · "+m.full_name+(m.auth_user_id?" · Account linked":" · No account");loginMemberSelect.append(option)});
 loginMemberSelect.addEventListener("change",()=>{const selected=members.find(m=>m.id===loginMemberSelect.value);document.getElementById("loginAccountEmail").value=(selected?.auth_user_id?loginEmailByUserId.get(selected.auth_user_id):"")||selected?.email||""});
 document.getElementById("loginAccountForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const member_id=loginMemberSelect.value,email=document.getElementById("loginAccountEmail").value.trim().toLowerCase();
  if(!member_id||!email){toast("সদস্য ও Email নির্বাচন করুন।");return}
  if(!confirm("নির্বাচিত Active member-এর Login Account তৈরি/Temporary Password সেট করবেন?"))return;
  const button=document.getElementById("loginAccountButton");button.disabled=true;button.textContent="তৈরি হচ্ছে…";
  const {data,error}=await supabase.functions.invoke("create-member-login",{body:{member_id,email}});
  if(error){toast(data?.error||error.message);button.disabled=false;button.textContent="Login ID তৈরি / Temporary Password সেট";return}
  const result=document.getElementById("loginAccountResult");
  result.innerHTML='<article class="notice"><strong>Login Account প্রস্তুত</strong><p>Member: '+esc(data.member_no||"")+'</p><p>Email: '+esc(data.email)+'</p><label>Temporary Password — এখনই কপি করে নিরাপদে সদস্যকে দিন</label><input id="generatedMemberPassword" type="text" readonly value="'+esc(data.temporary_password)+'"><button type="button" id="copyMemberPassword">Password কপি করুন</button><p class="muted small">নিরাপত্তার জন্য এই Password পরে আর দেখানো হবে না। সদস্য Login করে Profile থেকে Password পরিবর্তন করবে।</p></article>';
  document.getElementById("copyMemberPassword").addEventListener("click",async()=>{const value=document.getElementById("generatedMemberPassword").value;try{await navigator.clipboard.writeText(value);toast("Temporary Password কপি হয়েছে।")}catch{document.getElementById("generatedMemberPassword").select();toast("Password select করা হয়েছে—Ctrl+C চাপুন।")}});
  toast(data.account_action==="created"?"Login Account তৈরি হয়েছে।":"আগের unused Account-এর Password সেট হয়েছে।");
  button.disabled=false;button.textContent="Login ID তৈরি / Temporary Password সেট";
 });
 const signupBox=document.getElementById("pendingSignups");
 if(signupBox){
  signupBox.innerHTML=signupProfiles.length?signupProfiles.map(p=>{
   const match=members.find(m=>m.email&&p.email&&m.email.trim().toLowerCase()===p.email.trim().toLowerCase()&&["pending","active"].includes(m.status)&&(!m.auth_user_id||m.auth_user_id===p.id));
   const status=p.role==="rejected"?"Rejected":"Pending";
   const actions=p.role==="rejected"
    ?'<button type="button" data-signup-action="reopen" data-user-id="'+esc(p.id)+'">Reopen</button>'
    :'<button type="button" data-signup-action="approve" data-user-id="'+esc(p.id)+'" '+(match?'':'disabled')+'>Approve &amp; Activate</button><button class="danger" type="button" data-signup-action="reject" data-user-id="'+esc(p.id)+'">Reject</button>';
   return '<article class="list-item"><div class="row"><strong>'+esc(p.full_name||"New signup")+'</strong><span class="pill">'+status+'</span></div><p>'+esc(p.email||"Email missing")+'</p><small>'+esc(new Date(p.created_at).toLocaleString())+'</small><p class="muted small">'+(match?'Matched member: '+esc(match.member_no||"No ID")+' · '+esc(match.full_name)+' ('+esc(match.status)+')':'কোনো মিল পাওয়া Member/Google Form record নেই। Google Form-এর ইমেইল আগে যাচাই করুন।')+' · '+(p.email_verified_at?'Email verified':'Email not verified — Super Admin approval will enable login')+'</p><div class="row">'+actions+'</div></article>';
  }).join(""):empty("কোনো website signup pending নেই।");
  signupBox.querySelectorAll("[data-signup-action]").forEach(button=>button.addEventListener("click",async()=>{
   const action=button.dataset.signupAction,user_id=button.dataset.userId;
   if(action==="approve"&&!confirm("এই ইমেইলের Google Form/member record Active করে Login অনুমোদন করবেন?"))return;
   if(action==="reject"&&!confirm("এই signup আবেদন Reject করবেন?"))return;
   button.disabled=true;
   const {data,error}=await supabase.functions.invoke("review-member-signup",{body:{action,user_id}});
   if(error){toast(data?.error||error.message);button.disabled=false;return}
   toast(action==="approve"?"সদস্য Active এবং Login অনুমোদিত হয়েছে।":action==="reject"?"Signup Reject করা হয়েছে।":"Signup আবার Pending করা হয়েছে।");
   renderAdmin();
  }));
 }
 const pendingMembers=members.filter(m=>m.status==="pending");
 const pendingBox=document.getElementById("pendingMembers");
 if(pendingBox){
  pendingBox.innerHTML=pendingMembers.length?pendingMembers.map(m=>{
   const hasSignup=signupProfiles.some(p=>p.role==="pending"&&p.email&&m.email&&p.email.trim().toLowerCase()===m.email.trim().toLowerCase());
   return '<article class="list-item"><div class="row"><strong>'+esc(m.member_no||"New applicant")+' · '+esc(m.full_name||"নাম পাওয়া যায়নি")+'</strong><span class="pill">Pending · Google Form</span></div><p class="muted small">'+esc(m.phone||"")+' '+esc(m.email||"")+'</p><p class="muted small">'+(hasSignup?'Website signup পাওয়া গেছে—উপরের Pending website signups অংশ থেকে অনুমোদন করুন।':'Approval-এর পর Admin Login Account তৈরি করে দিতে পারবেন; সদস্য চাইলে নিজেও Signup করতে পারবেন।')+'</p><a class="button secondary" href="member-profile.html?id='+encodeURIComponent(m.id)+'">প্রোফাইল দেখুন</a></article>';
  }).join(""):empty("কোনো Pending Google Form registration নেই।");
 }
 const rateSelect=document.getElementById("rateMember");
 members.filter(m=>m.status==="active").forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=(m.member_no||"")+" · "+m.full_name;rateSelect.append(o)});
 document.getElementById("rateForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),effective=d.get("effective_from");if(new Date(effective+"T00:00:00").getDate()!==1){toast("কার্যকর তারিখ মাসের ১ তারিখ হতে হবে।");return}const {error}=await supabase.rpc("set_member_contribution_rate",{p_member_id:rateSelect.value,p_amount:Number(d.get("amount")),p_effective_from:effective});if(error)toast(error.message);else{toast("মাসিক জমার হার সংরক্ষিত হয়েছে।");renderAdmin()}});
 const memberSelect=document.getElementById("transactionMember");
 members.forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=(m.member_no||"")+(m.member_no?" · ":"")+m.full_name;memberSelect.append(o)});
 document.getElementById("adminMembers").innerHTML='<table><thead><tr><th>Member ID</th><th>Name</th><th>Status</th><th>Monthly</th><th>Start</th><th>Login link</th></tr></thead><tbody>'+members.map(m=>'<tr><td>'+esc(m.member_no||"—")+'</td><td>'+esc(m.full_name)+'</td><td>'+esc(m.status)+'</td><td>'+esc(m.monthly_contribution?money(m.monthly_contribution):"৳2,000 (default)")+'</td><td>'+esc(m.contribution_start_date||"—")+'</td><td>'+((m.auth_user_id)?'<span class="pill">Linked</span>':'<span class="pill">Not linked</span>')+'</td></tr>').join("")+'</tbody></table>';
 const tx=txResult;
 const txBox=document.getElementById("adminTransactions");
 if(tx.error)txBox.innerHTML=empty(tx.error.message);
 else if(!tx.data.length)txBox.innerHTML=empty("এখনো কোনো লেনদেন নেই।");
 else{
  txBox.innerHTML='<form id="adminTransactionEditForm"><table><thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Flow</th><th>Amount</th><th>Description</th><th>Editing</th></tr></thead><tbody>'+tx.data.map(x=>{
   const locked=x.transaction_type==="transfer"||Boolean(x.transfer_group_id)||String(x.reference_no||"").startsWith("FFV_MATRIX|");
   const reason=x.transaction_type==="transfer"||x.transfer_group_id?"Transfer pair locked":String(x.reference_no||"").startsWith("FFV_MATRIX|")?"Edit from DATA":"Editable";
   return '<tr data-transaction-row="'+esc(x.id)+'"><td>'+(locked?esc(x.transaction_date):'<input type="date" name="date" value="'+esc(x.transaction_date)+'" data-current="'+esc(x.transaction_date)+'">')+'</td><td>'+esc(x.transaction_type)+'</td><td>'+esc(x.account_type)+'</td><td>'+esc(x.direction)+'</td><td>'+(locked?money(x.amount):'<input type="number" name="amount" min=".01" step=".01" value="'+Number(x.amount)+'" data-current="'+Number(x.amount)+'">')+'</td><td>'+(locked?esc(x.description||""):'<input type="text" name="description" maxlength="500" value="'+esc(x.description||"")+'" data-current="'+esc(x.description||"")+'">')+'</td><td><span class="pill">'+reason+'</span><input type="hidden" name="id" value="'+esc(x.id)+'"></td></tr>';
  }).join("")+'</tbody></table><div class="form-actions"><button type="submit" id="saveAdminTransactions">Save Changes</button><span id="adminTransactionStatus" class="muted small"></span></div></form>';
  document.getElementById("adminTransactionEditForm").addEventListener("submit",async event=>{
   event.preventDefault();
   const changes=[];
   for(const row of txBox.querySelectorAll("[data-transaction-row]")){
    const amount=row.querySelector('[name="amount"]'),date=row.querySelector('[name="date"]'),description=row.querySelector('[name="description"]');
    if(!amount||!date||!description)continue;
    const next={id:row.querySelector('[name="id"]').value,amount:Number(amount.value),transaction_date:date.value,description:description.value.trim()};
    if(next.amount!==Number(amount.dataset.current)||next.transaction_date!==date.dataset.current||next.description!==description.dataset.current)changes.push(next);
   }
   if(!changes.length){toast("কোনো পরিবর্তন করা হয়নি।");return}
   if(changes.some(x=>!(x.amount>0)||!Number.isFinite(x.amount)||!x.transaction_date)){toast("Amount ও Date সঠিকভাবে পূরণ করুন।",true);return}
   const button=document.getElementById("saveAdminTransactions"),status=document.getElementById("adminTransactionStatus");
   button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
   const {data,error}=await supabase.rpc("correct_financial_transactions",{p_idempotency_key:crypto.randomUUID(),p_changes:changes});
   if(error){status.textContent="Save হয়নি।";toast(error.message,true);button.disabled=false;return}
   status.textContent=(data?.saved||changes.length)+"টি লেনদেন সংশোধন হয়েছে।";
   toast("লেনদেনের সংশোধন সংরক্ষিত হয়েছে।");renderAdmin();
  });
 }
 const pending=pendingResult;
 const pBox=document.getElementById("pendingRequests");
 if(pending.error)pBox.textContent=pending.error.message;
 else if(!pending.data.length)pBox.innerHTML=empty("কোনো Pending request নেই।");
 else{
  pBox.innerHTML=pending.data.map(r=>'<article class="list-item request"><strong>'+esc(r.members?.member_no||"")+' '+esc(r.members?.full_name||"Member")+'</strong><small>'+esc(new Date(r.created_at).toLocaleString())+'</small><pre>'+esc(JSON.stringify(r.requested_changes,null,2))+'</pre><div id="photo-'+esc(r.id)+'"></div><div class="row"><button data-approve="'+esc(r.id)+'">Approve</button><button class="danger" data-reject="'+esc(r.id)+'">Reject</button></div></article>').join("");
  for(const r of pending.data){if(r.requested_photo_path){const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(r.requested_photo_path,3600);if(u?.signedUrl)document.getElementById("photo-"+r.id).innerHTML='<a href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener"><img class="private-doc-thumb" src="'+esc(u.signedUrl)+'" alt="Pending profile photo preview"></a>'}}
  document.querySelectorAll("[data-approve],[data-reject]").forEach(b=>b.addEventListener("click",async()=>{const approved=b.hasAttribute("data-approve"),id=approved?b.dataset.approve:b.dataset.reject;const note=prompt("Admin note (optional):")||null;const {error}=await supabase.rpc("review_profile_change_request",{p_request_id:id,p_approved:approved,p_admin_note:note});if(error)toast(error.message);else{toast(approved?"Request approved.":"Request rejected.");renderAdmin()}}));
 }
 await renderPendingPrivateDocuments();
 document.getElementById("transactionForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const type=String(d.get("type")||"");
  const amount=Number(d.get("amount"));
  const account=String(d.get("account")||"");
  const date=String(d.get("date")||"");
  const memberId=d.get("member_id")||null;
  const desc=String(d.get("description")||"").trim();
  const referenceNo=String(d.get("reference_no")||"").trim()||null;
  const destination=type==="transfer"?String(d.get("destination")||""):null;
  if(!(amount>0)||!Number.isFinite(amount)){toast("Amount অবশ্যই 0-এর বেশি হতে হবে।",true);return}
  if(!date){toast("লেনদেনের তারিখ দিতে হবে।",true);return}
  if(type==="contribution"&&!memberId){toast("Contribution-এর জন্য সদস্য নির্বাচন করো।",true);return}
  if(type==="transfer"&&(!destination||account===destination)){toast("Source ও destination account আলাদা হতে হবে।",true);return}
  const direction=type==="transfer"?"out":(["withdrawal","expense","investment_loss"].includes(type)?"out":"in");
  const button=e.currentTarget.querySelector('button[type="submit"]');
  if(button)button.disabled=true;
  const {error}=await supabase.rpc("post_financial_transaction",{
   p_idempotency_key:crypto.randomUUID(),
   p_transaction_type:type,
   p_amount:amount,
   p_transaction_date:date,
   p_account_type:account,
   p_direction:direction,
   p_member_id:memberId,
   p_description:desc||null,
   p_reference_no:referenceNo,
   p_category:null,
   p_project_name:null,
   p_destination_account_type:destination
  });
  if(error){
   toast(error.message,true);
   if(button)button.disabled=false;
   return;
  }
  toast("লেনদেন সংরক্ষিত হয়েছে।");
  renderAdmin();
 });
 document.getElementById("noticeForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),type=d.get("type"),meeting=d.get("meeting_at");if(type==="meeting"&&!meeting){toast("সভা হলে সময় দিতে হবে।");return}const {error}=await supabase.from("notices").insert({title:d.get("title"),body:d.get("body"),notice_type:type,meeting_at:meeting?new Date(meeting).toISOString():null,published:true,published_at:new Date().toISOString(),created_by:access.session.user.id});if(error)toast(error.message);else{toast("নোটিশ প্রকাশ হয়েছে।");renderAdmin()}});
 const noticeRows=noticeRowsResult;
 const noticeEditor=document.getElementById("adminNoticeEditor");
 if(noticeRows.error)noticeEditor.innerHTML=empty(noticeRows.error.message);
 else if(!noticeRows.data.length)noticeEditor.innerHTML=empty("এখনো কোনো নোটিশ তৈরি হয়নি।");
 else{
  const toLocalDateTime=value=>{if(!value)return "";const d=new Date(value),pad=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes())};
  noticeEditor.innerHTML='<form id="noticeEditForm">'+noticeRows.data.map(n=>'<article class="notice-edit-row" data-notice-row><input type="hidden" name="id" value="'+esc(n.id)+'"><div class="field"><label>Title</label><input name="title" maxlength="180" required value="'+esc(n.title)+'"></div><div class="field"><label>Type</label><select name="notice_type"><option value="general" '+(n.notice_type==="general"?"selected":"")+'>General</option><option value="meeting" '+(n.notice_type==="meeting"?"selected":"")+'>Meeting</option><option value="reminder" '+(n.notice_type==="reminder"?"selected":"")+'>Reminder</option></select></div><div class="field"><label>Meeting date/time</label><input name="meeting_at" type="datetime-local" value="'+esc(toLocalDateTime(n.meeting_at))+'"></div><div class="field"><label>Body</label><textarea name="body" rows="3" maxlength="5000" required>'+esc(n.body)+'</textarea></div><label class="inline-check"><input name="published" type="checkbox" '+(n.published?"checked":"")+'> Published</label></article>').join("")+'<div class="form-actions"><button type="submit" id="saveNoticeChanges">Save Changes</button><span id="noticeEditStatus" class="muted small"></span></div></form>';
  document.getElementById("noticeEditForm").addEventListener("submit",async event=>{
   event.preventDefault();
   const changes=[...noticeEditor.querySelectorAll("[data-notice-row]")].map(row=>{
    const meeting=row.querySelector('[name="meeting_at"]').value;
    return {id:row.querySelector('[name="id"]').value,title:row.querySelector('[name="title"]').value.trim(),body:row.querySelector('[name="body"]').value.trim(),notice_type:row.querySelector('[name="notice_type"]').value,meeting_at:meeting?new Date(meeting).toISOString():null,published:row.querySelector('[name="published"]').checked};
   });
   if(changes.some(item=>!item.title||!item.body||(item.notice_type==="meeting"&&!item.meeting_at))){toast("Title, Body এবং Meeting হলে date/time দিতে হবে।",true);return}
   const button=document.getElementById("saveNoticeChanges"),status=document.getElementById("noticeEditStatus");
   button.disabled=true;status.textContent="সংরক্ষণ হচ্ছে…";
   const {data,error}=await supabase.rpc("save_notice_updates",{p_changes:changes});
   if(error){status.textContent="Save হয়নি।";toast(error.message,true);button.disabled=false;return}
   status.textContent=(data?.saved||changes.length)+"টি নোটিশ Save হয়েছে।";
   toast("নোটিশের পরিবর্তন সংরক্ষিত হয়েছে।");renderAdmin();
  });
 }
}
async function renderPage(){
 try{
  if(page==="dashboard")await renderDashboard();
  else if(page==="personal-due")await renderDue();
  else if(page==="member-info")await renderMembers();
  else if(page==="proof")await renderProofs();
  else if(page==="member")await renderProfile();
  else if(page==="admin")await renderAdmin();
  else if(page==="payment")await renderPayment();
 }catch(error){console.error(error);setPage('<h1>তথ্য লোড করা যায়নি</h1><div class="error">'+esc(error.message||"Unknown error")+'</div><p class="muted">Supabase connection, permissions and table setup পরীক্ষা করো।</p>')}
}
access=await requireRole(page==="admin"?["super_admin"]:["super_admin","member"]);
if(access){shell();await Promise.all([loadHeaderIdentity(),loadTickerSettings()]);await renderPage();registerPwa()}
