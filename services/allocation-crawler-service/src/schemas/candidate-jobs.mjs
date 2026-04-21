/**
 * CandidateJob / CandidateJobs schema.
 *
 * A CandidateJobs payload is the per-user, per-run queue of jobs that the
 * batch-apply pipeline should attempt. Every apply entrypoint pulls through
 * this object — inline title/location filtering in the apply scripts is gone.
 *
 * Shape:
 *   CandidateJob  = one row in the queue (board, id, title, score, source)
 *   CandidateJobs = full run snapshot (userId, strategy, jobs[], generatedAt)
 *
 * `source` on a CandidateJob is either:
 *   - "content" — scored against UserHistory (applied, callbacks, etc.)
 *   - "random"  — exploration seed, one per run
 */

export const CANDIDATE_SOURCES = Object.freeze(["content", "random"]);

/**
 * @typedef {Object} CandidateJob
 * @property {string} board          Greenhouse board token (e.g. "williamblair")
 * @property {string} jobId          Board-scoped job id
 * @property {string} title
 * @property {string} url
 * @property {string} location
 * @property {string} [department]
 * @property {string[]} tags
 * @property {number} score          Content-similarity score; 0 for random seeds
 * @property {Object} [scoreBreakdown]
 * @property {"content"|"random"} source
 * @property {string[]} [matchedTokens]  Tokens that matched user history signal
 */

/**
 * @typedef {Object} CandidateJobs
 * @property {string} userId
 * @property {string} runId
 * @property {string} generatedAt            ISO timestamp
 * @property {string} strategy               "history-tokens+random-seed" for now
 * @property {CandidateJob[]} jobs
 * @property {Object} meta
 * @property {number} meta.poolSize          Size of candidate pool before ranking
 * @property {number} meta.historyEntries    How many UserHistory entries fed the scorer
 * @property {number} meta.randomSeedCount   Always 0 or 1 for the current strategy
 */

export function makeCandidateJob(input) {
  if (!input || typeof input !== "object") throw new TypeError("makeCandidateJob: input required");
  const { board, jobId, title, url, location, department, tags, score, scoreBreakdown, source, matchedTokens } = input;
  if (!board) throw new TypeError("makeCandidateJob: board required");
  if (!jobId) throw new TypeError("makeCandidateJob: jobId required");
  if (!title) throw new TypeError("makeCandidateJob: title required");
  if (!CANDIDATE_SOURCES.includes(source)) {
    throw new TypeError(`makeCandidateJob: source must be one of ${CANDIDATE_SOURCES.join("|")} (got ${source})`);
  }
  return {
    board: String(board),
    jobId: String(jobId),
    title: String(title),
    url: url ? String(url) : "",
    location: location ? String(location) : "",
    department: department ? String(department) : "",
    tags: Array.isArray(tags) ? tags.map(String) : [],
    score: Number.isFinite(score) ? Number(score) : 0,
    scoreBreakdown: scoreBreakdown && typeof scoreBreakdown === "object" ? { ...scoreBreakdown } : undefined,
    source,
    matchedTokens: Array.isArray(matchedTokens) ? matchedTokens.map(String) : [],
  };
}

export function makeCandidateJobs({ userId, runId, jobs, meta, strategy, generatedAt }) {
  if (!userId) throw new TypeError("makeCandidateJobs: userId required");
  if (!Array.isArray(jobs)) throw new TypeError("makeCandidateJobs: jobs array required");
  return {
    userId: String(userId),
    runId: runId ? String(runId) : `run-${Date.now()}`,
    generatedAt: generatedAt || new Date().toISOString(),
    strategy: strategy || "history-tokens+random-seed",
    jobs: jobs.map((j) => (j && j.source ? j : makeCandidateJob(j))),
    meta: {
      poolSize: Number(meta?.poolSize) || 0,
      historyEntries: Number(meta?.historyEntries) || 0,
      randomSeedCount: Number(meta?.randomSeedCount) || 0,
    },
  };
}

/**
 * Structural validation. Returns { ok, errors }. Does not throw.
 */
export function validateCandidateJobs(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  if (!obj.userId) errors.push("missing userId");
  if (!Array.isArray(obj.jobs)) errors.push("jobs must be an array");
  if (Array.isArray(obj.jobs)) {
    obj.jobs.forEach((j, i) => {
      if (!j.board) errors.push(`jobs[${i}]: missing board`);
      if (!j.jobId) errors.push(`jobs[${i}]: missing jobId`);
      if (!CANDIDATE_SOURCES.includes(j.source)) errors.push(`jobs[${i}]: invalid source ${j.source}`);
    });
  }
  return { ok: errors.length === 0, errors };
}
