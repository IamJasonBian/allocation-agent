/**
 * Config-driven job filter and scoring engine.
 *
 * Loads filter rules from JSON config files and provides:
 * - isTargetJob(title, filter) — include/exclude by title patterns
 * - isValidLocation(loc, filter) — check location against allowed patterns
 * - scorePriority(title, tags, filter) — score a job by priority rules
 * - filterAndRank(jobs, filter, opts) — full pipeline: filter + score + sort
 */

import { readFileSync } from "fs";

/**
 * Compile a [pattern, flags] pair from JSON into a RegExp.
 */
function compilePattern(entry) {
  if (entry instanceof RegExp) return entry;
  if (Array.isArray(entry)) return new RegExp(entry[0], entry[1] || "");
  return new RegExp(entry, "i");
}

/**
 * Load and compile a filter config from a JSON file.
 * Returns an object with compiled RegExp arrays.
 */
export function loadFilter(filterPath) {
  const raw = JSON.parse(readFileSync(filterPath, "utf8"));
  return {
    name: raw.name,
    description: raw.description,
    includePatterns: (raw.include_patterns || []).map(compilePattern),
    excludePatterns: (raw.exclude_patterns || []).map(compilePattern),
    validLocations: (raw.valid_locations || []).map(compilePattern),
    scoringRules: (raw.scoring_rules || []).map(r => ({
      regex: compilePattern(r.pattern),
      score: r.score,
      guard: !!r.guard,        // only applies if score is still 0
      exclusive: !!r.exclusive, // not used in current logic, reserved
    })),
    tagBonuses: raw.tag_bonuses || {},
    penalties: (raw.penalties || []).map(p => ({
      regex: compilePattern(p.pattern),
      score: p.score,
    })),
  };
}

/**
 * Check if a job title matches the filter's include patterns
 * and does NOT match exclude patterns.
 */
export function isTargetJob(title, filter) {
  if (filter.excludePatterns.some(p => p.test(title))) return false;
  return filter.includePatterns.some(p => p.test(title));
}

/**
 * Check if a location is valid (matches at least one location pattern).
 * Empty/null location is treated as valid.
 */
export function isValidLocation(loc, filter) {
  return !loc || filter.validLocations.some(p => p.test(loc));
}

/**
 * Score a job title's priority. Higher = more relevant.
 * Scoring rules are additive except when `guard: true` (only applies if score is still 0).
 */
export function scorePriority(title, tags, filter) {
  const t = title.toLowerCase();
  let score = 0;

  for (const rule of filter.scoringRules) {
    if (rule.guard && score > 0) continue;
    if (rule.regex.test(t)) score += rule.score;
  }

  // Tag bonuses
  if (tags) {
    for (const tag of tags) {
      if (filter.tagBonuses[tag]) score += filter.tagBonuses[tag];
    }
  }

  // Penalties
  for (const penalty of filter.penalties) {
    if (penalty.regex.test(t)) score += penalty.score;
  }

  return score;
}

/**
 * Filter and rank a list of jobs using the given filter config.
 *
 * @param {Array} jobs - Array of job objects with { title, location, board, tags, ... }
 * @param {object} filter - Compiled filter from loadFilter()
 * @param {object} opts - { boardFilter?: string, allowedBoards?: Set<string> }
 * @returns {Array} Filtered and sorted jobs with `score` field added
 */
export function filterAndRank(jobs, filter, opts = {}) {
  const { boardFilter, allowedBoards } = opts;

  return jobs
    .filter(j => {
      if (boardFilter && j.board !== boardFilter) return false;
      if (allowedBoards && !allowedBoards.has(j.board)) return false;
      if (!isTargetJob(j.title, filter)) return false;
      if (!isValidLocation(j.location, filter)) return false;
      return true;
    })
    .map(j => ({ ...j, score: scorePriority(j.title, j.tags, filter) }))
    .filter(j => j.score > 0)
    .sort((a, b) => b.score - a.score);
}
