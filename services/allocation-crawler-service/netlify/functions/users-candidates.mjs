/**
 * GET  /api/crawler/users/:userId/candidates   → most recent CandidateJobs
 * POST /api/crawler/users/:userId/candidates   body: CandidateJobs snapshot
 *
 * Redis layout:
 *   user_candidates:{userId}:latest       STRING  JSON CandidateJobs, 7d TTL
 *   user_candidates:{userId}:{runId}      STRING  JSON CandidateJobs, 7d TTL
 *
 * POST is used by the builder (scripts/lib/candidate-jobs-builder.mjs) to
 * persist a run so the prerun UI can replay the same list. No in-process
 * rebuild: the build lives in scripts/lib because it needs outbound fetches
 * to Greenhouse, which Netlify functions can do but we want to keep the
 * function surface thin.
 */

import { getRedis, jsonResponse, readUserId } from "./_shared/redis.mjs";
import { validateCandidateJobs, makeCandidateJobs } from "../../src/schemas/candidate-jobs.mjs";

const TTL_SECONDS = 7 * 24 * 60 * 60;
const latestKey = (userId) => `user_candidates:${userId}:latest`;
const runKey = (userId, runId) => `user_candidates:${userId}:${runId}`;

export default async (request) => {
  const userId = readUserId(request);
  if (!userId) return jsonResponse(400, { error: "missing userId" });

  const redis = getRedis();

  if (request.method === "GET") {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const key = runId ? runKey(userId, runId) : latestKey(userId);
    const raw = await redis.get(key);
    if (!raw) return jsonResponse(404, { error: "no candidates on file", userId, runId: runId || null });
    try {
      return jsonResponse(200, JSON.parse(raw));
    } catch {
      return jsonResponse(500, { error: "stored payload corrupt" });
    }
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "invalid JSON body" });
    }
    // Normalize via factory so downstream readers can trust the shape.
    let normalized;
    try {
      normalized = makeCandidateJobs({ ...body, userId });
    } catch (err) {
      return jsonResponse(400, { error: "normalization failed", detail: err?.message });
    }
    const { ok, errors } = validateCandidateJobs(normalized);
    if (!ok) return jsonResponse(400, { error: "validation failed", details: errors });
    const payload = JSON.stringify(normalized);
    await redis.set(runKey(userId, normalized.runId), payload, "EX", TTL_SECONDS);
    await redis.set(latestKey(userId), payload, "EX", TTL_SECONDS);
    return jsonResponse(201, { userId, runId: normalized.runId, jobs: normalized.jobs.length });
  }

  return jsonResponse(405, { error: "method not allowed" }, { Allow: "GET, POST" });
};

export const config = { path: "/.netlify/functions/users-candidates" };
