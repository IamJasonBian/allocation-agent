import type { Context } from "@netlify/functions";
import { submitApplication } from "../../src/lib/greenhouse-apply.js";
import { submitApplicationViaBrowser } from "../../src/lib/greenhouse-browser-apply.js";
import { candidate } from "../../src/config/candidate.js";
import { companies } from "../../src/config/companies.js";

/**
 * POST /api/auto-apply
 *
 * Submit an application to a Greenhouse job.
 *
 * Body (JSON):
 *   boardToken - Greenhouse board token (e.g. "point72")
 *   jobId      - Greenhouse job ID (e.g. 7829230002)
 *   useBrowser - Use headless browser to handle reCAPTCHA (default: true)
 *
 * Or batch mode:
 *   jobs - Array of { boardToken, jobId }
 */
export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authenticate with webhook secret
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  const authHeader = req.headers.get("x-webhook-secret");
  if (secret && authHeader !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve company names
  const companyMap = new Map(companies.map((c) => [c.boardToken, c.displayName]));

  // Single or batch mode
  const targets: Array<{ boardToken: string; jobId: number }> = body.jobs
    ? body.jobs
    : [{ boardToken: body.boardToken, jobId: body.jobId }];

  if (!targets.length || !targets[0].boardToken || !targets[0].jobId) {
    return new Response(
      JSON.stringify({ error: "Provide boardToken and jobId, or jobs array" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Submitting ${targets.length} application(s) for ${candidate.firstName} ${candidate.lastName}`);

  const results = [];
  for (const { boardToken, jobId } of targets) {
    const companyName = companyMap.get(boardToken) || boardToken;
    console.log(`  Applying to ${companyName} job ${jobId}...`);

    const useBrowser = body.useBrowser !== false; // default true
    const applyFn = useBrowser ? submitApplicationViaBrowser : submitApplication;
    const result = await applyFn(boardToken, jobId, candidate, companyName);
    results.push(result);

    console.log(`  → ${result.success ? "SUCCESS" : "FAILED"}: ${result.message}`);

    // Politeness delay between applications
    if (targets.length > 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return new Response(
    JSON.stringify({
      candidate: `${candidate.firstName} ${candidate.lastName}`,
      submitted: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
      results,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
