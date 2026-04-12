#!/usr/bin/env node
/**
 * Captcha Manual Queue — local UI for jobs that can't be auto-submitted.
 *
 * Pulls matched jobs from scripts/aastha-jobs-matched.json, persists per-job
 * status to scripts/aastha/captcha-queue.json, and serves a small HTML UI at
 * http://localhost:7777 where you click through each one.
 *
 * Usage:
 *   node scripts/aastha/captcha-queue-server.mjs
 *   node scripts/aastha/captcha-queue-server.mjs --port=8080
 *   node scripts/aastha/captcha-queue-server.mjs --source=scripts/aastha-jobs-matched.json
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith("--port="));
const PORT = portArg ? parseInt(portArg.split("=")[1], 10) : 7777;
const sourceArg = args.find(a => a.startsWith("--source="));
const SOURCE = resolve(ROOT, sourceArg?.split("=")[1] || "scripts/aastha-jobs-matched.json");
const STATE_PATH = resolve(ROOT, "scripts/aastha/captcha-queue.json");

const CANDIDATE = {
  name: "Aastha Aggarwal",
  email: "aastha.aggarwal1@gmail.com",
  phone: "347-224-9624",
  linkedIn: "https://www.linkedin.com/in/aastar",
  location: "New York, NY",
  currentEmployer: "Ironhold Capital",
  currentTitle: "Investment Analyst",
  school: "Columbia University",
  degree: "M.S. Applied Analytics",
  gpa: "3.6",
  graduation: "May 2025",
  sponsorship: "Yes, requires H-1B sponsorship",
  authorizedUS: "No",
  noticePeriod: "Available immediately",
  resumePath: "blob/aastha_resume.pdf",
};

// ── State: merge source jobs with persisted statuses ──
function jobKey(j) { return `${j.board}:${j.job_id}`; }

function loadState() {
  if (!existsSync(SOURCE)) {
    console.error(`Source file not found: ${SOURCE}`);
    console.error(`Run: node scripts/batch-apply-aastha.mjs --dry-run  first`);
    process.exit(1);
  }
  const jobs = JSON.parse(readFileSync(SOURCE, "utf8"));

  let persisted = {};
  if (existsSync(STATE_PATH)) {
    try {
      persisted = JSON.parse(readFileSync(STATE_PATH, "utf8")).statuses || {};
    } catch {}
  }

  return jobs.map(j => ({
    key: jobKey(j),
    board: j.board,
    job_id: j.job_id,
    title: j.title,
    location: j.location || "",
    url: j.url || "",
    embedUrl: `https://boards.greenhouse.io/embed/job_app?for=${j.board}&token=${j.job_id}`,
    score: j.score || 0,
    status: persisted[jobKey(j)]?.status || "pending",
    note: persisted[jobKey(j)]?.note || "",
    updatedAt: persisted[jobKey(j)]?.updatedAt || null,
  }));
}

function saveState(queue) {
  const statuses = {};
  for (const q of queue) {
    if (q.status !== "pending" || q.note) {
      statuses[q.key] = { status: q.status, note: q.note, updatedAt: q.updatedAt };
    }
  }
  writeFileSync(STATE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), statuses }, null, 2));
}

let queue = loadState();

// ── HTML UI ──
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Captcha Queue — Aastha</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, ui-sans-serif, system-ui, sans-serif; background: #0b0e14; color: #cdd6f4; margin: 0; padding: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #7f849c; font-size: 13px; margin-bottom: 16px; }
  .panel { background: #11141c; border: 1px solid #232836; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #89b4fa; margin: 0 0 10px; }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 6px 14px; font-size: 13px; }
  .grid .k { color: #7f849c; }
  .grid .v { font-family: ui-monospace, Menlo, monospace; cursor: pointer; }
  .grid .v:hover { color: #a6e3a1; }
  .stats { display: flex; gap: 16px; margin-bottom: 12px; font-size: 13px; }
  .stat { background: #11141c; border: 1px solid #232836; border-radius: 6px; padding: 6px 12px; }
  .stat b { color: #f9e2af; }
  .stat.done b { color: #a6e3a1; }
  .stat.skipped b { color: #f38ba8; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1e222e; vertical-align: top; }
  th { color: #7f849c; font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; position: sticky; top: 0; background: #0b0e14; }
  tr.pending { }
  tr.submitted td { opacity: 0.4; }
  tr.skipped td { opacity: 0.3; color: #f38ba8; }
  tr.failed td { opacity: 0.5; color: #f38ba8; }
  a { color: #89b4fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  button { background: #232836; color: #cdd6f4; border: 1px solid #313747; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; margin-right: 4px; }
  button:hover { background: #313747; }
  button.primary { background: #89b4fa; color: #11141c; border-color: #89b4fa; }
  button.primary:hover { background: #b4befe; }
  button.danger { border-color: #f38ba8; color: #f38ba8; }
  .score { font-family: ui-monospace, Menlo, monospace; color: #f9e2af; font-weight: 600; }
  .filters { margin-bottom: 10px; }
  .filters label { margin-right: 14px; font-size: 13px; color: #cdd6f4; cursor: pointer; }
  .toast { position: fixed; bottom: 20px; right: 20px; background: #a6e3a1; color: #11141c; padding: 8px 14px; border-radius: 6px; font-size: 13px; display: none; }
  .toast.show { display: block; }
  .bookmarklet { display: inline-block; background: #a6e3a1; color: #11141c; font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 6px; text-decoration: none; cursor: grab; border: 2px dashed #313747; }
  .bookmarklet:hover { background: #b4befe; text-decoration: none; }
</style>
</head>
<body>
<h1>Captcha Manual Queue — Aastha Aggarwal</h1>
<div class="sub">Open a job (goes to direct Greenhouse embed form). Click the bookmarklet to auto-fill. Upload resume, solve captcha, submit. Mark done.</div>

<div class="panel" style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
  <div style="flex:1;min-width:300px;">
    <h2>Candidate Info (click to copy)</h2>
    <div class="grid" id="candidate"></div>
  </div>
  <div style="flex:0 0 auto;">
    <h2>Autofill Bookmarklet</h2>
    <p style="font-size:12px;color:#7f849c;margin:0 0 8px;">Drag this to your bookmark bar. Click it on any open Greenhouse form.</p>
    <a id="bookmarklet" class="bookmarklet" href="#">Fill Form</a>
    <p style="font-size:11px;color:#585b70;margin:8px 0 0;">Fills name, email, phone, LinkedIn, location, common questions. Resume upload is manual (browser security).</p>
  </div>
</div>

<div class="stats" id="stats"></div>

<div class="filters">
  <label><input type="checkbox" id="hide-done" checked> Hide submitted/skipped</label>
  <button onclick="resetAll()" class="danger">Reset all statuses</button>
</div>

<table>
  <thead>
    <tr><th>#</th><th>Score</th><th>Board</th><th>Title</th><th>Location</th><th>Actions</th></tr>
  </thead>
  <tbody id="rows"></tbody>
</table>

<div class="toast" id="toast">Copied</div>

<script>
const CANDIDATE = ${JSON.stringify(CANDIDATE)};
let queue = [];

// ── Bookmarklet: auto-fills Greenhouse embed forms ──
const FILL_SCRIPT = \`(function(){
  function s(id,v){var e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}}
  function sq(sel,v){var e=document.querySelector(sel);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}}
  s('first_name','\${CANDIDATE.name.split(' ')[0]}');
  s('last_name','\${CANDIDATE.name.split(' ').slice(1).join(' ')}');
  s('email','\${CANDIDATE.email}');
  s('phone','\${CANDIDATE.phone}');
  s('location','\${CANDIDATE.location}');
  s('resume_text','');
  var inputs=document.querySelectorAll('input[type=text],input[type=url],input[type=email],input[type=tel],textarea,select');
  inputs.forEach(function(el){
    var n=(el.name||'').toLowerCase();
    var lbl='';
    var labelEl=el.closest('.field')?.querySelector('label')||el.closest('div')?.querySelector('label');
    if(labelEl)lbl=labelEl.textContent.toLowerCase();
    var ctx=n+' '+lbl;
    if(!el.value){
      if(ctx.match(/linkedin/))el.value='\${CANDIDATE.linkedIn}';
      else if(ctx.match(/salary|compensation/))el.value='Open to discussion';
      else if(ctx.match(/how did you hear|referral|source/))el.value='Company website';
      else if(ctx.match(/year|experience/))el.value='3';
      else if(ctx.match(/current.*(title|role|position)/))el.value='\${CANDIDATE.currentTitle}';
      else if(ctx.match(/employer|company/))el.value='\${CANDIDATE.currentEmployer}';
      else if(ctx.match(/website|portfolio|github/))el.value='\${CANDIDATE.linkedIn}';
      else if(ctx.match(/sponsor|visa|immigration/))el.value='\${CANDIDATE.sponsorship}';
      else if(ctx.match(/relocat/))el.value='No, based in New York';
      else if(ctx.match(/start.?date|available|notice/))el.value='\${CANDIDATE.noticePeriod}';
      else if(ctx.match(/location|city|where/))el.value='\${CANDIDATE.location}';
      else if(ctx.match(/full.?name|legal.?name/))el.value='\${CANDIDATE.name}';
      else if(ctx.match(/school|university|college/))el.value='\${CANDIDATE.school}';
      else if(ctx.match(/degree/))el.value='\${CANDIDATE.degree}';
      else if(ctx.match(/gpa/))el.value='\${CANDIDATE.gpa}';
      else if(ctx.match(/graduat/))el.value='\${CANDIDATE.graduation}';
      else if(ctx.match(/program|language|skill/))el.value='Python, R, Java, SQL, Excel';
      if(el.value)el.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  var checks=document.querySelectorAll('input[type=radio],input[type=checkbox]');
  checks.forEach(function(el){
    var lbl=(el.closest('.field')?.textContent||el.closest('label')?.textContent||'').toLowerCase();
    if(lbl.match(/authorized/)&&el.value==='No')el.click();
    else if(lbl.match(/sponsor/)&&el.value==='Yes')el.click();
    else if(lbl.match(/veteran|military/)&&el.value==='No')el.click();
    else if(lbl.match(/privacy|consent|agree/)&&!el.checked)el.click();
  });
  var ct=0;inputs.forEach(function(e){if(e.value)ct++;});
  alert('Auto-filled '+ct+' fields. Upload resume manually, then solve captcha & submit.');
})()\`;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1200);
}

function copy(text) {
  navigator.clipboard.writeText(text);
  toast("Copied: " + text.slice(0, 40));
}

function renderCandidate() {
  const el = document.getElementById("candidate");
  el.innerHTML = Object.entries(CANDIDATE).map(([k, v]) =>
    \`<div class="k">\${k}</div><div class="v" onclick="copy(\${JSON.stringify(v)})">\${v}</div>\`
  ).join("");
  // Build bookmarklet href
  document.getElementById("bookmarklet").href = "javascript:" + encodeURIComponent(FILL_SCRIPT);
}

function renderStats() {
  const counts = queue.reduce((a, q) => (a[q.status] = (a[q.status] || 0) + 1, a), {});
  const total = queue.length;
  document.getElementById("stats").innerHTML = \`
    <div class="stat">Total: <b>\${total}</b></div>
    <div class="stat">Pending: <b>\${counts.pending || 0}</b></div>
    <div class="stat done">Submitted: <b>\${counts.submitted || 0}</b></div>
    <div class="stat skipped">Skipped: <b>\${counts.skipped || 0}</b></div>
    <div class="stat skipped">Failed: <b>\${counts.failed || 0}</b></div>
  \`;
}

function renderRows() {
  const hideDone = document.getElementById("hide-done").checked;
  const tbody = document.getElementById("rows");
  const filtered = queue
    .map((q, i) => ({ ...q, rank: i + 1 }))
    .filter(q => !hideDone || q.status === "pending");
  tbody.innerHTML = filtered.map(q => \`
    <tr class="\${q.status}">
      <td>\${q.rank}</td>
      <td class="score">\${q.score}</td>
      <td>\${q.board}</td>
      <td><a href="\${q.embedUrl}" target="_blank" rel="noopener">\${q.title}</a></td>
      <td>\${q.location}</td>
      <td>
        <button class="primary" onclick="openAndFill('\${q.embedUrl}', '\${q.key}')">Open + Fill</button>
        <button onclick="mark('\${q.key}', 'submitted')">✓ Done</button>
        <button onclick="mark('\${q.key}', 'skipped')">Skip</button>
        <button onclick="mark('\${q.key}', 'failed')">✗ Fail</button>
        <button onclick="mark('\${q.key}', 'pending')">↺</button>
      </td>
    </tr>
  \`).join("");
}

function openAndFill(url, key) {
  const w = window.open(url, "_blank");
  // Attempt autofill after the page loads (same-origin won't apply, but embed forms are on boards.greenhouse.io)
  // Fallback: user clicks bookmarklet
  toast("Opened form. Use bookmarklet to auto-fill if needed.");
}

async function mark(key, status) {
  const res = await fetch("/api/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, status }),
  });
  queue = (await res.json()).queue;
  renderStats(); renderRows();
}

async function resetAll() {
  if (!confirm("Reset all statuses to pending?")) return;
  const res = await fetch("/api/reset", { method: "POST" });
  queue = (await res.json()).queue;
  renderStats(); renderRows();
}

async function load() {
  const res = await fetch("/api/queue");
  queue = (await res.json()).queue;
  renderCandidate(); renderStats(); renderRows();
}

document.getElementById("hide-done").addEventListener("change", renderRows);
load();
</script>
</body>
</html>`;

// ── HTTP server ──
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(HTML);
    }
    if (req.method === "GET" && req.url === "/api/queue") {
      return json(res, 200, { queue });
    }
    if (req.method === "POST" && req.url === "/api/update") {
      const { key, status, note } = await readBody(req);
      const job = queue.find(q => q.key === key);
      if (!job) return json(res, 404, { error: "not found" });
      job.status = status;
      if (note !== undefined) job.note = note;
      job.updatedAt = new Date().toISOString();
      saveState(queue);
      return json(res, 200, { queue });
    }
    if (req.method === "POST" && req.url === "/api/reset") {
      for (const q of queue) { q.status = "pending"; q.note = ""; q.updatedAt = null; }
      saveState(queue);
      return json(res, 200, { queue });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Captcha queue UI → http://localhost:${PORT}`);
  console.log(`  Source: ${SOURCE}`);
  console.log(`  State:  ${STATE_PATH}`);
  console.log(`  Jobs loaded: ${queue.length}\n`);
});
