/**
 * Candidate-pool fetchers.
 *
 * Extracted from batch-browser-apply-aastha.mjs so every entrypoint that
 * builds a CandidateJobs list uses the same sources. The builder in
 * candidate-jobs-builder.mjs pulls via these helpers.
 */

const DEFAULT_TAGS = ["analyst", "quant", "ml", "finance", "data", "junior"];

export const DEFAULT_BOARDS_ALLOWLIST = new Set([
  "coinbase", "deshaw", "aqr", "aquaticcapitalmanagement", "gravitonresearchcapital",
  "togetherai", "databricks", "brex", "lithic", "figma", "dbtlabsinc",
  "planetscale", "deepmind", "runwayml", "asana", "affirm", "marqeta",
  "melio", "alloy", "datadog", "grafanalabs", "cockroachlabs", "anthropic",
  "perplexity", "anyscale", "plaid", "mercury", "vercel", "temporaltechnologies",
  "supabase", "scaleai", "janestreet", "towerresearchcapital",
  "lincolninternational", "williamblair", "generalatlantic", "stepstone", "liontree",
]);

export const DEFAULT_BOARD_SCRAPES = [
  "lincolninternational", "williamblair", "generalatlantic", "stepstone", "liontree",
];

async function fetchJobsByTag(crawlerApi, tag, timeoutMs = 30000) {
  try {
    const res = await fetch(`${crawlerApi}/jobs?status=discovered&tag=${encodeURIComponent(tag)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || data || [];
  } catch {
    return [];
  }
}

async function fetchGreenhouseBoard(token, timeoutMs = 15000) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      job_id: String(j.id),
      board: token,
      title: j.title,
      url: j.absolute_url,
      location: j.location?.name || "",
      department: j.departments?.[0]?.name || "",
      tags: [],
      status: "discovered",
    }));
  } catch {
    return [];
  }
}

/**
 * Build the union candidate pool: crawler-indexed jobs by tag + direct
 * Greenhouse board scrapes. Deduped by job_id.
 */
export async function fetchPool({ crawlerApi, tags = DEFAULT_TAGS, boards = DEFAULT_BOARD_SCRAPES, boardsAllowlist = DEFAULT_BOARDS_ALLOWLIST }) {
  const jobMap = new Map();

  for (const tag of tags) {
    const jobs = await fetchJobsByTag(crawlerApi, tag);
    for (const j of jobs) if (!jobMap.has(j.job_id)) jobMap.set(j.job_id, j);
  }

  for (const token of boards) {
    const jobs = await fetchGreenhouseBoard(token);
    for (const j of jobs) if (!jobMap.has(j.job_id)) jobMap.set(j.job_id, j);
  }

  const all = Array.from(jobMap.values());
  return all.filter((j) => boardsAllowlist.has(j.board));
}

// Re-exported for reuse and testing.
export { fetchJobsByTag, fetchGreenhouseBoard };
