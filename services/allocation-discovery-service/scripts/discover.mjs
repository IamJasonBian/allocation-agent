#!/usr/bin/env node
/**
 * Local discovery runner.
 *
 * Uses the file-backed mock Redis so you can crawl all day without touching
 * prod. State lives at ./.discovery-state/mock-redis.json (override with
 * --state=<path>). Swap the mock for real ioredis by setting USE_REAL_REDIS=1
 * and REDIS_PASSWORD.
 *
 * Usage:
 *   node services/allocation-discovery-service/scripts/discover.mjs
 *   node services/allocation-discovery-service/scripts/discover.mjs --ats=greenhouse --limit=10
 *   node services/allocation-discovery-service/scripts/discover.mjs --company=anthropic --verbose
 *   node services/allocation-discovery-service/scripts/discover.mjs --dry-run           # no writes
 *   node services/allocation-discovery-service/scripts/discover.mjs --summary           # skip crawl, just print mock-redis state
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { MockRedis } from "../src/redis/mock-redis.mjs";
import { LocalQueue } from "../src/queue/local-queue.mjs";
import { seedQueue, runUntilEmpty } from "../src/runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const DEFAULT_CONFIG = resolve(__dirname, "../src/config/companies.json");

function arg(name, fallback) {
  const match = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!match) return fallback;
  const eq = match.indexOf("=");
  return eq === -1 ? true : match.slice(eq + 1);
}

async function main() {
  const configPath = arg("config", DEFAULT_CONFIG);
  const statePath = arg("state", resolve(ROOT, ".discovery-state/mock-redis.json"));
  const atsFilter = arg("ats", null);
  const companyFilter = arg("company", null);
  const limit = parseInt(arg("limit", "0"), 10) || 0;
  const hostDelayMs = parseInt(arg("host-delay", "2000"), 10);
  const verbose = Boolean(arg("verbose", false));
  const dryRun = Boolean(arg("dry-run", false));
  const summaryOnly = Boolean(arg("summary", false));

  const redis = dryRun
    ? new MockRedis({ path: statePath, autosave: false })
    : new MockRedis({ path: statePath });

  if (summaryOnly) {
    await printSummary(redis);
    return;
  }

  const { companies } = JSON.parse(readFileSync(configPath, "utf8"));
  let list = companies;
  if (atsFilter) list = list.filter((c) => c.ats === atsFilter);
  if (companyFilter) list = list.filter((c) => c.token === companyFilter);
  if (limit > 0) list = list.slice(0, limit);

  console.log(`discovery: ${list.length} companies, state=${statePath}${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`  ATS:      ${countBy(list, "ats")}`);

  const queue = new LocalQueue({ defaultHostDelayMs: hostDelayMs });
  seedQueue(queue, list);

  const knownCompanies = new Set(list.map((c) => c.token));

  const started = Date.now();
  const stats = await runUntilEmpty({
    queue,
    redis,
    knownCompanies,
    onStep: (ev) => {
      if (!verbose) return;
      if (ev.phase === "fetch-failed") {
        console.log(`  [fail] ${ev.item.ats}/${ev.item.boardToken} → ${ev.result.error || "?"}`);
      } else if (ev.phase === "upserted") {
        const c = ev.counts;
        console.log(
          `  [ok]   ${ev.item.ats.padEnd(10)} ${ev.item.boardToken.padEnd(24)} ` +
          `new=${c.new} upd=${c.updated} unch=${c.unchanged} dead=${c.dead} total=${c.total} (${ev.durationMs}ms)`
        );
      }
    },
  });
  const elapsedMs = Date.now() - started;

  console.log("");
  console.log(`completed in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  ticks:    ${stats.ticks}`);
  console.log(`  errors:   ${stats.errors}`);
  console.log(`  new:      ${stats.counts.new}`);
  console.log(`  updated:  ${stats.counts.updated}`);
  console.log(`  unchanged:${stats.counts.unchanged}`);
  console.log(`  dead:     ${stats.counts.dead}`);
  console.log(`  total:    ${stats.counts.total}`);
  if (!dryRun) redis.save();
  await printSummary(redis);
}

function countBy(list, field) {
  const counts = new Map();
  for (const x of list) counts.set(x[field], (counts.get(x[field]) || 0) + 1);
  return Array.from(counts.entries()).map(([k, v]) => `${k}=${v}`).join(" ");
}

async function printSummary(redis) {
  const active = await redis.scard("idx:status:active");
  const dead = await redis.scard("idx:dead");
  console.log("");
  console.log("mock redis summary");
  console.log(`  active jobs:  ${active}`);
  console.log(`  dead jobs:    ${dead}`);
  // show ATS breakdown
  const atsBreakdown = [];
  for (const ats of ["greenhouse", "lever", "ashby", "workable"]) {
    const n = await redis.scard(`idx:ats:${ats}`);
    if (n > 0) atsBreakdown.push(`${ats}=${n}`);
  }
  console.log(`  by ATS:       ${atsBreakdown.join(" ") || "(none)"}`);
  // show top-quality jobs
  const activeKeys = await redis.smembers("idx:status:active");
  const top = [];
  for (const comp of activeKeys.slice(0, 500)) {
    const [company, jobId] = comp.split(":");
    const q = await redis.get(`quality:${company}:${jobId}`);
    if (q) {
      try {
        const parsed = JSON.parse(q);
        top.push({ comp, score: parsed.score });
      } catch {}
    }
  }
  top.sort((a, b) => b.score - a.score);
  if (top.length) {
    console.log("  top quality:");
    for (const r of top.slice(0, 5)) {
      const [company, jobId] = r.comp.split(":");
      const job = await redis.hgetall(`jobs:${company}:${jobId}`);
      console.log(`    ${r.score.toFixed(3)}  ${company.padEnd(24)} ${(job.title || "").slice(0, 55)}`);
    }
  }
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
