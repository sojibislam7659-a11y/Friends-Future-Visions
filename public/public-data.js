import { supabase, supabaseReady } from "./supabase-client.js";
const root=document.getElementById("publicData");
const money=n=>"৳"+Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=m=>'<div class="empty">'+esc(m)+'</div>';
const monthLabel=v=>new Date(v+"-01T00:00:00").toLocaleDateString("bn-BD",{month:"long",year:"numeric"});
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
}
load();