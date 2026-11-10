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

  let memberQuery = supabase.from("members")
    .select("id,member_no,full_name,full_name_bn,status,monthly_contribution")
    .order("member_no");
  if (isSuper) memberQuery = memberQuery.eq("status", "active");
  else memberQuery = memberQuery.eq("auth_user_id", user.id).eq("status", "active");

  const { data: members, error: memberError } = await memberQuery;
  if (memberError) throw memberError;
  if (!members?.length) {
    root.innerHTML = '<h1>Member Contribution Matrix</h1>' + empty("এখনো কোনো Active Member পাওয়া যায়নি।");
    return;
  }

  const { data: transactions, error: transactionError } = await supabase
    .from("financial_transactions")
    .select("id,member_id,amount,transaction_date,created_at,updated_at,reference_no,transaction_type,direction")
    .in("member_id", members.map(member => member.id))
    .eq("transaction_type", "contribution")
    .eq("direction", "in")
    .gte("transaction_date", "2026-12-01")
    .lt("transaction_date", "2031-12-01")
    .order("created_at", { ascending: true });
  if (transactionError) throw transactionError;

  const contributionIds = (transactions || []).map(row => row.id);
  let reversals = [];
  if (contributionIds.length) {
    const { data, error } = await supabase
      .from("financial_transactions")
      .select("reversal_of_id")
      .eq("transaction_type", "reversal")
      .eq("direction", "out")
      .in("reversal_of_id", contributionIds);
    if (error) throw error;
    reversals = data || [];
  }
  const reversedIds = new Set(reversals.map(row => row.reversal_of_id));

  const transactionMap = new Map();
  const matrixPrefix = "FFV_MATRIX|";
  (transactions || []).forEach(transaction => {
    const month = String(transaction.transaction_date).slice(0, 7);
    const key = transaction.member_id + "|" + month;
    if (!transactionMap.has(key)) transactionMap.set(key, { amount: 0, rows: [], latest: "" });
    const item = transactionMap.get(key);
    if (!reversedIds.has(transaction.id)) item.amount += Number(transaction.amount || 0);
    item.rows.push(transaction);
    const stamp = transaction.updated_at || transaction.created_at || "";
    if (stamp > item.latest) item.latest = stamp;
  });

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
        const activeRows = rows.filter(row => !reversedIds.has(row.id));
        const matrixRows = activeRows.filter(row => String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
        const manualRows = activeRows.filter(row => !String(row.reference_no || "").startsWith(matrixPrefix + month + "|"));
        const amount = record?.amount || 0;
        yearTotal += amount;
        const locked = manualRows.length > 0 || matrixRows.length > 1;
        const selected = amount > 0;
        const savedAt = dateTime(record?.latest);
        const checkbox = '<input type="checkbox" class="matrix-check" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '"' +
          (selected ? " checked" : "") + ((!isSuper || locked) ? " disabled" : "") + ' aria-label="' + esc(month + " " + member.full_name) + '">';
        const amountInput = '<input type="number" class="matrix-amount" data-member="' + esc(member.id) + '" data-month="' + esc(month) + '" data-original-amount="' + (selected ? amount : 0) + '" min="0" step="1" inputmode="numeric" value="' + (selected ? amount : 0) + '"' +
          ((!isSuper || locked) ? " readonly disabled" : "") + ' aria-label="' + esc(month + " amount for " + member.full_name) + '">';
        if (isSuper && !locked) editorRows.push({ memberId: member.id, month, existing: matrixRows[0] || null });
        return '<td><div class="matrix-cell">' +
          (isSuper ? '<label class="matrix-toggle">' + checkbox + '<span>জমা</span></label>' : "") +
          amountInput +
          (matrixRows.length > 1 ? '<small class="cell-date">Duplicate entry · review</small>' : (manualRows.length ? '<small class="cell-date">Manual entry</small>' : (savedAt ? '<small class="cell-date">' + esc(savedAt) + '</small>' : ""))) +
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
      return {
        memberId: input.dataset.member,
        month: input.dataset.month,
        amount: selected ? Number(input.value) : 0,
        original: Number(input.dataset.originalAmount || 0)
      };
    }).filter(entry => Math.abs(entry.amount - entry.original) > 0.000001);

    const invalid = entries.find(entry => entry.amount < 0 || !Number.isFinite(entry.amount) || (entry.amount > 0 && entry.amount > 999999999999.99));
    if (invalid) { toast("প্রতিটি Amount শূন্য বা বৈধ ধনাত্মক সংখ্যা হতে হবে।", true); return; }
    if (!entries.length) {
      status.textContent = "কোনো পরিবর্তন নেই।";
      toast("সংরক্ষণের জন্য নতুন পরিবর্তন পাওয়া যায়নি।");
      return;
    }
    if (!window.confirm("Contribution Matrix-এর " + entries.length + "টি পরিবর্তন Confirm করে Save করবেন?")) return;

    saveButton.disabled = true;
    status.textContent = "একসঙ্গে নিরাপদে সংরক্ষণ হচ্ছে…";
    try {
      const { data, error } = await supabase.rpc("save_contribution_matrix", {
        p_idempotency_key: crypto.randomUUID(),
        p_changes: entries.map(entry => ({
          member_id: entry.memberId,
          month: entry.month + "-01",
          amount: entry.amount
        }))
      });
      if (error) throw error;
      const changed = Array.isArray(data) ? data.filter(row => row.status !== "unchanged").length : entries.length;
      status.textContent = changed + "টি পরিবর্তন সংরক্ষিত হয়েছে।";
      toast("Contribution Matrix সংরক্ষণ সম্পন্ন।");
      await loadMatrix();
    } catch (error) {
      console.error(error);
      status.textContent = "পরিবর্তন সংরক্ষণ হয়নি।";
      toast("Save error: " + (error.message || "Unknown error") + "। কোনো আংশিক পরিবর্তন রাখা হয়নি; বর্তমান হিসাব Reload করে যাচাই করুন।", true);
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