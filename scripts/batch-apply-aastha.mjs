#!/usr/bin/env node
/**
 * Batch Apply for Aastha Aggarwal
 *
 * Fetches jobs from the crawler API matching her profile tags,
 * filters for relevant roles and US locations, and applies via
 * Greenhouse HTTP submission.
 *
 * Usage:
 *   node scripts/batch-apply-aastha.mjs                   # crawl + apply
 *   node scripts/batch-apply-aastha.mjs --dry-run          # list matching jobs only
 *   node scripts/batch-apply-aastha.mjs --limit=5          # apply to first 5
 *   node scripts/batch-apply-aastha.mjs --board=coinbase   # single board only
 *   node scripts/batch-apply-aastha.mjs --detect-captcha   # probe captcha type per job, no submission
 *   node scripts/batch-apply-aastha.mjs --dashboard        # crawl → prepare → launch UI at localhost:7777
 */

import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import puppeteer from "puppeteer-core"; // used by serveDashboard inline browser launch
import { fileURLToPath } from "url";
import { prepare as prepareApp, generateAutofillScript } from "../services/allocation-crawler-service/src/engine/apply-operator.mjs";
import { fillFormInBrowser } from "../services/allocation-crawler-service/src/engine/browser-fill.mjs";
import { launchBrowser as launchBrowserEngine } from "../services/allocation-crawler-service/src/engine/browser-launcher.mjs";
import { profile as aasthaProfile } from "./lib/candidate-profile-aastha.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CRAWLER_API = "https://allocation-crawler-service.netlify.app/api/crawler";

// ── Aastha's Candidate Profile ──
const candidate = {
  firstName: "Aastha",
  lastName: "Aggarwal",
  email: "aastha.aggarwal1@gmail.com",
  phone: "347-224-9624",
  linkedIn: "https://www.linkedin.com/in/aastar",
  location: "New York, NY",
  authorizedToWork: false,  // requires sponsorship
  requiresSponsorship: true,
  veteranStatus: false,
  userId: "aastha.aggarwal1@gmail.com",
  resumePath: resolve(ROOT, "blob/aastha_resume.pdf"),
  resumeText: `AASTHA AGGARWAL
New York, NY | 347-224-9624 | aastha.aggarwal1@gmail.com | linkedin.com/in/aastar

EDUCATION
Columbia University, M.S. Applied Analytics — GPA: 3.6
Fordham University Gabelli School of Business, B.S. Global Business — GPA: 3.9

PROFESSIONAL EXPERIENCE

Ironhold Capital — Investment Analyst (Generalist)
• Investment analysis across multiple sectors
• Financial modeling and due diligence

Vertex Partners — M&A Analyst Intern
• M&A deal analysis and financial modeling
• Cash flow projections and valuation

Value Works LLC — Equity Trader
• Equity research and trading
• NAV techniques and DCF valuation

Ecohaven Furniture — Market Research Analytics Intern
• Market research and predictive analytics
• Data-driven insights using Python and Tableau

TECHNICAL SKILLS
Programming: Python, R, Java, SQL, Excel
Analytics Tools: Tableau, PowerPoint, Alexa Analytics
ML/Analytics: Supervised Learning, Unsupervised Learning, LLM, Predictive Analytics, Linear Regression, Decision Trees
Finance: Equity Research, M&A, Financial Modeling, NAV Techniques, Cash Flow Projections, DCF Valuation`,
};

// ── Title patterns for Aastha's target roles ──
const TARGET_TITLE_PATTERNS = [
  // Analyst roles
  /\banalyst\b/i,
  /\banalytics\b/i,
  /\bdata\s*analyst/i,
  /\bbusiness\s*analyst/i,
  /\bfinancial\s*analyst/i,
  /\brisk\s*analyst/i,
  /\bcredit\s*analyst/i,
  /\bquantitative\s*analyst/i,
  /\bresearch\s*analyst/i,
  /\binvestment\s*analyst/i,
  /\bstrategy\s*analyst/i,
  // Data science / ML
  /\bdata\s*scientist/i,
  /\bdata\s*science/i,
  /\bmachine\s*learning/i,
  /\bml\b.*\b(analyst|scientist|associate)/i,
  /\bapplied\s*scientist/i,
  // Investment Banking / Finance roles
  /\binvestment\s*banking/i,
  /\bib\s*(analyst|associate)/i,
  /\bm&a\b/i,
  /\bmergers?\s*(and|&)\s*acquisitions?/i,
  /\bcapital\s*markets/i,
  /\bcapital\s*advisory/i,
  /\bcorporate\s*finance/i,
  /\bprivate\s*(equity|capital|debt|wealth)/i,
  /\bequity\b.*\b(research|analyst|associate|trader)/i,
  /\bportfolio\b.*\b(analyst|associate|valuation|management)/i,
  /\bquant\b.*\b(analyst|researcher|associate|model)/i,
  /\bfinance\b.*\b(analyst|associate)/i,
  /\bfp&a\b/i,
  /\bpricing\b.*\b(analyst|associate)/i,
  /\bforecast/i,
  /\bmodeling\b/i,
  /\bvaluation/i,
  /\bfund\s*(accounting|operations|controller)/i,
  /\btreasury/i,
  /\basset\s*(backed|management)/i,
  /\brestructuring/i,
  /\bclient\s*relations/i,
  /\binvestor\s*relations/i,
  /\bsecondary\s*advisory/i,
  // Associate/junior roles
  /\bassociate\b/i,
  // Summer analyst programs
  /\bsummer\s*analyst/i,
];

// Exclusion patterns (roles that don't match her profile)
const EXCLUDE_TITLE_PATTERNS = [
  /\bsoftware\s*engineer/i,
  /\bsre\b/i,
  /\bdevops\b/i,
  /\binfrastructure\b/i,
  /\bfrontend\b/i,
  /\bbackend\b/i,
  /\bfull\s*stack/i,
  /\bplatform\s*engineer/i,
  /\bsecurity\s*engineer/i,
  /\bsite\s*reliability/i,
  /\bcompliance\s*manager/i,
  /\blegal\b/i,
  /\bcounsel\b/i,
  /\bdesign/i,
  /\brecruiter\b/i,
  /\bpeople\s*ops/i,
  /\bhr\b/i,
  /\bcustomer\s*success/i,
  /\bsales\s*(manager|director|lead|executive)\b/i,
  /\baccount\s*(manager|executive)/i,
  /\bmarketing\b(?!.*\bintern)/i,
  /\bproduct\s*manager/i,
  /\bprogram\s*manager/i,
  /\bengineering\s*manager/i,
  /\bvice\s*president\b/i,
  /\bhead\s+of\b/i,
  /\bsenior\s+manager/i,
  /\bmanager,?\s+software/i,
  /\bdirector\b(?!.*\b(analyst|associate))/i,
  /\bparalegal\b/i,
  /\bexecutive\s*assistant/i,
  /\bdesktop\s*support/i,
  /\badministrative\s*assistant/i,
  /\bpayroll\s*specialist/i,
  /\bjira\b/i,
  /\bsalesforce\b/i,
  /\bworkday\b/i,
  /\bsite\s*reliability\s*engineer/i,
];

// US / Remote location patterns
const VALID_LOCATIONS = [
  /new\s*york/i, /nyc/i, /\bny\b/i,
  /san\s*francisco/i, /\bsf\b/i,
  /remote/i, /united\s*states/i, /\bus\b/i, /\busa\b/i,
  /chicago/i, /boston/i, /\bct\b/i,
  /greenwich/i, /stamford/i,
  /anywhere/i, /hybrid/i, /flexible/i,
];

function isTargetJob(title) {
  if (EXCLUDE_TITLE_PATTERNS.some(p => p.test(title))) return false;
  return TARGET_TITLE_PATTERNS.some(p => p.test(title));
}

function isUSLocation(loc) {
  if (!loc) return true;
  return VALID_LOCATIONS.some(p => p.test(loc));
}

function scorePriority(title, tags) {
  const t = title.toLowerCase();
  let score = 0;

  // Strong matches for Aastha's profile
  // IB roles (top priority)
  if (/investment\s*banking\s*analyst/i.test(t)) score += 120;
  if (/investment\s*banking\s*associate/i.test(t)) score += 115;
  if (/investment\s*banking/i.test(t) && score === 0) score += 110;
  if (/m&a\s*(analyst|associate)/i.test(t)) score += 115;
  if (/m&a/i.test(t) && score === 0) score += 100;
  if (/capital\s*advisory/i.test(t)) score += 100;
  if (/private\s*equity\s*analyst/i.test(t)) score += 110;
  if (/private\s*(capital|debt|wealth)/i.test(t)) score += 90;
  if (/equity\s*research\s*(analyst|associate)/i.test(t)) score += 105;
  if (/restructuring/i.test(t)) score += 90;
  if (/valuation/i.test(t)) score += 95;
  if (/summer\s*analyst/i.test(t)) score += 100;
  // Finance / Analytics roles
  if (/data\s*analyst/i.test(t)) score += 100;
  if (/financial\s*analyst/i.test(t)) score += 100;
  if (/fp&a/i.test(t)) score += 95;
  if (/data\s*scientist/i.test(t)) score += 95;
  if (/quantitative\s*analyst/i.test(t)) score += 95;
  if (/investment\s*analyst/i.test(t)) score += 90;
  if (/business\s*analyst/i.test(t)) score += 90;
  if (/risk\s*analyst/i.test(t)) score += 85;
  if (/credit\s*analyst/i.test(t)) score += 85;
  if (/research\s*analyst/i.test(t)) score += 80;
  if (/applied\s*scientist/i.test(t)) score += 80;
  if (/portfolio\s*(analyst|valuation|management)/i.test(t)) score += 80;
  if (/fund\s*(accounting|operations)/i.test(t)) score += 70;
  if (/treasury/i.test(t)) score += 70;
  if (/asset\s*backed/i.test(t)) score += 75;
  if (/client\s*relations/i.test(t)) score += 65;
  if (/investor\s*relations/i.test(t)) score += 65;
  if (/equity\s*research/i.test(t) && score < 75) score += 75;
  if (/pricing/i.test(t)) score += 70;
  if (/forecast/i.test(t)) score += 70;
  if (/corporate\s*finance/i.test(t)) score += 85;
  if (/\banalytics\b/i.test(t) && score === 0) score += 60;
  if (/\banalyst\b/i.test(t) && score === 0) score += 50;
  if (/\bassociate\b/i.test(t) && score === 0) score += 40;

  // Tag bonuses
  if (tags?.includes("analyst")) score += 10;
  if (tags?.includes("quant")) score += 10;
  if (tags?.includes("ml")) score += 5;
  if (tags?.includes("finance")) score += 10;

  // Seniority: prefer junior/mid, penalize senior/staff
  if (/\bjunior\b/i.test(t) || /\b(analyst\s*i|analyst\s*1)\b/i.test(t)) score += 10;
  if (/\bintern\b/i.test(t)) score -= 30;
  if (/\bstaff\b/i.test(t) || /\bprincipal\b/i.test(t)) score -= 15;
  if (/\bsenior\b/i.test(t)) score -= 5; // slight penalty, still worth applying

  return score;
}

// ── Captcha detection ──
// Returns { type, sitekey } where type is one of:
//   "none"       — no captcha present, pure HTTP submit will work
//   "v2"         — reCAPTCHA v2 checkbox; audio-challenge solvable locally (Whisper)
//   "v3"         — reCAPTCHA v3 invisible; behavioral score, needs real browser
//   "enterprise" — reCAPTCHA Enterprise; behavioral, needs real browser
//   "hcaptcha"   — hCaptcha; image classification, not locally practical
//   "unknown"    — keyword found but couldn't classify
function detectCaptcha(html) {
  const lower = html.toLowerCase();

  if (lower.includes("hcaptcha") || lower.includes("h-captcha")) {
    const sk = html.match(/data-sitekey="([^"]+)"/);
    return { type: "hcaptcha", sitekey: sk?.[1] || null };
  }

  const hasRecaptcha = lower.includes("recaptcha") || lower.includes("grecaptcha");
  if (!hasRecaptcha) return { type: "none", sitekey: null };

  if (lower.includes("recaptcha/enterprise") || lower.includes("grecaptcha.enterprise")) {
    const sk = html.match(/enterprise\.js\?render=([^"'&\s]+)/) ||
               html.match(/data-sitekey="([^"]+)"/);
    return { type: "enterprise", sitekey: sk?.[1] || null };
  }

  // v3: loaded via `api.js?render=SITEKEY` and invoked with grecaptcha.execute
  const v3Match = html.match(/recaptcha\/api\.js\?render=([^"'&\s]+)/);
  if (v3Match && v3Match[1] !== "explicit") {
    return { type: "v3", sitekey: v3Match[1] };
  }
  if (lower.includes("grecaptcha.execute(")) {
    const sk = html.match(/data-sitekey="([^"]+)"/);
    return { type: "v3", sitekey: sk?.[1] || null };
  }

  // v2: visible checkbox div with data-sitekey
  const v2Match = html.match(/class="[^"]*g-recaptcha[^"]*"[^>]*data-sitekey="([^"]+)"/) ||
                  html.match(/data-sitekey="([^"]+)"[^>]*class="[^"]*g-recaptcha/);
  if (v2Match) return { type: "v2", sitekey: v2Match[1] };

  return { type: "unknown", sitekey: null };
}

async function probeCaptcha(boardToken, jobId) {
  const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { type: "fetch_error", sitekey: null, httpStatus: res.status };
    const html = await res.text();
    const hasForm = /name="fingerprint"/.test(html);
    const result = detectCaptcha(html);
    return { ...result, hasLegacyForm: hasForm };
  } catch (err) {
    return { type: "fetch_error", sitekey: null, error: err.message };
  }
}

// ── Fetch jobs from crawler API ──

async function fetchJobsByTag(tag) {
  const url = `${CRAWLER_API}/jobs?status=discovered&tag=${tag}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || data || [];
  } catch {
    return [];
  }
}

// ── Greenhouse HTTP Apply ──

async function applyViaHTTP(boardToken, jobId, jobTitle) {
  // Step 1: Get embed page
  const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
  let embedHtml;
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { success: false, error: `Embed page ${res.status}` };
    embedHtml = await res.text();
  } catch (err) {
    return { success: false, error: `Embed fetch: ${err.message}` };
  }

  // Classify captcha before attempting submit
  const captcha = detectCaptcha(embedHtml);
  if (captcha.type !== "none") {
    return {
      success: false,
      error: `captcha:${captcha.type}`,
      captcha,
    };
  }

  // Extract anti-fraud tokens
  const fpMatch = embedHtml.match(/name="fingerprint"[^>]*value="([^"]+)"/);
  const rdMatch = embedHtml.match(/name="render_date"[^>]*value="([^"]+)"/);
  const pltMatch = embedHtml.match(/name="page_load_time"[^>]*value="([^"]+)"/);

  if (!fpMatch || !rdMatch || !pltMatch) {
    return { success: false, error: "No embed tokens found (React-style form)" };
  }

  // Parse embed question structure
  const questions = [];
  const qidPattern = /job_application\[answers_attributes\]\[(\d+)\]\[question_id\]"[^>]*value="(\d+)"/g;
  let match;
  while ((match = qidPattern.exec(embedHtml)) !== null) {
    const idx = parseInt(match[1], 10);
    const qid = match[2];
    const hasBool = embedHtml.includes(`answers_attributes][${idx}][boolean_value]`);

    // Try to extract the label for this question
    const labelPattern = new RegExp(`answers_attributes\\]\\[${idx}\\][\\s\\S]*?<label[^>]*>([^<]+)<`, "i");
    const labelMatch = embedHtml.match(labelPattern);
    const label = labelMatch ? labelMatch[1].trim() : "";

    questions.push({ index: idx, questionId: qid, fieldType: hasBool ? "boolean" : "text", label });
  }

  // Build form data
  const params = new URLSearchParams();
  params.append("utf8", "✓");
  params.append("fingerprint", fpMatch[1]);
  params.append("render_date", rdMatch[1]);
  params.append("page_load_time", pltMatch[1]);
  params.append("from_embed", "true");
  params.append("security_code", "");

  // Candidate info
  params.append("job_application[first_name]", candidate.firstName);
  params.append("job_application[last_name]", candidate.lastName);
  params.append("job_application[email]", candidate.email);
  params.append("job_application[phone]", candidate.phone);
  params.append("job_application[resume_text]", candidate.resumeText);
  params.append("job_application[location]", candidate.location);

  // Answer questions
  for (const q of questions) {
    const prefix = `job_application[answers_attributes][${q.index}]`;
    params.append(`${prefix}[question_id]`, q.questionId);
    params.append(`${prefix}[priority]`, String(q.index));

    const label = q.label.toLowerCase();

    if (q.fieldType === "boolean") {
      let value = "1"; // default yes
      if (label.includes("previously applied") || label.includes("have you ever worked")) value = "0";
      if (label.includes("authorized to work") || label.includes("legally authorized")) value = "0"; // requires sponsorship
      if (label.includes("sponsorship") || label.includes("require sponsor") || label.includes("visa")) value = "1"; // yes, requires
      if (label.includes("military") || label.includes("veteran")) value = "0";
      if (label.includes("privacy") || label.includes("consent")) value = "1";
      params.append(`${prefix}[boolean_value]`, value);
    } else {
      let value = "";
      if (label.includes("linkedin")) value = candidate.linkedIn;
      else if (label.includes("salary") || label.includes("compensation")) value = "Open to discussion";
      else if (label.includes("how did you hear") || label.includes("referral")) value = "Company website";
      else if (label.includes("years of") || label.includes("experience")) value = "3";
      else if (label.includes("current") && label.includes("title")) value = "Investment Analyst";
      else if (label.includes("employer") || label.includes("current company")) value = "Ironhold Capital";
      else if (label.includes("website") || label.includes("portfolio")) value = candidate.linkedIn;
      else if (label.includes("sponsorship") || label.includes("immigration")) value = "Yes, requires sponsorship";
      else if (label.includes("visa")) value = "Requires H-1B sponsorship";
      else if (label.includes("relocat")) value = "No, based in New York";
      else if (label.includes("start date") || label.includes("available")) value = "Immediately";
      else if (label.includes("location") || label.includes("where are you")) value = "New York, NY";
      else if (label.includes("full name") || label.includes("legal name")) value = "Aastha Aggarwal";
      else if (label.includes("programming") || label.includes("language")) value = "Python, R, Java, SQL, Excel";
      else if (label.includes("cover letter")) value = "";
      else if (label.includes("notice period") || label.includes("non-compete")) value = "No non-compete. Available immediately.";
      params.append(`${prefix}[text_value]`, value);
    }
  }

  // Submit
  const submitUrl = `https://boards.greenhouse.io/embed/${boardToken}/jobs/${jobId}`;
  try {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Origin: "https://boards.greenhouse.io",
        Referer: embedUrl,
      },
      body: params.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });

    const status = res.status;
    const location = res.headers.get("location") || "";

    if (status === 302 || status === 301) {
      const isSuccess = location.includes("confirmation") || location.includes("thank");
      return {
        success: isSuccess,
        message: isSuccess ? `Applied! Redirect: ${location}` : `Redirected: ${location}`,
      };
    }

    const responseText = await res.text();
    const hasSuccess = responseText.toLowerCase().includes("thank you") || responseText.toLowerCase().includes("submitted");
    const hasError = responseText.toLowerCase().includes("error") || responseText.toLowerCase().includes("required");
    const alreadyApplied = responseText.toLowerCase().includes("already") && responseText.toLowerCase().includes("applied");

    if (alreadyApplied) return { success: false, error: "Already applied" };
    if (hasSuccess && !hasError) return { success: true, message: "Application submitted" };
    return { success: false, error: `HTTP ${status} (${hasError ? "form errors" : "unclear result"})` };
  } catch (err) {
    return { success: false, error: `Submit failed: ${err.message}` };
  }
}

// ── Record run in crawler API ──

async function recordRun(jobId, board, status, error) {
  const runId = `aastha-${board}-${jobId}-${Date.now()}`;
  try {
    await fetch(`${CRAWLER_API}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run",
        run_id: runId,
        job_id: jobId,
        board,
        user_id: candidate.userId,
        artifacts: { notes: error || "Submitted via batch-apply-aastha.mjs" },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // non-critical
  }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const detectCaptchaMode = args.includes("--detect-captcha");
  const dashboardMode = args.includes("--dashboard");
  const autoApplyMode = args.includes("--auto-apply");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
  const boardFilter = args.find(a => a.startsWith("--board="))?.split("=")[1];
  const portArg = args.find(a => a.startsWith("--port="));
  const dashPort = portArg ? parseInt(portArg.split("=")[1]) : 7777;
  const browserArg = args.find(a => a.startsWith("--browser="))?.split("=")[1] || "chrome";

  const BROWSER_PATHS = {
    chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    safari: "/Applications/Safari.app/Contents/MacOS/Safari",
    // Puppeteer doesn't natively support Safari; we use WebDriver for Safari below
  };

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Batch Apply — Aastha Aggarwal                             ║");
  console.log(`║  Mode: ${dryRun ? "DRY RUN" : "LIVE APPLY"}  |  Limit: ${limit === Infinity ? "ALL" : limit}                          ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Greenhouse boards in the crawler
  const GREENHOUSE_BOARDS = new Set([
    "coinbase", "deshaw", "aqr", "aquaticcapitalmanagement", "gravitonresearchcapital",
    "togetherai", "databricks", "brex", "lithic", "figma", "dbtlabsinc",
    "planetscale", "deepmind", "runwayml", "asana", "affirm", "marqeta",
    "melio", "alloy", "datadog", "grafanalabs", "cockroachlabs", "anthropic",
    "perplexity", "anyscale", "plaid", "mercury", "vercel", "temporaltechnologies",
    "supabase", "scaleai", "janestreet", "towerresearchcapital",
    // IB / PE boards
    "lincolninternational", "williamblair", "generalatlantic", "stepstone", "liontree",
  ]);

  // Phase 1: Fetch jobs from crawler API by Aastha's tags + direct from IB boards
  console.log("── Phase 1: Fetching jobs from crawler API ──\n");
  const tags = ["analyst", "quant", "ml", "finance", "data", "junior"];
  const jobMap = new Map(); // deduplicate by job_id

  for (const tag of tags) {
    process.stdout.write(`  Tag: ${tag.padEnd(10)} `);
    const jobs = await fetchJobsByTag(tag);
    let added = 0;
    for (const j of jobs) {
      if (!jobMap.has(j.job_id)) {
        jobMap.set(j.job_id, j);
        added++;
      }
    }
    console.log(`${jobs.length} jobs → ${added} new (${jobMap.size} total)`);
  }

  // Also fetch directly from IB Greenhouse boards (in case crawl hasn't ingested yet)
  console.log("\n  Fetching directly from IB Greenhouse boards...\n");
  const IB_BOARDS = [
    { token: "lincolninternational", name: "Lincoln International" },
    { token: "williamblair", name: "William Blair" },
    { token: "generalatlantic", name: "General Atlantic" },
    { token: "stepstone", name: "StepStone Group" },
    { token: "liontree", name: "LionTree" },
  ];

  for (const board of IB_BOARDS) {
    process.stdout.write(`  ${board.name.padEnd(25)} `);
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) { console.log("(no board)"); continue; }
      const data = await res.json();
      const jobs = data.jobs || [];
      let added = 0;
      for (const j of jobs) {
        const jobId = String(j.id);
        if (!jobMap.has(jobId)) {
          jobMap.set(jobId, {
            job_id: jobId,
            board: board.token,
            title: j.title,
            url: j.absolute_url,
            location: j.location?.name || "",
            department: j.departments?.[0]?.name || "",
            tags: [],
            status: "discovered",
          });
          added++;
        }
      }
      console.log(`${jobs.length} total → ${added} new (${jobMap.size} total)`);
    } catch {
      console.log("(error)");
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Phase 2: Filter for Aastha's profile
  console.log("\n── Phase 2: Filtering for matching roles ──\n");

  const allJobs = Array.from(jobMap.values());
  const matchingJobs = allJobs
    .filter(j => {
      if (boardFilter && j.board !== boardFilter) return false;
      if (!GREENHOUSE_BOARDS.has(j.board)) return false; // can only apply to Greenhouse
      if (!isTargetJob(j.title)) return false;
      if (!isUSLocation(j.location)) return false;
      return true;
    })
    .map(j => ({
      ...j,
      score: scorePriority(j.title, j.tags),
    }))
    .filter(j => j.score > 0)
    .sort((a, b) => b.score - a.score);

  const jobsToApply = matchingJobs.slice(0, limit);

  console.log(`  Total crawled: ${allJobs.length}`);
  console.log(`  Greenhouse + US location: ${allJobs.filter(j => GREENHOUSE_BOARDS.has(j.board) && isUSLocation(j.location)).length}`);
  console.log(`  Title match: ${matchingJobs.length}`);
  console.log(`  Applying to: ${jobsToApply.length}`);
  console.log("");

  // Print job table
  console.log("═".repeat(100));
  console.log(`  ${"Score".padEnd(6)} ${"Board".padEnd(18)} ${"Title".padEnd(55)} Location`);
  console.log("─".repeat(100));
  for (const j of jobsToApply) {
    console.log(`  ${String(j.score).padStart(4)}  ${j.board.padEnd(18)} ${j.title.substring(0, 53).padEnd(55)} ${(j.location || "").substring(0, 25)}`);
  }
  console.log("═".repeat(100));

  // Save job list
  writeFileSync(
    resolve(ROOT, "scripts/aastha-jobs-matched.json"),
    JSON.stringify(jobsToApply, null, 2)
  );
  console.log(`\n  Matched jobs saved to: scripts/aastha-jobs-matched.json`);

  if (dryRun) {
    console.log("\n  DRY RUN complete. Run without --dry-run to apply.\n");
    return;
  }

  // Phase 2.5 (optional): probe captcha type per job without submitting
  if (detectCaptchaMode) {
    console.log(`\n── Phase 2.5: Probing captcha type for ${jobsToApply.length} jobs ──\n`);
    const breakdown = { none: 0, v2: 0, v3: 0, enterprise: 0, hcaptcha: 0, unknown: 0, fetch_error: 0 };
    const perJob = [];
    for (let i = 0; i < jobsToApply.length; i++) {
      const job = jobsToApply[i];
      process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(18)} ${job.title.substring(0, 50).padEnd(52)} `);
      const probe = await probeCaptcha(job.board, job.job_id);
      breakdown[probe.type] = (breakdown[probe.type] || 0) + 1;
      const tag = probe.type === "none" ? "[ok] clean" : `[--] ${probe.type}`;
      const legacy = probe.hasLegacyForm === false ? " (react form)" : "";
      console.log(`${tag}${legacy}`);
      perJob.push({ board: job.board, job_id: job.job_id, title: job.title, ...probe });
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log("  CAPTCHA BREAKDOWN");
    console.log("═".repeat(60));
    for (const [type, count] of Object.entries(breakdown)) {
      if (count > 0) console.log(`  ${type.padEnd(14)} ${count}`);
    }
    console.log(`  ${"total".padEnd(14)} ${jobsToApply.length}`);
    const submittable = breakdown.none || 0;
    console.log(`\n  Submittable via pure HTTP: ${submittable}/${jobsToApply.length} (${Math.round(100 * submittable / jobsToApply.length)}%)`);

    const outPath = resolve(ROOT, "scripts/aastha-captcha-breakdown.json");
    writeFileSync(outPath, JSON.stringify({ breakdown, perJob }, null, 2));
    console.log(`\n  Saved: ${outPath}\n`);
    return;
  }

  // ── Dashboard mode: prepare all jobs + serve interactive UI ──
  if (dashboardMode) {
    console.log(`\n── Phase 3: Preparing ${jobsToApply.length} applications via apply operator ──\n`);
    const prepared = [];
    for (let i = 0; i < jobsToApply.length; i++) {
      const job = jobsToApply[i];
      process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(18)} ${job.title.substring(0, 50).padEnd(52)} `);
      const app = await prepareApp(aasthaProfile, job);
      const tag = app.ready ? "[ok] ready" :
                  app.error === "react_form" ? "[--] react" :
                  app.captcha?.type !== "none" ? `[--] ${app.captcha.type}` :
                  app.missing.length > 0 ? `[..] missing ${app.missing.length}` : "[!!] error";
      console.log(tag);
      prepared.push({
        ...job,
        embedUrl: app.embedUrl,
        ready: app.ready,
        captcha: app.captcha,
        stage: app.stage,
        error: app.error,
        fieldsTotal: app.resolved.length,
        fieldsResolved: app.resolved.filter(f => f.value).length,
        missing: app.missing.map(f => f.label),
        resolved: app.resolved.map(f => ({ label: f.label, value: f.value, source: f.source })),
      });
      await new Promise(r => setTimeout(r, 400));
    }

    // Summary
    const counts = { ready: 0, captcha: 0, react: 0, error: 0 };
    for (const p of prepared) {
      if (p.ready) counts.ready++;
      else if (p.error === "react_form") counts.react++;
      else if (p.captcha?.type !== "none") counts.captcha++;
      else counts.error++;
    }
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Ready (HTTP submit): ${counts.ready}  |  Captcha-gated: ${counts.captcha}  |  React: ${counts.react}  |  Error: ${counts.error}`);
    console.log("═".repeat(60));

    // Save enriched queue
    const queuePath = resolve(ROOT, "scripts/aastha/prepared-queue.json");
    writeFileSync(queuePath, JSON.stringify(prepared, null, 2));
    console.log(`\n  Prepared queue saved: ${queuePath}`);

    // Launch inline dashboard server
    serveDashboard(prepared, dashPort);
    return;
  }

  // ── Auto-apply mode: open Chrome, fill each form, report fill coverage ──
  if (autoApplyMode) {
    console.log(`\n-- Phase 3: Auto-apply scan — ${jobsToApply.length} jobs (browser: ${browserArg}) --\n`);

    const browserCtx = await launchBrowserEngine(browserArg);
    console.log(`  ${browserArg} launched\n`);

    const results = [];
    for (let i = 0; i < jobsToApply.length; i++) {
      const job = jobsToApply[i];
      process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(18)} ${job.title.substring(0, 45).padEnd(47)} `);

      let page;
      try {
        const embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${job.board}&token=${job.job_id}`;
        page = await browserCtx.openPage(embedUrl);

        const fillResult = await fillFormInBrowser(page, aasthaProfile, {
          useLLM: false,
          resumePath: resolve(ROOT, "blob/aastha_resume.pdf"),
        });

        // Check for unfilled required fields
        const unfilled = await page.evaluate(() => {
          const missing = [];
          document.querySelectorAll("[required], [aria-required='true']").forEach(el => {
            if (el.type === "hidden" || el.type === "file") return;
            const container = el.closest("[class*='field'], [class*='question']") || el.parentElement;
            const label = container?.querySelector("label")?.textContent?.trim() || el.name || el.id || "";
            if (el.tagName === "INPUT" && el.getAttribute("role") === "combobox") {
              const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
              const hasVal = ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
              if (!hasVal) missing.push(label);
            } else if (!el.value) {
              missing.push(label);
            }
          });
          return missing;
        });

        const status = unfilled.length === 0 ? "COMPLETE" : `${unfilled.length} missing`;
        const icon = unfilled.length === 0 ? "[+]" : `[~]`;
        console.log(`${icon} filled=${fillResult.filled} resume=${fillResult.resumeUploaded ? "Y" : "N"} ${status}`);
        if (unfilled.length > 0 && unfilled.length <= 5) {
          console.log(`       missing: ${unfilled.join(", ")}`);
        }

        results.push({
          ...job,
          filled: fillResult.filled,
          total: fillResult.total,
          resumeUploaded: fillResult.resumeUploaded,
          unfilled,
          complete: unfilled.length === 0,
          details: fillResult.details,
        });
      } catch (err) {
        console.log(`[!] ${err.message.slice(0, 50)}`);
        results.push({ ...job, filled: 0, error: err.message, complete: false, unfilled: ["error"] });
      }

      // Close tab, move to next
      if (page) { try { await browserCtx.closePage(page); } catch {} }
      await new Promise(r => setTimeout(r, 500));
    }

    // Summary
    const complete = results.filter(r => r.complete).length;
    const partial = results.filter(r => !r.complete && !r.error).length;
    const errored = results.filter(r => r.error).length;

    console.log(`\n${"=".repeat(70)}`);
    console.log("  AUTO-APPLY SCAN RESULTS");
    console.log("=".repeat(70));
    console.log(`  Complete (ready to submit): ${complete}`);
    console.log(`  Partial (needs manual):     ${partial}`);
    console.log(`  Error:                      ${errored}`);
    console.log(`  Total:                      ${results.length}`);
    console.log("");

    if (complete > 0) {
      console.log("  -- Ready to submit (only captcha blocking): --");
      results.filter(r => r.complete).forEach(r =>
        console.log(`    [+] ${r.board.padEnd(18)} ${r.title.slice(0, 55)} (${r.filled} fields)`)
      );
    }
    if (partial > 0) {
      console.log("\n  -- Needs manual fields: --");
      results.filter(r => !r.complete && !r.error).forEach(r =>
        console.log(`    [~] ${r.board.padEnd(18)} ${r.title.slice(0, 45)} missing: ${r.unfilled.join(", ").slice(0, 60)}`)
      );
    }

    const outPath = resolve(ROOT, "scripts/aastha/auto-apply-results.json");
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n  Saved: ${outPath}`);
    console.log("  Browser left open for inspection. Ctrl+C to close.\n");

    // Keep process alive so browser stays open
    await new Promise(() => {});
  }

  // Phase 3: Apply
  console.log(`\n── Phase 3: Applying to ${jobsToApply.length} jobs ──\n`);

  let applied = 0, failed = 0, skipped = 0;
  const results = [];

  for (let i = 0; i < jobsToApply.length; i++) {
    const job = jobsToApply[i];
    process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(18)} ${job.title.substring(0, 50).padEnd(52)} `);

    const result = await applyViaHTTP(job.board, job.job_id, job.title);

    if (result.success) {
      console.log(`[ok] APPLIED`);
      applied++;
      await recordRun(job.job_id, job.board, "submitted", null);
    } else {
      if (result.error?.includes("reCAPTCHA")) {
        console.log(`[--] CAPTCHA`);
        skipped++;
      } else {
        console.log(`[!!] ${result.error?.substring(0, 50)}`);
        failed++;
      }
      await recordRun(job.job_id, job.board, "failed", result.error);
    }

    results.push({ ...job, result });

    // Rate limit between applications
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  console.log(`\n${"═".repeat(80)}`);
  console.log("  BATCH APPLY RESULTS — Aastha Aggarwal");
  console.log("═".repeat(80));
  console.log(`  Applied: ${applied} | Failed: ${failed} | Captcha-blocked: ${skipped} | Total: ${jobsToApply.length}`);
  console.log("");

  for (const r of results) {
    const icon = r.result.success ? "[ok]" : r.result.error?.includes("reCAPTCHA") ? "[--]" : "[!!]";
    console.log(`  ${icon} ${r.board.padEnd(18)} ${r.title.substring(0, 55)}`);
  }

  // Save results
  const resultsPath = resolve(ROOT, "scripts/aastha-apply-results.json");
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n  Results saved to: ${resultsPath}\n`);
}

// ── Inline Dashboard Server ──

function serveDashboard(prepared, port) {
  const STATE_PATH = resolve(ROOT, "scripts/aastha/captcha-queue.json");
  const autofillJS = generateAutofillScript(aasthaProfile);

  // Merge persisted statuses
  let persisted = {};
  if (existsSync(STATE_PATH)) {
    try { persisted = JSON.parse(readFileSync(STATE_PATH, "utf8")).statuses || {}; } catch {}
  }
  const queue = prepared.map(p => {
    const key = `${p.board}:${p.job_id}`;
    return {
      key,
      ...p,
      status: persisted[key]?.status || "pending",
      note: persisted[key]?.note || "",
      updatedAt: persisted[key]?.updatedAt || null,
    };
  });

  function saveState() {
    const statuses = {};
    for (const q of queue) {
      if (q.status !== "pending" || q.note) {
        statuses[q.key] = { status: q.status, note: q.note, updatedAt: q.updatedAt };
      }
    }
    writeFileSync(STATE_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), statuses }, null, 2));
  }

  const candidateInfo = {
    name: aasthaProfile.fullName,
    email: aasthaProfile.email,
    phone: aasthaProfile.phone,
    linkedIn: aasthaProfile.linkedIn,
    location: aasthaProfile.location,
    employer: aasthaProfile.employer,
    title: aasthaProfile.jobTitle,
    school: `${aasthaProfile.school} — ${aasthaProfile.degree}`,
    gpa: aasthaProfile.gpa,
    graduation: `${aasthaProfile.graduationMonth} ${aasthaProfile.graduationYear}`,
    sponsorship: aasthaProfile.requiresSponsorship ? "Yes" : "No",
    authorized: aasthaProfile.authorizedToWork ? "Yes" : "No",
    resume: "blob/aastha_resume.pdf",
  };

  const HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>Apply Dashboard — ${aasthaProfile.fullName}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{font-family:-apple-system,ui-sans-serif,system-ui,sans-serif;background:#0b0e14;color:#cdd6f4;margin:0;padding:20px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#7f849c;font-size:13px;margin-bottom:16px}
.panel{background:#11141c;border:1px solid #232836;border-radius:8px;padding:14px;margin-bottom:16px}
.panel h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#89b4fa;margin:0 0 10px}
.grid{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;font-size:13px}
.grid .k{color:#7f849c}.grid .v{font-family:ui-monospace,Menlo,monospace;cursor:pointer}
.grid .v:hover{color:#a6e3a1}
.top-row{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px}
.top-row .panel{flex:1;min-width:280px;margin-bottom:0}
.stats{display:flex;gap:12px;margin-bottom:12px;font-size:13px;flex-wrap:wrap}
.stat{background:#11141c;border:1px solid #232836;border-radius:6px;padding:6px 12px}
.stat b{color:#f9e2af}.stat.ok b{color:#a6e3a1}.stat.warn b{color:#f38ba8}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #1e222e;vertical-align:top}
th{color:#7f849c;font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:.05em;position:sticky;top:0;background:#0b0e14}
tr.submitted td{opacity:.35}tr.skipped td{opacity:.25;color:#f38ba8}tr.failed td{opacity:.4;color:#f38ba8}
a{color:#89b4fa;text-decoration:none}a:hover{text-decoration:underline}
button{background:#232836;color:#cdd6f4;border:1px solid #313747;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;margin-right:4px}
button:hover{background:#313747}
button.primary{background:#89b4fa;color:#11141c;border-color:#89b4fa}button.primary:hover{background:#b4befe}
button.submit{background:#a6e3a1;color:#11141c;border-color:#a6e3a1}button.submit:hover{background:#c6f0c6}
button.danger{border-color:#f38ba8;color:#f38ba8}
.score{font-family:ui-monospace,Menlo,monospace;color:#f9e2af;font-weight:600}
.badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600}
.badge.ready{background:#a6e3a1;color:#11141c}
.badge.captcha{background:#f9e2af;color:#11141c}
.badge.react{background:#cba6f7;color:#11141c}
.badge.error{background:#f38ba8;color:#11141c}
.fields-preview{font-size:11px;color:#585b70;max-height:0;overflow:hidden;transition:max-height .3s}
.fields-preview.open{max-height:500px}
.fields-preview table{font-size:11px}
.bookmarklet{display:inline-block;background:#a6e3a1;color:#11141c;font-weight:700;font-size:14px;padding:8px 18px;border-radius:6px;text-decoration:none;cursor:grab;border:2px dashed #313747}
.bookmarklet:hover{background:#b4befe;text-decoration:none}
.filters{margin-bottom:10px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.filters label{font-size:13px;cursor:pointer}
.toast{position:fixed;bottom:20px;right:20px;background:#a6e3a1;color:#11141c;padding:8px 14px;border-radius:6px;font-size:13px;display:none}
.toast.show{display:block}
</style></head><body>
<h1>Apply Dashboard — ${aasthaProfile.fullName}</h1>
<div class="sub">Crawled → filtered → pre-resolved. Open a form, autofill, upload resume, solve captcha, submit, mark done.</div>

<div class="top-row">
  <div class="panel">
    <h2>Candidate (click to copy)</h2>
    <div class="grid" id="cand"></div>
  </div>
  <div class="panel" style="flex:0 0 240px">
    <h2>Bookmarklet</h2>
    <p style="font-size:12px;color:#7f849c;margin:0 0 8px">Drag to bookmark bar. Click on any Greenhouse form.</p>
    <a id="bkmk" class="bookmarklet" href="#">Fill Form</a>
  </div>
</div>

<div class="stats" id="stats"></div>

<div class="filters">
  <label><input type="checkbox" id="hide-done" checked> Hide submitted/skipped</label>
  <label><input type="checkbox" id="show-ready-only"> Ready to submit only</label>
  <button onclick="resetAll()" class="danger">Reset all</button>
</div>

<table>
  <thead><tr><th>#</th><th>Score</th><th>Status</th><th>Board</th><th>Title</th><th>Fields</th><th>Actions</th></tr></thead>
  <tbody id="rows"></tbody>
</table>

<div class="toast" id="toast"></div>

<script>
const C=${JSON.stringify(candidateInfo)};
const FILL=\`${autofillJS.replace(/`/g, "\\`")}\`;
let Q=[];

function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1200)}
function copy(v){navigator.clipboard.writeText(v);toast("Copied: "+v.slice(0,40))}

function renderCand(){
  document.getElementById("cand").innerHTML=Object.entries(C).map(([k,v])=>
    \`<div class="k">\${k}</div><div class="v" onclick="copy('\${v}')">\${v}</div>\`).join("");
  document.getElementById("bkmk").href="javascript:"+encodeURIComponent(FILL);
}

function renderStats(){
  const c=Q.reduce((a,q)=>(a[q.status]=(a[q.status]||0)+1,a),{});
  const rdy=Q.filter(q=>q.ready&&q.status==="pending").length;
  document.getElementById("stats").innerHTML=\`
    <div class="stat">Total: <b>\${Q.length}</b></div>
    <div class="stat">Pending: <b>\${c.pending||0}</b></div>
    <div class="stat ok">Ready to submit: <b>\${rdy}</b></div>
    <div class="stat ok">Submitted: <b>\${c.submitted||0}</b></div>
    <div class="stat warn">Skipped: <b>\${c.skipped||0}</b></div>
    <div class="stat warn">Failed: <b>\${c.failed||0}</b></div>\`;
}

function badgeFor(q){
  if(q.ready)return '<span class="badge ready">READY</span>';
  if(q.error==="react_form")return '<span class="badge react">REACT</span>';
  if(q.captcha?.type!=="none")return \`<span class="badge captcha">\${q.captcha.type.toUpperCase()}</span>\`;
  return '<span class="badge error">ERR</span>';
}

function renderRows(){
  const hd=document.getElementById("hide-done").checked;
  const ro=document.getElementById("show-ready-only").checked;
  const tb=document.getElementById("rows");
  const filtered=Q.map((q,i)=>({...q,rank:i+1}))
    .filter(q=>!(hd&&(q.status==="submitted"||q.status==="skipped")))
    .filter(q=>!(ro&&!q.ready));
  tb.innerHTML=filtered.map(q=>\`
    <tr class="\${q.status}">
      <td>\${q.rank}</td>
      <td class="score">\${q.score}</td>
      <td>\${badgeFor(q)}</td>
      <td>\${q.board}</td>
      <td>
        <a href="\${q.embedUrl}" target="_blank">\${q.title}</a>
        <div style="font-size:11px;color:#585b70">\${q.location||""}</div>
        <div style="margin-top:4px">
          <button onclick="toggleFields('\${q.key}')" style="font-size:10px;padding:2px 6px">fields (\${q.fieldsResolved}/\${q.fieldsTotal})</button>
        </div>
        <div class="fields-preview" id="fp-\${q.key}">
          <table>\${(q.resolved||[]).map(f=>\`<tr><td>\${f.label}</td><td>\${f.value||'<em style=color:#f38ba8>—</em>'}</td><td style=color:#585b70>\${f.source}</td></tr>\`).join("")}</table>
        </div>
      </td>
      <td>\${q.fieldsResolved}/\${q.fieldsTotal}\${missingHtml(q)}</td>
      <td>
        <button class="primary" onclick="window.open('/apply/'+encodeURIComponent('\${q.key}'),'_blank')">Apply</button>
        \${submitBtn(q)}
        <button onclick="mark('\${q.key}','submitted')">Done</button>
        <button onclick="mark('\${q.key}','skipped')">Skip</button>
        <button onclick="mark('\${q.key}','failed')">Fail</button>
        <button onclick="mark('\${q.key}','pending')">Reset</button>
      </td>
    </tr>\`).join("");
}

function missingHtml(q){
  if(!q.missing||!q.missing.length)return "";
  return ' <span style="color:#f38ba8">(miss: '+q.missing.join(", ")+')</span>';
}
function submitBtn(q){
  if(!q.ready)return "";
  return '<button class="submit" onclick="httpSubmit(\\x27'+q.key+'\\x27)">Submit</button>';
}
function toggleFields(key){document.getElementById("fp-"+key)?.classList.toggle("open")}

async function mark(key,status){
  const r=await fetch("/api/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,status})});
  Q=(await r.json()).queue;renderStats();renderRows();
}

async function httpSubmit(key){
  if(!confirm("Submit this application via HTTP?"))return;
  toast("Submitting...");
  const r=await fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key})});
  const data=await r.json();
  toast(data.success?"Submitted!":"Failed: "+(data.error||"unknown"));
  Q=data.queue||Q;renderStats();renderRows();
}

async function resetAll(){
  if(!confirm("Reset all to pending?"))return;
  const r=await fetch("/api/reset",{method:"POST"});Q=(await r.json()).queue;renderStats();renderRows();
}

async function load(){const r=await fetch("/api/queue");Q=(await r.json()).queue;renderCand();renderStats();renderRows()}
document.getElementById("hide-done").addEventListener("change",renderRows);
document.getElementById("show-ready-only").addEventListener("change",renderRows);
load();
</script></body></html>`;

  function buildApplyPage(job, fields, embedUrl, cand) {
    const fieldsJson = JSON.stringify(fields);
    const candJson = JSON.stringify(cand);
    const jobJson = JSON.stringify({ title: job.title, board: job.board, score: job.score, location: job.location, key: job.key });
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>Apply: ${job.title.replace(/"/g, '')}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{font-family:-apple-system,ui-sans-serif,system-ui,sans-serif;background:#0b0e14;color:#cdd6f4;margin:0;display:flex;height:100vh;overflow:hidden}
.sidebar{width:420px;min-width:350px;overflow-y:auto;padding:16px;border-right:1px solid #232836;flex-shrink:0}
.main-frame{flex:1;display:flex;flex-direction:column}
.toolbar{background:#11141c;padding:8px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #232836}
iframe{flex:1;border:none;background:#fff}
h1{font-size:16px;margin:0 0 4px}
.meta{font-size:12px;color:#7f849c;margin-bottom:12px}
.field-row{background:#11141c;border:1px solid #232836;border-radius:6px;padding:8px 10px;margin-bottom:6px;cursor:pointer;transition:border-color .15s}
.field-row:hover{border-color:#89b4fa}
.field-row.copied{border-color:#a6e3a1}
.field-label{font-size:11px;color:#7f849c;margin-bottom:2px;display:flex;justify-content:space-between}
.field-label .req{color:#f38ba8;font-weight:700}
.field-label .source{font-size:10px;color:#585b70}
.field-value{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all}
.field-value.empty{color:#f38ba8;font-style:italic}
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#89b4fa;margin:12px 0 6px;font-weight:600}
button{background:#232836;color:#cdd6f4;border:1px solid #313747;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer}
button:hover{background:#313747}
button.primary{background:#89b4fa;color:#11141c;border-color:#89b4fa}
button.done{background:#a6e3a1;color:#11141c;border-color:#a6e3a1}
button.done:hover{background:#c6f0c6}
.toast{position:fixed;bottom:20px;right:20px;background:#a6e3a1;color:#11141c;padding:8px 14px;border-radius:6px;font-size:13px;display:none;z-index:999}
.toast.show{display:block}
.copy-all{margin-bottom:12px}
</style></head><body>

<div class="sidebar">
  <h1>${job.title.replace(/'/g, "\\'")}</h1>
  <div class="meta">${job.board} &middot; ${(job.location || '').replace(/'/g, "\\'")} &middot; Score: ${job.score}</div>

  <div class="copy-all" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="primary" onclick="copyAll()">Copy All Fields</button>
    <button class="done" onclick="autoSubmit()" id="auto-submit-btn">Auto Submit (HTTP)</button>
  </div>
  <div id="submit-status" style="font-size:12px;margin-top:6px;min-height:18px"></div>

  <div class="section-title">Application Fields (click to copy)</div>
  <div id="fields"></div>

  <div class="section-title" style="margin-top:16px">Status</div>
  <div style="display:flex;gap:8px;margin-top:8px">
    <button class="done" onclick="markDone()">Mark Submitted</button>
    <button onclick="markStatus('skipped')">Skip</button>
    <button onclick="markStatus('failed')">Fail Failed</button>
    <button onclick="window.location='/'">Back</button>
  </div>
</div>

<div class="main-frame">
  <div class="toolbar">
    <span style="font-size:12px;color:#7f849c">Application</span>
    <button class="primary" onclick="openForm()">Open Greenhouse Form in New Tab</button>
    <a href="${embedUrl}" target="_blank" style="font-size:12px;color:#89b4fa">(direct link)</a>
  </div>
  <div id="form-panel" style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center">
    <div>
      <div style="font-size:48px;margin-bottom:16px">&gt;</div>
      <div style="font-size:16px;margin-bottom:8px">Click <b>Auto Submit</b> to attempt direct HTTP submission</div>
      <div style="font-size:13px;color:#7f849c;margin-bottom:24px">If captcha blocks it, the form opens in a new browser tab.<br>Use the sidebar to copy each field value into the form.</div>
      <button class="done" onclick="autoSubmit()" id="auto-submit-btn2" style="font-size:16px;padding:12px 32px">&gt; Auto Submit</button>
      <div style="margin-top:16px">
        <button onclick="openForm()">Or skip to manual fill &gt;</button>
      </div>
      <div id="submit-status2" style="font-size:13px;margin-top:12px;min-height:20px"></div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const F=${fieldsJson};
const C=${candJson};
const JOB=${jobJson};

function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1200)}

function copyVal(val,el){
  navigator.clipboard.writeText(val);
  toast("Copied: "+val.slice(0,50));
  if(el){el.classList.add("copied");setTimeout(()=>el.classList.remove("copied"),800)}
}

function copyAll(){
  const lines=F.filter(f=>f.value).map(f=>f.label+": "+f.value);
  navigator.clipboard.writeText(lines.join("\\n"));
  toast("Copied "+lines.length+" fields to clipboard");
}

function renderFields(){
  const el=document.getElementById("fields");
  el.innerHTML=F.map((f,i)=>{
    const v=f.value||"";
    const isEmpty=!v||v==="(empty)";
    const req=f.required?"<span class=req>*</span>":"";
    // For combobox/multiselect, show the label of the selected option
    let displayVal=v;
    if(f.selectedLabels&&f.selectedLabels.length){displayVal=f.selectedLabels.join(", ")}
    else if(f.options&&f.options.length&&v){
      const opt=f.options.find(o=>String(o.value)===String(v));
      if(opt)displayVal=opt.text+" (value: "+v+")";
    }
    return '<div class="field-row" onclick="copyVal(\\''+v.replace(/'/g,"\\\\\\'").replace(/\\\\/g,"\\\\\\\\")+'\\',this)">'+
      '<div class="field-label">'+req+" "+f.label+'<span class="source">'+f.source+'</span></div>'+
      '<div class="field-value'+(isEmpty?" empty":"")+'">'+
      (isEmpty?"— empty —":displayVal.replace(/</g,"&lt;"))+
      '</div></div>';
  }).join("");
}

const EMBED_URL="${embedUrl}";

async function openForm(){
  const st=document.getElementById("submit-status")||document.getElementById("submit-status2");
  if(st){st.style.color="#f9e2af";st.textContent="Opening Chrome and filling form...";}
  toast("Launching Chrome...");
  try{
    const r=await fetch("/api/open-and-fill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:JOB.key})});
    const data=await r.json();
    if(data.success){
      toast(data.message);
      if(st){st.style.color="#a6e3a1";st.textContent=data.message;}
    }else{
      toast("Error: "+(data.error||"unknown"));
      if(st){st.style.color="#f38ba8";st.textContent="Fail "+(data.error||"unknown");}
    }
  }catch(e){
    toast("Error: "+e.message);
    if(st){st.style.color="#f38ba8";st.textContent="Fail "+e.message;}
  }
}

async function autoSubmit(){
  // Update both button locations
  var btns=document.querySelectorAll("#auto-submit-btn,#auto-submit-btn2");
  var sts=document.querySelectorAll("#submit-status,#submit-status2");
  btns.forEach(b=>{b.disabled=true;b.textContent="Submitting..."});
  sts.forEach(s=>{s.style.color="#f9e2af";s.textContent="Preparing payload and submitting via HTTP..."});
  try{
    const r=await fetch("/api/auto-submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:JOB.key})});
    const data=await r.json();
    if(data.success){
      sts.forEach(s=>{s.style.color="#a6e3a1";s.textContent="Application submitted successfully."});
      btns.forEach(b=>{b.textContent="Submitted"});
      toast("Application submitted!");
      setTimeout(()=>window.location="/",1500);
    }else{
      const isCaptcha=data.error&&data.error.includes("captcha");
      btns.forEach(b=>{b.textContent="Retry";b.disabled=false});
      if(isCaptcha){
        sts.forEach(s=>{s.style.color="#f9e2af";s.textContent="Captcha required — opening pre-filled form in Chrome..."});
        setTimeout(()=>openForm(),300);
      }else{
        sts.forEach(s=>{s.style.color="#f38ba8";s.textContent="Fail "+data.error});
      }
    }
  }catch(e){
    sts.forEach(s=>{s.style.color="#f38ba8";s.textContent="Fail Network error: "+e.message});
    btns.forEach(b=>{b.textContent="Retry";b.disabled=false});
  }
}

async function markDone(){await markStatus("submitted")}
async function markStatus(s){
  await fetch("/api/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:JOB.key,status:s})});
  toast(s==="submitted"?"Marked as submitted!":"Status: "+s);
  setTimeout(()=>window.location="/",800);
}

renderFields();
</script></body></html>`;
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  }

  function json(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
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

      // ── Fill page: proxied Greenhouse form with pre-populated fields ──
      if (req.method === "GET" && req.url.startsWith("/fill/")) {
        const key = decodeURIComponent(req.url.slice(6));
        const job = queue.find(q => q.key === key);
        if (!job) { res.writeHead(404); return res.end("Job not found"); }

        try {
          // Fetch the actual Greenhouse embed page
          const embedUrl = job.embedUrl || `https://job-boards.greenhouse.io/embed/job_app?for=${job.board}&token=${job.job_id}`;
          const ghRes = await fetch(embedUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "text/html" },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
          });
          if (!ghRes.ok) { res.writeHead(502); return res.end("Failed to fetch Greenhouse form"); }
          let ghHtml = await ghRes.text();

          // Build the autofill data from resolved fields
          const fillData = {
            core: {
              first_name: aasthaProfile.firstName,
              last_name: aasthaProfile.lastName,
              email: aasthaProfile.email,
              phone: aasthaProfile.phone || aasthaProfile.phoneRaw,
              location: aasthaProfile.location,
            },
            questions: (job.resolved || [])
              .filter(f => f.fieldName && f.value && f.fieldType !== "file")
              .map(f => ({
                name: f.fieldName,
                label: f.label,
                value: f.value,
                type: f.fieldType,
                selectedLabels: f.selectedLabels || null,
                options: f.options || null,
              })),
          };

          // Inject autofill script before </body>
          const fillScript = `
<script>
(function() {
  const FILL = ${JSON.stringify(fillData)};
  const RESUME_NOTE = "Resume: upload blob/aastha_resume.pdf manually";

  function nativeSet(el, val) {
    const proto = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value"
    );
    if (proto && proto.set) proto.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tryFill() {
    let filled = 0;

    // Fill core fields by id or name
    for (const [key, val] of Object.entries(FILL.core)) {
      const el = document.getElementById(key) ||
                 document.querySelector('input[name="' + key + '"]') ||
                 document.querySelector('input[name="job_application[' + key + ']"]');
      if (el && !el.value) { nativeSet(el, val); filled++; }
    }

    // Fill question fields
    for (const q of FILL.questions) {
      // Try by name attribute
      let el = document.querySelector('[name="' + q.name + '"]') ||
               document.querySelector('[name="job_application[answers_attributes][][' + q.name + ']"]');

      if (!el) {
        // Try finding by label text
        const labels = document.querySelectorAll("label");
        for (const lbl of labels) {
          if (lbl.textContent.trim().toLowerCase().includes(q.label.toLowerCase().slice(0, 30))) {
            const container = lbl.closest(".field, .question, [class*=field], [class*=question], div");
            if (container) {
              el = container.querySelector("input:not([type=hidden]):not([type=file]), textarea, select");
            }
            break;
          }
        }
      }

      if (el) {
        if (el.tagName === "SELECT") {
          // For select dropdowns, find the matching option
          const opts = Array.from(el.options);
          const match = opts.find(o => String(o.value) === String(q.value) || o.text.toLowerCase().includes((q.selectedLabels?.[0] || q.value || "").toLowerCase()));
          if (match) { el.value = match.value; el.dispatchEvent(new Event("change", { bubbles: true })); filled++; }
        } else if (q.type === "combobox" || q.type === "multiselect") {
          // React Select / combobox: click to open, then type value
          // Try clicking the container to open dropdown
          const reactSelect = el.closest("[class*=select], [class*=combobox], [class*=listbox]") || el;
          reactSelect.click && reactSelect.click();
          setTimeout(() => {
            const displayLabel = q.selectedLabels?.[0] || q.value || "";
            nativeSet(el, displayLabel);
            // Look for matching option in any open listbox
            setTimeout(() => {
              const options = document.querySelectorAll('[role=option], [class*=option], li[class*=result]');
              for (const opt of options) {
                if (opt.textContent.toLowerCase().includes(displayLabel.toLowerCase())) {
                  opt.click();
                  filled++;
                  break;
                }
              }
            }, 200);
          }, 100);
        } else {
          if (!el.value) { nativeSet(el, q.value); filled++; }
        }
      }
    }

    return filled;
  }

  // Wait for React to hydrate, then fill
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const inputs = document.querySelectorAll("input[type=text], input[type=email], textarea");
    if (inputs.length > 3 || attempts > 40) {
      clearInterval(interval);
      setTimeout(() => {
        const count = tryFill();
        // Show a toast
        const toast = document.createElement("div");
        toast.style.cssText = "position:fixed;top:20px;right:20px;background:#22c55e;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:99999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3)";
        toast.textContent = "Auto-filled " + count + " fields. Upload resume + solve captcha to submit.";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);

        // Retry fill after a delay for React re-renders
        setTimeout(() => tryFill(), 1000);
        setTimeout(() => tryFill(), 3000);
      }, 500);
    }
  }, 300);
})();
</script>`;

          // Inject before </body>, strip CSP meta tags that would block our script
          ghHtml = ghHtml.replace(/<meta[^>]*content-security-policy[^>]*>/gi, "");
          ghHtml = ghHtml.replace("</body>", fillScript + "</body>");

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            // Override CSP to allow our injected script
            "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'",
          });
          return res.end(ghHtml);
        } catch (err) {
          res.writeHead(500);
          return res.end("Proxy error: " + err.message);
        }
      }

      // ── Apply page: split-screen with resolved fields + Greenhouse form ──
      if (req.method === "GET" && req.url.startsWith("/apply/")) {
        const key = decodeURIComponent(req.url.slice(7));
        const job = queue.find(q => q.key === key);
        if (!job) { res.writeHead(404); return res.end("Job not found"); }
        const fields = job.resolved || [];
        const embedUrl = job.embedUrl;
        const applyPageHtml = buildApplyPage(job, fields, embedUrl, candidateInfo);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(applyPageHtml);
      }
      if (req.method === "POST" && req.url === "/api/update") {
        const { key, status, note } = await readBody(req);
        const job = queue.find(q => q.key === key);
        if (!job) return json(res, 404, { error: "not found" });
        job.status = status;
        if (note !== undefined) job.note = note;
        job.updatedAt = new Date().toISOString();
        saveState();
        return json(res, 200, { queue });
      }
      if (req.method === "POST" && req.url === "/api/submit") {
        const { key } = await readBody(req);
        const job = queue.find(q => q.key === key);
        if (!job) return json(res, 404, { error: "not found" });
        if (!job.ready) return json(res, 400, { error: "not ready for HTTP submit", queue });
        try {
          const app = await prepareApp(aasthaProfile, job);
          if (!app.ready || !app.payload) {
            return json(res, 400, { success: false, error: "preparation failed", queue });
          }
          const { submitPayload } = await import("../services/allocation-crawler-service/src/engine/apply-operator.mjs");
          const result = await submitPayload(job.board, job.job_id, app.embedUrl, app.payload);
          if (result.success) {
            job.status = "submitted";
            job.updatedAt = new Date().toISOString();
            saveState();
            await recordRun(job.job_id, job.board, "submitted", null);
          }
          return json(res, 200, { ...result, queue });
        } catch (err) {
          return json(res, 500, { success: false, error: err.message, queue });
        }
      }
      // Auto-submit: re-prepares with fresh tokens and attempts HTTP POST
      if (req.method === "POST" && req.url === "/api/auto-submit") {
        const { key } = await readBody(req);
        const job = queue.find(q => q.key === key);
        if (!job) return json(res, 404, { error: "not found" });
        try {
          console.log(`  [auto-submit] Preparing ${job.board}/${job.job_id}...`);
          const app = await prepareApp(aasthaProfile, job);
          if (!app.payload) {
            return json(res, 400, { success: false, error: "Could not build payload: " + (app.error || "unknown"), queue });
          }
          console.log(`  [auto-submit] formType=${app.formType} captcha=${app.captcha?.type} missing=${app.missing.length}`);

          let result;
          if (app.formType === "react" && app.submitPath) {
            const { submitReactPayload } = await import("../services/allocation-crawler-service/src/engine/apply-operator.mjs");
            result = await submitReactPayload(app.submitPath, app.payload);
          } else if (app.formType === "legacy") {
            const { submitPayload } = await import("../services/allocation-crawler-service/src/engine/apply-operator.mjs");
            result = await submitPayload(job.board, job.job_id, app.embedUrl, app.payload);
          } else {
            return json(res, 400, { success: false, error: "Unknown form type: " + app.formType, queue });
          }

          console.log(`  [auto-submit] Result: ${result.success ? "SUCCESS" : result.error}`);
          if (result.success) {
            job.status = "submitted";
            job.updatedAt = new Date().toISOString();
            saveState();
            await recordRun(job.job_id, job.board, "submitted", null);
          }
          return json(res, 200, { ...result, queue });
        } catch (err) {
          console.error(`  [auto-submit] Error:`, err.message);
          return json(res, 500, { success: false, error: err.message, queue });
        }
      }
      // ── Open Chrome tab, fill form, leave for user to solve captcha + submit ──
      if (req.method === "POST" && req.url === "/api/open-and-fill") {
        const { key } = await readBody(req);
        const job = queue.find(q => q.key === key);
        if (!job) return json(res, 404, { error: "not found" });

        try {
          console.log(`  [chrome] Opening ${job.board}/${job.job_id}...`);

          // Launch or reuse browser
          if (!serveDashboard._browserCtx || !serveDashboard._browserCtx.isConnected()) {
            serveDashboard._browserCtx = await launchBrowserEngine("chrome");
            console.log("  [browser] Chrome launched");
          }

          const embedUrl = job.embedUrl || `https://job-boards.greenhouse.io/embed/job_app?for=${job.board}&token=${job.job_id}`;
          const page = await serveDashboard._browserCtx.openPage(embedUrl);

          // Use the full browser-fill module (combobox fuzzy-match, EEO detection, education, checkboxes, etc.)
          const result = await fillFormInBrowser(page, aasthaProfile, {
            useLLM: false,
            resumePath: resolve(ROOT, "blob/aastha_resume.pdf"),
          });

          console.log(`  [chrome] Filled ${result.filled}/${result.total} fields | resume=${result.resumeUploaded}`);
          console.log(`  [chrome] Details: ${result.details.join(", ")}`);

          return json(res, 200, {
            success: true,
            message: `Opened in Chrome. Filled ${result.filled} fields.${result.resumeUploaded ? " Resume uploaded." : ""} Solve captcha and click Submit.`,
            filled: result.filled,
            queue,
          });
        } catch (err) {
          console.error("  [chrome] Error:", err.message);
          return json(res, 500, { success: false, error: err.message, queue });
        }
      }
      if (req.method === "POST" && req.url === "/api/reset") {
        for (const q of queue) { q.status = "pending"; q.note = ""; q.updatedAt = null; }
        saveState();
        return json(res, 200, { queue });
      }
      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });

  server.listen(port, () => {
    console.log(`\n  ┌─────────────────────────────────────────────┐`);
    console.log(`  │  Dashboard → http://localhost:${port}           │`);
    console.log(`  │  ${queue.length} jobs loaded | Ctrl+C to stop            │`);
    console.log(`  └─────────────────────────────────────────────┘\n`);
  });
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
