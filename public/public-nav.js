import {supabase,supabaseReady} from "./supabase-client.js";
const home=document.getElementById("siteHome"),menu=document.getElementById("siteMenu"),nav=document.getElementById("siteNav"),bell=document.getElementById("siteBell"),login=document.getElementById("siteLogin");
const icon={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/>'};
const DEFAULT_TICKER="আপনাকে ফ্রেন্ডস ফিউচার ভিশন ফরইভার এ স্বাগতম। আপনাকে আমাদের কোম্পানির পার্টনারশিপ ও মেম্বার হওয়ার জন্য অনেক অনেক শুভেচ্ছা জানাই। নিজের আইডি পাসওয়ার্ড নিজের কাছে রাখুন। অন্যদের সাথে শেয়ার করা থেকে বিরত থাকুন। নিজের বকেয়া প্রতি মাসের নির্ধারিত সময় (মাসের ১৫ তারিখের মধ্যে) এর মধ্যে দায়িত্বপ্রাপ্তদের হাতে বুঝিয়ে দিন। ধন্যবাদ। ইন শাহ আল্লাহ আমাদের স্বপ্ন বাস্তব হবে সকলে একসাথে থাকলে।";
function setupPublicTheme(){
 const actions=document.querySelector(".actions");
 if(!actions||document.getElementById("publicThemeToggle"))return;
 const installButton=document.createElement("button");
 installButton.type="button";installButton.id="publicInstallAppBtn";installButton.className="secondary install-app-button";installButton.textContent="Install App";
 installButton.addEventListener("click",async()=>{
  try{
   const pwa=await import("./pwa.js");
   const result=await pwa.installPwa();
   if(!result.available)alert("Chrome menu ⋮ থেকে Install app / Add to Home screen নির্বাচন করুন। iPhone হলে Share → Add to Home Screen চাপুন।");
   else if(result.outcome==="accepted")alert("App install শুরু হয়েছে।");
  }catch(error){alert("Install prompt চালু করা যায়নি: "+(error.message||"Unknown error"))}
 });
 actions.insertBefore(installButton,menu);
 const button=document.createElement("button");
 button.type="button";button.id="publicThemeToggle";button.className="secondary theme-toggle";
 const apply=()=>{const dark=document.body.classList.contains("dark-theme");button.textContent=dark?"☀ Light":"☾ Dark";button.setAttribute("aria-pressed",String(dark))};
 let dark=false;try{dark=localStorage.getItem("ffv-theme")==="dark"}catch{}
 document.body.classList.toggle("dark-theme",dark);apply();
 button.addEventListener("click",()=>{const next=!document.body.classList.contains("dark-theme");document.body.classList.toggle("dark-theme",next);try{localStorage.setItem("ffv-theme",next?"dark":"light")}catch{}apply()});
 actions.insertBefore(button,menu);
}
function ensurePublicTicker(){
 if(document.getElementById("siteTicker"))return;
 const main=document.querySelector("main.page");if(!main)return;
 const ticker=document.createElement("div");ticker.className="site-ticker";ticker.id="siteTicker";
 ticker.innerHTML='<span class="site-ticker-label">NOTICE</span><div class="site-ticker-window"><span id="siteTickerText"></span></div>';
 main.parentNode.insertBefore(ticker,main);
 const textNode=document.getElementById("siteTickerText");if(textNode)textNode.textContent=DEFAULT_TICKER;
}
async function loadPublicTicker(){
 ensurePublicTicker();
 const ticker=document.getElementById("siteTicker"),textNode=document.getElementById("siteTickerText");
 if(!ticker||!textNode||!supabaseReady)return;
 try{
  const {data,error}=await supabase.from("site_settings").select("setting_key,setting_value").in("setting_key",["ticker_message","ticker_enabled"]);
  if(error)throw error;
  const values=new Map((data||[]).map(row=>[row.setting_key,row.setting_value]));
  textNode.textContent=String(values.get("ticker_message")||DEFAULT_TICKER).trim()||DEFAULT_TICKER;
  ticker.hidden=values.get("ticker_enabled")==="false";
 }catch(error){console.warn("Public ticker settings unavailable; default message retained",error)}
}
const svg=n=>'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icon[n]+'</svg>';
const item=(href,label,n)=>'<a href="'+href+'"'+(location.pathname.split("/").pop()===href?' class="active" aria-current="page"':'')+'>'+svg(n)+'<span>'+label+'</span></a>';
function showPublicNavigation(){
 setupPublicTheme();ensurePublicTicker();loadPublicTicker();
 home.href="index.html";
 nav.innerHTML=item("rules.html","RULES","rules");
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");
 menu.addEventListener("click",()=>{nav.hidden=!nav.hidden;menu.setAttribute("aria-expanded",String(!nav.hidden))});
 login.hidden=false;bell.hidden=true;
 document.body.classList.remove("auth-pending");
}
async function init(){
 document.body.classList.add("auth-pending");
 if(!supabaseReady){showPublicNavigation();return}
 const {data:s,error}=await supabase.auth.getSession();
 const session=s?.session;
 if(error||!session?.user?.id){showPublicNavigation();return}
 const {data:profile,error:pe}=await supabase.from("profiles").select("role").eq("id",session.user.id).maybeSingle();
 if(pe||!profile||!["super_admin","member"].includes(profile.role)){await supabase.auth.signOut();location.replace("login.html");return}
 home.href="dashboard.html";
 setupPublicTheme();await loadPublicTicker();
 const role=profile.role;
 const links=[item("rules.html","RULES","rules"),item("member-info.html","MEMBER INFO","members"),item("data.html","DATA","data"),item("personal-due.html","PERSONAL DUE","due"),item("proof.html","PROOF","proof"),item("payment.html","PAYMENT","payment"),...(role==="super_admin"?[item("admin.html","SUPER ADMIN","admin")]:[]),...(role==="member"?[item("statement.html","MY STATEMENT","data"),item("member.html","MY PROFILE","members")]:[])];
 nav.innerHTML=links.join("");
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");menu.addEventListener("click",()=>{nav.hidden=!nav.hidden;menu.setAttribute("aria-expanded",String(!nav.hidden))});
 login.hidden=true;bell.hidden=false;
  if(role==="super_admin"){
   const actions=document.querySelector(".actions");
   const menuBox=document.createElement("details");
   menuBox.className="export-menu";
   menuBox.innerHTML='<summary>EXPORT</summary><div class="export-menu-panel"><button type="button" data-export-action="page-xlsx">এই পেজ · Excel</button><button type="button" data-export-action="page-docx">এই পেজ · Word</button><button type="button" data-export-action="full-xlsx">সম্পূর্ণ Website · Excel</button><button type="button" data-export-action="full-docx">সম্পূর্ণ Website · Word</button></div>';
   actions?.insertBefore(menuBox,menu);
   menuBox.querySelectorAll("[data-export-action]").forEach(button=>button.addEventListener("click",async()=>{
    const action=button.dataset.exportAction,original=button.textContent;
    button.disabled=true;button.textContent="তৈরি হচ্ছে…";
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
  }
 const {count}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",session.user.id).is("read_at",null);
 const badge=document.getElementById("siteUnread");if(count>0){badge.textContent=count>99?"99+":String(count);badge.hidden=false}
 bell.addEventListener("click",()=>location.href="dashboard.html");
 document.body.classList.remove("auth-pending");
}
init().catch(()=>location.replace("login.html"));
