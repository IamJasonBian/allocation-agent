#!/usr/bin/env node
/**
 * Generic Batch Apply Orchestrator
 *
 * Uses config-driven components to apply to jobs for any candidate.
 *
 * Usage:
 *   node scripts/batch-apply.mjs --candidate=aastha --filters=ib-analyst
 *   node scripts/batch-apply.mjs --candidate=aastha --filters=ib-analyst --dry-run
 *   node scripts/batch-apply.mjs --candidate=aastha --filters=ib-analyst --limit=5
 *   node scripts/batch-apply.mjs --candidate=aastha --filters=ib-analyst --board=williamblair
 *   node scripts/batch-apply.mjs --candidate=aastha --filters=ib-analyst --job-id=123 --board=williamblair
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { loadProfile } from "./lib/candidate-profile.mjs";
import { loadFilter, filterAndRank } from "./lib/job-matcher.mjs";
import { applyToJob, findChromePath } from "./lib/greenhouse-driver.mjs";
import { recordRun, saveResults } from "./lib/result-tracker.mjs";
import { buildCandidateJobs } from "./lib/candidate-jobs-builder.mjs";
import { confirmPrerun } from "./lib/prerun-confirm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CRAWLER_API = "https://allocation-crawler-service.netlify.app/api/crawler";

// ── CLI Parsing ──

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
  return {
    candidateName: get("candidate") || "aastha",
    filterName: get("filters") || "ib-analyst",
    dryRun: args.includes("--dry-run"),
    limit: get("limit") ? parseInt(get("limit")) : Infinity,
    boardFilter: get("board"),
    jobId: get("job-id"),
    useLLM: !process.env.NO_LLM,
    debugNoSubmit: !!process.env.DEBUG_NO_SUBMIT,
  };
}

// Append a UserHistoryEntry so the CandidateJobs scorer sees this apply on
// the next run. Non-fatal if the endpoint isn't reachable.
async function recordHistory(userId, board, jobId, title, status, notes) {
  try {
    await fetch(`${CRAWLER_API}/users/${encodeURIComponent(userId)}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, jobId: String(jobId), title, status, source: "manual", notes: notes || "" }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {}
}

// ── Main ──

async function main() {
  const opts = parseArgs();

  // Load profile and filter
  const profile = await loadProfile(opts.candidateName);
  const filterPath = resolve(__dirname, `config/job-filters/${opts.filterName}.json`);
  const filter = loadFilter(filterPath);
  const boardsConfig = JSON.parse(readFileSync(resolve(__dirname, "config/boards.json"), "utf8"));

  const allowedBoards = new Set(boardsConfig.greenhouse_boards);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  Batch Apply — ${profile.fullName.padEnd(20)} (${filter.name})`.padEnd(63) + "║");
  console.log(`║  Mode: ${opts.dryRun ? "DRY RUN" : "LIVE APPLY"}  |  Limit: ${String(opts.limit === Infinity ? "ALL" : opts.limit).padEnd(4)}                       ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Single-job test mode
  if (opts.jobId) {
    if (!opts.boardFilter) { console.error("--job-id requires --board=<token>"); process.exit(1); }
    console.log(`── Single-job test: board=${opts.boardFilter} job_id=${opts.jobId} ──\n`);
    if (opts.dryRun) { console.log("  DRY RUN — would apply to single job.\n"); return; }
    const chromePath = findChromePath();
    const result = await applyToJob({
      chromePath, boardToken: opts.boardFilter, jobId: opts.jobId, profile,
      useLLM: opts.useLLM, debugNoSubmit: opts.debugNoSubmit,
    });
    if (result.success) {
      console.log(`  ✓ APPLIED: ${result.message || ""}`);
      await recordRun({ jobId: opts.jobId, board: opts.boardFilter, userId: profile.email });
      await recordHistory(profile.email, opts.boardFilter, opts.jobId, "(single-job test)", "applied", null);
    } else {
      console.log(`  ✗ FAILED: ${result.error || "unknown"}`);
      await recordRun({ jobId: opts.jobId, board: opts.boardFilter, userId: profile.email, error: result.error });
    }
    return;
  }

  // Phase 1+2: Build CandidateJobs. The content-based scorer runs against
  // this user's history; a random exploration seed is appended. The config
  // filter + allowlist still participates via the pool fetch + `filter` hook
  // so declarative job-filters/*.json rules keep working as a pre-filter.
  console.log("── Phase 1+2: Building CandidateJobs ──\n");
  const candidateJobs = await buildCandidateJobs({
    userId: profile.email,
    crawlerApi: CRAWLER_API,
    limit: Number.isFinite(opts.limit) ? opts.limit : 20,
    boardsAllowlist: allowedBoards,
    filter: (j) => {
      if (opts.boardFilter && j.board !== opts.boardFilter) return false;
      // Pre-filter via the declared job-filter config so legacy rules still gate.
      const ranked = filterAndRank([j], filter, { allowedBoards });
      return ranked.length > 0;
    },
  });

  const approved = await confirmPrerun(candidateJobs);
  if (!approved) { console.log("\n  Prerun not confirmed. Exiting.\n"); return; }

  const jobsToApply = candidateJobs.jobs.map((j) => ({
    job_id: j.jobId,
    board: j.board,
    title: j.title,
    url: j.url,
    location: j.location,
    department: j.department,
    tags: j.tags,
    score: j.score,
    source: j.source,
  }));

  if (opts.dryRun) { console.log("\n  DRY RUN complete.\n"); return; }

  // Phase 3: Apply
  const chromePath = findChromePath();
  console.log(`\n── Phase 3: Applying via Chrome (${chromePath.split("/").pop()}) ──\n`);

  let applied = 0, secCode = 0, failed = 0;
  const results = [];

  for (let i = 0; i < jobsToApply.length; i++) {
    const job = jobsToApply[i];
    process.stdout.write(`  [${i + 1}/${jobsToApply.length}] ${job.board.padEnd(22)} ${job.title.substring(0, 45).padEnd(47)} `);

    const result = await applyToJob({
      chromePath, boardToken: job.board, jobId: job.job_id, profile,
      useLLM: opts.useLLM, debugNoSubmit: opts.debugNoSubmit,
    });

    if (result.success) {
      console.log("✓ APPLIED");
      applied++;
      await recordRun({ jobId: job.job_id, board: job.board, userId: profile.email });
      await recordHistory(profile.email, job.board, job.job_id, job.title, "applied", null);
    } else if (result.error?.includes("Security code")) {
      console.log("⚡ SEC CODE");
      secCode++;
      await recordRun({ jobId: job.job_id, board: job.board, userId: profile.email, error: result.error });
    } else {
      console.log(`✗ ${(result.error || "unknown").substring(0, 40)}`);
      failed++;
      await recordRun({ jobId: job.job_id, board: job.board, userId: profile.email, error: result.error });
    }

    results.push({ ...job, result });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Summary
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  BATCH RESULTS — ${profile.fullName}`);
  console.log("═".repeat(80));
  console.log(`  Applied: ${applied} | Security code needed: ${secCode} | Failed: ${failed} | Total: ${jobsToApply.length}`);

  const outputPath = resolve(__dirname, `${opts.candidateName}-browser-apply-results.json`);
  saveResults(results, outputPath);
  console.log(`  Results saved to: ${outputPath}\n`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
