/**
 * Workable T1 source.
 *   https://apply.workable.com/api/v3/accounts/{boardToken}/jobs
 *
 * The public apply.workable.com endpoint is used by Workable's own
 * career-page SPA. Returns { results: [{ shortcode, title, location,
 * department, url }] }.
 */

import { contentHash, extractTags } from "./normalize.mjs";

export const ATS = "workable";
export const HOST = "apply.workable.com";

export async function fetchBoard(boardToken, { companyName, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const url = `https://${HOST}/api/v3/accounts/${boardToken}/jobs`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST", // Workable's public API wants POST with an empty filter body
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: "", location: [], department: [], workplace: [], remote: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || "fetch failed", jobs: [] };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, jobs: [] };
  let data;
  try { data = await res.json(); } catch { return { ok: false, status: res.status, error: "invalid JSON", jobs: [] }; }
  const results = data.results || [];
  const jobs = results.map((r) => normalize(r, { boardToken, companyName }));
  return { ok: true, status: res.status, jobs };
}

function normalize(r, { boardToken, companyName }) {
  const title = r.title || "";
  // Workable returns location as an object { city, country, region } or
  // sometimes a string. Normalize to "City, Region".
  const loc = r.location || {};
  const location = typeof loc === "string"
    ? loc
    : [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
  const department = r.department || "";
  return {
    job_id: String(r.shortcode || r.id || ""),
    company: boardToken,
    company_name: companyName || boardToken,
    ats: ATS,
    title,
    location,
    department,
    url: r.url || `https://${HOST}/${boardToken}/j/${r.shortcode}/`,
    posted_at: r.published_on || r.created_at || "",
    updated_at: r.updated_at || r.published_on || "",
    host: HOST,
    content_hash: contentHash(title, location, department),
    tags: extractTags(title, department, r.description || ""),
    tier: 1,
  };
}
