import { supabase, supabaseReady } from "./supabase-client.js";

const root = document.getElementById("publicData");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 });
const empty = message => '<div class="empty">' + esc(message) + '</div>';
const monthList = () => {
  const result = [];
  for (let year = 2026; year <= 2031; year++) {
    const first = year === 2026 ? 12 : 1;
    const last = year === 2031 ? 11 : 12;
    for (let month = first; month <= last; month++) {
      result.push(year + "-" + String(month).padStart(2, "0"));
    }
  }
  return result;
};
const monthName = key => new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" });
const dateTime = value => value ? new Date(value).toLocaleString("en-GB", {
  timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit"
}) : "";

function toast(message, isError = false) {
  const node = document.createElement("div");
  node.className = isError ? "toast error" : "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 4500);
}

async function loadMatrix() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (sessionError || !user) {
    root.innerHTML = empty("লগইন সেশন পাওয়া যায়নি। আবার লগইন করুন।");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !["super_admin", "member"].includes(profile.role)) {
    root.innerHTML = empty("এই তথ্য দেখার অনুমতি নেই।");
    return;
  }
  const isSuper = profile.role === "super_admin";

  const { data: sharedRows, error: sharedError } = await supabase.rpc("get_member_shared_financial_data");
  if (sharedError) throw sharedError;
  const memberMap = new Map();
  const transactionMap = new Map();
  const matrixPrefix = "FFV_MATRIX|";
  (sharedRows || []).forEach(row => {
    if (!memberMap.has(row.member_id)) memberMap.set(row.member_id, { id: row.member_id, member_no: row.member_no, full_name: row.full_name, full_name_bn: row.full_name_bn, status: "active" });
    const month = String(row.contribution_month).slice(0, 7);
    const matrixRows = Number(row.matrix_count || 0) > 0 ? [{ id: null, amount: Number(row.amount || 0), reference_no: matrixPrefix + month + "|" + row.member_id }] : [];
    const manualRows = row.has_manual ? [{ id: null, amount: Number(row.amount || 0), reference_no: "MANUAL" }] : [];
    transactionMap.set(row.member_id + "|" + month, { amount: Number(row.amount || 0), rows: matrixRows.concat(manualRows), latest: row.last_paid_at || "", paidDay: row.paid_day || null });
  });
  const members = Array.from(memberMap.values()).sort((a,b)=>String(a.member_no||"").localeCompare(String(b.member_no||"")));
  if (!members.length) { root.innerHTML = "<h1>Member Contribution Matrix</h1>" + empty("এখনো কোনো Active Member পাওয়া যায়নি।"); return; }
  const months = monthList();
  const years = [2026, 2027, 2028, 2029, 2030, 2031];
  const editorRows = [];
  const tables = years.map(year => {
    const yearMonths = months.filter(month => Number(month.slice(0, 4)) === year);
    const headers = yearMonths.map(month => '<th class="matrix-month-head">' + esc(monthName(month)) + '</th>').join("");
    const body = members.map(member => {
      let yearTotal = 0;
      const cells = yearMonths.map(month => {
        const key = member.id + "|" + month;
        const record = transactionMap.get(key);
        const rows = record?.rows || [];
        const matrixRows = rows.filter(row => String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
        const manualRows = rows.filter(row => !String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
        const amount = record?.amount || 0;
        yearTotal += amount;
        const locked = manualRows.length > 0 || matrixRows.length > 1;
        const selected = amount > 0;
        const savedDay = record?.paidDay ? String(record.paidDay) : "";
        const checkbox = '<input type="checkbox" class="matrix-check" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '"' +
          (selected ? " checked" : "") + ((!isSuper || locked) ? " disabled" : "") + ' aria-label="' + esc(month + " " + member.full_name) + '">';
        const amountInput = '<input type="number" class="matrix-amount" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '" min="0" step="1" inputmode="numeric" value="' + (selected ? amount : 0) + '"' +
          ((!isSuper || locked) ? " readonly disabled" : "") + ' aria-label="' + esc(month + " amount for " + member.full_name) + '">';
        if (isSuper && !locked) editorRows.push({ memberId: member.id, month, existing: matrixRows[0] || null });
        return '<td><div class="matrix-cell">' +
          (isSuper ? '<label class="matrix-toggle">' + checkbox + '<span>জমা</span></label>' : "") +
          amountInput +
          (matrixRows.length > 1 ? '<small class="cell-date">Duplicate entry · review</small>' : (manualRows.length ? '<small class="cell-date">Manual entry</small>' : (savedDay ? '<small class="cell-date paid-date">' + esc(savedDay) + '</small>' : ""))) +
          '</div></td>';
      }).join("");
      const name = member.full_name_bn || member.full_name || "—";
      return '<tr data-member-row="' + esc(member.id) + '" data-year="' + year + '">' +
        '<td class="sticky-col">' + esc(member.member_no || "—") + '</td>' +
        '<td class="sticky-col name-col"><span class="matrix-member-name">' + esc(name) + '</span></td>' +
        cells +
        '<td class="matrix-year-total" data-year-total="' + year + '" data-member="' + esc(member.id) + '"><strong>' + money(yearTotal) + '</strong></td>' +
        '</tr>';
    }).join("");
    const monthTotals = yearMonths.map(month => {
      const total = members.reduce((sum, member) => sum + (transactionMap.get(member.id + "|" + month)?.amount || 0), 0);
      return '<td class="matrix-month-total" data-month-total="' + esc(month) + '"><strong>' + money(total) + '</strong></td>';
    }).join("");
    const yearTotal = members.reduce((sum, member) => sum + yearMonths.reduce((inner, month) => inner + (transactionMap.get(member.id + "|" + month)?.amount || 0), 0), 0);
    return '<section class="section matrix-year-section"><div class="section-head"><h2>' + year + ' · Monthly contribution</h2><strong class="muted">' + money(yearTotal) + '</strong></div>' +
      '<div class="table-wrap matrix-wrap"><table class="contribution-matrix matrix-editable"><thead><tr><th class="sticky-col">Member No.</th><th class="sticky-col name-col">Member Name</th>' + headers + '<th>Year Total</th></tr></thead>' +
      '<tbody>' + body + '<tr class="total-row"><td colspan="2">TOTAL</td>' + monthTotals + '<td data-year-grand-total="' + year + '"><strong>' + money(yearTotal) + '</strong></td></tr></tbody></table></div></section>';
  }).join("");

  root.innerHTML = '<h1>Member Contribution Matrix</h1>' +
    '<p class="lead">' + (isSuper
      ? 'প্রতি মাসে সদস্যের জমা Checkbox দিয়ে নির্বাচন করুন। Amount পরিবর্তন করা যাবে; সব পরিবর্তন Confirm & Save করলে সংরক্ষিত হবে।'
      : 'এখানে শুধু আপনার নিজের মাসভিত্তিক জমার তথ্য দেখানো হচ্ছে।') + '</p>' +
    (isSuper ? '<div class="notice">প্রাথমিক Amount ৳2,000। প্রয়োজন হলে প্রতিটি মাস ও সদস্যের Amount আলাদাভাবে Edit করতে পারবেন। Checkbox উঠালে Amount হবে ৳0।</div>' : "") +
    tables +
    (isSuper ? '<div class="form-actions matrix-save-actions"><button type="button" id="saveMatrix">Confirm &amp; Save</button><span id="matrixSaveStatus" class="muted small"></span></div>' : "");

  const monthlyTotals = new Map();
  (sharedRows || []).forEach(row => { const k=String(row.contribution_month).slice(0,7); monthlyTotals.set(k,(monthlyTotals.get(k)||0)+Number(row.amount||0)); });
  const chartKeys=Array.from(monthlyTotals.keys()).sort().filter(k=>monthlyTotals.get(k)>0).slice(-12);
  const chartValues=chartKeys.map(k=>monthlyTotals.get(k));
  const chartMax=Math.max(1,...chartValues);
  const barHtml=chartKeys.map((k,i)=>"<div class=\"mini-bar-item\"><span>"+esc(k.slice(5))+"</span><i style=\"height:"+Math.max(3,100*chartValues[i]/chartMax)+"%\"></i></div>").join("");
  const points=chartValues.map((v,i)=>{const x=12+(i*476/Math.max(1,chartValues.length-1));const y=178-(150*v/chartMax);return x+","+y;}).join(" ");
  const lineHtml="<svg viewBox=\"0 0 500 200\" class=\"matrix-chart-svg\" role=\"img\" aria-label=\"Monthly contribution trend\"><line x1=\"8\" y1=\"180\" x2=\"492\" y2=\"180\" stroke=\"currentColor\" opacity=\".2\"/><polyline points=\""+points+"\" fill=\"none\" stroke=\"#3976d2\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
  const memberTotals=members.map(m=>({name:m.full_name_bn||m.full_name,value:(sharedRows||[]).filter(r=>r.member_id===m.id).reduce((n,r)=>n+Number(r.amount||0),0)}));
  const pieTotal=memberTotals.reduce((n,x)=>n+x.value,0);let angle=0;const colors=["#15966f","#3976d2","#e0a43b","#9a72ce","#d56d72","#48a9b5"];
  const stops=memberTotals.filter(x=>x.value>0).map((x,i)=>{const begin=angle;angle+=pieTotal?x.value/pieTotal*360:0;return colors[i%colors.length]+" "+begin+"deg "+angle+"deg";}).join(",");
  const legend=memberTotals.map((x,i)=>"<span><i style=\"background:"+colors[i%colors.length]+"\"></i>"+esc(x.name)+" · "+money(x.value)+"</span>").join("");
  root.insertAdjacentHTML("beforeend","<section class=\"section matrix-charts\"><div class=\"section-head\"><h2>Contribution Charts</h2><button type=\"button\" class=\"secondary\" id=\"toggleMatrixCharts\" aria-expanded=\"false\">See Charts</button></div><div id=\"matrixChartsPanel\" hidden><div class=\"matrix-chart-grid\"><article class=\"card\"><strong>Monthly contribution · Column</strong><div class=\"mini-bars\">"+barHtml+"</div></article><article class=\"card\"><strong>Monthly trend · Line</strong>"+lineHtml+"</article><article class=\"card\"><strong>Member share · Pie</strong><div class=\"matrix-pie\" style=\"background:conic-gradient("+stops+")\"></div><div class=\"matrix-chart-legend\">"+legend+"</div></article></div></div></section>");
  document.getElementById("toggleMatrixCharts")?.addEventListener("click",()=>{const panel=document.getElementById("matrixChartsPanel"),button=document.getElementById("toggleMatrixCharts");panel.hidden=!panel.hidden;button.setAttribute("aria-expanded",String(!panel.hidden));button.textContent=panel.hidden?"See Charts":"Hide Charts";});
  if (!isSuper) return;

  function recalculate() {
    document.querySelectorAll(".matrix-year-section").forEach(section => {
      const table = section.querySelector("table");
      const rows = Array.from(table.querySelectorAll("tbody tr[data-member-row]"));
      const headers = Array.from(table.querySelectorAll("thead th[data-month]"));
      const year = Number(section.querySelector("h2").textContent.slice(0, 4));
      let grand = 0;
      rows.forEach(row => {
        let total = 0;
        row.querySelectorAll(".matrix-amount").forEach(input => { total += Number(input.value || 0); });
        grand += total;
        const totalCell = row.querySelector("[data-year-total]");
        if (totalCell) totalCell.innerHTML = "<strong>" + money(total) + "</strong>";
      });
      const grandCell = table.querySelector("[data-year-grand-total]");
      if (grandCell) grandCell.innerHTML = "<strong>" + money(grand) + "</strong>";
      const monthHeaders = Array.from(table.querySelectorAll("thead th.matrix-month-head"));
      monthHeaders.forEach((header, index) => {
        const monthTotal = rows.reduce((sum, row) => {
          const input = row.querySelectorAll(".matrix-amount")[index];
          return sum + Number(input?.value || 0);
        }, 0);
        const monthKey = year + "-" + String(year === 2026 ? 12 : index + 1).padStart(2, "0");
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
      if (check.checked && Number(amount.value) <= 0) amount.value = "2000";
      if (!check.checked) amount.value = "0";
      recalculate();
    });
  });
  root.querySelectorAll(".matrix-amount").forEach(input => {
    input.addEventListener("input", () => {
      const selector = '.matrix-check[data-member="' + input.dataset.member + '"][data-month="' + input.dataset.month + '"]';
      const check = root.querySelector(selector);
      if (check) check.checked = Number(input.value) > 0;
      recalculate();
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
      return { memberId: input.dataset.member, month: input.dataset.month, selected, amount: selected ? Number(input.value) : 0 };
    });
    const invalid = entries.find(entry => entry.selected && (!(entry.amount > 0) || !Number.isFinite(entry.amount)));
    if (invalid) { toast("টিক দেওয়া প্রতিটি সদস্যের Amount শূন্যের বেশি হতে হবে।", true); return; }
    if (!window.confirm("Contribution Matrix-এর সব পরিবর্তন Confirm করে Save করবেন?")) return;

    saveButton.disabled = true;
    status.textContent = "সংরক্ষণ হচ্ছে…";
    let changed = 0;
    try {
      const changes = entries.map(entry => ({ member_id: entry.memberId, month: entry.month + "-01", amount: entry.selected ? entry.amount : 0 }));
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