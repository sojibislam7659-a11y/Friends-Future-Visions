import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth-guard.js";
import { BRAND_LOGO_SVG } from "./brand-logo.js";
import { installPwa } from "./pwa.js";

const root = document.getElementById("statementApp");
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
const money = value => "৳" + Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = value => value ? new Date(value + "T00:00:00").toLocaleDateString("en-GB") : "—";
const monthLabel = value => value ? new Date(value + "-01T00:00:00").toLocaleDateString("bn-BD", { month: "long", year: "numeric" }) : "—";

function dhakaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value || "2027";
  const month = parts.find(part => part.type === "month")?.value || "01";
  return year + "-" + month;
}

function currentMonthRows(rows, currentMonth) {
  return rows.filter(row => {
    const month = String(row.contribution_month || "").slice(0, 7);
    return month >= "2027-01" && month < "2032-01" && (month <= currentMonth || Number(row.amount || 0) > 0);
  });
}

function effectiveRate(rates, member, monthStart) {
  const monthEnd = new Date(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0);
  const end = monthEnd.getFullYear() + "-" + String(monthEnd.getMonth() + 1).padStart(2, "0") + "-" + String(monthEnd.getDate()).padStart(2, "0");
  const match = rates
    .filter(rate => rate.effective_from <= end && (!rate.effective_to || rate.effective_to >= monthStart))
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  return Number(match?.monthly_amount ?? 2000);
}

async function main() {
  const access = await requireRole(["member", "super_admin"]);
  if (!access) return;

  const params = new URLSearchParams(location.search);
  const requestedMemberId = params.get("member_id");
  if (access.role === "super_admin" && !requestedMemberId) {
    root.innerHTML = '<div class="statement-shell"><h1>Member Statement</h1><p>প্রথমে Member Info থেকে একজন Active member-এর Statement খুলুন।</p><a href="member-info.html">Member Info</a></div>';
    return;
  }
  let memberQuery = supabase
    .from("members")
    .select("id,member_no,full_name,full_name_bn,status,joined_at,joining_date,contribution_start_date,monthly_contribution");
  memberQuery = access.role === "member"
    ? memberQuery.eq("auth_user_id", access.session.user.id)
    : memberQuery.eq("id", requestedMemberId);
  const { data: member, error: memberError } = await memberQuery.maybeSingle();
  if (memberError) throw memberError;
  if (!member || member.status !== "active") throw new Error("এই Statement শুধু Active Member-এর জন্য পাওয়া যাবে।");
  if (access.role === "member" && requestedMemberId && requestedMemberId !== member.id) {
    throw new Error("নিরাপত্তার কারণে অন্য সদস্যের Statement দেখার অনুমতি নেই।");
  }

  const [sharedResult, transactionResult, ratesResult] = await Promise.all([
    supabase.rpc("get_member_shared_financial_data_v2"),
    supabase.from("financial_transactions")
      .select("id,transaction_type,amount,transaction_date,description,reference_no,account_type,direction,reversal_of_id,created_at")
      .eq("member_id", member.id)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("member_contribution_rates")
      .select("monthly_amount,effective_from,effective_to")
      .eq("member_id", member.id)
      .order("effective_from", { ascending: true })
  ]);
  if (sharedResult.error) throw sharedResult.error;
  if (transactionResult.error) throw transactionResult.error;
  if (ratesResult.error) throw ratesResult.error;

  const sharedRows = (sharedResult.data || []).filter(row => row.member_id === member.id);
  const summary = sharedRows[0] || {};
  const rates = ratesResult.data || [];
  const currentMonth = dhakaMonth();
  const monthRows = currentMonthRows(sharedRows, currentMonth);
  const paidTotal = Number(summary.total_paid || 0);
  const dueTotal = Number(summary.total_due || 0);
  const rawStartDate = member.contribution_start_date || member.joining_date || member.joined_at || "2027-01-01";
  const startDate = rawStartDate < "2027-01-01" ? "2027-01-01" : String(rawStartDate).slice(0, 10);

  let availablePaid = 0;
  const scheduleRows = monthRows.map(row => {
    const month = String(row.contribution_month).slice(0, 10);
    const monthKey = month.slice(0, 7);
    const beforeContributionStart = monthKey < startDate.slice(0, 7);
    const expected = beforeContributionStart ? 0 : effectiveRate(rates, member, month);
    const paid = Number(row.amount || 0);
    let due = 0;
    let status;
    if (monthKey > currentMonth) {
      status = paid > 0 ? "আগাম জমা" : "পরবর্তী মাস";
    } else {
      availablePaid += paid;
      due = Math.max(0, expected - availablePaid);
      availablePaid = Math.max(0, availablePaid - expected);
      status = beforeContributionStart ? (paid > 0 ? "শুরুর আগের জমা" : "সদস্য হওয়ার আগে") : due <= 0 ? (paid > 0 ? "পরিশোধিত" : "ক্রেডিট সমন্বয়") : paid > 0 ? "আংশিক জমা" : "বকেয়া";
    }
    return { month, expected, paid, due, paidDate: row.paid_date || null, status };
  });

  const transactions = transactionResult.data || [];
  const reversedIds = new Set(transactions.map(row => row.reversal_of_id).filter(Boolean));
  const ledgerRows = transactions.filter(row => {
    const match = String(row.reference_no || "").match(/^FFV_MATRIX\|(\d{4}-\d{2})\|/);
    const month = match ? match[1] : String(row.transaction_date || "").slice(0, 7);
    return month >= "2027-01" && month < "2032-01";
  }).map(row => {
    const accountingMatch = String(row.reference_no || "").match(/^FFV_MATRIX\|(\d{4}-\d{2})\|/);
    const accountingMonth = accountingMatch ? accountingMatch[1] : String(row.transaction_date || "").slice(0, 7);
    const isReversed = reversedIds.has(row.id);
    const typeLabel = row.transaction_type === "reversal" ? "সংশোধন / Reversal" : row.transaction_type === "contribution" ? "মাসিক জমা" : row.transaction_type;
    return '<tr><td>' + esc(dateText(row.transaction_date)) + '</td><td>' + esc(monthLabel(accountingMonth)) + '</td><td>' + esc(typeLabel) + (isReversed ? '<span class="statement-status reversed">Reversed</span>' : '') + '</td><td>' + esc(row.direction === "in" ? "জমা / Credit" : "বিয়োগ / Debit") + '</td><td class="amount">' + money(row.amount) + '</td><td>' + esc(row.description || row.reference_no || "—") + '</td></tr>';
  }).join("");

  const schedule = scheduleRows.map(row => '<tr><td>' + esc(monthLabel(row.month.slice(0, 7))) + '</td><td class="amount">' + money(row.expected) + '</td><td class="amount">' + money(row.paid) + '</td><td class="amount">' + money(row.due) + '</td><td>' + esc(dateText(row.paidDate)) + '</td><td><span class="statement-status">' + esc(row.status) + '</span></td></tr>').join("");

  const isSuperAdmin=access.role==="super_admin";
  const sidebarItems=[["dashboard.html","হোম"],["rules.html","RULES"],["member-info.html","MEMBER INFO"],["data.html","DATA"],["personal-due.html","PERSONAL DUE"],["proof.html","PROOF"],["payment.html","PAYMENT"],...(isSuperAdmin?[["admin.html","SUPER ADMIN"]]:[["statement.html","MY STATEMENT"],["member.html","MY PROFILE"]])];
  const sidebarHtml='<div class="drawer-backdrop" id="statementDrawerBackdrop" hidden></div><aside class="sidebar-panel" id="statementSidebar" aria-label="Main navigation" hidden><div class="sidebar-head"><a class="sidebar-brand" href="dashboard.html">'+BRAND_LOGO_SVG+'<strong>'+esc((member.full_name||"Member").toLocaleUpperCase("en-US"))+'</strong></a><button class="icon-button drawer-close" id="statementCloseMenu" type="button" aria-label="Close menu">×</button></div><nav class="nav sidebar-nav">'+sidebarItems.map(([href,label])=>'<a href="'+href+'"'+(href==="statement.html"?' class="active" aria-current="page"':"")+'><span>'+label+'</span></a>').join("")+'</nav><div class="sidebar-footer"><div class="sidebar-account"><span class="account-role">'+(isSuperAdmin?"Super Admin":"Member")+'</span><span class="account-email">'+esc(access.session.user.email||"")+'</span></div><button class="secondary" id="statementSidebarThemeToggle" type="button">Dark / Light</button>'+(isSuperAdmin?'<details class="export-menu sidebar-export-menu"><summary>EXPORT DATA</summary><div class="export-menu-panel"><button type="button" data-export-action="full-xlsx">সম্পূর্ণ Website · Excel</button><button type="button" data-export-action="full-docx">সম্পূর্ণ Website · Word</button></div></details>':'')+'<button class="secondary" id="statementSidebarInstallBtn" type="button">Install App</button><button class="secondary" id="statementLogoutBtn" type="button">লগআউট</button></div></aside>';
  root.innerHTML = '<div class="statement-shell"><header class="statement-header"><button class="icon-button menu-button" id="statementMenuBtn" type="button" aria-label="Open menu" aria-expanded="false">☰</button>'+BRAND_LOGO_SVG+'<div class="topbar-identity"><strong>'+esc((member.full_name||"Member").toLocaleUpperCase("en-US"))+'</strong><small>Friends Future Vision Forever</small></div><button class="secondary" id="statementThemeToggle" type="button">☾ Dark</button></header>'+sidebarHtml+
    '<div class="statement-actions"><a class="secondary" href="'+(access.role==="super_admin"?"member-info.html":"dashboard.html")+'">← '+(access.role==="super_admin"?"Member Info":"Dashboard")+'</a>'+(access.role==="super_admin"?'<button type="button" id="exportStatementXlsx" class="secondary">Excel</button><button type="button" id="exportStatementDocx" class="secondary">Word</button>':"")+'<button id="downloadStatement">PDF ডাউনলোড / Print</button></div>' +
    '<h1>Member Statement</h1><p class="statement-subtitle">Official contribution and due statement · হিসাবের সময়সীমা ১ জানুয়ারি ২০২৭ থেকে</p>' +
    '<section class="statement-member"><div><small>সদস্যের নাম</small><strong>' + esc((member.full_name || "Member").toLocaleUpperCase("en-US")) + '</strong></div><div><small>Member ID</small><strong>' + esc(member.member_no || "—") + '</strong></div><div><small>জমা শুরু</small><strong>' + esc(dateText(startDate)) + '</strong></div><div><small>Statement Date</small><strong>' + esc(new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })) + '</strong></div></section>' +
    '<section class="statement-summary"><article><small>মোট জমা / Total Deposit</small><strong>' + money(paidTotal) + '</strong></article><article><small>মোট বকেয়া / Total Due</small><strong>' + money(dueTotal) + '</strong></article><article><small>বর্তমান মাসিক হার / Monthly Rate</small><strong>' + money(effectiveRate(rates, member, currentMonth + "-01")) + '</strong></article></section>' +
    '<section class="statement-section"><h2>মাসভিত্তিক জমা ও বকেয়া / Monthly Summary</h2><div class="statement-table-wrap"><table><thead><tr><th>মাস / Month</th><th>নির্ধারিত জমা</th><th>প্রকৃত জমা</th><th>বকেয়া</th><th>জমার তারিখ</th><th>অবস্থা</th></tr></thead><tbody>' + (schedule || '<tr><td colspan="6">এখনো কোনো মাসিক হিসাব পাওয়া যায়নি।</td></tr>') + '</tbody></table></div></section>' +
    '<section class="statement-section"><h2>লেনদেনের বিস্তারিত / Transaction History</h2><div class="statement-table-wrap"><table><thead><tr><th>প্রকৃত তারিখ</th><th>যে মাসের জমা</th><th>লেনদেন</th><th>ধরন</th><th>Amount</th><th>বিবরণ / Reference</th></tr></thead><tbody>' + (ledgerRows || '<tr><td colspan="6">এখনো কোনো লেনদেন পাওয়া যায়নি।</td></tr>') + '</tbody></table></div></section>' +
    '<p class="statement-footnote">এই বিবরণী Website-এর হিসাব থেকে স্বয়ংক্রিয়ভাবে তৈরি হয়েছে। কোনো অমিল মনে হলে Super Admin-এর সঙ্গে যোগাযোগ করুন।</p><footer>Friends Future Vision Forever · Member Copy · Private</footer></div>';

  let statementTheme="light";try{statementTheme=localStorage.getItem("ffv-theme")==="dark"?"dark":"light"}catch{}
 document.body.classList.toggle("dark-theme",statementTheme==="dark");
 const themeButton=document.getElementById("statementThemeToggle");
 const updateThemeButton=()=>{const dark=document.body.classList.contains("dark-theme");if(themeButton){themeButton.textContent=dark?"☀ Light":"☾ Dark";themeButton.setAttribute("aria-pressed",String(dark))}};
 updateThemeButton();
 const setStatementTheme=()=>{const next=document.body.classList.contains("dark-theme")?"light":"dark";document.body.classList.toggle("dark-theme",next==="dark");try{localStorage.setItem("ffv-theme",next)}catch{}updateThemeButton();const sideTheme=document.getElementById("statementSidebarThemeToggle");if(sideTheme)sideTheme.textContent=next==="dark"?"☀ Light":"☾ Dark"};
 themeButton?.addEventListener("click",setStatementTheme);
 const sidebar=document.getElementById("statementSidebar"),backdrop=document.getElementById("statementDrawerBackdrop");
 const closeStatementMenu=()=>{if(sidebar)sidebar.hidden=true;if(backdrop)backdrop.hidden=true;document.getElementById("statementMenuBtn")?.setAttribute("aria-expanded","false")};
 document.getElementById("statementMenuBtn")?.addEventListener("click",()=>{const open=sidebar?.hidden;closeStatementMenu();if(sidebar)sidebar.hidden=!open;if(backdrop)backdrop.hidden=!open;document.getElementById("statementMenuBtn")?.setAttribute("aria-expanded",String(Boolean(open)))});
 document.getElementById("statementCloseMenu")?.addEventListener("click",closeStatementMenu);
 backdrop?.addEventListener("click",closeStatementMenu);
 sidebar?.querySelectorAll("a").forEach(link=>link.addEventListener("click",closeStatementMenu));
 document.getElementById("statementSidebarThemeToggle")?.addEventListener("click",setStatementTheme);
 document.getElementById("statementSidebarInstallBtn")?.addEventListener("click",async()=>{try{const result=await installPwa();if(!result.available)alert("এই browser-এ Install prompt পাওয়া যায়নি। Chrome menu থেকে Add to Home screen ব্যবহার করুন।");else if(result.outcome==="accepted")alert("App install শুরু হয়েছে।")}catch(error){alert(error.message||"Install prompt চালু করা যায়নি।")}});
 document.querySelectorAll("[data-export-action]").forEach(button=>button.addEventListener("click",async()=>{const action=button.dataset.exportAction;button.disabled=true;try{if(!confirm("সম্পূর্ণ Website Export-এ সদস্যদের ব্যক্তিগত তথ্য ও আর্থিক রেকর্ড থাকবে। ফাইলটি নিরাপদে রাখবেন। চালিয়ে যাবেন?"))return;const tools=await import("./export-tools.js");await tools.exportFullWebsite(supabase,action==="full-docx"?"docx":"xlsx");alert("Export file তৈরি হয়েছে। Download folder পরীক্ষা করুন।")}catch(error){alert("Export ব্যর্থ: "+(error.message||"Unknown error"))}finally{button.disabled=false}}));
 document.getElementById("statementLogoutBtn")?.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error)alert(error.message);else location.replace("login.html")});
 if (access.role === "super_admin") {
    for (const [id, format] of [["exportStatementXlsx", "xlsx"], ["exportStatementDocx", "docx"]]) {
      document.getElementById(id)?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        const original = button.textContent;
        button.textContent = "তৈরি হচ্ছে…";
        try {
          const tools = await import("./export-tools.js");
          await tools.exportCurrentPage(format);
        } catch (error) {
          console.error(error);
          alert("Statement export ব্যর্থ: " + (error.message || "Unknown error"));
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      });
    }
  }
  document.getElementById("downloadStatement").addEventListener("click", async () => {
    const button = document.getElementById("downloadStatement");
    button.disabled = true;
    button.textContent = "PDF প্রস্তুত হচ্ছে…";
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      window.print();
    } finally {
      button.disabled = false;
      button.textContent = "PDF ডাউনলোড / Print";
    }
  });
}

main().catch(error => {
  console.error(error);
  root.innerHTML = '<div class="statement-shell"><div class="error">' + esc(error.message || "Statement load failed") + '</div><a href="dashboard.html">Dashboard</a></div>';
});
