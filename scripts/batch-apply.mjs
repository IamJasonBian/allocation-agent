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

// ── Job Fetching ──

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
      job_id: String(j.id),
      board: token,
      title: j.title,
      url: j.absolute_url,
      location: j.location?.name || "",
      department: j.departments?.[0]?.name || "",
      tags: [],
      status: "discovered",
    }));
  } catch { return []; }
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
    } else {
      console.log(`  ✗ FAILED: ${result.error || "unknown"}`);
      await recordRun({ jobId: opts.jobId, board: opts.boardFilter, userId: profile.email, error: result.error });
    }
    return;
  }

  // Phase 1: Fetch jobs
  console.log("── Phase 1: Fetching jobs ──\n");
  const jobMap = new Map();

  for (const tag of boardsConfig.crawler_tags) {
    process.stdout.write(`  Tag: ${tag.padEnd(10)} `);
    const jobs = await fetchJobsByTag(tag);
    let added = 0;
    for (const j of jobs) { if (!jobMap.has(j.job_id)) { jobMap.set(j.job_id, j); added++; } }
    console.log(`${jobs.length} → ${added} new (${jobMap.size} total)`);
  }

  console.log("\n  Fetching IB Greenhouse boards...\n");
  for (const { token, name } of boardsConfig.ib_boards) {
    process.stdout.write(`  ${name.padEnd(25)} `);
    const jobs = await fetchGreenhouseBoard(token);
    let added = 0;
    for (const j of jobs) { if (!jobMap.has(j.job_id)) { jobMap.set(j.job_id, j); added++; } }
    console.log(`${jobs.length} total → ${added} new (${jobMap.size} total)`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Phase 2: Filter
  const allJobs = Array.from(jobMap.values());
  const matchingJobs = filterAndRank(allJobs, filter, {
    boardFilter: opts.boardFilter,
    allowedBoards: allowedBoards,
  });
  const jobsToApply = matchingJobs.slice(0, opts.limit);

  console.log(`\n── Phase 2: ${jobsToApply.length} matching jobs ──\n`);
  for (const j of jobsToApply.slice(0, 20)) {
    console.log(`  ${String(j.score).padStart(4)}  ${j.board.padEnd(22)} ${j.title.substring(0, 55).padEnd(57)} ${(j.location || "").substring(0, 25)}`);
  }
  if (jobsToApply.length > 20) console.log(`  ... and ${jobsToApply.length - 20} more`);

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
