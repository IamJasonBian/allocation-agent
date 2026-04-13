/**
 * Result tracking for batch job applications.
 *
 * Records runs to the crawler API and saves results/screenshots locally.
 */

import { writeFileSync } from "fs";

const DEFAULT_API = "https://allocation-crawler-service.netlify.app/api/crawler";

/**
 * Record a job application run in the crawler API.
 *
 * @param {object} opts
 * @param {string} opts.jobId - Job ID
 * @param {string} opts.board - Board token
 * @param {string} opts.userId - Candidate email/ID
 * @param {string|null} opts.error - Error message, or null for success
 * @param {string} [opts.apiUrl] - Crawler API base URL
 * @param {string} [opts.scriptName] - Name of the script that submitted
 */
export async function recordRun({ jobId, board, userId, error, apiUrl, scriptName }) {
  const api = apiUrl || DEFAULT_API;
  try {
    await fetch(`${api}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "run",
        run_id: `${userId.split("@")[0]}-${board}-${jobId}-${Date.now()}`,
        job_id: jobId,
        board,
        user_id: userId,
        artifacts: { notes: error || `Submitted via ${scriptName || "batch-apply"}` },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {}
}

/**
 * Save batch results to a JSON file.
 *
 * @param {Array} results - Array of job result objects
 * @param {string} outputPath - Absolute path to write results JSON
 */
export function saveResults(results, outputPath) {
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

/**
 * Take a screenshot of the current page state.
 *
 * @param {object} page - Puppeteer page object
 * @param {string} outputPath - Absolute path for the screenshot PNG
 */
export async function saveScreenshot(page, outputPath) {
  try {
    await page.screenshot({ path: outputPath, fullPage: true });
  } catch {}
}
