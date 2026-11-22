import "./password-visibility.js";
import { supabase, supabaseReady } from "./supabase-client.js";

const root = document.getElementById("publicData");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 });
const empty = message => '<div class="empty">' + esc(message) + '</div>';
const monthList = () => {
  const result = [];
  for (let year = 2027; year <= 2031; year++) {
    for (let month = 1; month <= 12; month++) {
      result.push(year + "-" + String(month).padStart(2, "0"));
    }
  }
  return result;
};
const monthName = key => new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" });
const paidDateLabel = value => { if (!value) return ""; const d = new Date(value + "T00:00:00"); return d.getDate() + " " + d.toLocaleDateString("en-US", { weekday: "short" }); };
const contributionRateForMonth = (member, monthKey) => {
  const [year, month] = monthKey.split("-").map(Number);
  const monthStart = monthKey + "-01";
  const monthEnd = year + "-" + String(month).padStart(2, "0") + "-" + String(new Date(year, month, 0).getDate()).padStart(2, "0");
  const rate = (member.contribution_rates || [])
    .filter(item => item.effective_from <= monthEnd && (!item.effective_to || item.effective_to >= monthStart))
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  return Number(rate?.monthly_amount ?? 2000);
};
function contributionLedgerTotal(rows, activeMemberIds){
  const reversedIds = new Set(rows.map(row => row.reversal_of_id).filter(Boolean));
  return rows.reduce((sum, row) => {
    if (!activeMemberIds.has(row.member_id) || row.transaction_type !== "contribution" || row.direction !== "in" || reversedIds.has(row.id)) return sum;
    const parts = String(row.reference_no || "").split("|");
    const month = parts[0] === "FFV_MATRIX" && /^\d{4}-\d{2}$/.test(parts[1] || "") ? parts[1] : String(row.transaction_date || "").slice(0, 7);
    return month >= "2027-01" && month < "2032-01" ? sum + Number(row.amount || 0) : sum;
  }, 0);
}
const dateTime = value => {
  if (!value) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return parts.day + "." + parts.month + "." + parts.year + " at " + parts.hour + "." + parts.minute + parts.dayPeriod.toLowerCase();
};

function toast(message, isError = false) {
  const node = document.createElement("div");
  node.className = isError ? "toast error" : "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 4500);
}

function renderPublicSummary(summary) {
  const value = summary || {};
  const number = key => Number(value[key] || 0);
  const cards = [
    ["মোট সম্পদ", number("total_assets")],
    ["নগদ ব্যালেন্স", number("cash_balance")],
    ["ব্যাংক ব্যালেন্স", number("bank_balance")],
    ["বিনিয়োগ ব্যালেন্স", number("investment_balance")],
    ["মোট জমা", number("total_contributions")],
    ["মোট খরচ", number("total_expenses")],
    ["অন্যান্য আয়", number("other_income")],
    ["বিনিয়োগ লাভ", number("investment_profit")],
    ["বিনিয়োগ ক্ষতি", number("investment_loss")]
  ];
  const trends = Array.isArray(value.monthly_trend) ? value.monthly_trend.slice(-12).reverse() : [];
  const rows = trends.map(row =>
    "<tr><td>" + esc(row.month || "—") + "</td><td>" + money(row.contributions) +
    "</td><td>" + money(row.expenses) + "</td><td>" + money(row.income) +
    "</td><td>" + money(row.investment_loss) + "</td></tr>"
  ).join("");
  root.innerHTML =
    "<h1>সমিতির সামগ্রিক আর্থিক তথ্য</h1>" +
    "<p class='lead'>এখানে শুধু সমিতির মোট হিসাব দেখানো হয়। সদস্যভিত্তিক জমা, বকেয়া ও ব্যক্তিগত তথ্য প্রকাশ করা হয় না।</p>" +
    (number("transaction_count") === 0
      ? "<div class='notice'>এখনো কোনো আর্থিক লেনদেন রেকর্ড করা হয়নি। হিসাব যোগ হলে এখানে আপডেট দেখা যাবে।</div>"
      : "<div class='notice'>সর্বশেষ হিসাব: " + esc(value.last_updated ? dateTime(value.last_updated) : "তথ্য পাওয়া যায়নি") + " · মোট লেনদেন: " + number("transaction_count") + "</div>") +
    "<div class='grid'>" + cards.map(([label,amount]) =>
      "<article class='card'><div class='label'>" + esc(label) + "</div><div class='value'>" + money(amount) + "</div></article>"
    ).join("") + "</div>" +
    "<section class='section'><h2>সাম্প্রতিক মাসের সারাংশ</h2>" +
    (rows
      ? "<div class='table-wrap'><table><thead><tr><th>মাস</th><th>জমা</th><th>খরচ</th><th>আয়</th><th>বিনিয়োগ ক্ষতি</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
      : empty("এখনো মাসভিত্তিক আর্থিক তথ্য নেই।")) +
    "</section><p class='muted small'>সদস্যভিত্তিক Contribution Matrix ও ব্যক্তিগত তথ্য দেখতে <a href='login.html'>লগইন করুন</a>।</p>";
}

async function loadMatrix() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (sessionError) throw sessionError;
  if (!user) {
    const { data: publicSummary, error: publicError } = await supabase.rpc("get_public_financial_summary");
    if (publicError) throw publicError;
    renderPublicSummary(publicSummary);
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !["super_admin", "member"].includes(profile.role)) {
    root.innerHTML = empty("এই তথ্য দেখার অনুমতি নেই।");
    return;
  }
  const isSuper = profile.role === "super_admin";

  const { data: sharedRows, error: sharedError } = await supabase.rpc("get_member_shared_financial_data_v2");
  if (sharedError) throw sharedError;
  const memberMap = new Map();
  const transactionMap = new Map();
  const matrixPrefix = "FFV_MATRIX|";
  (sharedRows || []).forEach(row => {
    if (!memberMap.has(row.member_id)) memberMap.set(row.member_id, { id: row.member_id, member_no: row.member_no, status: "active" });
    const month = String(row.contribution_month).slice(0, 7);
    const matrixRows = Number(row.matrix_count || 0) > 0 ? [{ id: null, amount: Number(row.amount || 0), reference_no: matrixPrefix + month + "|" + row.member_id }] : [];
    const manualRows = row.has_manual ? [{ id: null, amount: Number(row.amount || 0), reference_no: "MANUAL" }] : [];
    transactionMap.set(row.member_id + "|" + month, { amount: Number(row.amount || 0), rows: matrixRows.concat(manualRows), latest: row.last_paid_at || "", paidDay: row.paid_day || null, paidDate: row.paid_date || '' });
  });
  const members = Array.from(memberMap.values()).sort((a,b)=>String(a.member_no||"").localeCompare(String(b.member_no||"")));
  if (isSuper) {
    const [rateMembersResult, rateHistoryResult] = await Promise.all([
      supabase.from("members").select("id,monthly_contribution").eq("status", "active"),
      supabase.from("member_contribution_rates").select("member_id,monthly_amount,effective_from,effective_to")
    ]);
    if (rateMembersResult.error) throw rateMembersResult.error;
    if (rateHistoryResult.error) throw rateHistoryResult.error;
    const rateMap = new Map((rateMembersResult.data || []).map(member => [member.id, Number(member.monthly_contribution || 2000)]));
    const historyMap = new Map();
    (rateHistoryResult.data || []).forEach(rate => {
      if (!historyMap.has(rate.member_id)) historyMap.set(rate.member_id, []);
      historyMap.get(rate.member_id).push(rate);
    });
    members.forEach(member => {
      member.monthly_contribution = rateMap.get(member.id) || 2000;
      member.contribution_rates = historyMap.get(member.id) || [];
    });
  }
  let reconciliationNotice = "";
  if (isSuper) {
    const { data: ledgerRows, error: ledgerError } = await supabase.from("financial_transactions")
      .select("id,member_id,transaction_type,amount,transaction_date,reference_no,direction,reversal_of_id")
      .in("member_id", Array.from(memberMap.keys()))
      .in("transaction_type", ["contribution", "reversal"])
      .order("created_at", { ascending: true }).order("id", { ascending: true });
    if (ledgerError) throw ledgerError;
    const activeMemberIds = new Set(memberMap.keys());
    const matrixTotal = (sharedRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const ledgerTotal = contributionLedgerTotal(ledgerRows || [], activeMemberIds);
    const difference = ledgerTotal - matrixTotal;
    if (Math.abs(difference) > 0.01) {
      reconciliationNotice = '<div class="error" role="alert"><strong>হিসাব মিলছে না — Super Admin যাচাই করুন</strong><p>Active member ledger ও DATA Matrix-এর মধ্যে ' + money(Math.abs(difference)) + ' পার্থক্য আছে। ' + (difference > 0 ? 'Ledger-এ বেশি' : 'DATA Matrix-এ বেশি') + '। Save করার আগে সংশ্লিষ্ট লেনদেন ও মাসের হিসাব মিলিয়ে নিন।</p></div>';
    }
  }
  if (!members.length) { root.innerHTML = "<h1>Member Contribution Matrix</h1>" + empty("এখনো কোনো Active Member পাওয়া যায়নি।"); return; }
  const months = monthList();
  const years = [2027, 2028, 2029, 2030, 2031];
  const requestedYear = Number(new URLSearchParams(window.location.search).get("year") || 2027);
  const selectedYear = years.includes(requestedYear) ? requestedYear : 2027;
  const yearSelector = '<div class="field matrix-year-selector"><label for="matrixYear">Accounting year</label><select id="matrixYear">' +
    years.map(year => '<option value="' + year + '"' + (year === selectedYear ? ' selected' : '') + '>' + year + '</option>').join("") +
    '</select></div>';
  const localToday = new Date();
  const todayKey = localToday.getFullYear() + "-" + String(localToday.getMonth()+1).padStart(2,"0") + "-" + String(localToday.getDate()).padStart(2,"0");
  const tables = years.filter(year => year === selectedYear).map(year => {
    const yearMonths = months.filter(month => Number(month.slice(0, 4)) === year);
    const periods = [yearMonths.slice(0, 4), yearMonths.slice(4, 8), yearMonths.slice(8, 12)];
    return periods.map((periodMonths, periodIndex) => {
      const periodKey = year + "-P" + (periodIndex + 1);
      const periodLabel = monthName(periodMonths[0]) + "–" + monthName(periodMonths[periodMonths.length - 1]);
      const headers = periodMonths.map(month => '<th class="matrix-month-head" data-month="' + esc(month) + '">' + esc(monthName(month)) + '</th>').join("");
      const body = members.map(member => {
        const memberNo = String(member.member_no || "—").split("-").pop();
        let periodTotal = 0;
        const cells = periodMonths.map(month => {
          const key = member.id + "|" + month;
          const record = transactionMap.get(key);
          const rows = record?.rows || [];
          const matrixRows = rows.filter(row => String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
          const manualRows = rows.filter(row => !String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
          const amount = record?.amount || 0;
          periodTotal += amount;
          const locked = manualRows.length > 0 || matrixRows.length > 1;
          const selected = amount > 0;
          const savedDate = record?.paidDate || "";
          const defaultPaidDate = savedDate || todayKey;
          const cellStatus = matrixRows.length > 1 ? '<small class="cell-date">Duplicate entry · review</small>' : (manualRows.length ? '<small class="cell-date">Manual entry</small>' : (savedDate ? '<small class="cell-date paid-date">' + esc(paidDateLabel(savedDate)) + '</small>' : ""));
          const checkbox = '<input type="checkbox" class="matrix-check" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '"' +
            (selected ? " checked" : "") + ((!isSuper || locked) ? " disabled" : "") + ' aria-label="' + esc(month + " " + memberNo) + '">';
          const amountInput = '<input type="number" class="matrix-amount" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '" data-default-amount="' + contributionRateForMonth(member, month) + '" data-last-paid-at="' + esc(record?.latest || "") + '" data-saved-amount="' + Number(record?.amount || 0) + '" data-saved-date="' + esc(savedDate) + '" min="0" step="1" inputmode="numeric" value="' + (selected ? amount : 0) + '"' +
            ((!isSuper || locked) ? " readonly disabled" : "") + ' aria-label="' + esc(month + " amount for " + memberNo) + '">';
          const dayInput = isSuper && !locked ? '<input type="date" class="matrix-day" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '" max="' + esc(todayKey) + '" value="' + esc(selected ? defaultPaidDate : "") + '"' + (selected ? "" : " disabled") + ' aria-label="Actual payment date for ' + esc(memberNo) + ' contribution month ' + esc(month) + '">' : "";
          return '<td><div class="matrix-cell">' +
            (isSuper ? '<label class="matrix-toggle">' + checkbox + '<span>জমা</span></label>' : "") +
            amountInput +
            (dayInput ? dayInput + '<small class="matrix-paid-day" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '">' + esc(selected ? paidDateLabel(defaultPaidDate) : "") + '</small>' : cellStatus) +
            '</div></td>';
        }).join("");

        return '<tr data-member-row="' + esc(member.id) + '" data-period="' + periodKey + '">' +
          '<td class="sticky-col">' + esc(memberNo) + '</td>' +

          cells +
          '<td class="matrix-period-total" data-period-total="' + periodKey + '" data-member="' + esc(member.id) + '"><strong>' + money(periodTotal) + '</strong></td>' +
          '</tr>';
      }).join("");
      const monthTotals = periodMonths.map(month => {
        const total = members.reduce((sum, member) => sum + (transactionMap.get(member.id + "|" + month)?.amount || 0), 0);
        return '<td class="matrix-month-total" data-month-total="' + esc(month) + '"><strong>' + money(total) + '</strong></td>';
      }).join("");
      const periodTotal = members.reduce((sum, member) => sum + periodMonths.reduce((inner, month) => inner + (transactionMap.get(member.id + "|" + month)?.amount || 0), 0), 0);
      return '<section class="section matrix-period-section" data-period="' + periodKey + '"><div class="section-head"><h2>' + year + " · " + periodLabel + ' · Monthly contribution</h2><strong class="muted">' + money(periodTotal) + '</strong></div>' +
        '<p class="matrix-scroll-hint">← টেবিলটি ডানে-বামে সরিয়ে সব মাসের তথ্য দেখুন →</p><div class="table-wrap matrix-wrap"><table class="contribution-matrix matrix-editable"><thead><tr><th class="sticky-col">Member No.</th>' + headers + '<th>Period Total</th></tr></thead>' +
        '<tbody>' + body + '<tr class="total-row"><td>TOTAL</td>' + monthTotals + '<td data-period-grand-total="' + periodKey + '"><strong>' + money(periodTotal) + '</strong></td></tr></tbody></table></div></section>';
    }).join("");
  }).join("");

  root.innerHTML = '<h1>Member Contribution Matrix</h1>' +
    reconciliationNotice +
    '<p class="lead">' + (isSuper
      ? 'প্রতি মাসে সদস্যের জমা Checkbox দিয়ে নির্বাচন করুন। Amount পরিবর্তন করা যাবে; সব পরিবর্তন Confirm & Save করলে সংরক্ষিত হবে।'
      : 'এখানে সব সক্রিয় সদস্যের মাসভিত্তিক জমা দেখা যাবে। আপনি শুধু দেখতে পারবেন; পরিবর্তন করতে পারবেন না।') + '</p>' +
    (isSuper ? '<div class="notice">মাসিক হার নির্ধারিত থাকলে সেটি আসবে; হার না থাকলে Checkbox টিক দিলে ডিফল্ট ৳2,000 হবে। Amount ও Actual Payment Date দুটোই Super Admin পরিবর্তন করতে পারবেন। কলামের Month হলো হিসাবের মাস; Date হলো টাকা বাস্তবে পাওয়ার দিন—দুটি আলাদা মাসও হতে পারে। Weekday স্বয়ংক্রিয়ভাবে দেখাবে।</div>' : "") +
    yearSelector +
    tables +
    (isSuper ? '<div class="form-actions matrix-save-actions"><button type="button" id="saveMatrix">Confirm &amp; Save</button><span id="matrixSaveStatus" class="muted small"></span></div>' : "");

  document.getElementById("matrixYear")?.addEventListener("change", event => {
    const hasUnsavedChanges = Array.from(root.querySelectorAll(".matrix-amount")).some(input => {
      const amount = Number(input.value || 0);
      const savedAmount = Number(input.dataset.savedAmount || 0);
      const dayInput = root.querySelector('.matrix-day[data-member="' + input.dataset.member + '"][data-month="' + input.dataset.month + '"]');
      return amount !== savedAmount || (amount > 0 && dayInput && dayInput.value !== (input.dataset.savedDate || ""));
    });
    if (hasUnsavedChanges && !window.confirm("এই বছরের কিছু জমার তথ্য Save হয়নি। Save না করে অন্য বছর খুলবেন?")) {
      event.target.value = String(selectedYear);
      return;
    }
    window.location.search = "?year=" + encodeURIComponent(event.target.value);
  });

  const monthlyTotals = new Map();
  (sharedRows || []).forEach(row => { const k=String(row.contribution_month).slice(0,7); monthlyTotals.set(k,(monthlyTotals.get(k)||0)+Number(row.amount||0)); });
  const chartKeys=Array.from(monthlyTotals.keys()).sort().filter(k=>monthlyTotals.get(k)>0).slice(-12);
  const chartValues=chartKeys.map(k=>monthlyTotals.get(k));
  const chartMax=Math.max(1,...chartValues);
  const barHtml=chartKeys.map((k,i)=>"<div class=\"mini-bar-item\"><span>"+esc(k.slice(5))+"</span><i style=\"height:"+Math.max(3,100*chartValues[i]/chartMax)+"%\"></i></div>").join("");
  const points=chartValues.map((v,i)=>{const x=12+(i*476/Math.max(1,chartValues.length-1));const y=178-(150*v/chartMax);return x+","+y;}).join(" ");
  const lineHtml="<svg viewBox=\"0 0 500 200\" class=\"matrix-chart-svg\" role=\"img\" aria-label=\"Monthly contribution trend\"><line x1=\"8\" y1=\"180\" x2=\"492\" y2=\"180\" stroke=\"currentColor\" opacity=\".2\"/><polyline points=\""+points+"\" fill=\"none\" stroke=\"#3976d2\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
  const memberTotals=members.map(m=>({name:String(m.member_no||"—").split("-").pop(),value:(sharedRows||[]).filter(r=>r.member_id===m.id).reduce((n,r)=>n+Number(r.amount||0),0)}));
  const pieTotal=memberTotals.reduce((n,x)=>n+x.value,0);let angle=0;const colors=["#15966f","#3976d2","#e0a43b","#9a72ce","#d56d72","#48a9b5"];
  const stops=memberTotals.filter(x=>x.value>0).map((x,i)=>{const begin=angle;angle+=pieTotal?x.value/pieTotal*360:0;return colors[i%colors.length]+" "+begin+"deg "+angle+"deg";}).join(",");
  const legend=memberTotals.map((x,i)=>"<span><i style=\"background:"+colors[i%colors.length]+"\"></i>"+esc(x.name)+" · "+money(x.value)+"</span>").join("");
  root.insertAdjacentHTML("beforeend","<section class=\"section matrix-charts\"><div class=\"section-head\"><h2>Contribution Charts</h2><button type=\"button\" class=\"secondary\" id=\"toggleMatrixCharts\" aria-expanded=\"false\">See Charts</button></div><div id=\"matrixChartsPanel\" hidden><div class=\"matrix-chart-grid\"><article class=\"card\"><strong>Monthly contribution · Column</strong><div class=\"mini-bars\">"+barHtml+"</div></article><article class=\"card\"><strong>Monthly trend · Line</strong>"+lineHtml+"</article><article class=\"card\"><strong>Member share · Pie</strong><div class=\"matrix-pie\" style=\"background:conic-gradient("+stops+")\"></div><div class=\"matrix-chart-legend\">"+legend+"</div></article></div></div></section>");
  document.getElementById("toggleMatrixCharts")?.addEventListener("click",()=>{const panel=document.getElementById("matrixChartsPanel"),button=document.getElementById("toggleMatrixCharts");panel.hidden=!panel.hidden;button.setAttribute("aria-expanded",String(!panel.hidden));button.textContent=panel.hidden?"See Charts":"Hide Charts";});
  if (!isSuper) return;

  function recalculate() {
    root.querySelectorAll(".matrix-period-section").forEach(section => {
      const table = section.querySelector("table");
      const rows = Array.from(table.querySelectorAll("tbody tr[data-member-row]"));
      let grand = 0;
      rows.forEach(row => {
        const total = Array.from(row.querySelectorAll(".matrix-amount")).reduce((sum, input) => sum + Number(input.value || 0), 0);
        grand += total;
        const totalCell = row.querySelector("[data-period-total]");
        if (totalCell) totalCell.innerHTML = "<strong>" + money(total) + "</strong>";
      });
      const grandCell = table.querySelector("[data-period-grand-total]");
      if (grandCell) grandCell.innerHTML = "<strong>" + money(grand) + "</strong>";
      const monthHeaders = Array.from(table.querySelectorAll("thead th.matrix-month-head"));
      monthHeaders.forEach((header, index) => {
        const monthKey = header.dataset.month;
        const monthTotal = rows.reduce((sum, row) => {
          const input = row.querySelectorAll(".matrix-amount")[index];
          return sum + Number(input?.value || 0);
        }, 0);
        const cell = table.querySelector('[data-month-total="' + monthKey + '"]');
        if (cell) cell.innerHTML = "<strong>" + money(monthTotal) + "</strong>";
      });
      const headingTotal = section.querySelector(".section-head > strong");
      if (headingTotal) headingTotal.textContent = money(grand);
    });
  }

  root.querySelectorAll(".matrix-check").forEach(check => {
    check.addEventListener("change", () => {
      const selector = '.matrix-amount[data-member="' + check.dataset.member + '"][data-month="' + check.dataset.month + '"]';
      const amount = root.querySelector(selector);
      if (!amount) return;
      if (check.checked && Number(amount.value) <= 0) { const defaultAmount = Number(amount.dataset.defaultAmount || 0); amount.value = String(defaultAmount > 0 ? defaultAmount : 2000); }
      if (!check.checked) amount.value = "0";
      const dayInput = root.querySelector(".matrix-day[data-member=\"" + check.dataset.member + "\"][data-month=\"" + check.dataset.month + "\"]");
      const today = new Date(); const todayKey = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
      if (dayInput) { dayInput.disabled = !check.checked; if (check.checked && !dayInput.value) dayInput.value = todayKey; if (!check.checked) dayInput.value = ""; }
      const label = root.querySelector(".matrix-paid-day[data-member=\"" + check.dataset.member + "\"][data-month=\"" + check.dataset.month + "\"]");
      if (label) label.textContent = check.checked && dayInput?.value ? paidDateLabel(dayInput.value) : "";
      recalculate();
    });
  });
  root.querySelectorAll(".matrix-day").forEach(input => input.addEventListener("change", () => { const label = root.querySelector(".matrix-paid-day[data-member=\"" + input.dataset.member + "\"][data-month=\"" + input.dataset.month + "\"]"); if (label) label.textContent = paidDateLabel(input.value); }));
  root.querySelectorAll(".matrix-amount").forEach(input => {
    input.addEventListener("input", () => {
      const selector = '.matrix-check[data-member="' + input.dataset.member + '"][data-month="' + input.dataset.month + '"]';
      const check = root.querySelector(selector);
      if (check) { const wasChecked = check.checked; check.checked = Number(input.value) > 0; if (wasChecked !== check.checked) check.dispatchEvent(new Event("change", { bubbles: true })); }
      recalculate();
    });
    input.addEventListener("click", () => {
      if (input.dataset.lastPaidAt) {
        toast("Saved amount: " + money(input.dataset.savedAmount) + " · Recorded: " + dateTime(input.dataset.lastPaidAt));
      }
    });
  });

  const saveButton = document.getElementById("saveMatrix");
  const status = document.getElementById("matrixSaveStatus");
  saveButton.addEventListener("click", async () => {
    const cells = Array.from(root.querySelectorAll(".matrix-amount:not(:disabled)"));
    const entries = cells.map(input => {
      const selector = '.matrix-check[data-member="' + input.dataset.member + '"][data-month="' + input.dataset.month + '"]';
      const check = root.querySelector(selector);
      const selected = Boolean(check?.checked);
      const amount = selected ? Number(input.value) : 0;
      const dayInput = root.querySelector('.matrix-day[data-member="' + input.dataset.member + '"][data-month="' + input.dataset.month + '"]');
      const paidDate = dayInput?.value || todayKey;
      const savedAmount = Number(input.dataset.savedAmount || 0);
      const changed = amount !== savedAmount || (selected && paidDate !== (input.dataset.savedDate || ""));
      return { memberId: input.dataset.member, month: input.dataset.month, selected, amount, paidDate, changed };
    });
    const invalid = entries.find(entry => entry.selected && (!(entry.amount > 0) || !Number.isFinite(entry.amount)));
    if (invalid) { toast("টিক দেওয়া প্রতিটি সদস্যের Amount শূন্যের বেশি হতে হবে।", true); return; }
    const invalidDay = entries.find(entry => entry.selected &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(entry.paidDate) || Number.isNaN(Date.parse(entry.paidDate + "T00:00:00")) || entry.paidDate > todayKey));
    if (invalidDay) { toast("প্রতিটি নির্বাচিত জমার Actual Payment Date সঠিকভাবে নির্বাচন করুন। ভবিষ্যতের তারিখ দেওয়া যাবে না।", true); return; }
    const changedEntries = entries.filter(entry => entry.changed);
    if (!changedEntries.length) { toast("কোনো পরিবর্তন করা হয়নি।"); return; }
    if (!window.confirm(changedEntries.length + "টি পরিবর্তন Confirm করে Save করবেন?")) return;

    saveButton.disabled = true;
    status.textContent = "সংরক্ষণ হচ্ছে…";
    let changed = 0;
    try {
      const changes = changedEntries.map(entry => ({
        member_id: entry.memberId,
        month: entry.month + "-01",
        amount: entry.selected ? entry.amount : 0,
        paid_date: entry.paidDate
      }));
      const { data: saved, error } = await supabase.rpc("save_contribution_matrix", { p_idempotency_key: crypto.randomUUID(), p_changes: changes });
      if (error) throw error;
      changed = (saved || []).filter(item => item.status !== "unchanged").length;
      status.textContent = changed + "টি পরিবর্তন সংরক্ষিত হয়েছে।";
      toast("Contribution Matrix সংরক্ষণ সম্পন্ন।");
      await loadMatrix();
    } catch (error) {
      console.error(error);
      status.textContent = "কিছু পরিবর্তন সংরক্ষিত হতে পারেনি।";
      toast("Save error: " + (error.message || "Unknown error") + "। Reload করে বর্তমান হিসাব যাচাই করুন।", true);
      await loadMatrix();
    } finally {
      const currentButton = document.getElementById("saveMatrix");
      if (currentButton) currentButton.disabled = false;
    }
  });
}

async function load() {
  if (!supabaseReady) {
    root.innerHTML = empty("Data service configured নয়।");
    return;
  }
  try {
    await loadMatrix();
  } catch (error) {
    console.error(error);
    root.innerHTML = '<div class="error">' + esc(error.message || "তথ্য লোড করা যায়নি।") + '</div>';
  }
}
load();