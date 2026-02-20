import type { Context } from "@netlify/functions";
import { fetchGreenhouseJobs } from "../../src/lib/greenhouse.js";
import { findMatchingJobs } from "../../src/lib/job-matcher.js";
import { companies } from "../../src/config/companies.js";
import { candidate } from "../../src/config/candidate.js";

/**
 * GET /api/find-matching-jobs
 *
 * Scans all tracked Greenhouse boards and returns jobs matching
 * the candidate profile, ranked by relevance score.
 *
 * Query params:
 *   limit  - max results (default 10)
 *   min    - minimum score threshold (default 40)
 */
export default async (req: Request, _ctx: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const minScore = parseInt(url.searchParams.get("min") || "40", 10);

  console.log(`Scanning ${companies.length} companies for matching jobs...`);

  // Fetch all jobs in parallel with a small delay between batches
  const batchSize = 5;
  const allJobs: Array<{ boardToken: string; companyName: string; jobs: any[] }> = [];

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (c) => {
        const jobs = await fetchGreenhouseJobs(c.boardToken);
        return { boardToken: c.boardToken, companyName: c.displayName, jobs };
      })
    );
    allJobs.push(...results);

    // Politeness delay between batches
    if (i + batchSize < companies.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const totalJobs = allJobs.reduce((sum, c) => sum + c.jobs.length, 0);
  console.log(`Fetched ${totalJobs} total jobs from ${allJobs.length} companies`);

  const matches = findMatchingJobs(allJobs, candidate, limit, minScore);

  return new Response(
    JSON.stringify({
      candidate: `${candidate.firstName} ${candidate.lastName}`,
      companiesScanned: allJobs.length,
      totalJobsScanned: totalJobs,
      matchesFound: matches.length,
      matches: matches.map((m) => ({
        company: m.companyName,
        boardToken: m.boardToken,
        jobId: m.job.id,
        title: m.job.title,
        location: m.job.location.name,
        url: m.job.absolute_url,
        score: m.score,
        matchReasons: m.matchReasons,
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
