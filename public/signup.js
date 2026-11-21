import { BRAND_LOGO_SVG } from "./brand-logo.js";
document.getElementById("signupBrandLogo").innerHTML = BRAND_LOGO_SVG;
import "./password-visibility.js";
import {supabase,supabaseReady} from "./supabase-client.js";
const form=document.getElementById("signupForm"),button=document.getElementById("signupButton"),message=document.getElementById("message");
const show=(text)=>{message.textContent=text;message.style.display="block"};
form.addEventListener("submit",async event=>{
 event.preventDefault();
 if(!supabaseReady){show("Login service এখন প্রস্তুত নয়। পরে আবার চেষ্টা করুন।");return}
 const fullName=document.getElementById("fullName").value.trim();
 const email=document.getElementById("email").value.trim().toLowerCase();
 const password=document.getElementById("password").value;
 const confirmation=document.getElementById("confirmPassword").value;
 if(password.length<12){show("পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।");return}
 if(password!==confirmation){show("দুটি পাসওয়ার্ড এক নয়।");return}
 button.disabled=true;button.textContent="অ্যাকাউন্ট তৈরি হচ্ছে…";message.style.display="none";
 const {data,error}=await supabase.auth.signUp({
  email,password,
  options:{data:{full_name:fullName},emailRedirectTo:new URL("login.html",location.href).href}
 });
 if(error){show("অ্যাকাউন্ট তৈরি করা যায়নি। ইমেইলটি আগে ব্যবহার করা হয়েছে কি না বা তথ্য ঠিক আছে কি না পরীক্ষা করুন।")}
 else{
  if(data.session)await supabase.auth.signOut();
  show("অ্যাকাউন্টের আবেদন তৈরি হয়েছে। আপনার ইমেইলে verification link পাঠানো হয়েছে (যদি Email Confirmation চালু থাকে)। ইমেইল যাচাইয়ের পর Super Admin অনুমোদন করলে Login করতে পারবেন।");
  form.reset();
 }
 button.disabled=false;button.textContent="অ্যাকাউন্ট তৈরি করুন";
});
