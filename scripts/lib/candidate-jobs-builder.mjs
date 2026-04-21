/**
 * Builds a CandidateJobs payload for a given user.
 *
 * 1. Pulls UserHistory from the crawler API.
 * 2. Pulls the candidate pool (crawler tag index + Greenhouse board scrapes).
 * 3. Scores each candidate against the user's history (see score-by-history).
 * 4. Drops jobs the user has already interacted with.
 * 5. Takes top-N by score, appends 1 random exploration seed.
 * 6. Persists the CandidateJobs snapshot via POST /users/{id}/candidates.
 */

import {
  makeCandidateJob,
  makeCandidateJobs,
} from "../../services/allocation-crawler-service/src/schemas/candidate-jobs.mjs";
import { scoreByHistory } from "../../services/allocation-crawler-service/src/lib/score-by-history.mjs";
import { fetchPool, DEFAULT_BOARDS_ALLOWLIST } from "./job-pool.mjs";

async function fetchHistory(crawlerApi, userId) {
  try {
    const res = await fetch(`${crawlerApi}/users/${encodeURIComponent(userId)}/history`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function persistSnapshot(crawlerApi, userId, snapshot) {
  try {
    await fetch(`${crawlerApi}/users/${encodeURIComponent(userId)}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Non-fatal — the scripts can still proceed without a cached snapshot.
  }
}

function pickRandomSeed(pool, excludeKeys) {
  const candidates = pool.filter((j) => !excludeKeys.has(`${j.board}:${j.job_id}`));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.crawlerApi
 * @param {number} [opts.limit=20]
 * @param {boolean} [opts.includeRandomSeed=true]
 * @param {Set<string>} [opts.boardsAllowlist]
 * @param {(job) => boolean} [opts.filter]  Optional secondary filter
 * @returns {Promise<import("../../services/allocation-crawler-service/src/schemas/candidate-jobs.mjs").CandidateJobs>}
 */
export async function buildCandidateJobs(opts = {}) {
  const {
    userId,
    crawlerApi,
    limit = 20,
    includeRandomSeed = true,
    boardsAllowlist = DEFAULT_BOARDS_ALLOWLIST,
    filter,
    poolOverride, // test hook
    historyOverride, // test hook
    persist = true,
  } = opts;

  if (!userId) throw new Error("buildCandidateJobs: userId required");
  if (!crawlerApi && !poolOverride) throw new Error("buildCandidateJobs: crawlerApi required");

  const [history, poolRaw] = await Promise.all([
    historyOverride ? Promise.resolve(historyOverride) : fetchHistory(crawlerApi, userId),
    poolOverride ? Promise.resolve(poolOverride) : fetchPool({ crawlerApi, boardsAllowlist }),
  ]);

  const applied = new Set(history.map((e) => `${e.board}:${e.jobId}`));
  let pool = poolRaw.filter((j) => !applied.has(`${j.board}:${j.job_id}`));
  if (typeof filter === "function") pool = pool.filter(filter);

  // Shape pool entries (raw crawler/Greenhouse shape uses snake_case; the
  // scorer + schema want camelCase).
  const normalized = pool.map((j) => ({
    board: j.board,
    jobId: String(j.job_id),
    title: j.title || "",
    url: j.url || "",
    location: j.location || "",
    department: j.department || "",
    tags: j.tags || [],
  }));

  const { scored } = scoreByHistory(normalized, history);
  const topN = scored.slice(0, limit).map((c) =>
    makeCandidateJob({
      ...c,
      source: "content",
    })
  );

  const chosenKeys = new Set(topN.map((j) => `${j.board}:${j.jobId}`));
  let randomSeedCount = 0;
  if (includeRandomSeed) {
    // Prefer a seed from the pool that wasn't already picked. Fall back to
    // the full pool (minus interacted) if we exhausted everything.
    const seed = pickRandomSeed(poolRaw, chosenKeys) || null;
    if (seed) {
      topN.push(
        makeCandidateJob({
          board: seed.board,
          jobId: String(seed.job_id),
          title: seed.title || "",
          url: seed.url || "",
          location: seed.location || "",
          department: seed.department || "",
          tags: seed.tags || [],
          score: 0,
          source: "random",
          matchedTokens: [],
        })
      );
      randomSeedCount = 1;
    }
  }

  const snapshot = makeCandidateJobs({
    userId,
    runId: `run-${Date.now()}`,
    jobs: topN,
    meta: {
      poolSize: normalized.length,
      historyEntries: history.length,
      randomSeedCount,
    },
  });

  if (persist && crawlerApi) await persistSnapshot(crawlerApi, userId, snapshot);
  return snapshot;
}
