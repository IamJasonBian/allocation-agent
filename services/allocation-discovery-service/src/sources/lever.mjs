/**
 * Lever T1 source.
 *   https://api.lever.co/v0/postings/{company}?mode=json
 *
 * Lever's public postings API returns an array of posting objects with
 * categories { location, commitment, team, department }.
 */

import { contentHash, extractTags } from "./normalize.mjs";

export const ATS = "lever";
export const HOST = "api.lever.co";

export async function fetchBoard(boardToken, { companyName, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const url = `https://${HOST}/v0/postings/${boardToken}?mode=json`;
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || "fetch failed", jobs: [] };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, jobs: [] };
  let data;
  try { data = await res.json(); } catch { return { ok: false, status: res.status, error: "invalid JSON", jobs: [] }; }
  const postings = Array.isArray(data) ? data : [];
  const jobs = postings.map((p) => normalize(p, { boardToken, companyName }));
  return { ok: true, status: res.status, jobs };
}

function normalize(p, { boardToken, companyName }) {
  const title = p.text || "";
  const location = p.categories?.location || "";
  const department = p.categories?.department || p.categories?.team || "";
  const updated = p.createdAt ? new Date(p.createdAt).toISOString() : "";
  return {
    job_id: String(p.id || p.lever_id || ""),
    company: boardToken,
    company_name: companyName || boardToken,
    ats: ATS,
    title,
    location,
    department,
    url: p.hostedUrl || p.applyUrl || "",
    posted_at: updated,
    updated_at: updated,
    host: HOST,
    content_hash: contentHash(title, location, department),
    tags: extractTags(title, department, p.descriptionPlain || ""),
    tier: 1,
  };
}
