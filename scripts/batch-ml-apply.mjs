#!/usr/bin/env node
/**
 * Batch ML Engineering Job Apply
 *
 * Crawls Greenhouse boards for ML/Data Infra/MLE roles and applies
 * using the existing test-apply.mjs Puppeteer flow.
 *
 * Usage:
 *   node scripts/batch-ml-apply.mjs                    # crawl + apply to all
 *   node scripts/batch-ml-apply.mjs --limit=10         # apply to first 10
 *   node scripts/batch-ml-apply.mjs --company=point72   # single company
 *   node scripts/batch-ml-apply.mjs --dry-run           # list only
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Companies with Greenhouse boards ──
const ML_COMPANIES = [
  // Finance/Quant (many have ML roles)
  { boardToken: "point72", displayName: "Point72" },
  { boardToken: "drweng", displayName: "DRW" },
  { boardToken: "imc", displayName: "IMC Trading" },
  { boardToken: "jumptrading", displayName: "Jump Trading" },
  { boardToken: "janestreet", displayName: "Jane Street" },

  // AI-first companies
  { boardToken: "anthropic", displayName: "Anthropic" },
  { boardToken: "scaleai", displayName: "Scale AI" },
  { boardToken: "deepmind", displayName: "DeepMind" },
  { boardToken: "runwayml", displayName: "Runway" },
  { boardToken: "databricks", displayName: "Databricks" },

  // Tech companies with strong ML teams
  { boardToken: "stripe", displayName: "Stripe" },
  { boardToken: "airbnb", displayName: "Airbnb" },
  { boardToken: "figma", displayName: "Figma" },
  { boardToken: "discord", displayName: "Discord" },
  { boardToken: "robinhood", displayName: "Robinhood" },
  { boardToken: "instacart", displayName: "Instacart" },
  { boardToken: "pinterest", displayName: "Pinterest" },
  { boardToken: "lyft", displayName: "Lyft" },
  { boardToken: "coinbase", displayName: "Coinbase" },
  { boardToken: "nuro", displayName: "Nuro" },
  { boardToken: "waymo", displayName: "Waymo" },
  { boardToken: "duolingo", displayName: "Duolingo" },
  { boardToken: "brex", displayName: "Brex" },
  { boardToken: "snowflakecomputing", displayName: "Snowflake" },
  { boardToken: "square", displayName: "Block (Square)" },
  { boardToken: "doordash", displayName: "DoorDash" },
  { boardToken: "plaid", displayName: "Plaid" },
  { boardToken: "notion", displayName: "Notion" },
];

// Title patterns for ML Engineering roles
const ML_TITLE_PATTERNS = [
  /machine\s*learning\s*engineer/i,
  /\bml\s*engineer/i,
  /\bml\s*infra/i,
  /ml\s*data\s*infra/i,
  /data\s*infra.*engineer/i,
  /\bai\s+engineer/i,
  /deep\s*learning\s*engineer/i,
  /mlops/i,
  /ml\s*ops/i,
  /ml\s*platform/i,
  /training\s*infra/i,
  /inference\s*engineer/i,
  /applied\s*scientist/i,
  /research\s*engineer/i,
  /research\s*scientist/i,
  /\bnlp\s*engineer/i,
  /\bllm\b.*engineer/i,
  /\bgenai\b.*engineer/i,
  /data\s*engineer/i,
  /data\s*platform/i,
  /computer\s*vision/i,
  /machine\s*learning/i,
  /\bml\b.*\bengine/i,
];

// US location patterns
const US_LOCATIONS = [
  /new\s*york/i, /nyc/i, /san\s*francisco/i, /seattle/i,
  /remote/i, /united\s*states/i, /\bus\b/i, /chicago/i,
  /boston/i, /austin/i, /los\s*angeles/i, /palo\s*alto/i,
  /mountain\s*view/i, /sunnyvale/i, /menlo\s*park/i,
  /denver/i, /washington/i, /stamford/i, /greenwich/i,
  /anywhere/i, /hybrid/i, /flexible/i, /\bsf\b/i,
  /san\s*jose/i, /cupertino/i, /\bny\b/i, /portland/i,
  /boulder/i, /\bca\b/i, /california/i,
];

function isMLJob(title) {
  return ML_TITLE_PATTERNS.some(p => p.test(title));
}

function isUSLocation(loc) {
  if (!loc) return true;
  return US_LOCATIONS.some(p => p.test(loc));
}

// Priority scoring: higher = better match for ML Engineering
function scorePriority(title) {
  const t = title.toLowerCase();
  let score = 0;
  if (/machine\s*learning\s*engineer/i.test(t)) score += 100;
  if (/\bml\s*engineer/i.test(t)) score += 100;
  if (/\bml\s*infra/i.test(t)) score += 95;
  if (/ml\s*data\s*infra/i.test(t)) score += 95;
  if (/data\s*infra/i.test(t)) score += 90;
  if (/\bai\s+engineer/i.test(t)) score += 85;
  if (/ml\s*platform/i.test(t)) score += 85;
  if (/mlops/i.test(t)) score += 80;
  if (/applied\s*scientist/i.test(t)) score += 75;
  if (/data\s*engineer/i.test(t)) score += 70;
  if (/research\s*engineer/i.test(t)) score += 65;
  if (/data\s*platform/i.test(t)) score += 60;
  if (/research\s*scientist/i.test(t)) score += 55;

  // Seniority bonus (prefer mid-level roles)
  if (/\bsenior\b/i.test(t) && !/\bstaff\b/i.test(t) && !/\bprincipal\b/i.test(t)) score += 5;
  // Penalty for too-senior or intern
  if (/\bstaff\b/i.test(t) || /\bprincipal\b/i.test(t) || /\bdirector\b/i.test(t)) score -= 10;
  if (/\bintern\b/i.test(t)) score -= 20;
  if (/\bmanager\b/i.test(t) && !/\bic\b/i.test(t)) score -= 15;

  return score;
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

// Resume variants (local to this workspace)
const RESUME_VARIANTS = [
  resolve(ROOT, "blob/resume_jasonzb_oct15_m.pdf"),
  resolve(ROOT, "blob/resume_jasonzb (1).pdf"),
  resolve(ROOT, "blob/resume_jasonzb (2).pdf"),
  resolve(ROOT, "blob/resume_jasonzb (3).pdf"),
  resolve(ROOT, "blob/resume_jasonzb (4).pdf"),
  resolve(ROOT, "blob/resume_jasonzb (7).pdf"),
].filter(p => existsSync(p));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(a => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
  const companyFilter = args.find(a => a.startsWith("--company="))?.split("=")[1];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ML Engineering Job Batch Apply (Puppeteer)                 ║");
  console.log(`║  Mode: ${dryRun ? "DRY RUN" : "LIVE APPLY"}  |  Limit: ${limit === Infinity ? "ALL" : limit}                          ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (RESUME_VARIANTS.length === 0) {
    console.error("ERROR: No resume PDFs found in blob/");
    process.exit(1);
  }
  console.log(`  Resume variants: ${RESUME_VARIANTS.length}`);

  // Phase 1: Crawl
  console.log("\n── Phase 1: Crawling Greenhouse boards ──\n");

  const companies = companyFilter
    ? ML_COMPANIES.filter(c => c.boardToken === companyFilter)
    : ML_COMPANIES;

  const allJobs = [];

  for (const company of companies) {
    process.stdout.write(`  ${company.displayName.padEnd(22)} `);
    const jobs = await fetchGreenhouseJobs(company.boardToken);

    if (jobs.length === 0) {
      console.log("(no board)");
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    const mlJobs = jobs.filter(j =>
      isMLJob(j.title || "") && isUSLocation(j.location?.name || "")
    );

    console.log(`${jobs.length} total → ${mlJobs.length} ML matches`);

    for (const j of mlJobs) {
      allJobs.push({
        company: company.displayName,
        boardToken: company.boardToken,
        id: String(j.id),
        title: j.title,
        location: j.location?.name || "Unknown",
        url: j.absolute_url,
        score: scorePriority(j.title),
      });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // Sort by priority score (highest first)
  allJobs.sort((a, b) => b.score - a.score);

  // Apply limit
  const jobsToApply = allJobs.slice(0, limit);

  console.log(`\n${"═".repeat(80)}`);
  console.log(`  FOUND ${allJobs.length} ML jobs | Applying to top ${jobsToApply.length}`);
  console.log("═".repeat(80));

  for (const j of jobsToApply) {
    console.log(`  [${String(j.score).padStart(3)}] ${j.company.padEnd(20)} ${j.title.substring(0, 55).padEnd(57)} ${j.location.substring(0, 20)}`);
  }

  // Save job list
  writeFileSync(resolve(ROOT, "scripts/ml-jobs-found.json"), JSON.stringify(allJobs, null, 2));

  if (dryRun) {
    console.log("\n  DRY RUN complete. Use without --dry-run to apply.");
    return;
  }

  // Phase 2: Apply using test-apply.mjs
  console.log(`\n── Phase 2: Applying to ${jobsToApply.length} jobs ──\n`);

  let applied = 0, failed = 0, skipped = 0;
  const results = [];
  let variantIdx = 0;

  for (const job of jobsToApply) {
    const variant = RESUME_VARIANTS[variantIdx % RESUME_VARIANTS.length];
    variantIdx++;

    console.log(`\n${"─".repeat(70)}`);
    console.log(`  [${applied + failed + skipped + 1}/${jobsToApply.length}] ${job.company} | ${job.title}`);
    console.log(`  Score: ${job.score} | Resume: ${variant.split("/").pop()}`);

    try {
      const output = execSync(
        `node scripts/test-apply.mjs ${job.boardToken} ${job.id}`,
        {
          cwd: ROOT,
          env: { ...process.env, PATH: process.env.PATH, RESUME_PATH: variant },
          timeout: 300_000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const lastLines = output.split("\n").slice(-15).join("\n");
      const isPASS = lastLines.includes("PASS") || output.includes("Application submitted") || output.includes("thank you");

      if (isPASS) {
        console.log("  ✓ APPLIED SUCCESSFULLY");
        applied++;
        results.push({ ...job, status: "PASS" });
      } else {
        console.log("  ✗ SUBMISSION UNCERTAIN");
        console.log(`  Last output: ${lastLines.substring(0, 200)}`);
        failed++;
        results.push({ ...job, status: "FAIL", output: lastLines.substring(0, 300) });
      }
    } catch (err) {
      const errOutput = ((err.stdout || "") + "\n" + (err.stderr || "")).trim();
      const lastLines = errOutput.split("\n").slice(-10).join("\n");

      // Check if it succeeded despite the error exit code
      if (lastLines.includes("PASS") || errOutput.includes("Application submitted")) {
        console.log("  ✓ APPLIED (with warnings)");
        applied++;
        results.push({ ...job, status: "PASS" });
      } else {
        console.log(`  ✗ ERROR: ${err.message.substring(0, 100)}`);
        console.log(`  Output: ${lastLines.substring(0, 200)}`);
        failed++;
        results.push({ ...job, status: "ERROR", error: err.message.substring(0, 200) });
      }
    }

    // Wait between applications
    console.log("  Waiting 5s...");
    await new Promise(r => setTimeout(r, 5000));
  }

  // Summary
  console.log(`\n${"═".repeat(80)}`);
  console.log("  BATCH RESULTS SUMMARY");
  console.log("═".repeat(80));
  console.log(`  Applied: ${applied} | Failed: ${failed} | Skipped: ${skipped} | Total: ${jobsToApply.length}`);
  console.log("");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    console.log(`  ${icon} ${r.status.padEnd(6)} ${r.company.padEnd(20)} ${r.title.substring(0, 50)}`);
  }

  // Save results
  writeFileSync(resolve(ROOT, "scripts/ml-apply-results.json"), JSON.stringify(results, null, 2));
  console.log(`\n  Results saved to scripts/ml-apply-results.json`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
