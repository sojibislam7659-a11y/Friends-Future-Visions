import {supabase,supabaseReady} from "./supabase-client.js";
const home=document.getElementById("siteHome"),menu=document.getElementById("siteMenu"),nav=document.getElementById("siteNav"),bell=document.getElementById("siteBell"),login=document.getElementById("siteLogin");
const icon={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',rules:'<path d="M7 3h10l3 3v15H7zM17 3v4h4M10 11h7M10 15h7"/>',members:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>',data:'<path d="M4 19V5M4 19h17M8 15l4-4 3 2 5-7"/>',due:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',proof:'<path d="M7 3h8l4 4v14H7zM15 3v5h5"/>',payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',admin:'<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/>'};
const svg=n=>'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icon[n]+'</svg>';
const item=(href,label,n)=>'<a href="'+href+'">'+svg(n)+'<span>'+label+'</span></a>';
async function init(){
 document.body.classList.add("auth-pending");
 if(!supabaseReady){location.replace("login.html");return}
 const {data:s,error}=await supabase.auth.getSession();
 const session=s?.session;
 if(error||!session?.user?.id){location.replace("login.html");return}
 const {data:profile,error:pe}=await supabase.from("profiles").select("role").eq("id",session.user.id).maybeSingle();
 if(pe||!profile||!["super_admin","admin","member"].includes(profile.role)){await supabase.auth.signOut();location.replace("login.html");return}
 home.href="dashboard.html";
 const role=profile.role;
 const links=[item("rules.html","RULES","rules"),item("member-info.html","MEMBER INFO","members"),item("data.html","DATA","data"),item("personal-due.html","PERSONAL DUE","due"),item("proof.html","PROOF","proof"),item("payment.html","PAYMENT","payment"),...(role==="super_admin"?[item("admin.html","SUPER ADMIN","admin")]:[]),...(role==="member"?[item("member.html","MY PROFILE","members")]:[])];
 nav.innerHTML=links.join("");
 menu.addEventListener("click",()=>{nav.hidden=!nav.hidden});
 login.hidden=true;bell.hidden=false;
 const {count}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",session.user.id).is("read_at",null);
 const badge=document.getElementById("siteUnread");if(count>0){badge.textContent=count>99?"99+":String(count);badge.hidden=false}
 bell.addEventListener("click",()=>location.href="dashboard.html");
 document.body.classList.remove("auth-pending");
}
init().catch(()=>location.replace("login.html"));
