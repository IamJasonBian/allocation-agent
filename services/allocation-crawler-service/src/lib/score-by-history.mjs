/**
 * Content-similarity scorer — the "brain" behind CandidateJobs ranking.
 *
 * Strategy (v1, deliberately simple — swap for TF-IDF or embeddings later
 * behind the same `scoreByHistory()` signature):
 *
 *   1. Tokenize each UserHistoryEntry's title + tags.
 *   2. Accumulate a weight per token across all entries, where per-status
 *      weights come from STATUS_WEIGHTS (callback/offer ≫ applied ≫ 0 ≫
 *      rejection).
 *   3. Score a candidate as sum(weight[token]) for tokens overlapping with
 *      the candidate's title + tags, plus a small tag-overlap bonus.
 *   4. Return the score plus the list of matched tokens for UX transparency.
 */

import { STATUS_WEIGHTS } from "../schemas/user-history.mjs";

const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "for", "to", "in", "on", "at", "by", "with",
  "or", "vs", "is", "be", "it", "as", "new", "usa", "us", "united", "states",
  "ny", "sf", "york", "francisco", "remote", "hybrid", "senior", "junior",
  "i", "ii", "iii", "iv",
]);

export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9&+]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function buildSignal(historyEntries) {
  const weights = new Map(); // token -> cumulative weight
  let contributing = 0;
  for (const entry of historyEntries) {
    const w = STATUS_WEIGHTS[entry.status];
    if (!Number.isFinite(w) || w === 0) continue;
    contributing++;
    const tokens = new Set([
      ...tokenize(entry.title),
      ...((entry.tags || []).flatMap(tokenize)),
    ]);
    for (const t of tokens) {
      weights.set(t, (weights.get(t) || 0) + w);
    }
  }
  return { weights, contributing };
}

export function scoreCandidate(candidate, signal) {
  const tokens = new Set([
    ...tokenize(candidate.title),
    ...((candidate.tags || []).flatMap(tokenize)),
  ]);
  let score = 0;
  const matched = [];
  for (const t of tokens) {
    const w = signal.weights.get(t);
    if (!w) continue;
    score += w;
    matched.push(t);
  }
  const tagBonus = (candidate.tags || []).reduce((acc, tag) => {
    return acc + (signal.weights.get(String(tag).toLowerCase()) ? 0.5 : 0);
  }, 0);
  return { score: score + tagBonus, matchedTokens: matched };
}

/**
 * Score every candidate against a history. Returns an array of
 * `{ ...candidate, score, matchedTokens }` sorted descending by score.
 *
 * Does NOT mutate the input array and does NOT drop zero-scored entries —
 * that's the builder's job (it may still want to random-sample from them).
 */
export function scoreByHistory(candidates, historyEntries) {
  const signal = buildSignal(historyEntries);
  const scored = candidates.map((c) => {
    const { score, matchedTokens } = scoreCandidate(c, signal);
    return { ...c, score, matchedTokens };
  });
  scored.sort((a, b) => b.score - a.score);
  return { scored, signal };
}
