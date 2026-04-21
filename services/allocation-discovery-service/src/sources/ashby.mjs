/**
 * Ashby T1 source.
 *   https://api.ashbyhq.com/posting-api/job-board/{boardToken}
 *
 * Public endpoint returns { jobs: [{ id, title, location, department,
 * employmentType, jobUrl, publishedDate, updatedAt, descriptionHtml }] }.
 */

import { contentHash, extractTags } from "./normalize.mjs";

export const ATS = "ashby";
export const HOST = "api.ashbyhq.com";

export async function fetchBoard(boardToken, { companyName, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const url = `https://${HOST}/posting-api/job-board/${boardToken}?includeCompensation=true`;
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
  const location = j.location || j.locationName || "";
  const department = j.department || j.team || "";
  return {
    job_id: String(j.id || j.jobId || ""),
    company: boardToken,
    company_name: companyName || boardToken,
    ats: ATS,
    title,
    location,
    department,
    url: j.jobUrl || j.applyUrl || "",
    posted_at: j.publishedDate || "",
    updated_at: j.updatedAt || j.publishedDate || "",
    host: HOST,
    content_hash: contentHash(title, location, department),
    tags: extractTags(title, department, j.descriptionPlain || ""),
    tier: 1,
  };
}
