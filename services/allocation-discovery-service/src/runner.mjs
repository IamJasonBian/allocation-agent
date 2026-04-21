/**
 * Discovery runner.
 *
 *   seedQueue(queue, companies)   → enqueues one crawl task per company
 *   runTick({ queue, redis, ... }) → dequeues one task, fetches, upserts
 *   runUntilEmpty(...)            → drains the queue (with politeness gaps)
 *
 * Upsert semantics mirror scripts/refresh-jobs.mjs so swapping the mock
 * redis for the real one is a one-line change: same keys
 * (`jobs:{company}:{jobId}`, `idx:company:*`, `idx:status:active`,
 * `idx:tag:*`, `feed:new`, `feed:company:*`, `meta:last_fetch:*`).
 *
 * New keys this service owns (not in scripts/refresh-jobs.mjs):
 *   `quality:{company}:{jobId}`   → string JSON { score, breakdown, at }
 *   `idx:ats:{ats}`               → set of composite keys per ATS
 *   `idx:dead`                    → set of composite keys currently dead
 */

import { sourceFor } from "./sources/index.mjs";
import { qualityScore } from "./quality/score.mjs";
import { markDroppedFromApi } from "./quality/liveness.mjs";

export function seedQueue(queue, companies) {
  for (const c of companies) {
    const source = sourceFor(c.ats);
    queue.enqueue({
      host: source.HOST,
      ats: c.ats,
      boardToken: c.token,
      companyName: c.name,
      tier: c.tier || 1,
      priority: c.priority ?? (c.tier === 1 ? 10 : 5),
    });
  }
}

function compositeKey(company, jobId) { return `${company}:${jobId}`; }
function jobKey(company, jobId) { return `jobs:${company}:${jobId}`; }
function qualityKey(company, jobId) { return `quality:${company}:${jobId}`; }

export async function runTick({ queue, redis, now = () => new Date(), knownCompanies = new Set(), fetchImpl = fetch, onStep = () => {} }) {
  const item = queue.dequeue();
  if (!item) return { status: "idle", waitMs: queue.msUntilReady() };

  const source = sourceFor(item.ats);
  const started = Date.now();
  const result = await source.fetchBoard(item.boardToken, {
    companyName: item.companyName,
    fetchImpl,
  });
  const durationMs = Date.now() - started;

  if (!result.ok) {
    queue.markDone(item, { ok: false, durationMs });
    onStep({ phase: "fetch-failed", item, result, durationMs });
    return { status: "fetch-failed", item, result };
  }

  const nowDate = now();
  const nowIso = nowDate.toISOString();
  const nowTs = nowDate.getTime() / 1000;

  // Track which composite keys we already had for this company so we can
  // detect drop-outs (dead listings) in a single pass.
  const alreadyKnown = new Set(await redis.smembers(`idx:company:${item.boardToken}`));
  const seenThisTick = new Set();

  const pipe = redis.pipeline();
  let newCount = 0, updatedCount = 0, unchangedCount = 0;
  const upserts = [];

  for (const j of result.jobs) {
    if (!j.job_id) continue;
    const comp = compositeKey(j.company, j.job_id);
    seenThisTick.add(comp);

    const existingHash = await redis.hget(jobKey(j.company, j.job_id), "content_hash");
    const existingFirstSeen = await redis.hget(jobKey(j.company, j.job_id), "first_seen_at");

    const baseFields = {
      job_id: j.job_id,
      company: j.company,
      company_name: j.company_name,
      ats: j.ats,
      title: j.title,
      url: j.url,
      department: j.department,
      location: j.location,
      status: "active",
      last_seen_at: nowIso,
      updated_at: j.updated_at || existingFirstSeen || nowIso,
      posted_at: j.posted_at || existingFirstSeen || "",
      content_hash: j.content_hash,
      host: j.host,
      tags: j.tags.join(","),
      tier: String(j.tier ?? 1),
    };

    if (existingHash === null) {
      newCount++;
      pipe.hset(jobKey(j.company, j.job_id), { ...baseFields, first_seen_at: nowIso });
      pipe.sadd(`idx:company:${j.company}`, comp);
      pipe.sadd(`idx:ats:${j.ats}`, comp);
      pipe.sadd("idx:status:active", comp);
      pipe.zadd("feed:new", nowTs, comp);
      pipe.zadd(`feed:company:${j.company}`, nowTs, comp);
      for (const tag of j.tags) pipe.sadd(`idx:tag:${tag}`, comp);
    } else if (existingHash !== j.content_hash) {
      updatedCount++;
      pipe.hset(jobKey(j.company, j.job_id), baseFields);
      for (const tag of j.tags) pipe.sadd(`idx:tag:${tag}`, comp);
    } else {
      unchangedCount++;
      pipe.hset(jobKey(j.company, j.job_id), { last_seen_at: nowIso });
    }

    // Quality score is computed on every tick — cheap and makes ranking live.
    const scored = qualityScore(
      { ...j, status: "active", first_seen_at: existingFirstSeen || nowIso },
      { knownCompanies, now: nowDate.getTime() }
    );
    pipe.set(
      qualityKey(j.company, j.job_id),
      JSON.stringify({ score: scored.score, breakdown: scored.breakdown, at: nowIso })
    );
    upserts.push({ comp, score: scored.score });
  }

  // Dead-listing detection — anything we knew for this company but didn't see
  // this tick gets marked dead. The job hash stays (so we preserve history),
  // but it drops out of the active index.
  const dropped = markDroppedFromApi({ known: alreadyKnown, seen: seenThisTick });
  let deadCount = 0;
  for (const comp of dropped) {
    const [company, jobId] = comp.split(":");
    pipe.hset(jobKey(company, jobId), { status: "dead", last_seen_at: nowIso, dead_reason: "api_dropout" });
    pipe.srem("idx:status:active", comp);
    pipe.sadd("idx:dead", comp);
    deadCount++;
  }

  pipe.set(`meta:last_fetch:${item.boardToken}`, nowIso);

  await pipe.exec();
  queue.markDone(item, { ok: true, durationMs });

  const summary = {
    status: "ok",
    item,
    durationMs,
    counts: { new: newCount, updated: updatedCount, unchanged: unchangedCount, dead: deadCount, total: result.jobs.length },
    upserts,
  };
  onStep({ phase: "upserted", ...summary });
  return summary;
}

export async function runUntilEmpty({ queue, redis, ...opts } = {}) {
  const stats = { ticks: 0, errors: 0, counts: { new: 0, updated: 0, unchanged: 0, dead: 0, total: 0 } };
  while (true) {
    const out = await runTick({ queue, redis, ...opts });
    if (out.status === "idle") {
      // every host on cooldown, or queue empty.
      if (queue.size() === 0) break;
      const wait = queue.msUntilReady();
      if (wait <= 0) break; // truly empty
      await new Promise((r) => setTimeout(r, Math.max(50, wait)));
      continue;
    }
    stats.ticks++;
    if (out.status === "ok") {
      for (const [k, v] of Object.entries(out.counts)) stats.counts[k] = (stats.counts[k] || 0) + v;
    } else {
      stats.errors++;
    }
  }
  return stats;
}
