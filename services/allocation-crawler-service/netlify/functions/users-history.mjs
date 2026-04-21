/**
 * GET  /api/crawler/users/:userId/history   → { userId, entries: [...] }
 * POST /api/crawler/users/:userId/history   body: partial UserHistoryEntry
 *
 * Routed via redirects in netlify.toml — the :userId segment is propagated as
 * the `?id=` query param.
 */

import { getRedis, jsonResponse, readUserId } from "./_shared/redis.mjs";
import { appendHistory, readHistory } from "../../src/lib/user-history-store.mjs";
import { validateUserHistoryEntry } from "../../src/schemas/user-history.mjs";

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
    try {
      const entry = await appendHistory(redis, userId, candidate);
      return jsonResponse(201, { userId, entry });
    } catch (err) {
      return jsonResponse(500, { error: "append failed", detail: err?.message });
    }
  }

  return jsonResponse(405, { error: "method not allowed" }, { Allow: "GET, POST" });
};

export const config = { path: "/.netlify/functions/users-history" };
