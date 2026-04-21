import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { confirmPrerun, formatCandidateJobsTable } from "../lib/prerun-confirm.mjs";

function sinkStream() {
  const chunks = [];
  const stream = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); } });
  stream.text = () => chunks.join("");
  return stream;
}

function stdinFrom(text) {
  const s = Readable.from([text]);
  return s;
}

const mkCandidateJobs = (overrides = {}) => ({
  userId: "u",
  runId: "run-1",
  generatedAt: "2026-01-01T00:00:00Z",
  strategy: "history-tokens+random-seed",
  jobs: [
    { board: "williamblair", jobId: "1", title: "IB Analyst", url: "", location: "NY", department: "", tags: [], score: 9, scoreBreakdown: undefined, source: "content", matchedTokens: ["investment", "banking"] },
    { board: "liontree", jobId: "2", title: "Wildcard", url: "", location: "NY", department: "", tags: [], score: 0, source: "random", matchedTokens: [] },
  ],
  meta: { poolSize: 42, historyEntries: 3, randomSeedCount: 1 },
  ...overrides,
});

describe("prerun-confirm", () => {
  it("table rendering includes both jobs, marks random row", () => {
    const text = formatCandidateJobsTable(mkCandidateJobs());
    assert.match(text, /IB Analyst/);
    assert.match(text, /Wildcard/);
    assert.match(text, /★rand/);
  });

  it("y accepts", async () => {
    const out = sinkStream();
    const approved = await confirmPrerun(mkCandidateJobs(), {
      stream: out, input: stdinFrom("y\n"), argv: [],
    });
    assert.equal(approved, true);
  });

  it("blank line rejects (default N)", async () => {
    const out = sinkStream();
    const approved = await confirmPrerun(mkCandidateJobs(), {
      stream: out, input: stdinFrom("\n"), argv: [],
    });
    assert.equal(approved, false);
    assert.match(out.text(), /Aborted/);
  });

  it("--yes bypasses the prompt", async () => {
    const out = sinkStream();
    const approved = await confirmPrerun(mkCandidateJobs(), {
      stream: out, input: stdinFrom(""), argv: ["--yes"],
    });
    assert.equal(approved, true);
  });

  it("BATCH_AUTO_CONFIRM=1 bypasses", async () => {
    const prev = process.env.BATCH_AUTO_CONFIRM;
    process.env.BATCH_AUTO_CONFIRM = "1";
    try {
      const out = sinkStream();
      const approved = await confirmPrerun(mkCandidateJobs(), {
        stream: out, input: stdinFrom(""), argv: [],
      });
      assert.equal(approved, true);
    } finally {
      if (prev === undefined) delete process.env.BATCH_AUTO_CONFIRM;
      else process.env.BATCH_AUTO_CONFIRM = prev;
    }
  });

  it("empty job list short-circuits", async () => {
    const out = sinkStream();
    const approved = await confirmPrerun(mkCandidateJobs({ jobs: [] }), {
      stream: out, input: stdinFrom("y\n"), argv: [],
    });
    assert.equal(approved, false);
    assert.match(out.text(), /Nothing to do/);
  });
});
