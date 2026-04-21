/**
 * Prerun confirmation gate.
 *
 * Renders a CandidateJobs payload to the terminal and prompts the user to
 * approve before any browser apply fires. Bypassed by --yes, CI=1, or
 * BATCH_AUTO_CONFIRM=1 (cron uses this).
 */

import readline from "node:readline";

function truncate(s, n) {
  const str = String(s ?? "");
  if (str.length <= n) return str.padEnd(n, " ");
  return str.slice(0, n - 1) + "…";
}

export function formatCandidateJobsTable(candidateJobs) {
  const lines = [];
  lines.push("");
  lines.push("CandidateJobs preview");
  lines.push(`  user:   ${candidateJobs.userId}`);
  lines.push(`  runId:  ${candidateJobs.runId}`);
  lines.push(
    `  pool:   ${candidateJobs.meta.poolSize} jobs  |  history: ${candidateJobs.meta.historyEntries} entries  |  random seed: ${candidateJobs.meta.randomSeedCount}`
  );
  lines.push("");
  lines.push(
    `  # | score | src  | board                  | title                                            | location              | matched`
  );
  lines.push(`  ${"".padEnd(130, "-")}`);
  candidateJobs.jobs.forEach((j, i) => {
    const marker = j.source === "random" ? "★rand" : "cont ";
    const matched = (j.matchedTokens || []).slice(0, 4).join(",");
    lines.push(
      `  ${String(i + 1).padStart(2)} | ${String(j.score.toFixed(1)).padStart(5)} | ${marker} | ${truncate(j.board, 22)} | ${truncate(j.title, 48)} | ${truncate(j.location, 21)} | ${truncate(matched, 20)}`
    );
  });
  lines.push("");
  return lines.join("\n");
}

function isBypassed(argv = process.argv) {
  if (argv.includes("--yes") || argv.includes("-y")) return "flag";
  if (process.env.BATCH_AUTO_CONFIRM === "1") return "env";
  if (process.env.CI === "1" || process.env.CI === "true") return "ci";
  return null;
}

async function ask(prompt, input, output) {
  const rl = readline.createInterface({ input, output });
  try {
    return await new Promise((resolve) => rl.question(prompt, (ans) => resolve(ans)));
  } finally {
    rl.close();
  }
}

/**
 * Returns true if the run is authorized to proceed.
 *
 * @param {import("../../services/allocation-crawler-service/src/schemas/candidate-jobs.mjs").CandidateJobs} candidateJobs
 * @param {object} [opts]
 * @param {NodeJS.WritableStream} [opts.stream=process.stdout]
 * @param {NodeJS.ReadableStream} [opts.input=process.stdin]
 * @param {string[]} [opts.argv=process.argv]
 */
export async function confirmPrerun(candidateJobs, opts = {}) {
  const stream = opts.stream || process.stdout;
  const input = opts.input || process.stdin;
  const argv = opts.argv || process.argv;

  const table = formatCandidateJobsTable(candidateJobs);
  stream.write(table);

  const bypass = isBypassed(argv);
  if (bypass) {
    process.stderr.write(`[prerun] auto-confirmed via ${bypass}; applying to ${candidateJobs.jobs.length} jobs\n`);
    return true;
  }

  if (!candidateJobs.jobs.length) {
    stream.write("No candidate jobs. Nothing to do.\n");
    return false;
  }

  const answer = await ask(`Apply to these ${candidateJobs.jobs.length} jobs? [y/N] `, input, stream);
  const normalized = String(answer || "").trim().toLowerCase();
  const approved = normalized === "y" || normalized === "yes";
  if (!approved) stream.write("Aborted by user.\n");
  return approved;
}
