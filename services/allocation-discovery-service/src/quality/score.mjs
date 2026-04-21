/**
 * Per-job quality score.
 *
 * Formula (from the blog post):
 *   quality_score = w1*completeness + w2*trust + w3*freshness + w4*uniqueness - penalty
 *
 * v1 skips uniqueness (requires a similarity index) — leaves the weight wired
 * so we can plug it in later without changing callers.
 *
 * Components are all in [0, 1]:
 *
 *   completeness → how many of title/location/url/department/tags are present
 *   trust        → T1 (Official API) = 1.0; T2 HTML = 0.7; T3 aggregator = 0.5;
 *                  T4 long-tail = 0.4. Known-company bonus +0.2 (capped at 1.0).
 *   freshness    → exp(-ageDays / decayDays). default decayDays = 30.
 *   penalty      → ghost-job (listed > 90d, no edits) flag adds 0.3; dead +1.0.
 */

const WEIGHTS = { completeness: 0.30, trust: 0.30, freshness: 0.30, uniqueness: 0.10 };

export function completeness(job) {
  const fields = ["title", "location", "url", "department", "tags"];
  let filled = 0;
  for (const f of fields) {
    const v = job[f];
    if (Array.isArray(v) ? v.length > 0 : Boolean(v)) filled++;
  }
  return filled / fields.length;
}

export function trust(job, { knownCompanies = new Set() } = {}) {
  const tier = Number(job.tier) || 2;
  const base = tier === 1 ? 1.0 : tier === 2 ? 0.7 : tier === 3 ? 0.5 : 0.4;
  const bonus = knownCompanies.has(job.company) ? 0.2 : 0;
  return Math.min(1.0, base + bonus);
}

export function freshness(job, { now = Date.now(), decayDays = 30 } = {}) {
  const ref = job.posted_at || job.updated_at;
  if (!ref) return 0.5; // unknown — neutral
  const parsed = Date.parse(ref);
  if (!Number.isFinite(parsed)) return 0.5;
  const ageDays = Math.max(0, (now - parsed) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / decayDays);
}

export function penalty(job) {
  let p = 0;
  if (job.status === "dead") p += 1.0;
  if (isGhostJob(job)) p += 0.3;
  return p;
}

/**
 * Ghost-job heuristic: listed for more than `thresholdDays` (default 90) and
 * the content_hash has never changed since first_seen_at. The blog uses
 * "listed >90 days with zero apply signal" — we approximate with "zero
 * content edit" because apply signals live on a different key.
 */
export function isGhostJob(job, { thresholdDays = 90, now = Date.now() } = {}) {
  const firstSeen = Date.parse(job.first_seen_at || "");
  if (!Number.isFinite(firstSeen)) return false;
  const ageDays = (now - firstSeen) / (1000 * 60 * 60 * 24);
  if (ageDays < thresholdDays) return false;
  const updated = Date.parse(job.updated_at || "");
  // if updated_at is unset or equals first_seen_at, treat as stagnant
  return !Number.isFinite(updated) || Math.abs(updated - firstSeen) < 24 * 60 * 60 * 1000;
}

export function qualityScore(job, ctx = {}) {
  const c = completeness(job);
  const t = trust(job, ctx);
  const f = freshness(job, ctx);
  const u = Number(job.uniqueness ?? 1.0); // until we wire a similarity index
  const raw =
    WEIGHTS.completeness * c +
    WEIGHTS.trust * t +
    WEIGHTS.freshness * f +
    WEIGHTS.uniqueness * u;
  const pen = penalty(job);
  const score = Math.max(0, raw - pen);
  return {
    score,
    breakdown: {
      completeness: round(c),
      trust: round(t),
      freshness: round(f),
      uniqueness: round(u),
      penalty: round(pen),
    },
  };
}

function round(x) { return Math.round(x * 1000) / 1000; }
