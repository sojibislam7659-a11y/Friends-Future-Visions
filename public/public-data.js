import { supabase, supabaseReady } from "./supabase-client.js";
const root=document.getElementById("publicData");
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
const monthLabel=v=>new Date(v+"-01T00:00:00").toLocaleDateString("bn-BD",{month:"long",year:"numeric"});
async function loadMemberMatrix(){
 const {data:sessionData}=await supabase.auth.getSession();
 const user=sessionData?.session?.user;if(!user)return;
 const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(profileError||!profile)return;
 if(!["super_admin","member"].includes(profile.role))return;
 let memberQuery=supabase.from("members").select("id,member_no,full_name,status").order("member_no");
 if(profile.role==="member")memberQuery=memberQuery.eq("auth_user_id",user.id);
 else memberQuery=memberQuery.eq("status","active");
 const {data:members,error:memberError}=await memberQuery;
 if(memberError||!members?.length)return;
 const {data:transactions,error:txError}=await supabase.from("financial_transactions").select("member_id,amount,transaction_date,created_at").in("member_id",members.map(m=>m.id)).eq("transaction_type","contribution").eq("direction","in").gte("transaction_date","2026-12-01").lt("transaction_date","2031-12-01");
 if(txError)return;
 const map={};(transactions||[]).forEach(tx=>{
  const month=String(tx.transaction_date).slice(0,7),key=tx.member_id+"|"+month;
  if(!map[key])map[key]={amount:0,latest:"",times:[]};
  map[key].amount+=Number(tx.amount||0);
  map[key].times.push(new Date(tx.created_at).toLocaleString("en-GB"));
  if(!map[key].latest||tx.created_at>map[key].latest)map[key].latest=tx.created_at;
 });
 const years=[2026,2027,2028,2029,2030,2031];
 const tables=years.map(year=>{
  const months=[];for(let m=0;m<12;m++){const d=new Date(year,m,1),key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");if(key>="2026-12"&&key<="2031-11")months.push(key)}
  if(!months.length)return "";
  const header=months.map(k=>'<th>'+esc(new Date(k+"-01T00:00:00").toLocaleDateString("en-GB",{month:"short"}))+'</th>').join("");
  const body=members.map(member=>{
   let h1=0,h2=0,total=0;
   const cells=months.map(k=>{
    const v=map[member.id+"|"+k];if(!v)return "<td>—</td>";
    const monthNo=Number(k.slice(5,7));if(monthNo<=6)h1+=v.amount;else h2+=v.amount;total+=v.amount;
    const tip=v.times.join(" | ");
    return '<td><span title="Confirmed: '+esc(tip)+'">'+money(v.amount)+'</span><small class="cell-date">'+esc(new Date(v.latest).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}))+'</small></td>';
   }).join("");
   const totalH1=months.some(k=>Number(k.slice(5,7))<=6)?money(h1):"—",totalH2=months.some(k=>Number(k.slice(5,7))>=7)?money(h2):"—";
   return '<tr><td class="sticky-col">'+esc(member.member_no||"—")+'</td><td class="sticky-col name-col">'+esc(member.full_name)+'</td>'+cells+'<td>'+totalH1+'</td><td>'+totalH2+'</td><td><strong>'+money(total)+'</strong></td></tr>';
  }).join("");
  const totals=months.map(k=>{const v=members.reduce((n,m)=>n+(map[m.id+"|"+k]?.amount||0),0);return '<td><strong>'+money(v)+'</strong></td>'}).join("");
  const all=members.reduce((n,m)=>n+months.reduce((z,k)=>z+(map[m.id+"|"+k]?.amount||0),0),0);
  const h1=members.reduce((n,m)=>n+months.reduce((z,k)=>z+(Number(k.slice(5,7))<=6?(map[m.id+"|"+k]?.amount||0):0),0),0);
  const h2=members.reduce((n,m)=>n+months.reduce((z,k)=>z+(Number(k.slice(5,7))>=7?(map[m.id+"|"+k]?.amount||0):0),0),0);
  return '<section class="section"><h2>'+year+' · Monthly contribution</h2><div class="table-wrap matrix-wrap"><table class="contribution-matrix"><thead><tr><th>Member No.</th><th>Member Name</th>'+header+'<th>Jan–Jun</th><th>Jul–Dec</th><th>Year Total</th></tr></thead><tbody>'+body+'<tr class="total-row"><td colspan="2">TOTAL</td>'+totals+'<td>'+money(h1)+'</td><td>'+money(h2)+'</td><td>'+money(all)+'</td></tr></tbody></table></div></section>';
 }).join("");
 root.insertAdjacentHTML("beforeend",'<section class="section"><h2>Member contribution matrix</h2><p class="lead">'+(profile.role==="super_admin"?"Super Admin view — all active members.":"আপনার নিজের জমার তথ্য। অন্য সদস্যের ব্যক্তিগত জমা এখানে দেখানো হয় না.")+'</p>'+tables+'</section>');
}

async function load(){
 if(!supabaseReady){root.innerHTML=empty("Data service configured নয়।");return}
 const {data:s,error}=await supabase.rpc("get_financial_summary");
 if(error){root.innerHTML='<div class="error">'+esc(error.message)+'</div>';return}
 const cards=[
  ["মোট সম্পদ",s.total_assets],["ব্যাংক ব্যালেন্স",s.bank_balance],["হাতে নগদ",s.cash_balance],
  ["মোট বিনিয়োগ",s.investment_balance],["সদস্যদের মোট জমা",s.total_contributions],
  ["মোট ব্যয়",s.total_expenses],["অন্যান্য আয় + বিনিয়োগ লাভ",Number(s.other_income||0)+Number(s.investment_profit||0)],
  ["লেনদেন সংখ্যা",s.transaction_count]
 ];
 const monthly=s.monthly_trend||[],half=s.half_yearly_trend||[];
 root.innerHTML='<div class="grid">'+cards.map(([label,value])=>'<article class="card"><div class="label">'+esc(label)+'</div><div class="value">'+(label==="লেনদেন সংখ্যা"?esc(value):money(value))+'</div></article>').join("")+'</div>'+
 '<section class="section"><h2>মাসভিত্তিক রিপোর্ট</h2>'+(monthly.length?'<div class="table-wrap"><table><thead><tr><th>মাস</th><th>জমা</th><th>ব্যয়</th><th>অন্যান্য আয় + লাভ</th><th>বিনিয়োগ ক্ষতি</th></tr></thead><tbody>'+monthly.map(r=>'<tr><td>'+esc(monthLabel(r.month))+'</td><td>'+money(r.contributions)+'</td><td>'+money(r.expenses)+'</td><td>'+money(r.income)+'</td><td>'+money(r.investment_loss)+'</td></tr>').join("")+'</tbody></table></div>':empty("এখনো কোনো লেনদেন নেই।"))+'</section>'+
 '<section class="section"><h2>অর্ধবার্ষিক রিপোর্ট</h2>'+(half.length?'<div class="table-wrap"><table><thead><tr><th>সময়কাল</th><th>জমা</th><th>ব্যয়</th><th>অন্যান্য আয় + লাভ</th><th>বিনিয়োগ ক্ষতি</th></tr></thead><tbody>'+half.map(r=>'<tr><td>'+esc(r.year+(r.half===1?" · জানুয়ারি–জুন":" · জুলাই–ডিসেম্বর"))+'</td><td>'+money(r.contributions)+'</td><td>'+money(r.expenses)+'</td><td>'+money(r.income)+'</td><td>'+money(r.investment_loss)+'</td></tr>').join("")+'</tbody></table></div>':empty("এখনো অর্ধবার্ষিক রিপোর্ট নেই।"))+'</section>'+
 '<div class="notice">এখানে শুধু সামগ্রিক হিসাব দেখানো হয়। সদস্যভিত্তিক জমা, বকেয়া, ফোন নম্বর বা ব্যক্তিগত তথ্য প্রকাশ করা হয় না। পুরোনো/প্রাথমিক ব্যালেন্স Super Admin এন্ট্রি না করা পর্যন্ত যোগ হবে না।</div>';
 await loadMemberMatrix();
}
load();