/**
 * UserHistory persistence.
 *
 * Redis layout:
 *   user_history:{userId}    ZSET  score = epoch ms, member = JSON entry
 *
 * Append-only. Entries are never mutated in place; a status change is a new
 * entry. `readHistory` returns newest-last unless `order: "desc"` is passed.
 */

import { makeUserHistoryEntry, HISTORY_STATUSES } from "../schemas/user-history.mjs";

const historyKey = (userId) => `user_history:${userId}`;

/**
 * Append one entry. Returns the normalized entry that was written.
 */
export async function appendHistory(redis, userId, raw) {
  if (!redis) throw new Error("appendHistory: redis client required");
  if (!userId) throw new Error("appendHistory: userId required");
  const entry = makeUserHistoryEntry({ ...raw, userId });
  const score = Date.parse(entry.timestamp) || Date.now();
  await redis.zadd(historyKey(userId), score, JSON.stringify(entry));
  return entry;
}

/**
 * Read a user's history.
 *
 * @param {object} opts
 * @param {string[]} [opts.statuses] Filter to these statuses only
 * @param {number} [opts.since] epoch ms lower bound (inclusive)
 * @param {"asc"|"desc"} [opts.order="asc"]
 * @param {number} [opts.limit]
 */
export async function readHistory(redis, userId, opts = {}) {
  if (!redis) throw new Error("readHistory: redis client required");
  if (!userId) throw new Error("readHistory: userId required");
  const { statuses, since, order = "asc", limit } = opts;
  const min = typeof since === "number" ? since : "-inf";
  const raw =
    order === "desc"
      ? await redis.zrevrangebyscore(historyKey(userId), "+inf", min)
      : await redis.zrangebyscore(historyKey(userId), min, "+inf");

  let entries = [];
  for (const line of raw) {
    try {
      const parsed = JSON.parse(line);
      entries.push(parsed);
    } catch {
      // corrupt member — skip; don't let one bad row break the read.
    }
  }
  if (Array.isArray(statuses) && statuses.length) {
    const allow = new Set(statuses.filter((s) => HISTORY_STATUSES.includes(s)));
    entries = entries.filter((e) => allow.has(e.status));
  }
  if (typeof limit === "number" && limit > 0) entries = entries.slice(0, limit);
  return entries;
}

/**
 * Has this user interacted with this job before? Used by the builder to
 * dedupe the candidate pool.
 */
export async function hasInteracted(redis, userId, board, jobId) {
  const entries = await readHistory(redis, userId);
  return entries.some((e) => e.board === board && e.jobId === jobId);
}

export { historyKey };
