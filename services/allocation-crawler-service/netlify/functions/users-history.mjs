/**
 * GET  /api/crawler/users/:userId/history   → { userId, entries: [...] }
 * POST /api/crawler/users/:userId/history   body: partial UserHistoryEntry
 *
 * Routed via redirects in netlify.toml — the :userId segment is propagated as
 * the `?id=` query param.
 *
 * POST safety:
 *   X-Dry-Run: 1 — validate body, 200 { dry_run, would_create, diff }; no write
 *   Idempotency-Key — same normalized entry replays stored 2xx for 24h; mismatch → 409
 */

import { getRedis, jsonResponse, readUserId } from "./_shared/redis.mjs";
import {
  executePostWithIdempotency,
  getIdempotencyKey,
  isDryRun,
} from "./_shared/safety.mjs";
import { appendHistory, readHistory } from "../../src/lib/user-history-store.mjs";
import { makeUserHistoryEntry, validateUserHistoryEntry } from "../../src/schemas/user-history.mjs";

export default async (request) => {
  const userId = readUserId(request);
  if (!userId) return jsonResponse(400, { error: "missing userId" });

  const redis = getRedis();

  if (request.method === "GET") {
    const url = new URL(request.url);
    const statuses = url.searchParams.getAll("status");
    const limit = parseInt(url.searchParams.get("limit") || "", 10) || undefined;
    const since = parseInt(url.searchParams.get("since") || "", 10) || undefined;
    const entries = await readHistory(redis, userId, {
      statuses: statuses.length ? statuses : undefined,
      limit,
      since,
      order: "asc",
    });
    return jsonResponse(200, { userId, entries });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "invalid JSON body" });
    }
    const candidate = { ...body, userId };
    const { ok, errors } = validateUserHistoryEntry(candidate);
    if (!ok) return jsonResponse(400, { error: "validation failed", details: errors });

    let normalizedEntry;
    try {
      normalizedEntry = makeUserHistoryEntry(candidate);
    } catch (err) {
      return jsonResponse(400, { error: "normalization failed", detail: err?.message });
    }

    if (isDryRun(request)) {
      const tail = await readHistory(redis, userId, { order: "desc", limit: 1 });
      const previousLatest = tail[0] ?? null;
      return jsonResponse(200, {
        dry_run: true,
        would_create: true,
        diff: {
          entry: {
            board: normalizedEntry.board,
            jobId: normalizedEntry.jobId,
            status: normalizedEntry.status,
            timestamp: normalizedEntry.timestamp,
          },
          previous_latest_entry: previousLatest
            ? {
                board: previousLatest.board,
                jobId: previousLatest.jobId,
                status: previousLatest.status,
                timestamp: previousLatest.timestamp,
              }
            : null,
        },
      });
    }

    const idem = getIdempotencyKey(request);
    return executePostWithIdempotency({
      redis,
      scope: "history",
      userId,
      idempotencyKey: idem,
      normalizedBody: normalizedEntry,
      executeWrite: async () => {
        try {
          const entry = await appendHistory(redis, userId, candidate);
          return { status: 201, body: { userId, entry } };
        } catch (err) {
          return { status: 500, body: { error: "append failed", detail: err?.message } };
        }
      },
    });
  }

  return jsonResponse(405, { error: "method not allowed" }, { Allow: "GET, POST" });
};

export const config = { path: "/.netlify/functions/users-history" };
