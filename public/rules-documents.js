import { supabase, supabaseReady } from "./supabase-client.js";
const root=document.getElementById("deedContent");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
async function load(){
 if(!supabaseReady){root.innerHTML=empty("Document service is unavailable.");return}
 const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!sessionData.session){root.innerHTML=empty("দলিল দেখতে সদস্য লগইন করুন।")+'<p><a class="button secondary" href="login.html">Login</a></p>';return}
 const user=sessionData.session.user;
 const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
 const isSuper=profile?.role==="super_admin";
 const {data:docs,error}=await supabase.from("committee_documents").select("id,title,storage_path,mime_type,created_at").eq("doc_type","deed").eq("is_current",true).limit(1);
 if(error){root.innerHTML=empty(error.message);return}
 let content=empty("দলিল এখনো আপলোড করা হয়নি।");
 if(docs?.length){
  const d=docs[0],{data:u,error:urlError}=await supabase.storage.from("committee-documents").createSignedUrl(d.storage_path,1800);
  if(!urlError&&u?.signedUrl){
   content=d.mime_type==="application/pdf"?'<iframe class="deed-pdf" src="'+esc(u.signedUrl)+'" title="Committee deed PDF"></iframe><p><a class="button secondary" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">Open PDF</a></p>':'<div class="deed-image-tools"><button class="secondary" id="zoomOut" type="button">−</button><button class="secondary" id="zoomReset" type="button">Reset</button><button class="secondary" id="zoomIn" type="button">+</button></div><div class="deed-image-frame"><img id="deedImage" src="'+esc(u.signedUrl)+'" alt="Committee deed" loading="lazy"></div>';
  }
 }
 root.innerHTML=content+(isSuper?'<form id="deedUploadForm" class="section"><h3>Upload / Replace deed</h3><div class="form-grid"><div class="field"><label>Title</label><input name="title" value="Committee deed" required></div><div class="field"><label>Image max 5MB · PDF max 10MB</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div></div><button type="submit">Upload deed</button></form>':"");
 const image=document.getElementById("deedImage");
 if(image){let scale=1;document.getElementById("zoomIn").onclick=()=>{scale=Math.min(2.5,scale+.2);image.style.transform="scale("+scale+")"};document.getElementById("zoomOut").onclick=()=>{scale=Math.max(.6,scale-.2);image.style.transform="scale("+scale+")"};document.getElementById("zoomReset").onclick=()=>{scale=1;image.style.transform="scale(1)"}}
 const form=document.getElementById("deedUploadForm");
 if(form)form.addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(form),file=fd.get("file"),title=String(fd.get("title")||"").trim();
  if(!file?.size||!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)||(file.type==="application/pdf"?file.size>10*1024*1024:file.size>5*1024*1024)){alert("PDF/JPG/PNG/WEBP ফাইল সর্বোচ্চ 10MB হতে হবে।");return}
  const ext=(file.name.split(".").pop()||"pdf").toLowerCase(),path="deed/"+crypto.randomUUID()+"."+ext;
  const {error:upError}=await supabase.storage.from("committee-documents").upload(path,file,{upsert:false,contentType:file.type});
  if(upError){alert(upError.message);return}
  const {data:row,error:rowError}=await supabase.from("committee_documents").insert({doc_type:"deed",title,storage_path:path,mime_type:file.type,is_current:false,uploaded_by:user.id}).select("id").single();
  if(rowError){await supabase.storage.from("committee-documents").remove([path]);alert(rowError.message);return}
  const {error:publishError}=await supabase.rpc("set_current_committee_document",{p_document_id:row.id});
  if(publishError){alert(publishError.message);return}
  alert("নতুন দলিল প্রকাশ হয়েছে।");load();
 });
}
load();
