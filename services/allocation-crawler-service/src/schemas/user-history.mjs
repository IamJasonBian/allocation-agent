/**
 * UserHistory schema.
 *
 * One UserHistoryEntry per interaction between a user and a job: the user
 * applied, got a callback, had an interview, got an offer, got rejected, or
 * withdrew. Entries are append-only so the builder can weigh later signals
 * (callback, interview, offer) higher than earlier ones (applied).
 *
 * `source` tracks where the entry came from:
 *   - "manual"                — user or script recorded it directly
 *   - "email_reconciliation"  — future: inferred from inbox parsing
 */

export const HISTORY_STATUSES = Object.freeze([
  "applied",
  "callback",
  "interview",
  "offer",
  "rejection",
  "withdrawn",
]);

export const HISTORY_SOURCES = Object.freeze(["manual", "email_reconciliation"]);

/**
 * @typedef {Object} UserHistoryEntry
 * @property {string} userId
 * @property {string} board
 * @property {string} jobId
 * @property {"applied"|"callback"|"interview"|"offer"|"rejection"|"withdrawn"} status
 * @property {"manual"|"email_reconciliation"} source
 * @property {string} timestamp      ISO timestamp
 * @property {string} [title]        Snapshotted at the time of the event
 * @property {string[]} [tags]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} UserHistory
 * @property {string} userId
 * @property {UserHistoryEntry[]} entries   Newest-last
 */

export function makeUserHistoryEntry(input) {
  if (!input || typeof input !== "object") throw new TypeError("makeUserHistoryEntry: input required");
  const { userId, board, jobId, status, source = "manual", timestamp, title, tags, notes } = input;
  if (!userId) throw new TypeError("makeUserHistoryEntry: userId required");
  if (!board) throw new TypeError("makeUserHistoryEntry: board required");
  if (!jobId) throw new TypeError("makeUserHistoryEntry: jobId required");
  if (!HISTORY_STATUSES.includes(status)) {
    throw new TypeError(`makeUserHistoryEntry: status must be one of ${HISTORY_STATUSES.join("|")} (got ${status})`);
  }
  if (!HISTORY_SOURCES.includes(source)) {
    throw new TypeError(`makeUserHistoryEntry: source must be one of ${HISTORY_SOURCES.join("|")} (got ${source})`);
  }
  return {
    userId: String(userId),
    board: String(board),
    jobId: String(jobId),
    status,
    source,
    timestamp: timestamp || new Date().toISOString(),
    title: title ? String(title) : "",
    tags: Array.isArray(tags) ? tags.map(String) : [],
    notes: notes ? String(notes) : "",
  };
}

export function validateUserHistoryEntry(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  if (!obj.userId) errors.push("missing userId");
  if (!obj.board) errors.push("missing board");
  if (!obj.jobId) errors.push("missing jobId");
  if (!HISTORY_STATUSES.includes(obj.status)) errors.push(`invalid status ${obj.status}`);
  if (obj.source && !HISTORY_SOURCES.includes(obj.source)) errors.push(`invalid source ${obj.source}`);
  return { ok: errors.length === 0, errors };
}

/**
 * Status weights for the content-similarity scorer. Callbacks and offers are
 * the strongest positive signals; rejections subtract.
 */
export const STATUS_WEIGHTS = Object.freeze({
  applied: 1.0,
  callback: 3.0,
  interview: 2.5,
  offer: 3.0,
  rejection: -1.5,
  withdrawn: 0.0,
});
