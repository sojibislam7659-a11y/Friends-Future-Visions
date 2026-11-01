import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";
import { enablePush } from "./push.js";

const root=document.getElementById("app");
const page=document.body.dataset.page||"dashboard";
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText=v=>v?new Date(v+"T00:00:00").toLocaleDateString("en-GB"):"—";
const monthText=v=>v?new Date(v+"-01T00:00:00").toLocaleDateString("bn-BD",{month:"long",year:"numeric"}):"—";
const today=()=>new Date().toISOString().slice(0,10);
let access=null,lang="bn";
const t=(bn,en)=>lang==="bn"?bn:en;
function toast(message){let n=document.createElement("div");n.className="toast";n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),4200)}
function setPage(html){document.getElementById("pageContent").innerHTML=html}
function card(label,value,sub=""){return '<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+esc(value)+'</div><small>'+esc(sub)+'</small></article>'}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>'}
function navItem(href,label){return '<a href="'+href+'" '+(page===href.replace(".html","")?'class="active"':'')+'>'+label+'</a>'}
function shell(){
 const isSuper=access.role==="super_admin";
 root.innerHTML='<div class="shell"><header class="topbar"><div class="brand"><img src="friends-future-vision-logo.svg" alt="Friends Future Vision Forever"><div><strong>ফ্রেন্ডস ফিউচার ভিশন ফরএভার</strong><small>Friends Future Vision Forever</small></div></div><div class="actions"><span class="role">'+(isSuper?"Super Admin":access.role==="admin"?"Admin · View only":"Member · View only")+'</span><button class="secondary" id="languageBtn">English</button><button class="secondary" id="logoutBtn">লগআউট</button></div></header><nav class="nav">'+navItem("dashboard.html","Dashboard")+navItem("rules.html","Rules")+navItem("member-info.html","Member Info")+navItem("data.html","Data")+navItem("personal-due.html","Personal Due")+navItem("proof.html","Proof")+(isSuper?navItem("admin.html","Super Admin"):"")+(access.role==="member"?navItem("member.html","My Profile"):"")+'</nav><main class="page" id="pageContent"><div class="empty">তথ্য লোড হচ্ছে…</div></main><footer class="footer">Friends Future Vision Forever · Secure member portal</footer></div>';
 document.getElementById("logoutBtn").addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)toast(error.message);else location.replace("login.html")});
 document.getElementById("languageBtn").addEventListener("click",()=>{lang=lang==="bn"?"en":"bn";document.documentElement.lang=lang;document.getElementById("languageBtn").textContent=lang==="bn"?"English":"বাংলা";renderPage()});
}
async function summary(){
 const {data,error}=await supabase.rpc("get_financial_summary");
 if(error)throw error;
 return data||{};
}
async function renderDashboard(){
 const s=await summary();
 setPage('<h1>'+t("সামগ্রিক ড্যাশবোর্ড","Committee Dashboard")+'</h1><p class="lead">'+t("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ। সদস্যদের ব্যক্তিগত তথ্য এখানে প্রকাশ করা হয় না।","Verified committee-wide financial summary. Individual member details are not shown here.")+'</p><div class="grid">'+
 card(t("মোট সম্পদ","Total assets"),money(s.total_assets),t("নগদ + ব্যাংক + বিনিয়োগ","Cash + bank + investments"))+
 card(t("ব্যাংক ব্যালেন্স","Bank balance"),money(s.bank_balance))+
 card(t("হাতে নগদ","Cash in hand"),money(s.cash_balance))+
 card(t("মোট বিনিয়োগ","Investment balance"),money(s.investment_balance))+
 card(t("সদস্যদের মোট জমা","Member contributions"),money(s.total_contributions))+
 card(t("মোট ব্যয়","Total expenses"),money(s.total_expenses))+
 card(t("অন্যান্য আয় + বিনিয়োগ লাভ","Other income + investment profit"),money(Number(s.other_income||0)+Number(s.investment_profit||0)))+
 card(t("লেনদেন সংখ্যা","Transactions"),String(s.transaction_count||0),s.last_updated?t("সর্বশেষ আপডেট: ","Last updated: ")+new Date(s.last_updated).toLocaleString():"")
 )+'</div><div class="notice">'+t("এই হিসাব Database-এর লেনদেন থেকে তৈরি। এখনো কোনো লেনদেন না থাকলে শূন্য দেখাবে; পুরোনো বা প্রাথমিক ব্যালেন্স Super Admin এন্ট্রি না করা পর্যন্ত এখানে যোগ হবে না।","Figures are calculated from database transactions. Zero means no ledger entries have been recorded; historical or opening balances must be entered by the Super Admin.")+'</div><section class="section"><div class="section-head"><h2>'+t("সাম্প্রতিক নোটিশ","Recent notices")+'</h2><span class="pill">'+t("লগইন করা সদস্যদের জন্য","For signed-in users")+'</span></div><div id="noticeList" class="list">'+empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))+'</div></section><section class="section"><h2>'+t("আপনার নোটিফিকেশন","Your notifications")+'</h2><div id="inboxList" class="list">'+empty(t("কোনো নোটিফিকেশন নেই।","No notifications."))+'</div></section><div class="notice">'+t("নোটিফিকেশনের বিস্তারিত দেখতে লগইন করো। Push alert শুধু সাধারণ বার্তা দেখাবে।","Sign in to view notification details. Push alerts display only a generic message.")+'</div><div class="form-actions"><button class="secondary" id="enablePush">এই ডিভাইসে Push চালু করুন</button></div>');
 document.getElementById("enablePush").addEventListener("click",async()=>{try{await enablePush(supabase,access.session.user.id);toast("এই ডিভাইসে Push চালু হয়েছে।")}catch(e){toast(e.message||"Push চালু করা যায়নি।")}});
 const [notices,inbox]=await Promise.all([
  supabase.from("notices").select("id,title,body,notice_type,meeting_at,published_at").eq("published",true).order("published_at",{ascending:false}).limit(8),
  supabase.from("notifications").select("id,title,body,notification_type,created_at,read_at").eq("user_id",access.session.user.id).order("created_at",{ascending:false}).limit(10)
 ]);
 if(!notices.error){document.getElementById("noticeList").innerHTML=notices.data.length?notices.data.map(n=>'<article class="list-item"><strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p><small>'+esc(n.notice_type==="meeting"&&n.meeting_at?new Date(n.meeting_at).toLocaleString():new Date(n.published_at).toLocaleString())+'</small></article>').join(""):empty(t("কোনো প্রকাশিত নোটিশ নেই।","No published notices."))}
 if(!inbox.error){document.getElementById("inboxList").innerHTML=inbox.data.length?inbox.data.map(n=>'<article class="list-item"><div class="row"><strong>'+esc(n.title)+'</strong>'+(n.read_at?'<span class="pill">Read</span>':'<span class="pill">New</span>')+'</div><p>'+esc(n.body)+'</p><small>'+esc(new Date(n.created_at).toLocaleString())+'</small>'+(n.read_at?"":' <button class="secondary mark-read" data-id="'+esc(n.id)+'">পড়া হয়েছে</button>')+'</article>').join(""):empty(t("কোনো নোটিফিকেশন নেই।","No notifications."));document.querySelectorAll(".mark-read").forEach(b=>b.addEventListener("click",async()=>{const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",b.dataset.id);if(error)toast(error.message);else renderDashboard()}))}
}
async function renderData(){
 const s=await summary();
 const rows=s.monthly_trend||[];
 setPage('<h1>'+t("কমিটির আর্থিক তথ্য","Committee financial data")+'</h1><p class="lead">'+t("সবার জন্য প্রকাশযোগ্য সামগ্রিক হিসাব। ব্যক্তিগত জমা ও বকেয়া এখানে দেখানো হয় না।","Committee-wide figures only. Personal deposits and dues are not shown here.")+'</p><div class="grid">'+
 card(t("মোট সম্পদ","Total assets"),money(s.total_assets))+
 card(t("মোট জমা","Total contributions"),money(s.total_contributions))+
 card(t("ব্যয়","Expenses"),money(s.total_expenses))+
 card(t("নিট পরিচালন ফল","Net operating result"),money(s.net_operating_result))+'</div><section class="section"><h2>'+t("মাসভিত্তিক রিপোর্ট","Monthly report")+'</h2>'+ (rows.length?'<div class="table-wrap"><table><thead><tr><th>Month</th><th>Contributions</th><th>Expenses</th><th>Other income + profit</th><th>Investment loss</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(monthText(r.month))+'</td><td>'+money(r.contributions)+'</td><td>'+money(r.expenses)+'</td><td>'+money(r.income)+'</td><td>'+money(r.investment_loss)+'</td></tr>').join("")+'</tbody></table></div>':empty(t("এখনো কোনো আর্থিক লেনদেন নেই। Super Admin প্রথম লেনদেন যোগ করলে মাসিক রিপোর্ট তৈরি হবে।","No financial transactions yet. Monthly reports will appear after the Super Admin records transactions.")))+'</section><div class="notice">'+t("কোনো Demo বা অনুমানভিত্তিক অঙ্ক ব্যবহার করা হচ্ছে না।","No demo or estimated amounts are used.")+'</div>');
}
function monthCount(start){
 if(!start)return 0;
 const a=new Date(start+"T00:00:00"),b=new Date();
 return Math.max(0,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1);
}
async function renderDue(){
 let q=supabase.from("members").select("id,member_no,full_name,monthly_contribution,contribution_start_date,joined_at,status");
 if(access.role==="member")q=q.eq("auth_user_id",access.session.user.id);
 const {data:members,error}=await q.order("member_no");
 if(error)throw error;
 if(access.role==="admin"){setPage('<h1>Personal Due</h1>'+empty(t("এই Admin অ্যাকাউন্টের সঙ্গে কোনো সদস্য রেকর্ড যুক্ত নেই।","This read-only Admin account is not linked to a member record.")));return}
 if(!members.length){setPage('<h1>Personal Due</h1>'+empty(t("এই লগইন অ্যাকাউন্টের সঙ্গে কোনো সদস্য রেকর্ড যুক্ত নেই। Super Admin-কে অ্যাকাউন্ট লিংক করতে হবে।","No member record is linked to this login. The Super Admin must link the account.")));return}
 const ids=members.map(m=>m.id);
 const tx=await supabase.from("financial_transactions").select("member_id,transaction_type,amount,transaction_date").in("member_id",ids).eq("transaction_type","contribution").eq("direction","in");
 if(tx.error)throw tx.error;
 const paid={};(tx.data||[]).forEach(x=>paid[x.member_id]=(paid[x.member_id]||0)+Number(x.amount));
 const body=members.map(m=>{
  const start=m.contribution_start_date;
  const months=monthCount(start);
  const configured=m.monthly_contribution!==null&&start;
  const expected=configured?months*Number(m.monthly_contribution):null;
  const received=paid[m.id]||0;
  const due=configured?Math.max(0,expected-received):null;
  return '<tr><td>'+esc(m.member_no||"—")+'</td><td>'+esc(m.full_name)+'</td><td>'+esc(configured?money(m.monthly_contribution):"Not configured")+'</td><td>'+esc(configured?String(months):"—")+'</td><td>'+money(received)+'</td><td><strong>'+esc(configured?money(due):"—")+'</strong></td></tr>'
 }).join("");
 setPage('<h1>'+t("ব্যক্তিগত জমা ও বকেয়া","Personal deposits and dues")+'</h1><p class="lead">'+(access.role==="super_admin"?t("Super Admin সব সদস্যের হিসাব দেখতে পারবেন।","Super Admin view of all members."):t("শুধু তোমার নিজের হিসাব এখানে দেখানো হবে।","Only your own account is shown here."))+'</p><div class="table-wrap"><table><thead><tr><th>Member ID</th><th>Name</th><th>Monthly amount</th><th>Months due</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>'+body+'</tbody></table></div><div class="notice">'+t("বকেয়া হিসাবের জন্য প্রত্যেক সদস্যের Monthly contribution ও Contribution start date Super Admin-কে সেট করতে হবে। এগুলো না থাকলে বকেয়া গণনা করা হবে না।","The Super Admin must configure each member’s monthly contribution and start date before dues can be calculated.")+'</div>');
}
async function renderMembers(){
 const {data,error}=await supabase.from("member_directory").select("member_id,member_no,full_name,full_name_bn,profile_photo_path").order("member_no");
 if(error)throw error;
 if(!data.length){setPage('<h1>Member Info</h1>'+empty(t("এখনো কোনো Active member নেই।","No active members yet.")));return}
 const cards=await Promise.all(data.map(async m=>{
  let photo="";
  if(m.profile_photo_path){const {data:u}=await supabase.storage.from("member-profile-photos").createSignedUrl(m.profile_photo_path,3600);if(u?.signedUrl)photo='<img src="'+esc(u.signedUrl)+'" alt="">'}
  return '<article class="person">'+(photo||'<div class="avatar">FF</div>')+'<strong>'+esc(lang==="bn"?(m.full_name_bn||m.full_name):m.full_name)+'</strong><small>'+esc(m.member_no||"")+'</small></article>'
 }));
 setPage('<h1>'+t("সদস্য পরিচিতি","Member directory")+'</h1><p class="lead">'+t("শুধু সদস্যের নাম, সদস্য নম্বর ও অনুমোদিত ছবি দেখা যাবে। ব্যক্তিগত তথ্য গোপন থাকবে।","Only member names, IDs and approved photos are shown. Personal details remain private.")+'</p><div class="members-grid">'+cards.join("")+'</div>');
}
async function renderProofs(){
 const {data,error}=await supabase.from("committee_proofs").select("id,proof_month,title,storage_path,note,created_at").eq("published",true).order("proof_month",{ascending:false});
 if(error)throw error;
 const rows=await Promise.all((data||[]).map(async p=>{
  const {data:u}=await supabase.storage.from("committee-proofs").createSignedUrl(p.storage_path,3600);
  const link=u?.signedUrl?'<a class="button secondary" href="'+esc(u.signedUrl)+'" target="_blank" rel="noopener">প্রমাণ দেখুন</a>':"";
  return '<article class="list-item"><div class="row"><strong>'+esc(p.title)+'</strong><span class="pill">'+esc(monthText(p.proof_month.slice(0,7)))+'</span></div><p>'+esc(p.note||"")+'</p>'+link+'</article>'
 }));
 setPage('<h1>'+t("মাসিক জমা ও বিনিয়োগের প্রমাণ","Monthly deposit and investment proofs")+'</h1><p class="lead">'+t("প্রতি মাসের সামগ্রিক ব্যাংক জমা বা বিনিয়োগের রসিদ এখানে থাকবে। সদস্যরা শুধু দেখতে পারবেন।","Monthly committee-wide bank deposit or investment receipts. Members have view-only access.")+'</p>'+(rows.length?'<div class="list">'+rows.join("")+'</div>':empty(t("এখনো কোনো প্রমাণপত্র আপলোড করা হয়নি।","No proof documents have been uploaded yet."))));
}
async function renderProfile(){
 const {data:m,error}=await supabase.from("members").select("*").eq("auth_user_id",access.session.user.id).maybeSingle();
 if(error)throw error;
 if(!m){setPage('<h1>My Profile</h1>'+empty(t("এই অ্যাকাউন্টের সঙ্গে কোনো সদস্য প্রোফাইল যুক্ত নেই। Super Admin-কে তোমার Auth account-এর সঙ্গে Member record link করতে হবে।","No member profile is linked to this account. The Super Admin must link your Auth account to your member record.")));return}
 const fields=[["full_name","নাম"],["full_name_bn","বাংলা নাম"],["phone","মোবাইল"],["email","ইমেইল"],["profession","পেশা"],["present_address","বর্তমান ঠিকানা"],["permanent_address","স্থায়ী ঠিকানা"],["emergency_contact_name","জরুরি যোগাযোগের নাম"],["emergency_contact_phone","জরুরি যোগাযোগের নম্বর"],["nominee_name","নমিনির নাম"],["nominee_phone","নমিনির নম্বর"]];
 const inputs=fields.map(([key,label])=>'<div class="field"><label>'+label+'</label><input name="'+key+'" value="'+esc(m[key]||"")+'"></div>').join("");
 const requests=await supabase.from("profile_change_requests").select("id,status,created_at,admin_note").eq("submitted_by",access.session.user.id).order("created_at",{ascending:false}).limit(10);
 setPage('<h1>My Profile</h1><p class="lead">'+t("তথ্য পরিবর্তনের অনুরোধ Super Admin অনুমোদন না করা পর্যন্ত মূল প্রোফাইলে পরিবর্তন হবে না।","Changes remain pending until approved by the Super Admin.")+'</p><div class="grid">'+card("Member ID",m.member_no||"—")+card("Status",m.status)+card("Monthly contribution",m.monthly_contribution?money(m.monthly_contribution):"Not configured")+'</div><form id="profileRequest"><div class="form-grid">'+inputs+'</div><div class="field" style="margin-top:12px"><label>প্রোফাইল ছবি (JPG, PNG, WEBP · সর্বোচ্চ 5MB)</label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></div><div class="form-actions"><button type="submit">পরিবর্তনের অনুরোধ পাঠান</button></div></form><section class="section"><h2>তোমার আগের অনুরোধ</h2><div class="list">'+((requests.data||[]).map(r=>'<article class="list-item"><strong>'+esc(r.status)+'</strong><small>'+esc(new Date(r.created_at).toLocaleString())+'</small><p>'+esc(r.admin_note||"")+'</p></article>').join("")||empty("কোনো অনুরোধ নেই।"))+'</div></section>');
 document.getElementById("profileRequest").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.currentTarget;const fd=new FormData(f);const changes={};
  fields.forEach(([k])=>{const v=String(fd.get(k)||"").trim();if(v!==(m[k]||""))changes[k]=v});
  let photoPath=null;const file=fd.get("photo");
  if(file&&file.size){if(file.size>5*1024*1024){toast("ছবির আকার 5MB-এর বেশি।");return}const ext=(file.name.split(".").pop()||"jpg").toLowerCase();photoPath=access.session.user.id+"/"+crypto.randomUUID()+"."+ext;const {error:upErr}=await supabase.storage.from("member-profile-photos").upload(photoPath,file,{upsert:false,contentType:file.type});if(upErr){toast(upErr.message);return}}
  if(!Object.keys(changes).length&&!photoPath){toast("কোনো পরিবর্তন পাওয়া যায়নি।");return}
  const {error:insErr}=await supabase.from("profile_change_requests").insert({member_id:m.id,submitted_by:access.session.user.id,requested_changes:changes,requested_photo_path:photoPath});
  if(insErr){toast(insErr.message);return}toast("অনুরোধ জমা হয়েছে। Super Admin অনুমোদনের অপেক্ষায় আছে।");renderProfile();
 });
}
async function renderAdmin(){
 if(access.role!=="super_admin"){setPage('<h1>Super Admin</h1>'+empty("এই পেজে শুধু Super Admin প্রবেশ করতে পারবেন।"));return}
 setPage('<h1>Super Admin Control Panel</h1><p class="lead">সব কমিটি ডেটা, আর্থিক লেনদেন, সদস্য, প্রমাণপত্র ও নোটিশ এখান থেকে নিয়ন্ত্রণ করো।</p><div class="notice">শুধু যাচাইকৃত তথ্য এন্ট্রি করবে। Opening balance, monthly contribution ও start date না দেওয়া পর্যন্ত সেগুলো শূন্য/অনির্ধারিত থাকবে।</div><section class="section"><h2>নতুন সদস্য যোগ</h2><form id="memberForm"><div class="form-grid"><div class="field"><label>Member ID</label><input name="member_no" placeholder="যেমন M-003"></div><div class="field"><label>পূর্ণ নাম *</label><input name="full_name" required></div><div class="field"><label>বাংলা নাম</label><input name="full_name_bn"></div><div class="field"><label>মোবাইল</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>মাসিক জমা (৳)</label><input name="monthly_contribution" type="number" min="0" step=".01"></div><div class="field"><label>জমা শুরু</label><input name="contribution_start_date" type="date"></div></div><div class="form-actions"><button type="submit">সদস্য যোগ করো</button></div></form><p class="muted small">Member login তৈরি করতে Auth account invite ও UID linking আলাদা নিরাপদ ধাপ। এখানে কোনো password বা service-role key রাখা হয় না।</p></section><section class="section"><h2>নতুন আর্থিক লেনদেন</h2><form id="transactionForm"><div class="form-grid"><div class="field"><label>লেনদেনের ধরন</label><select name="type"><option value="opening_balance">Opening balance</option><option value="contribution">Member contribution</option><option value="withdrawal">Withdrawal</option><option value="expense">Expense</option><option value="other_income">Other income</option><option value="investment_profit">Investment profit</option><option value="investment_loss">Investment loss</option><option value="transfer">Account transfer</option></select></div><div class="field"><label>Amount (৳)</label><input name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>তারিখ</label><input name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Account</label><select name="account"><option value="cash">Cash</option><option value="bank">Bank</option><option value="investment">Investment</option></select></div><div class="field"><label>Transfer destination (transfer হলে)</label><select name="destination"><option value="bank">Bank</option><option value="cash">Cash</option><option value="investment">Investment</option></select></div><div class="field"><label>সদস্য (ঐচ্ছিক; Contribution-এ বাধ্যতামূলক)</label><select name="member_id" id="transactionMember"><option value="">Select member</option></select></div><div class="field"><label>বিবরণ</label><input name="description" required></div><div class="field"><label>Reference No</label><input name="reference_no"></div></div><div class="form-actions"><button type="submit">লেনদেন সংরক্ষণ</button></div></form></section><section class="section"><h2>মাসিক প্রমাণপত্র আপলোড</h2><form id="proofForm"><div class="form-grid"><div class="field"><label>মাস</label><input name="month" type="month" required></div><div class="field"><label>শিরোনাম</label><input name="title" required placeholder="Bank deposit receipt"></div><div class="field"><label>ছবি বা PDF</label><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div><div class="field"><label>নোট</label><input name="note"></div></div><div class="form-actions"><button type="submit">প্রমাণপত্র প্রকাশ</button></div></form></section><section class="section"><h2>নোটিশ প্রকাশ</h2><form id="noticeForm"><div class="form-grid"><div class="field"><label>শিরোনাম</label><input name="title" required maxlength="180"></div><div class="field"><label>ধরন</label><select name="type"><option value="general">সাধারণ</option><option value="meeting">সভা</option><option value="reminder">স্মরণবার্তা</option></select></div><div class="field"><label>সভা হলে তারিখ ও সময়</label><input name="meeting_at" type="datetime-local"></div></div><div class="field" style="margin-top:12px"><label>বিস্তারিত</label><textarea name="body" required maxlength="5000"></textarea></div><div class="form-actions"><button type="submit">সবার জন্য প্রকাশ</button></div></form></section><section class="section"><h2>Pending profile changes</h2><div id="pendingRequests" class="list">'+empty("লোড হচ্ছে…")+'</div></section><section class="section"><h2>সদস্য তালিকা</h2><div id="adminMembers" class="table-wrap"></div></section><section class="section"><h2>সাম্প্রতিক লেনদেন</h2><div id="adminTransactions" class="table-wrap"></div></section>');
 const {data:members,error:mErr}=await supabase.from("members").select("id,member_no,full_name,status,monthly_contribution,contribution_start_date,auth_user_id").order("member_no");
 if(mErr)throw mErr;
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
 document.getElementById("memberForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget);const amount=d.get("monthly_contribution");const payload={member_no:String(d.get("member_no")||"").trim()||null,full_name:String(d.get("full_name")).trim(),full_name_bn:String(d.get("full_name_bn")||"").trim()||null,phone:String(d.get("phone")||"").trim()||null,email:String(d.get("email")||"").trim()||null,status:"active",monthly_contribution:amount?Number(amount):null,contribution_start_date:d.get("contribution_start_date")||null};const {error}=await supabase.from("members").insert(payload);if(error)toast(error.message);else{toast("সদস্য যোগ হয়েছে।");renderAdmin()}});
 document.getElementById("transactionForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),type=d.get("type"),amount=Number(d.get("amount")),account=d.get("account"),date=d.get("date"),memberId=d.get("member_id")||null,desc=String(d.get("description")||"").trim();if(!(amount>0)){toast("Amount অবশ্যই 0-এর বেশি হতে হবে।");return}if(type==="contribution"&&!memberId){toast("Contribution-এর জন্য সদস্য নির্বাচন করো।");return}let payload;if(type==="transfer"){const destination=d.get("destination");if(account===destination){toast("Source ও destination account আলাদা হতে হবে।");return}const group=crypto.randomUUID();payload=[{transaction_type:"transfer",account_type:account,direction:"out",amount,transaction_date:date,description:desc,reference_no:d.get("reference_no")||null,transfer_group_id:group,created_by:access.session.user.id},{transaction_type:"transfer",account_type:destination,direction:"in",amount,transaction_date:date,description:desc,reference_no:d.get("reference_no")||null,transfer_group_id:group,created_by:access.session.user.id}]}else{const direction=["withdrawal","expense","investment_loss"].includes(type)?"out":"in";payload={transaction_type:type,account_type:account,direction,amount,transaction_date:date,member_id:memberId,description:desc,reference_no:d.get("reference_no")||null,created_by:access.session.user.id}}const {error}=await supabase.from("financial_transactions").insert(payload);if(error)toast(error.message);else{toast("লেনদেন সংরক্ষিত হয়েছে।");renderAdmin()}});
 document.getElementById("proofForm").addEventListener("submit",async e=>{e.preventDefault();const d=new FormData(e.currentTarget),file=d.get("file"),month=d.get("month");if(!file?.size){toast("ফাইল নির্বাচন করো।");return}const path=month+"/"+crypto.randomUUID()+"-"+file.name;const {error:up}=await supabase.storage.from("committee-proofs").upload(path,file,{upsert:false,contentType:file.type});if(up){toast(up.message);return}const {error}=await supabase.from("committee_proofs").insert({proof_month:month+"-01",title:d.get("title"),storage_path:path,note:d.get("note")||null,published:true,uploaded_by:access.session.user.id});if(error)toast(error.message);else{toast("প্রমাণপত্র প্রকাশ হয়েছে।");renderAdmin()}});
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
  else if(page==="payment")setPage('<h1>Payment</h1>'+empty("Member payment submission is disabled. The Super Admin records all payments directly in the committee ledger."));
 }catch(error){console.error(error);setPage('<h1>তথ্য লোড করা যায়নি</h1><div class="error">'+esc(error.message||"Unknown error")+'</div><p class="muted">Supabase connection, permissions and table setup পরীক্ষা করো।</p>')}
}
access=await requireRole(page==="admin"?["super_admin"]:["super_admin","admin","member"]);
if(access){shell();await renderPage();if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker registration failed",e))}}
