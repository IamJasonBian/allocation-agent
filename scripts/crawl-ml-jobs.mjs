#!/usr/bin/env node
/**
 * Crawl Greenhouse boards for ML Engineering / ML Data Infra jobs.
 * Fetches all jobs, filters by ML-relevant titles, and attempts to apply.
 *
 * Usage:
 *   node scripts/crawl-ml-jobs.mjs                # crawl + list
 *   node scripts/crawl-ml-jobs.mjs --apply        # crawl + apply
 *   node scripts/crawl-ml-jobs.mjs --company=anthropic  # single company
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── ML-focused companies with Greenhouse boards ──
const ML_COMPANIES = [
  // Existing finance/quant companies (many have ML roles)
  { boardToken: "point72", displayName: "Point72" },
  { boardToken: "twosigma", displayName: "Two Sigma" },
  { boardToken: "citabortsecurities", displayName: "Citadel Securities" },
  { boardToken: "deshaw", displayName: "D.E. Shaw" },
  { boardToken: "drweng", displayName: "DRW" },
  { boardToken: "imc", displayName: "IMC Trading" },
  { boardToken: "jumptrading", displayName: "Jump Trading" },
  { boardToken: "hudsonrivertrading", displayName: "Hudson River Trading" },
  { boardToken: "janestreet", displayName: "Jane Street" },
  { boardToken: "voleon", displayName: "Voleon" },
  { boardToken: "aqr", displayName: "AQR Capital" },
  { boardToken: "millenniumadvisors", displayName: "Millennium" },
  { boardToken: "sig", displayName: "Susquehanna (SIG)" },
  { boardToken: "clearstreet", displayName: "Clear Street" },

  // AI/ML-first companies
  { boardToken: "anthropic", displayName: "Anthropic" },
  { boardToken: "openai", displayName: "OpenAI" },
  { boardToken: "scaleai", displayName: "Scale AI" },
  { boardToken: "coabortshere", displayName: "Cohere" },
  { boardToken: "mistral", displayName: "Mistral AI" },
  { boardToken: "huggingface", displayName: "Hugging Face" },
  { boardToken: "deepmind", displayName: "DeepMind" },
  { boardToken: "adept", displayName: "Adept AI" },
  { boardToken: "runwayml", displayName: "Runway" },
  { boardToken: "stability", displayName: "Stability AI" },
  { boardToken: "characterai", displayName: "Character AI" },
  { boardToken: "perplexityai", displayName: "Perplexity AI" },
  { boardToken: "anyscale", displayName: "Anyscale" },
  { boardToken: "modular", displayName: "Modular" },
  { boardToken: "databricks", displayName: "Databricks" },
  { boardToken: "weights-and-biases", displayName: "Weights & Biases" },

  // Big tech with ML roles
  { boardToken: "stripe", displayName: "Stripe" },
  { boardToken: "datadoghq", displayName: "Datadog" },
  { boardToken: "palantirtechnologies", displayName: "Palantir" },
  { boardToken: "netflix", displayName: "Netflix" },
  { boardToken: "spotify", displayName: "Spotify" },
  { boardToken: "airbnb", displayName: "Airbnb" },
  { boardToken: "figma", displayName: "Figma" },
  { boardToken: "discord", displayName: "Discord" },
  { boardToken: "notion", displayName: "Notion" },
  { boardToken: "snowflakecomputing", displayName: "Snowflake" },
  { boardToken: "plaid", displayName: "Plaid" },
  { boardToken: "brex", displayName: "Brex" },
  { boardToken: "robinhood", displayName: "Robinhood" },
  { boardToken: "duolingo", displayName: "Duolingo" },
  { boardToken: "doordash", displayName: "DoorDash" },
  { boardToken: "instacart", displayName: "Instacart" },
  { boardToken: "pinterest", displayName: "Pinterest" },
  { boardToken: "lyft", displayName: "Lyft" },
  { boardToken: "square", displayName: "Block (Square)" },
  { boardToken: "coinbase", displayName: "Coinbase" },
  { boardToken: "nuro", displayName: "Nuro" },
  { boardToken: "cruise", displayName: "Cruise" },
  { boardToken: "aurora", displayName: "Aurora" },
  { boardToken: "waymo", displayName: "Waymo" },
];

// ── ML title filters ──
const ML_TITLE_PATTERNS = [
  /machine\s*learning/i,
  /\bml\b/i,
  /\bai\s+engineer/i,
  /\bai\s+infrastructure/i,
  /\bai\s*\/?\s*ml/i,
  /\bml\s*\/?\s*ai/i,
  /data\s*infra/i,
  /data\s*platform/i,
  /data\s*engineer/i,
  /deep\s*learning/i,
  /\bnlp\b/i,
  /\bllm\b/i,
  /research\s*engineer/i,
  /research\s*scientist/i,
  /applied\s*scientist/i,
  /ml\s*ops/i,
  /mlops/i,
  /ml\s*infra/i,
  /model\s*infra/i,
  /inference\s*engineer/i,
  /training\s*infra/i,
  /\bgenai\b/i,
  /generative\s*ai/i,
  /computer\s*vision/i,
  /\bcv\s+engineer/i,
  /reinforcement\s*learning/i,
];

// Higher priority patterns (these are the core ML Engineering roles)
const HIGH_PRIORITY_PATTERNS = [
  /machine\s*learning\s*engineer/i,
  /\bml\s*engineer/i,
  /\bml\s*infra/i,
  /ml\s*data\s*infra/i,
  /data\s*infra.*engineer/i,
  /\bai\s+engineer/i,
  /deep\s*learning\s*engineer/i,
  /mlops\s*engineer/i,
  /ml\s*platform/i,
  /\bml\s*ops/i,
  /training\s*infra/i,
  /inference\s*engineer/i,
  /applied\s*scientist/i,
];

// Location filters (US-based, remote-friendly)
const VALID_LOCATIONS = [
  /new\s*york/i, /nyc/i, /\bny\b/i,
  /san\s*francisco/i, /\bsf\b/i,
  /seattle/i, /\bwa\b/i,
  /remote/i, /united\s*states/i, /\bus\b/i,
  /chicago/i, /boston/i, /austin/i,
  /los\s*angeles/i, /\bla\b/i,
  /palo\s*alto/i, /mountain\s*view/i, /sunnyvale/i,
  /menlo\s*park/i, /cupertino/i, /san\s*jose/i,
  /denver/i, /boulder/i, /portland/i,
  /washington/i, /\bdc\b/i,
  /stamford/i, /greenwich/i,
  /anywhere/i, /hybrid/i, /flexible/i,
];

function isMLJob(title) {
  return ML_TITLE_PATTERNS.some(p => p.test(title));
}

function isHighPriority(title) {
  return HIGH_PRIORITY_PATTERNS.some(p => p.test(title));
}

function isUSLocation(location) {
  if (!location) return true; // include if location unknown
  return VALID_LOCATIONS.some(p => p.test(location));
}

async function fetchGreenhouseJobs(boardToken) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  } catch {
    return [];
  }
}

async function fetchJobQuestions(boardToken, jobId) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}?questions=true`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── HTTP-based Greenhouse application (no browser needed) ──

async function applyViaHTTP(boardToken, jobId, jobTitle) {
  // Step 1: Get the embed page to find the form token
  const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
  let embedHtml;
  try {
    const res = await fetch(embedUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { success: false, method: "http", error: `Embed page ${res.status}` };
    embedHtml = await res.text();
  } catch (err) {
    return { success: false, method: "http", error: `Embed fetch: ${err.message}` };
  }

  // Check for reCAPTCHA - if present, we can't use HTTP method
  if (embedHtml.includes("recaptcha") || embedHtml.includes("reCAPTCHA")) {
    return { success: false, method: "http", error: "reCAPTCHA detected, needs browser" };
  }

  // Extract authenticity token
  const tokenMatch = embedHtml.match(/name="authenticity_token"\s+value="([^"]+)"/);
  if (!tokenMatch) {
    return { success: false, method: "http", error: "No authenticity token found" };
  }
  const authToken = tokenMatch[1];

  // Find resume file
  const resumeDir = resolve(ROOT, "blob");
  const resumeFiles = [
    "resume_jasonzb_oct15_m.pdf",
    "resume_jasonzb (1).pdf",
    "resume_jasonzb (2).pdf",
    "resume_jasonzb (3).pdf",
  ];
  let resumePath = null;
  for (const f of resumeFiles) {
    const p = resolve(resumeDir, f);
    if (existsSync(p)) { resumePath = p; break; }
  }
  if (!resumePath) {
    return { success: false, method: "http", error: "No resume file found" };
  }

  // Build multipart form data
  const formData = new FormData();
  formData.append("authenticity_token", authToken);
  formData.append("job_application[first_name]", "Jason");
  formData.append("job_application[last_name]", "Bian");
  formData.append("job_application[email]", "jason.bian64@gmail.com");
  formData.append("job_application[phone]", "+17347306569");
  formData.append("job_application[location]", "New York, NY");

  // Read resume and attach
  const resumeBuffer = readFileSync(resumePath);
  const resumeBlob = new Blob([resumeBuffer], { type: "application/pdf" });
  formData.append("job_application[resume]", resumeBlob, resumePath.split("/").pop());

  // LinkedIn URL
  formData.append("job_application[urls][LinkedIn]", "https://linkedin.com/in/jasonzb");
  formData.append("job_application[urls][GitHub]", "https://github.com/IamJasonBian");

  // Submit
  const submitUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
  try {
    const res = await fetch(submitUrl, {
      method: "POST",
      body: formData,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });

    const status = res.status;
    if (status === 302 || status === 301) {
      return { success: true, method: "http", message: "Redirect (likely success)" };
    }

    const body = await res.text();
    if (body.toLowerCase().includes("thank you") || body.toLowerCase().includes("application has been submitted")) {
      return { success: true, method: "http", message: "Thank you page detected" };
    }
    if (body.toLowerCase().includes("already been submitted") || body.toLowerCase().includes("already applied")) {
      return { success: false, method: "http", error: "Already applied" };
    }
    if (body.toLowerCase().includes("error") || body.toLowerCase().includes("invalid")) {
      // Extract error details
      const errorMatch = body.match(/class="field-error"[^>]*>([^<]+)/);
      return { success: false, method: "http", error: errorMatch ? errorMatch[1] : `Form error (${status})` };
    }

    return { success: false, method: "http", error: `Unknown response (${status}), ${body.substring(0, 200)}` };
  } catch (err) {
    return { success: false, method: "http", error: `Submit: ${err.message}` };
  }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const doApply = args.includes("--apply");
  const companyFilter = args.find(a => a.startsWith("--company="))?.split("=")[1];
  const dryRun = args.includes("--dry-run") || !doApply;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ML Engineering Job Crawler + Auto-Apply                    ║");
  console.log(`║  Mode: ${dryRun ? "CRAWL ONLY (use --apply to submit)" : "CRAWL + APPLY"}                       ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const companies = companyFilter
    ? ML_COMPANIES.filter(c => c.boardToken === companyFilter)
    : ML_COMPANIES;

  if (companies.length === 0) {
    console.error(`Company "${companyFilter}" not found.`);
    process.exit(1);
  }

  const allMLJobs = [];
  let companiesWithJobs = 0;

  for (const company of companies) {
    process.stdout.write(`  ${company.displayName.padEnd(25)} `);
    const jobs = await fetchGreenhouseJobs(company.boardToken);

    if (jobs.length === 0) {
      console.log("(no board / 0 jobs)");
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    const mlJobs = jobs.filter(j => {
      const title = j.title || "";
      const location = j.location?.name || "";
      return isMLJob(title) && isUSLocation(location);
    });

    if (mlJobs.length > 0) {
      companiesWithJobs++;
      console.log(`${jobs.length} total → ${mlJobs.length} ML matches`);
      for (const j of mlJobs) {
        const priority = isHighPriority(j.title) ? "★" : " ";
        allMLJobs.push({
          company: company.displayName,
          boardToken: company.boardToken,
          id: String(j.id),
          title: j.title,
          location: j.location?.name || "Unknown",
          url: j.absolute_url,
          priority,
          dept: j.departments?.[0]?.name || "",
        });
      }
    } else {
      console.log(`${jobs.length} total → 0 ML matches`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // Sort: high priority first, then by company
  allMLJobs.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "★" ? -1 : 1;
    return a.company.localeCompare(b.company);
  });

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  FOUND ${allMLJobs.length} ML ENGINEERING JOBS across ${companiesWithJobs} companies`);
  console.log("═".repeat(80));

  // Print job table
  for (const j of allMLJobs) {
    console.log(`  ${j.priority} ${j.company.padEnd(22)} ${j.title.substring(0, 60).padEnd(62)} ${j.location.substring(0, 25)}`);
  }

  // Save job list to file
  const outputPath = resolve(ROOT, "scripts", "ml-jobs-found.json");
  writeFileSync(outputPath, JSON.stringify(allMLJobs, null, 2));
  console.log(`\n  Job list saved to: scripts/ml-jobs-found.json`);

  // Apply if requested
  if (doApply && allMLJobs.length > 0) {
    console.log(`\n${"═".repeat(80)}`);
    console.log("  APPLYING TO ML JOBS VIA HTTP");
    console.log("═".repeat(80));

    let applied = 0, failed = 0, skipped = 0;
    const results = [];

    for (const job of allMLJobs) {
      process.stdout.write(`\n  → ${job.company} | ${job.title.substring(0, 50)}... `);

      const result = await applyViaHTTP(job.boardToken, job.id, job.title);

      if (result.success) {
        console.log(`✓ APPLIED (${result.message})`);
        applied++;
      } else {
        console.log(`✗ ${result.error}`);
        if (result.error.includes("reCAPTCHA")) skipped++;
        else failed++;
      }

      results.push({ ...job, result });

      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n${"═".repeat(80)}`);
    console.log(`  RESULTS: Applied=${applied} | Failed=${failed} | Skipped (reCAPTCHA)=${skipped}`);
    console.log("═".repeat(80));

    // Save results
    const resultsPath = resolve(ROOT, "scripts", "ml-apply-results.json");
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`  Results saved to: scripts/ml-apply-results.json`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
