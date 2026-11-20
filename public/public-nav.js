import {supabase,supabaseReady} from "./supabase-client.js";
import { BRAND_LOGO_SVG } from "./brand-logo.js";
const home=document.getElementById("siteHome"),menu=document.getElementById("siteMenu"),nav=document.getElementById("siteNav"),bell=document.getElementById("siteBell"),login=document.getElementById("siteLogin");
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
 actions.insertBefore(button,menu);
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
  link("member-info.html","Members","members")+link("data.html","Data","data")+link("rules.html","Rules","rules")+
  '<button type="button" class="public-more-button" aria-label="More">'+svg("menu")+'<span>More</span></button>';
 const more=mobileNav.querySelector(".public-more-button");
 more.addEventListener("click",()=>menu.click());
 document.querySelector(".shell")?.append(mobileNav);
}
function showPublicNavigation(){
 setupPublicTheme();
 home.href="index.html";
 nav.innerHTML=item("rules.html","RULES","rules");
 const publicTheme=document.getElementById("publicThemeToggle");if(publicTheme)nav.append(publicTheme);
 addPublicMobileNav(false);
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");
 menu.addEventListener("click",()=>{nav.hidden=!nav.hidden;menu.setAttribute("aria-expanded",String(!nav.hidden))});
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
 const brandName=document.querySelector(".brand strong");
 if(brandName&&displayName)brandName.textContent=displayName.toLocaleUpperCase("en-US");
 home.href="dashboard.html";
 setupPublicTheme();
 const role=profile.role;
 const links=[item("rules.html","RULES","rules"),item("member-info.html","MEMBER INFO","members"),item("data.html","DATA","data"),item("personal-due.html","PERSONAL DUE","due"),item("proof.html","PROOF","proof"),item("payment.html","PAYMENT","payment"),...(role==="super_admin"?[item("admin.html","SUPER ADMIN","admin")]:[]),...(role==="member"?[item("statement.html","MY STATEMENT","data"),item("member.html","MY PROFILE","members")]:[])];
 nav.innerHTML=links.join("");
 const publicTheme=document.getElementById("publicThemeToggle");if(publicTheme)nav.append(publicTheme);
 addPublicMobileNav(true);
 menu.setAttribute("aria-expanded","false");menu.setAttribute("aria-controls","siteNav");menu.addEventListener("click",()=>{nav.hidden=!nav.hidden;menu.setAttribute("aria-expanded",String(!nav.hidden))});
 login.hidden=true;bell.hidden=false;

 const {count}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",session.user.id).is("read_at",null);
 const badge=document.getElementById("siteUnread");if(count>0){badge.textContent=count>99?"99+":String(count);badge.hidden=false}
 bell.addEventListener("click",()=>location.href="dashboard.html");
 document.body.classList.remove("auth-pending");
}
init().catch(()=>location.replace("login.html"));
