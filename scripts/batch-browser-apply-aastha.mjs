#!/usr/bin/env node
/**
 * Batch Browser Apply for Aastha Aggarwal
 *
 * Uses Puppeteer (real Chrome) to bypass reCAPTCHA Enterprise.
 * Fetches jobs from the crawler API + IB Greenhouse boards,
 * filters for matching roles, and applies via headless browser.
 *
 * Usage:
 *   node scripts/batch-browser-apply-aastha.mjs                  # apply to all
 *   node scripts/batch-browser-apply-aastha.mjs --dry-run         # list only
 *   node scripts/batch-browser-apply-aastha.mjs --limit=5         # first 5
 *   node scripts/batch-browser-apply-aastha.mjs --board=williamblair
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveField, getSynonyms } from "./lib/field-resolver.mjs";
import { loadProfile } from "./lib/candidate-profile-loader.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CRAWLER_API = process.env.CRAWLER_API || "https://allocation-crawler-service.netlify.app/api/crawler";

// Resolve the candidate at startup. `--user=<id>` (or USER_ID env var) picks
// the profile; defaults to Aastha for backwards-compat with existing cron/
// manual invocations.
const USER_ID =
  process.argv.find((a) => a.startsWith("--user="))?.split("=")[1] ||
  process.env.USER_ID ||
  "aastha.aggarwal1@gmail.com";

const { profile: candidateProfile, candidate: loadedCandidate, resumePath } = await loadProfile({
  userId: USER_ID,
  crawlerApi: CRAWLER_API,
});

const RESUME_PDF_PATH = resumePath || resolve(ROOT, "blob/aastha_resume.pdf");

// The rest of this file references `candidate.<field>`. For Aastha the loader
// delivers a fully-populated object from candidate-profile-aastha.mjs; for
// any other user it's derived from their /users answers blob, with empty
// fields falling through to the field-resolver's LLM layer.
const candidate = loadedCandidate;

// ── Question answering — uses 3-layer field resolver ──
// See scripts/lib/field-resolver.mjs for the implementation.
// Kept as thin wrappers for backward compatibility with the rest of the script.

const useLLM = !process.env.NO_LLM; // disable LLM with NO_LLM=1

async function getComboboxOptions(page, inputId) {
  const sel = /^\d/.test(inputId) ? `[id="${inputId}"]` : `#${inputId.replace(/([[\]()])/g, "\\$1")}`;
  const el = await page.$(sel);
  if (!el) return null;
  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await el.click();
  await new Promise(r => setTimeout(r, 600));
  const opts = await page.evaluate((id) => {
    const lb = document.querySelector(`#react-select-${id}-listbox`);
    if (!lb) return null;
    return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
  }, inputId);
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 200));
  return opts;
}

// ── Job filtering (same logic as batch-apply-aastha.mjs) ──

const TARGET_TITLE_PATTERNS = [
  /\banalyst\b/i, /\banalytics\b/i, /\bdata\s*analyst/i, /\bbusiness\s*analyst/i,
  /\bfinancial\s*analyst/i, /\brisk\s*analyst/i, /\bcredit\s*analyst/i,
  /\bquantitative\s*analyst/i, /\bresearch\s*analyst/i, /\binvestment\s*analyst/i,
  /\bdata\s*scientist/i, /\bapplied\s*scientist/i,
  /\binvestment\s*banking/i, /\bm&a\b/i, /\bcapital\s*(advisory|markets)/i,
  /\bprivate\s*(equity|capital|debt|wealth)/i, /\bequity\b.*\b(research|analyst|associate)/i,
  /\bportfolio\b.*\b(analyst|associate|valuation|management)/i,
  /\bfinance\b.*\b(analyst|associate)/i, /\bfp&a\b/i, /\bvaluation/i,
  /\bfund\s*(accounting|operations)/i, /\btreasury/i, /\brestructuring/i,
  /\bclient\s*relations/i, /\bsummer\s*analyst/i, /\bassociate\b/i,
  /\bforecast/i, /\bpricing/i, /\bmodeling\b/i,
];

const EXCLUDE_TITLE_PATTERNS = [
  /\bsoftware\s*engineer/i, /\bsre\b/i, /\bdevops\b/i, /\binfrastructure\b/i,
  /\bfrontend\b/i, /\bbackend\b/i, /\bfull\s*stack/i, /\bplatform\s*engineer/i,
  /\bsecurity\s*engineer/i, /\blegal\b/i, /\bcounsel\b/i, /\bdesign/i,
  /\brecruiter\b/i, /\bpeople\s*ops/i, /\bhr\b/i, /\bcustomer\s*success/i,
  /\bsales\s*(manager|director|lead|executive)\b/i, /\baccount\s*(manager|executive)/i,
  /\bproduct\s*manager/i, /\bprogram\s*manager/i, /\bengineering\s*manager/i,
  /\bvice\s*president\b/i, /\bhead\s+of\b/i, /\bsenior\s+manager/i,
  /\bdirector\b(?!.*\b(analyst|associate))/i, /\bparalegal\b/i,
  /\bexecutive\s*assistant/i, /\bdesktop\s*support/i, /\badministrative/i,
  /\bworkday\b/i, /\bjira\b/i, /\bsalesforce\b/i, /\bsite\s*reliability/i,
  /\bmarketing\b(?!.*\bintern)/i, /\bpayroll\s*specialist/i,
];

const VALID_LOCATIONS = [
  /new\s*york/i, /nyc/i, /\bny\b/i, /san\s*francisco/i, /\bsf\b/i,
  /remote/i, /united\s*states/i, /\bus\b/i, /\busa\b/i,
  /chicago/i, /boston/i, /\bct\b/i, /greenwich/i, /stamford/i,
  /charlotte/i, /atlanta/i, /anywhere/i, /hybrid/i, /flexible/i,
];

const GREENHOUSE_BOARDS = new Set([
  "coinbase", "deshaw", "aqr", "aquaticcapitalmanagement", "gravitonresearchcapital",
  "togetherai", "databricks", "brex", "lithic", "figma", "dbtlabsinc",
  "planetscale", "deepmind", "runwayml", "asana", "affirm", "marqeta",
  "melio", "alloy", "datadog", "grafanalabs", "cockroachlabs", "anthropic",
  "perplexity", "anyscale", "plaid", "mercury", "vercel", "temporaltechnologies",
  "supabase", "scaleai", "janestreet", "towerresearchcapital",
  "lincolninternational", "williamblair", "generalatlantic", "stepstone", "liontree",
]);

function isTargetJob(title) {
  if (EXCLUDE_TITLE_PATTERNS.some(p => p.test(title))) return false;
  return TARGET_TITLE_PATTERNS.some(p => p.test(title));
}
function isUSLocation(loc) { return !loc || VALID_LOCATIONS.some(p => p.test(loc)); }

function scorePriority(title, tags) {
  const t = title.toLowerCase();
  let score = 0;
  if (/investment\s*banking\s*analyst/i.test(t)) score += 120;
  if (/investment\s*banking\s*associate/i.test(t)) score += 115;
  if (/investment\s*banking/i.test(t) && score === 0) score += 110;
  if (/m&a\s*(analyst|associate)/i.test(t)) score += 115;
  if (/m&a/i.test(t) && score === 0) score += 100;
  if (/capital\s*advisory/i.test(t)) score += 100;
  if (/private\s*equity\s*analyst/i.test(t)) score += 110;
  if (/equity\s*research\s*(analyst|associate)/i.test(t)) score += 105;
  if (/summer\s*analyst/i.test(t)) score += 100;
  if (/valuation/i.test(t)) score += 95;
  if (/data\s*analyst/i.test(t)) score += 100;
  if (/financial\s*analyst/i.test(t)) score += 100;
  if (/fp&a/i.test(t)) score += 95;
  if (/data\s*scientist/i.test(t)) score += 95;
  if (/risk\s*analyst/i.test(t)) score += 85;
  if (/research\s*analyst/i.test(t)) score += 80;
  if (/portfolio\s*(analyst|valuation)/i.test(t)) score += 80;
  if (/restructuring/i.test(t)) score += 90;
  if (/corporate\s*finance/i.test(t)) score += 85;
  if (/fund\s*(accounting|operations)/i.test(t)) score += 70;
  if (/treasury/i.test(t)) score += 70;
  if (/\banalytics\b/i.test(t) && score === 0) score += 60;
  if (/\banalyst\b/i.test(t) && score === 0) score += 50;
  if (/\bassociate\b/i.test(t) && score === 0) score += 40;
  if (tags?.includes("analyst")) score += 10;
  if (tags?.includes("quant")) score += 10;
  if (/\bintern\b/i.test(t)) score -= 30;
  if (/\bstaff\b/i.test(t) || /\bprincipal\b/i.test(t)) score -= 15;
  return score;
}

// ── Fetch jobs ──

async function fetchJobsByTag(tag) {
  try {
    const res = await fetch(`${CRAWLER_API}/jobs?status=discovered&tag=${tag}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || data || [];
  } catch { return []; }
}

async function fetchGreenhouseBoard(token) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      job_id: String(j.id), board: token, title: j.title,
      url: j.absolute_url, location: j.location?.name || "",
      department: j.departments?.[0]?.name || "", tags: [], status: "discovered",
    }));
  } catch { return []; }
}

// ── Chrome path ──

function findChromePath() {
  const paths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  for (const p of paths) { if (existsSync(p)) return p; }
  throw new Error("Chrome not found. Set CHROME_PATH env var.");
}

// ── Browser-based apply ──

async function applyViaBrowser(chromePath, boardToken, jobId, jobTitle) {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 900 });

    // Try new-style URL first, fallback to old
    let embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
    await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 30_000 });

    // Detect form style
    const formStyle = await page.evaluate(() => {
      if (document.querySelector("#application_form")) return "old";
      if (document.querySelector("#application-form") || document.querySelector(".application--form")) return "react";
      return "unknown";
    });

    if (formStyle === "old") {
      // Fall back to old-style handling (same embed URL)
    } else if (formStyle === "unknown") {
      return { success: false, error: "No application form found" };
    }

    await page.waitForSelector("#first_name", { timeout: 10_000 });

    // Helper: fill a React Select combobox. Strategy: open dropdown first,
    // enumerate actual option labels, fuzzy-match against candidate values,
    // click best match. Falls back to typing if no match found.
    async function fillCombobox(selector, value, page) {
      const el = await page.$(selector);
      if (!el) return false;
      const DEBUG_CBX = !!process.env.DEBUG_COMBOBOX;
      const cbxLog = (m) => { if (DEBUG_CBX) console.log(`    [cbx:${selector.substring(0,30)}] ${m}`); };

      // Build candidate list — expand using synonym table from field-resolver
      const candidates = getSynonyms(value);
      const v = value.toLowerCase();
      // Additional month/GPA synonyms not in the generic table
      if (v === "consent") candidates.push("Consent", "I consent", "Yes");
      const months = { january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
        july:"07", august:"08", september:"09", october:"10", november:"11", december:"12" };
      if (months[v]) candidates.push(value, v.substring(0,3).charAt(0).toUpperCase() + v.substring(1,3), months[v]);
      if (v.startsWith("3.")) candidates.push("3.4 or higher", "3.5-3.9", "3.5-4.0", "3.0-3.9", value);

      // Scroll element into view — React Select won't open reliably offscreen
      await el.evaluate(n => n.scrollIntoView({ block: "center" }));
      await new Promise(r => setTimeout(r, 200));

      // Blur any previously active element, then focus target and open via
      // keyboard (most reliable for React Select — click can toggle).
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await new Promise(r => setTimeout(r, 100));
      await el.focus();
      await new Promise(r => setTimeout(r, 150));

      // Check for presence of any option element under this input's listbox.
      // Don't rely on offsetParent — React Select can render into portals.
      const verifyOpen = async () => await page.evaluate((sel) => {
        const inp = document.querySelector(sel);
        if (!inp) return false;
        const lb = document.getElementById("react-select-" + inp.id + "-listbox");
        if (!lb) return false;
        return !!lb.querySelector("[role='option'], .select__option");
      }, selector);

      // Try ArrowDown to open (standard React Select keyboard behavior)
      await page.keyboard.press("ArrowDown");
      await new Promise(r => setTimeout(r, 400));
      cbxLog(`after ArrowDown: open=${await verifyOpen()}`);

      if (!(await verifyOpen())) {
        await el.click();
        await new Promise(r => setTimeout(r, 500));
        cbxLog(`after click1: open=${await verifyOpen()}`);
      }
      if (!(await verifyOpen())) {
        await el.click();
        await new Promise(r => setTimeout(r, 500));
        cbxLog(`after click2: open=${await verifyOpen()}`);
      }

      const elId = await page.evaluate((sel) => document.querySelector(sel)?.id, selector);

      // Phase 1: try to pick from the already-open option list via fuzzy match
      const pickedResult = await page.evaluate((inputId, cands) => {
        const listbox = document.getElementById('react-select-' + inputId + '-listbox');
        const opts = listbox ? Array.from(listbox.querySelectorAll('[role="option"], .select__option')) : [];
        const optTexts = opts.map(o => o.textContent.trim());
        if (!opts.length) return { picked: null, opts: optTexts };
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const cand of cands) {
          const nc = norm(cand);
          for (const o of opts) if (norm(o.textContent) === nc) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
          for (const o of opts) if (norm(o.textContent).startsWith(nc) && nc.length >= 2) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
          if (nc.length >= 3) {
            for (const o of opts) if (norm(o.textContent).includes(nc)) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
          }
        }
        return { picked: null, opts: optTexts };
      }, elId, candidates);
      const picked = pickedResult.picked;
      cbxLog(`phase1 opts=${JSON.stringify(pickedResult.opts)} cands=${JSON.stringify(candidates)} picked=${picked}`);
      if (picked) {
        await new Promise(r => setTimeout(r, 400));
        return true;
      }

      // Phase 2: type first candidate and retry matching
      await el.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await new Promise(r => setTimeout(r, 150));
      await el.type(value, { delay: 40 });
      await new Promise(r => setTimeout(r, 1200));

      const picked2 = await page.evaluate((inputId, cands) => {
        const listbox = document.getElementById('react-select-' + inputId + '-listbox');
        const opts = listbox ? Array.from(listbox.querySelectorAll('[role="option"], .select__option')) : [];
        if (!opts.length) return null;
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const cand of cands) {
          const nc = norm(cand);
          for (const o of opts) if (norm(o.textContent).includes(nc) && nc.length >= 2) { o.click(); return o.textContent.trim().substring(0,50); }
        }
        return null;
      }, elId, candidates);

      // Do NOT fall back to first option — that causes wrong answers (e.g., "Yes"
      // when we wanted "No"). If nothing matched, close the dropdown and return
      // false so caller knows the field was not filled.
      if (!picked2) {
        await page.keyboard.press("Escape");
        await new Promise(r => setTimeout(r, 200));
        return false;
      }
      await new Promise(r => setTimeout(r, 400));
      return true;
    }

    // Helper: type into a simple text input by ID
    async function fillInput(id, value, page) {
      const el = await page.$(`#${id.replace(/([[\]()])/g, "\\$1")}`);
      if (!el) return false;
      await el.click({ clickCount: 3 });
      await el.type(value, { delay: 20 });
      return true;
    }

    // Fill basic info
    await fillInput("first_name", candidate.firstName, page);
    await fillInput("last_name", candidate.lastName, page);
    await fillInput("email", candidate.email, page);
    await fillInput("phone", candidate.phone, page);

    // Fill country combobox (React-style)
    await fillCombobox("#country", "United States", page);

    // Fill location combobox (React-style: #candidate-location, old-style: #auto_complete_input)
    const locSelector = (await page.$("#candidate-location")) ? "#candidate-location" : "#auto_complete_input";
    await fillCombobox(locSelector, "New York", page);

    // Upload resume PDF
    if (existsSync(RESUME_PDF_PATH)) {
      const fileInput = await page.$("#resume");
      if (!fileInput) {
        // Old-style: try S3 upload
        const oldFileInput = await page.$("#s3_upload_for_resume input[type='file']");
        if (oldFileInput) await oldFileInput.uploadFile(RESUME_PDF_PATH);
      } else {
        await fileInput.uploadFile(RESUME_PDF_PATH);
      }
      await new Promise(r => setTimeout(r, 3000)); // wait for upload
    } else {
      // Paste resume text fallback
      await page.evaluate((text) => {
        const pasteBtn = document.querySelector('button[data-source="paste"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes("Enter manually"));
        if (pasteBtn) pasteBtn.click();
      }, "");
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate((text) => {
        const ta = document.querySelector('textarea[name*="resume_text"], textarea');
        if (ta) { ta.focus(); ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); }
      }, candidate.resumeText);
    }

    // Fill education section (React-style: combobox inputs)
    const hasSchool = await page.$("#school--0");
    if (hasSchool) {
      await fillCombobox("#school--0", "Columbia University", page);
      await fillCombobox("#degree--0", "Master's", page);
      await fillCombobox("#discipline--0", "Business", page);
      // Year fields are number inputs
      await fillInput("start-year--0", "2023", page);
      await fillInput("end-year--0", "2025", page);
      // Month comboboxes
      await fillCombobox("#start-month--0", "September", page);
      await fillCombobox("#end-month--0", "May", page);
    } else {
      // Old-style education
      const hasOldEdu = await page.evaluate(() => !!document.querySelector("#education_degree_0"));
      if (hasOldEdu) {
        await page.evaluate(() => {
          for (const sel of ["#education_degree_0", "#education_degree"]) {
            const el = document.querySelector(sel);
            if (el) { for (const opt of el.options) { if (opt.textContent.includes("Master")) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); break; } } }
          }
        });
      }
    }

    // Scan all questions and answer them
    const questions = await page.evaluate(() => {
      const qs = [];
      // React-style: inputs with question_ IDs or aria-labels
      document.querySelectorAll("input[id^='question_'], textarea[id^='question_']").forEach(el => {
        let label = "";
        try { const direct = document.querySelector('label[for="' + el.id + '"]'); if (direct) label = direct.textContent.trim(); } catch {}
        if (!label) {
          const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
          label = container?.querySelector("label")?.textContent?.trim() || "";
        }
        if (!label) label = el.getAttribute("aria-label") || "";
        qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: el.getAttribute("role") === "combobox" });
      });
      // Old-style: answers_attributes
      document.querySelectorAll("select[name*='answers_attributes'], input[name*='answers_attributes'], textarea[name*='answers_attributes']").forEach(el => {
        if (el.id?.startsWith("question_")) return; // already captured
        const container = el.closest(".field") || el.parentElement;
        const label = container?.querySelector("label")?.textContent?.trim() || "";
        qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: false, name: el.name });
      });
      // EEO/demographic comboboxes (numeric IDs like 4013621007)
      const seenIds = new Set(qs.map(q => q.id));
      document.querySelectorAll("input[role='combobox']").forEach(el => {
        if (seenIds.has(el.id)) return;
        if (el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline") || el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id === "country" || el.id === "candidate-location" || el.id?.startsWith("iti")) return;
        // Walk up to find a label — check multiple containers
        let label = "";
        const container = el.closest("[class*='field'], [class*='question'], fieldset, [class*='demographic']") || el.parentElement?.parentElement?.parentElement?.parentElement;
        if (container) {
          const lbl = container.querySelector("label");
          if (lbl) label = lbl.textContent.trim();
        }
        // Fallback: aria-label or aria-labelledby
        if (!label) label = el.getAttribute("aria-label") || "";
        if (!label) {
          const lblId = el.getAttribute("aria-labelledby");
          if (lblId) { const lblEl = document.getElementById(lblId); if (lblEl) label = lblEl.textContent.trim(); }
        }
        // Fallback: walk up further
        if (!label) {
          let p = el.parentElement;
          for (let i = 0; i < 6 && p; i++) {
            const lbl = p.querySelector("label, legend, h3, h4, [class*='label']");
            if (lbl && lbl.textContent.trim().length > 2) { label = lbl.textContent.trim(); break; }
            p = p.parentElement;
          }
        }
        qs.push({ id: el.id, tag: el.tagName, type: el.type, role: "combobox", label: label || `unlabeled_combo_${el.id}`, isCombobox: true });
      });
      // Native <select> elements
      document.querySelectorAll("select").forEach(el => {
        if (el.id && qs.some(q => q.id === el.id)) return;
        if (!el.id && !el.name) return;
        if (el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline")) return;
        let label = "";
        const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
        if (container) { const lbl = container.querySelector("label"); if (lbl) label = lbl.textContent.trim(); }
        if (!label) label = el.getAttribute("aria-label") || "";
        if (!label) { const lblId = el.getAttribute("aria-labelledby"); if (lblId) { const lblEl = document.getElementById(lblId); if (lblEl) label = lblEl.textContent.trim(); } }
        qs.push({ id: el.id || "", name: el.name || "", tag: "SELECT", type: "select-one", role: null, label: label || `unlabeled_select_${el.id || el.name}`, isCombobox: false, isNativeSelect: true, options: Array.from(el.options).map(o => o.textContent.trim()).filter(Boolean) });
      });
      return qs;
    });

    console.log(`   Scanned ${questions.length} questions:`);
    for (const q of questions) {
      console.log(`     [${q.tag}${q.isCombobox ? ":combo" : q.isNativeSelect ? ":select" : ""}] ${q.label.slice(0, 70)}${q.options ? ` | opts=${q.options.slice(0,5).join(",")}` : ""}`);
    }

    // ── Answer all questions using 3-layer field resolver ──
    for (const q of questions) {
      try {
        const fieldType = q.isCombobox ? "combobox" : q.isNativeSelect ? "select" : "text";

        // Try heuristic first (no LLM, no option extraction)
        let options = q.options || null;
        let { value: answer, source } = await resolveField(
          q.label, fieldType, options, candidateProfile, { useLLM: false }
        );

        // If heuristic failed and LLM is enabled, extract combobox options and ask LLM
        if (!answer && source === "none" && useLLM) {
          if (q.isCombobox && !options) {
            options = await getComboboxOptions(page, q.id);
          }
          const llmResult = await resolveField(
            q.label, fieldType, options, candidateProfile, { useLLM: true }
          );
          answer = llmResult.value;
          source = llmResult.source;
        }

        if (source === "llm") {
          console.log(`     [LLM] "${q.label.slice(0, 50)}" -> "${(answer || "").slice(0, 40)}"`);
        }

        if (!answer && answer !== "") continue;

        const sel = (/^\d/.test(q.id) || q.id.includes("[")) ? `[id="${q.id}"]` : `#${q.id}`;

        if (q.isCombobox) {
          await fillCombobox(sel, answer, page);
        } else if (q.isNativeSelect) {
          // Native <select> — set value directly
          await page.evaluate((id, name, val) => {
            const el = id ? document.getElementById(id) : document.querySelector(`[name="${name}"]`);
            if (!el) return;
            const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const target = norm(val);
            for (const opt of el.options) {
              if (norm(opt.textContent) === target || norm(opt.textContent).includes(target)) {
                el.value = opt.value;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return;
              }
            }
            // Fallback: try first non-empty option
            if (el.options.length > 1) {
              el.value = el.options[1].value;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, q.id, q.name, answer);
        } else {
          if (answer) await fillInput(q.id, answer, page);
        }
      } catch (err) {
        // Log but don't fail
      }
    }

    // ── EEO / Demographic: fill any remaining unfilled comboboxes ──
    // Standard EEO order: Sex at Birth, Gender Identity, Race, Sexual Orientation, Veteran, Disability
    // Detect EEO fields by their dropdown options (labels are unreliable for numeric IDs)
    const eeoFields = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll("input[role='combobox']").forEach(el => {
        if (["country", "candidate-location"].includes(el.id)) return;
        if (el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline") || el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id?.startsWith("iti") || el.id?.startsWith("question_")) return;
        const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
        const hasValue = ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
        if (hasValue) return;
        results.push({ id: el.id });
      });
      return results;
    });
    for (const eeo of eeoFields) {
      const sel = /^\d/.test(eeo.id) ? `[id="${eeo.id}"]` : `#${eeo.id.replace(/([[\]()])/g, "\\$1")}`;
      // Open the dropdown and read option texts to detect which EEO field this is
      const optionTexts = await page.evaluate((selector) => {
        const inp = document.querySelector(selector);
        if (!inp) return [];
        // Try to read existing listbox options
        const lb = document.querySelector(`#react-select-${inp.id}-listbox`);
        if (!lb) return [];
        return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
      }, sel);
      // Open the dropdown if options not visible
      let opts = optionTexts;
      if (!opts.length) {
        const el = await page.$(sel);
        if (el) {
          await el.evaluate(n => n.scrollIntoView({ block: "center" }));
          await new Promise(r => setTimeout(r, 200));
          await el.focus();
          await page.keyboard.press("ArrowDown");
          await new Promise(r => setTimeout(r, 400));
          opts = await page.evaluate((selector) => {
            const inp = document.querySelector(selector);
            if (!inp) return [];
            const lb = document.querySelector(`#react-select-${inp.id}-listbox`);
            if (!lb) return [];
            return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
          }, sel);
          await page.keyboard.press("Escape");
          await new Promise(r => setTimeout(r, 200));
        }
      }
      // Detect EEO type by option content
      const joined = opts.join(" ").toLowerCase();
      let answer;
      if (joined.includes("heterosexual") || joined.includes("bisexual") || joined.includes("homosexual")) {
        answer = candidateProfile.sexualOrientation || "Decline";
      } else if (joined.includes("asian") || joined.includes("african") || joined.includes("hispanic") || joined.includes("indigenous")) {
        answer = candidateProfile.race || "Decline";
      } else if (joined.includes("disability") || joined.includes("disabled")) {
        answer = candidateProfile.disability === "No" ? "No" : (candidateProfile.disability || "Decline");
      } else if (joined.includes("veteran") || joined.includes("military")) {
        answer = candidateProfile.veteranStatus === "No" ? "I am not a veteran" : (candidateProfile.veteranStatus || "Decline");
      } else if (joined.includes("non-binary") || joined.includes("i prefer to self-describe")) {
        answer = candidateProfile.gender || "Decline"; // Gender identity
      } else if (joined.includes("male") || joined.includes("female")) {
        answer = candidateProfile.gender || "Decline"; // Sex at birth
      } else {
        answer = "Decline";
      }
      try { await fillCombobox(sel, answer, page); } catch {}
    }

    // ── Re-fill education fields if they got cleared ──
    const schoolEmpty = await page.evaluate(() => {
      const el = document.querySelector("#school--0");
      if (!el) return false;
      const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
      return !ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
    });
    if (schoolEmpty) {
      await fillCombobox("#school--0", "Columbia University", page);
      await fillCombobox("#degree--0", "Master of Science", page);
      await fillCombobox("#discipline--0", "Business", page);
    }

    // Check consent/GDPR checkboxes
    await page.evaluate(() => {
      document.querySelectorAll("input[type='checkbox']").forEach(cb => { if (!cb.checked) cb.click(); });
    });

    // Wait for reCAPTCHA
    await new Promise(r => setTimeout(r, 3000));

    // Trigger reCAPTCHA token (works for both old and new forms)
    await page.evaluate(async () => {
      try {
        if (typeof grecaptcha !== "undefined") {
          const key = typeof JBEN !== "undefined" ? JBEN?.Recaptcha?.publicKey : document.querySelector("[data-sitekey]")?.getAttribute("data-sitekey");
          if (key) {
            const token = await grecaptcha.enterprise.execute(key, { action: "apply_to_job" });
            let input = document.querySelector('input[name="g-recaptcha-enterprise-token"]');
            if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = "g-recaptcha-enterprise-token"; const form = document.querySelector("#application-form, #application_form"); if (form) form.appendChild(input); }
            if (input) input.value = token;
          }
        }
      } catch {}
    });

    // Debug: dump filled field values before submission
    if (process.env.DEBUG_NO_SUBMIT) {
      const dump = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("input[type='text'], input[type='email'], input[type='tel'], input[type='search'], textarea, select").forEach(el => {
          if (!el.id && !el.name) return;
          const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
          const label = container?.querySelector("label")?.textContent?.trim().substring(0, 60) || "";
          // For React Select comboboxes, read the rendered selected value
          let value = (el.value || "").substring(0, 40);
          if (el.getAttribute("role") === "combobox") {
            const selDisplay = container?.querySelector(".select__single-value, .select__multi-value__label");
            if (selDisplay) value = "<" + selDisplay.textContent.trim().substring(0, 40) + ">";
          }
          out.push({ id: el.id, label, value, role: el.getAttribute("role") });
        });
        return out;
      });
      console.log("\n── Filled fields dump ──");
      for (const f of dump) console.log(`  [${f.role || f.id.substring(0,20)}] ${f.label.padEnd(45)} = "${f.value}"`);
      try { await page.screenshot({ path: `/tmp/aastha_debug_${boardToken}_${jobId}.png`, fullPage: true }); } catch {}
      return { success: false, error: "DEBUG_NO_SUBMIT set — not submitting" };
    }

    // Submit - find submit button
    const submitClicked = await page.evaluate(() => {
      // React-style: button with "Submit application" text
      const btns = Array.from(document.querySelectorAll("button"));
      const submitBtn = btns.find(b => b.textContent.toLowerCase().includes("submit")) || document.querySelector("#submit_app");
      if (submitBtn) { submitBtn.click(); return true; }
      return false;
    });
    if (!submitClicked) return { success: false, error: "No submit button found" };

    await new Promise(r => setTimeout(r, 12_000));

    // Check result
    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Screenshot for debugging
    try { await page.screenshot({ path: `/tmp/aastha_apply_${boardToken}_${jobId}.png`, fullPage: true }); } catch {}

    if (finalUrl.includes("confirmation") || bodyText.toLowerCase().includes("thank you") || bodyText.toLowerCase().includes("submitted") || bodyText.toLowerCase().includes("we have received")) {
      return { success: true, message: "Application submitted!" };
    }

    // Check for security/verification code field
    const securityCodeVisible = await page.evaluate(() => {
      const field = document.querySelector("#security_code, input[name='security_code'], [aria-label*='security'], [aria-label*='Security'], [aria-label*='verification'], [placeholder*='code']");
      if (field && field.offsetParent !== null) return true;
      // Also check by page text
      const text = document.body.innerText.toLowerCase();
      return text.includes("verification code") || text.includes("security code") || text.includes("6-character code");
    });

    if (securityCodeVisible) {
      // Poll a file for the verification code (user writes it after receiving email).
      // This keeps the browser session alive so the code remains valid.
      const codeFile = `/tmp/aastha_code_${boardToken}_${jobId}.txt`;
      let code = process.env.SECURITY_CODE;
      if (!code) {
        console.log(`    ⏳  Waiting for verification code. Write it to: ${codeFile}`);
        console.log(`    (Poll interval: 3s, timeout: 5 min)`);
        const deadline = Date.now() + 5 * 60 * 1000;
        const { readFileSync, existsSync, unlinkSync } = await import("fs");
        while (Date.now() < deadline) {
          if (existsSync(codeFile)) {
            code = readFileSync(codeFile, "utf8").trim();
            try { unlinkSync(codeFile); } catch {}
            console.log(`    ✓  Code received: ${code}`);
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
        }
        if (!code) return { success: false, error: "Code file not provided within 5 min timeout" };
      }
      {
        console.log(`    Security code field detected; entering ${code}...`);
        // Poll for the actual input field for up to 10 seconds
        let field = null;
        for (let i = 0; i < 20; i++) {
          field = await page.$("#security_code, input[name='security_code'], input[aria-label*='security' i], input[aria-label*='verification' i], input[placeholder*='code' i], input[id*='code' i], input[id*='security' i], input[id*='verif' i]");
          if (field) break;
          await new Promise(r => setTimeout(r, 500));
        }
        if (!field) {
          // Dump all visible inputs to help diagnose
          const inputs = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll("input").forEach(el => {
              if (el.offsetParent !== null || el.type === "text") {
                out.push({ id: el.id, name: el.name, type: el.type, placeholder: el.placeholder, ariaLabel: el.getAttribute("aria-label") });
              }
            });
            return out.slice(0, 30);
          });
          console.log(`    Available inputs: ${JSON.stringify(inputs)}`);
          try { await page.screenshot({ path: `/tmp/aastha_apply_${boardToken}_${jobId}_codePage.png`, fullPage: true }); } catch {}
          return { success: false, error: "Security code input field not found" };
        }
        await field.click({ clickCount: 3 });
        await field.type(code, { delay: 30 });
        await new Promise(r => setTimeout(r, 500));
        // Click submit/verify
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const submitBtn = btns.find(b => /submit|verify|continue|confirm/i.test(b.textContent)) || document.querySelector("#submit_app");
          if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 10_000));
        const afterBody = await page.evaluate(() => document.body.innerText);
        try { await page.screenshot({ path: `/tmp/aastha_apply_${boardToken}_${jobId}_afterCode.png`, fullPage: true }); } catch {}
        if (afterBody.toLowerCase().includes("thank you") || afterBody.toLowerCase().includes("submitted") || afterBody.toLowerCase().includes("we have received") || page.url().includes("confirmation")) {
          return { success: true, message: "Application submitted after code verification!" };
        }
        return { success: false, error: "Code entered but final submit unclear" };
      }
      return { success: false, error: "Security/verification code required (check email)" };
    }

    // Check validation errors
    const errors = await page.evaluate(() => {
      const errs = [];
      document.querySelectorAll(".field_with_errors, [class*='error'], [class*='invalid']").forEach(f => {
        const text = f.textContent?.trim().substring(0, 60);
        if (text && !errs.includes(text)) errs.push(text);
      });
      return errs.slice(0, 5);
    });

    if (errors.length > 0) {
      return { success: false, error: `Validation: ${errors[0]}` };
    }

    return { success: false, error: "Unclear result" };
  } catch (err) {
    return { success: false, error: err.message?.substring(0, 80) };
  } finally {
    await browser.close();
  }
}

// ── Record run in crawler API ──

async function recordRun(jobId, board, error) {
  try {
    await fetch(`${CRAWLER_API}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run", run_id: `aastha-${board}-${jobId}-${Date.now()}`,
        job_id: jobId, board, user_id: candidate.userId,
        artifacts: { notes: error || "Submitted via batch-browser-apply-aastha.mjs" },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {}
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
  const boardFilter = args.find(a => a.startsWith("--board="))?.split("=")[1];
  const jobIdArg = args.find(a => a.startsWith("--job-id="))?.split("=")[1];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Browser Batch Apply — Aastha Aggarwal (Puppeteer)         ║");
  console.log(`║  Mode: ${dryRun ? "DRY RUN" : "LIVE APPLY"}  |  Limit: ${String(limit === Infinity ? "ALL" : limit).padEnd(4)}                       ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Single-job test mode: --job-id=<id> --board=<token>
  if (jobIdArg) {
    if (!boardFilter) { console.error("--job-id requires --board=<token>"); process.exit(1); }
    console.log(`── Single-job test: board=${boardFilter} job_id=${jobIdArg} ──\n`);
    if (dryRun) { console.log("  DRY RUN — would apply to single job.\n"); return; }
    const chromePath = findChromePath();
    console.log(`  Chrome: ${chromePath.split("/").pop()}\n`);
    const result = await applyViaBrowser(chromePath, boardFilter, jobIdArg, "(single-job test)");
    if (result.success) {
      console.log(`  ✓ APPLIED: ${result.message || ""}`);
      await recordRun(jobIdArg, boardFilter, null);
    } else {
      console.log(`  ✗ FAILED: ${result.error || "unknown"}`);
      await recordRun(jobIdArg, boardFilter, result.error);
    }
    console.log(`\n  Screenshot: /tmp/aastha_apply_${boardFilter}_${jobIdArg}.png\n`);
    return;
  }

  // Phase 1: Fetch jobs
  console.log("── Phase 1: Fetching jobs ──\n");
  const jobMap = new Map();

  for (const tag of ["analyst", "quant", "ml", "finance", "data", "junior"]) {
    process.stdout.write(`  Tag: ${tag.padEnd(10)} `);
    const jobs = await fetchJobsByTag(tag);
    let added = 0;
    for (const j of jobs) { if (!jobMap.has(j.job_id)) { jobMap.set(j.job_id, j); added++; } }
    console.log(`${jobs.length} → ${added} new (${jobMap.size} total)`);
  }

  console.log("\n  Fetching IB Greenhouse boards...\n");
  for (const { token, name } of [
    { token: "lincolninternational", name: "Lincoln International" },
    { token: "williamblair", name: "William Blair" },
    { token: "generalatlantic", name: "General Atlantic" },
    { token: "stepstone", name: "StepStone Group" },
    { token: "liontree", name: "LionTree" },
  ]) {
    process.stdout.write(`  ${name.padEnd(25)} `);
    const jobs = await fetchGreenhouseBoard(token);
    let added = 0;
    for (const j of jobs) { if (!jobMap.has(j.job_id)) { jobMap.set(j.job_id, j); added++; } }
    console.log(`${jobs.length} total → ${added} new (${jobMap.size} total)`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Phase 2: Filter
  const allJobs = Array.from(jobMap.values());
  const matchingJobs = allJobs
    .filter(j => {
      if (boardFilter && j.board !== boardFilter) return false;
      if (!GREENHOUSE_BOARDS.has(j.board)) return false;
      if (!isTargetJob(j.title)) return false;
      if (!isUSLocation(j.location)) return false;
      return true;
    })
    .map(j => ({ ...j, score: scorePriority(j.title, j.tags) }))
    .filter(j => j.score > 0)
    .sort((a, b) => b.score - a.score);

  const jobsToApply = matchingJobs.slice(0, limit);

  console.log(`\n── Phase 2: ${jobsToApply.length} matching jobs ──\n`);
  for (const j of jobsToApply.slice(0, 20)) {
    console.log(`  ${String(j.score).padStart(4)}  ${j.board.padEnd(22)} ${j.title.substring(0, 55).padEnd(57)} ${(j.location || "").substring(0, 25)}`);
  }
  if (jobsToApply.length > 20) console.log(`  ... and ${jobsToApply.length - 20} more`);

  if (dryRun) { console.log("\n  DRY RUN complete.\n"); return; }

  // Phase 3: Apply
  const chromePath = findChromePath();
  console.log(`\n── Phase 3: Applying via Chrome (${chromePath.split("/").pop()}) ──\n`);

  let applied = 0, secCode = 0, failed = 0;
  const results = [];

  for (let i = 0; i < jobsToApply.length; i++) {
    const job = jobsToApply[i];
    process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(22)} ${job.title.substring(0, 45).padEnd(47)} `);

    const result = await applyViaBrowser(chromePath, job.board, job.job_id, job.title);

    if (result.success) {
      console.log("✓ APPLIED");
      applied++;
      await recordRun(job.job_id, job.board, null);
    } else if (result.error?.includes("Security code")) {
      console.log("⚡ SEC CODE");
      secCode++;
      await recordRun(job.job_id, job.board, result.error);
    } else {
      console.log(`✗ ${(result.error || "unknown").substring(0, 40)}`);
      failed++;
      await recordRun(job.job_id, job.board, result.error);
    }

    results.push({ ...job, result });

    // Wait between applications
    await new Promise(r => setTimeout(r, 3000));
  }

  // Summary
  console.log(`\n${"═".repeat(80)}`);
  console.log("  BATCH RESULTS — Aastha Aggarwal (Browser)");
  console.log("═".repeat(80));
  console.log(`  Applied: ${applied} | Security code needed: ${secCode} | Failed: ${failed} | Total: ${jobsToApply.length}`);

  writeFileSync(resolve(ROOT, "scripts/aastha-browser-apply-results.json"), JSON.stringify(results, null, 2));
  console.log(`  Results saved to: scripts/aastha-browser-apply-results.json\n`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
