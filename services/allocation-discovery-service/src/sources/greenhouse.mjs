/**
 * Greenhouse T1 source.
 *   https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs
 */

import { contentHash, extractTags } from "./normalize.mjs";

export const ATS = "greenhouse";
export const HOST = "boards-api.greenhouse.io";

export async function fetchBoard(boardToken, { companyName, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const url = `https://${HOST}/v1/boards/${boardToken}/jobs?content=true`;
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || "fetch failed", jobs: [] };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, jobs: [] };
  let data;
  try { data = await res.json(); } catch { return { ok: false, status: res.status, error: "invalid JSON", jobs: [] }; }
  const apiJobs = data.jobs || [];
  const jobs = apiJobs.map((j) => normalize(j, { boardToken, companyName }));
  return { ok: true, status: res.status, jobs };
}

function normalize(j, { boardToken, companyName }) {
  const title = j.title || "";
  const location = j.location?.name || "";
  const department = j.departments?.[0]?.name || "";
  return {
    job_id: String(j.id),
    company: boardToken,
    company_name: companyName || boardToken,
    ats: ATS,
    title,
    location,
    department,
    url: j.absolute_url || "",
    posted_at: j.first_published || j.updated_at || "",
    updated_at: j.updated_at || "",
    host: HOST,
    content_hash: contentHash(title, location, department),
    tags: extractTags(title, department, j.content || ""),
    tier: 1,
  };
}
