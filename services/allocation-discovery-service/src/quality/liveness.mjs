/**
 * Dead-listing detection.
 *
 * Three signals, in order of authority:
 *   1. Job missing from the ATS response on a refetch (API dropout).
 *   2. Apply URL returns HTTP 404 / 410 on a HEAD request.
 *   3. Apply URL body contains a closure phrase ("position filled",
 *      "no longer accepting", "this job has been closed").
 *
 * v1 exposes two entry points:
 *   - markDroppedFromApi({ known, seen }) → returns Set of keys to mark dead
 *   - probeUrl(url) → { live, status, reason }
 */

const CLOSURE_PHRASES = [
  /position\s*filled/i,
  /no\s*longer\s*accepting/i,
  /this\s*job\s*has\s*been\s*closed/i,
  /we\s*are\s*no\s*longer\s*hiring/i,
  /application\s*is\s*closed/i,
];

/**
 * Given the set of composite keys we knew about before this crawl, and the
 * set we just saw, return the keys to mark dead (known minus seen).
 */
export function markDroppedFromApi({ known, seen }) {
  const dead = new Set();
  for (const k of known) if (!seen.has(k)) dead.add(k);
  return dead;
}

/**
 * HEAD the URL to check it still serves a 2xx. If the server rejects HEAD
 * (405 / 501), fall back to GET with a range request to read enough body to
 * match a closure phrase.
 *
 * Returns:
 *   { live: true }                    → 2xx, no closure text
 *   { live: false, reason, status }   → 404/410/closure phrase matched
 *   { live: null, reason, status }    → inconclusive (timeout, 5xx)
 */
export async function probeUrl(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!url) return { live: null, reason: "no url" };
  let res;
  try {
    res = await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  } catch (err) {
    return { live: null, reason: err?.message || "fetch failed" };
  }
  if (res.status === 404 || res.status === 410) {
    return { live: false, status: res.status, reason: `HTTP ${res.status}` };
  }
  if (res.status === 405 || res.status === 501 || (res.status >= 500 && res.status < 600)) {
    // server doesn't like HEAD (or is failing) — fall back to a small GET
    try {
      const body = await fetchImpl(url, {
        method: "GET",
        headers: { Range: "bytes=0-8191" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (body.status === 404 || body.status === 410) return { live: false, status: body.status, reason: `HTTP ${body.status}` };
      const text = (await body.text()).slice(0, 8192);
      for (const re of CLOSURE_PHRASES) {
        if (re.test(text)) return { live: false, status: body.status, reason: `closure phrase: ${re.source}` };
      }
      if (body.status >= 200 && body.status < 300) return { live: true, status: body.status };
      return { live: null, status: body.status, reason: `HTTP ${body.status}` };
    } catch (err) {
      return { live: null, reason: err?.message || "probe fallback failed" };
    }
  }
  if (res.status >= 200 && res.status < 300) return { live: true, status: res.status };
  return { live: null, status: res.status, reason: `HTTP ${res.status}` };
}
