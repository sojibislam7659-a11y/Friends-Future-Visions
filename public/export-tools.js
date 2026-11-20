const exportTables = [
  ["Members", "members"],
  ["Profiles", "profiles"],
  ["Member Directory", "member_directory"],
  ["Contribution Rates", "member_contribution_rates"],
  ["Financial Transactions", "financial_transactions"],
  ["Financial Postings", "financial_postings"],
  ["Transaction Audit", "financial_transaction_audit"],
  ["Payment Submissions", "payment_submissions"],
  ["Payment Methods", "payment_methods"],
  ["Committee Proofs", "committee_proofs"],
  ["Committee Documents", "committee_documents"],
  ["Private Document Index", "member_private_documents"],
  ["Profile Change Requests", "profile_change_requests"],
  ["Site Settings", "site_settings"],
  ["Committee Rules", "committee_rules"],
  ["Notices", "notices"]
];

let xlsxPromise;
let zipPromise;

async function loadXlsx() {
  xlsxPromise ||= import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  return xlsxPromise;
}

async function loadZip() {
  zipPromise ||= import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const module = await zipPromise;
  return module.default || module.JSZip;
}

function safeFilename(value) {
  return String(value || "FFV-Export")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "FFV-Export";
}

function cellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function uniqueSheetName(value, used) {
  let name = String(value || "Data").replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || "Data";
  let candidate = name, suffix = 2;
  while (used.has(candidate)) {
    const tail = " " + suffix++;
    candidate = name.slice(0, 31 - tail.length) + tail;
  }
  used.add(candidate);
  return candidate;
}

export async function downloadWorkbook(sheets, filename) {
  if (!Array.isArray(sheets) || !sheets.length) throw new Error("Export করার মতো কোনো তথ্য পাওয়া যায়নি।");
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const used = new Set();
  for (const item of sheets) {
    const rows = Array.isArray(item.rows) ? item.rows : [];
    const sheet = XLSX.utils.aoa_to_sheet(rows.map(row => row.map(cellValue)));
    const width = Math.max(10, ...rows.map(row => row.length));
    sheet["!cols"] = Array.from({ length: width }, (_, index) => ({
      wch: Math.min(42, Math.max(12, ...rows.slice(0, 80).map(row => String(cellValue(row[index])).length + 2)))
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, uniqueSheetName(item.name, used));
  }
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), safeFilename(filename) + ".xlsx");
}

function readCell(cell) {
  const controls = [...cell.querySelectorAll("input,select,textarea")];
  if (controls.length) return controls.map(control => {
    if (control.type === "checkbox") return control.checked ? "Yes" : "No";
    return control.value;
  }).join(" | ");
  return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
}

function pageSnapshot() {
  const root = document.getElementById("pageContent") || document.getElementById("publicData") || document.querySelector("main.page");
  if (!root) throw new Error("বর্তমান পেজ পাওয়া যায়নি।");
  const title = root.querySelector("h1")?.innerText?.trim() || document.title || "Page Export";
  const sections = [];
  const tables = [...root.querySelectorAll("table")];
  const cards = [...root.querySelectorAll(".card")];
  const headings = [...root.querySelectorAll("h2,h3")].map(node => node.innerText.trim()).filter(Boolean);
  const paragraphs = [...root.querySelectorAll("p,.lead,.notice,.success,.error")].map(node => node.innerText.trim()).filter(Boolean);
  if (cards.length) {
    sections.push({
      name: "Summary",
      rows: [["Field", "Value"], ...cards.map(card => [
        card.querySelector(".label")?.innerText || card.querySelector("strong")?.innerText || "Summary",
        card.querySelector(".value")?.innerText || card.innerText.trim()
      ])]
    });
  }
  tables.forEach((table, index) => {
    const rows = [...table.querySelectorAll("tr")].map(row => [...row.querySelectorAll("th,td")].map(readCell));
    if (rows.length) sections.push({ name: "Table " + (index + 1), rows });
  });
  if (!sections.length) {
    const lines = (root.innerText || "").split("\n").map(line => line.trim()).filter(Boolean);
    sections.push({ name: "Page Data", rows: [["Details"], ...lines.map(line => [line])] });
  }
  return { title, sections, headings, paragraphs };
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function paragraph(text, style) {
  const pStyle = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "";
  return "<w:p>" + pStyle + "<w:r><w:rPr><w:rFonts w:ascii=\"Aptos\" w:hAnsi=\"Aptos\" w:eastAsia=\"Noto Sans Bengali\" w:cs=\"Noto Sans Bengali\"/></w:rPr><w:t xml:space=\"preserve\">" + xmlEscape(text) + "</w:t></w:r></w:p>";
}

function wordTable(rows) {
  if (!rows?.length) return "";
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const columnWidth = Math.max(220, Math.floor(15398 / columnCount));
  const grid = Array.from({ length: columnCount }, () => "<w:gridCol w:w=\"" + columnWidth + "\"/>").join("");
  const tableRows = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, index) => {
      const value = row[index] ?? "";
      const fill = rowIndex === 0 ? '<w:shd w:fill="DCECE0"/>' : "";
      return "<w:tc><w:tcPr><w:tcW w:w=\"" + columnWidth + "\" w:type=\"dxa\"/>" + fill + "</w:tcPr>" + paragraph(value) + "</w:tc>";
    }).join("");
    return "<w:tr>" + cells + "</w:tr>";
  }).join("");
  return "<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/><w:tblW w:w=\"15398\" w:type=\"dxa\"/><w:tblLayout w:type=\"fixed\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/><w:left w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/><w:right w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/><w:insideV w:val=\"single\" w:sz=\"4\" w:color=\"B8C9BE\"/></w:tblBorders></w:tblPr><w:tblGrid>" + grid + "</w:tblGrid>" + tableRows + "</w:tbl>";
}

export async function downloadWordDocument(title, sections, filename) {
  if (!Array.isArray(sections) || !sections.length) throw new Error("Word ফাইলে যোগ করার মতো তথ্য পাওয়া যায়নি।");
  const JSZip = await loadZip();
  const body = [paragraph(title, "Title")];
  body.push(paragraph("Friends Future Vision Forever · Generated: " + new Date().toLocaleString("en-GB")));
  for (const section of sections) {
    if (section.name) body.push(paragraph(section.name, "Heading1"));
    for (const line of section.paragraphs || []) body.push(paragraph(line));
    if (section.rows?.length) body.push(wordTable(section.rows));
  }
  body.push('<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>');
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join("") + "</w:body></w:document>";
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Noto Sans Bengali" w:cs="Noto Sans Bengali"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="176653"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="176653"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C9BE"/><w:left w:val="single" w:sz="4" w:color="B8C9BE"/><w:bottom w:val="single" w:sz="4" w:color="B8C9BE"/><w:right w:val="single" w:sz="4" w:color="B8C9BE"/><w:insideH w:val="single" w:sz="4" w:color="B8C9BE"/><w:insideV w:val="single" w:sz="4" w:color="B8C9BE"/></w:tblBorders></w:tblPr></w:style>' +
    "</w:styles>";
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.folder("_rels").file(".rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const word = zip.folder("word");
  word.file("document.xml", documentXml);
  word.file("styles.xml", stylesXml);
  word.folder("_rels").file("document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
  downloadBlob(blob, safeFilename(filename) + ".docx");
}

export async function exportCurrentPage(format) {
  const snapshot = pageSnapshot();
  if (format === "xlsx") {
    const sheets = [{ name: "Page Summary", rows: [["Page", snapshot.title], ["Generated", new Date().toISOString()], ...snapshot.paragraphs.map(text => ["Note", text])] }, ...snapshot.sections];
    await downloadWorkbook(sheets, safeFilename(snapshot.title) + "-Report");
  } else {
    const sections = [
      { name: "Page Notes", paragraphs: snapshot.paragraphs },
      ...snapshot.sections.map(section => ({ name: section.name, rows: section.rows }))
    ];
    await downloadWordDocument(snapshot.title, sections, safeFilename(snapshot.title) + "-Report");
  }
}

async function readAllRows(supabase, table) {
  const all = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select("*").range(offset, offset + pageSize - 1);
    if (error) throw new Error(table + " export failed: " + error.message);
    const page = data || [];
    all.push(...page);
    if (page.length < pageSize) break;
    if (all.length > 50000) throw new Error(table + " contains more than 50,000 rows; export this table separately.");
  }
  return all;
}

export async function exportFullWebsite(supabase, format) {
  const generatedAt = new Date().toISOString();
  const sheets = [{ name: "Export Guide", rows: [
    ["Friends Future Vision Forever — Full Data Export"],
    ["Generated at (UTC)", generatedAt],
    ["Scope", "Application tables visible to the Super Admin under current RLS policies."],
    ["Included", "Member data, profiles, directory, contribution rates, financial ledger and audit, payment records, document metadata, profile change requests, site settings, rules and notices."],
    ["Excluded", "Passwords, auth.users credentials, secret keys, push subscription endpoints, private schema internals, and the binary contents of uploaded files."],
    ["Privacy", "This workbook contains sensitive member information. Store and share it securely."]
  ] }];
  const docSections = [{ name: "Export Scope", paragraphs: [
    "Generated at (UTC): " + generatedAt,
    "This export contains application tables visible to the Super Admin under current row-level security policies.",
    "Passwords, authentication credentials, secret keys, push subscription endpoints, private schema internals and uploaded file bytes are intentionally excluded.",
    "This document contains sensitive member information. Store and share it securely."
  ] }];
  for (const [sheetName, table] of exportTables) {
    const rows = await readAllRows(supabase, table);
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const dataRows = rows.map(row => keys.map(key => cellValue(row[key])));
    const tableRows = [keys, ...dataRows];
    sheets.push({ name: sheetName, rows: tableRows.length > 1 ? tableRows : [["No records"]] });
    docSections.push({ name: sheetName + " (" + rows.length + " rows)", rows: tableRows.length > 1 ? tableRows : [["No records"]] });
  }
  if (format === "docx") {
    await downloadWordDocument("Friends Future Vision Forever — Full Website Data", docSections, "FFV-Full-Website-Data");
  } else {
    await downloadWorkbook(sheets, "FFV-Full-Website-Data");
  }
  return { tableCount: exportTables.length, generatedAt };
}
