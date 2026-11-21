import {supabase,supabaseReady} from "./supabase-client.js";
import { BRAND_LOGO_SVG } from "./brand-logo.js";
import { installPwa } from "./pwa.js";
const home=document.getElementById("siteHome"),menu=document.getElementById("siteMenu"),nav=document.getElementById("siteNav"),bell=document.getElementById("siteBell"),login=document.getElementById("siteLogin");
let publicThemeButton=null;
const icon={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/>'};
function setupPublicTheme(){
 const actions=document.querySelector(".actions");
 if(!actions||document.getElementById("publicThemeToggle"))return;
 const button=document.createElement("button");
 button.type="button";button.id="publicThemeToggle";button.className="secondary theme-toggle public-theme-toggle";
 const apply=()=>{const dark=document.body.classList.contains("dark-theme");button.textContent=dark?"☀ Light":"☾ Dark";button.setAttribute("aria-pressed",String(dark))};
 let dark=false;try{dark=localStorage.getItem("ffv-theme")==="dark"}catch{}
 document.body.classList.toggle("dark-theme",dark);apply();
 button.addEventListener("click",()=>{const next=!document.body.classList.contains("dark-theme");document.body.classList.toggle("dark-theme",next);try{localStorage.setItem("ffv-theme",next?"dark":"light")}catch{}apply()});
 publicThemeButton=button;
}
const svg=n=>'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icon[n]+'</svg>';
const item=(href,label,n)=>'<a href="'+href+'"'+(location.pathname.split("/").pop()===href?' class="active" aria-current="page"':'')+'>'+svg(n)+'<span>'+label+'</span></a>';
function addPublicMobileNav(isAuthenticated){
 if(document.querySelector(".public-mobile-nav"))return;
 const current=location.pathname.split("/").pop()||"index.html";
 const mobileNav=document.createElement("nav");
 mobileNav.className="mobile-bottom-nav public-mobile-nav";
 mobileNav.setAttribute("aria-label","Quick navigation");
 const link=(href,label,name)=>'<a href="'+href+'"'+(current===href?' class="active" aria-current="page"':'')+'>'+svg(name)+'<span>'+label+'</span></a>';
 mobileNav.innerHTML=link(isAuthenticated?"dashboard.html":"index.html","Home","home")+
  link("member-info.html","Members","members")+link("rules.html","Rules","rules")+link("data.html","Data","data")+
  '<button type="button" class="public-more-button" aria-label="More">'+svg("menu")+'<span>More</span></button>';
 const more=mobileNav.querySelector(".public-more-button");
 more.addEventListener("click",()=>menu.click());
 document.querySelector(".shell")?.append(mobileNav);
}
function buildPublicDrawer(isAuthenticated,role,displayName){
 const shell=document.querySelector(".shell");if(!shell)return;
 const backdrop=document.createElement("div");backdrop.className="public-drawer-backdrop";backdrop.hidden=true;
 const drawer=document.createElement("aside");drawer.className="public-drawer";drawer.hidden=true;drawer.setAttribute("aria-label","Main menu");
 const links=isAuthenticated?[...(role==="super_admin"?[["admin.html","SUPER ADMIN","admin"]]:[]),["personal-due.html","PERSONAL DUE","due"],["proof.html","PROOF","proof"],["payment.html","PAYMENT","payment"],...(role==="member"?[["statement.html","MY STATEMENT","data"],["member.html","MY PROFILE","members"]]:[])]:[["login.html","LOGIN","profile"]];
 drawer.innerHTML='<div class="public-drawer-head"><a class="public-drawer-brand" href="dashboard.html">'+BRAND_LOGO_SVG+'<strong>'+String(displayName||"Friends Future Vision Forever").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</strong></a><button type="button" class="icon-button public-drawer-close" aria-label="Close menu">×</button></div><nav class="public-drawer-nav">'+links.map(([href,label,name])=>item(href,label,name)).join("")+'</nav><div class="public-drawer-footer"></div>';
 if(publicThemeButton)drawer.querySelector(".public-drawer-footer").append(publicThemeButton);
 if(isAuthenticated){const logout=document.createElement("button");logout.type="button";logout.className="secondary";logout.textContent="লগআউট";logout.addEventListener("click",async()=>{logout.disabled=true;const {error}=await supabase.auth.signOut();if(error){logout.disabled=false;logout.textContent="আবার চেষ্টা করুন"}else location.replace("login.html")});drawer.querySelector(".public-drawer-footer").append(logout);}
 shell.append(backdrop,drawer);
 const close=()=>{drawer.hidden=true;backdrop.hidden=true;menu?.setAttribute("aria-expanded","false")};
 const toggle=()=>{const open=drawer.hidden;close();drawer.hidden=!open;backdrop.hidden=!open;menu?.setAttribute("aria-expanded",String(!open))};
 menu?.addEventListener("click",toggle);backdrop.addEventListener("click",close);drawer.querySelector(".public-drawer-close").addEventListener("click",close);drawer.querySelectorAll("a").forEach(a=>a.addEventListener("click",close));nav.hidden=true;
}
async function loadPublicTicker(){
 if(!supabaseReady||document.querySelector(".public-global-ticker"))return;
 try{
  let message="";
  const {data,error}=await supabase.from("notices").select("title,body").eq("published",true).order("published_at",{ascending:false}).limit(1).maybeSingle();
  if(!error&&data)message=String(data.body||data.title||"").trim();
  if(!message){
   const fallback=await supabase.from("site_settings").select("setting_key,setting_value").in("setting_key",["ticker_message","ticker_enabled"]);
   if(!fallback.error){
    const settings=Object.fromEntries((fallback.data||[]).map(row=>[row.setting_key,row.setting_value]));
    if(settings.ticker_enabled!=="false")message=String(settings.ticker_message||"").trim();
   }
  }
  if(!message)return;
  const ticker=document.createElement("div");ticker.className="site-ticker public-global-ticker";ticker.setAttribute("role","region");ticker.setAttribute("aria-label","Latest notice");
  const label=document.createElement("strong");label.className="site-ticker-label";label.textContent="নোটিশ";
  const w=document.createElement("div");w.className="site-ticker-window";const t=document.createElement("span");t.textContent=message;t.className="notice-marquee-text";
  w.append(t);ticker.append(label,w);document.querySelector(".shell > .topbar")?.insertAdjacentElement("afterend",ticker);
 }catch(error){console.warn("Public notice unavailable",error)}
}
function showPublicNavigation(){
 setupPublicTheme();
 loadPublicTicker();
 home.href="index.html";
 nav.innerHTML=item("rules.html","RULES","rules");
 addPublicMobileNav(false);
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");
 buildPublicDrawer(false,"public","Friends Future Vision Forever");
 login.hidden=false;bell.hidden=true;
 document.body.classList.remove("auth-pending");
}
async function init(){
 document.body.classList.add("auth-pending");
 const brandSlot=document.getElementById("publicBrandLogo");if(brandSlot)brandSlot.innerHTML=BRAND_LOGO_SVG;
 if(!supabaseReady){showPublicNavigation();return}
 const {data:s,error}=await supabase.auth.getSession();
 const session=s?.session;
 if(error||!session?.user?.id){showPublicNavigation();return}
 const {data:profile,error:pe}=await supabase.from("profiles").select("role,full_name").eq("id",session.user.id).maybeSingle();
 if(pe||!profile||!["super_admin","member"].includes(profile.role)){await supabase.auth.signOut();location.replace("login.html");return}
 let displayName=profile.full_name||"";
 if(profile.role==="member"){
  const {data:member,error:memberError}=await supabase.from("members").select("full_name").eq("auth_user_id",session.user.id).maybeSingle();
  if(!memberError&&member?.full_name)displayName=member.full_name;
 }
 displayName=displayName||session.user.email?.split("@")[0]||"";
 const brand=document.querySelector(".topbar .brand");
 if(brand&&displayName){
  const safeName=displayName.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const initials=displayName.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toLocaleUpperCase("en-US");
  brand.innerHTML=BRAND_LOGO_SVG+'<div class="topbar-identity"><strong>'+safeName.toLocaleUpperCase("en-US")+'</strong><small>Friends Future Vision Forever</small></div>';
 }
 home.href="dashboard.html";
 setupPublicTheme();
 const role=profile.role;
 const links=[item("rules.html","RULES","rules"),item("member-info.html","MEMBER INFO","members"),item("data.html","DATA","data"),item("personal-due.html","PERSONAL DUE","due"),item("proof.html","PROOF","proof"),item("payment.html","PAYMENT","payment"),...(role==="super_admin"?[item("admin.html","SUPER ADMIN","admin")]:[]),...(role==="member"?[item("statement.html","MY STATEMENT","data"),item("member.html","MY PROFILE","members")]:[])];
 nav.innerHTML=links.join("");
 addPublicMobileNav(true);
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");
 buildPublicDrawer(true,role,displayName);
 login.hidden=true;bell.hidden=false;

 const {count}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",session.user.id).is("read_at",null);
 const badge=document.getElementById("siteUnread");if(count>0){badge.textContent=count>99?"99+":String(count);badge.hidden=false}
 bell.addEventListener("click",()=>location.href="dashboard.html");
 document.body.classList.remove("auth-pending");
 loadPublicTicker();
}
init().catch(()=>location.replace("login.html"));
