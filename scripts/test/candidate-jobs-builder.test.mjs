import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCandidateJobs } from "../lib/candidate-jobs-builder.mjs";

const rawJob = (overrides) => ({
  job_id: "1",
  board: "williamblair",
  title: "Analyst",
  url: "https://example.com",
  location: "New York",
  department: "",
  tags: [],
  status: "discovered",
  ...overrides,
});

const hist = (overrides) => ({
  userId: "u@ex.com",
  board: "williamblair",
  jobId: "99",
  status: "callback",
  source: "manual",
  timestamp: new Date().toISOString(),
  title: "",
  tags: [],
  notes: "",
  ...overrides,
});

describe("buildCandidateJobs", () => {
  it("empty history: still returns jobs with random seed", async () => {
    const pool = [rawJob({ job_id: "1", title: "Investment Banking Analyst" }), rawJob({ job_id: "2", title: "Data Scientist" })];
    const out = await buildCandidateJobs({
      userId: "u@ex.com",
      crawlerApi: "http://fake",
      limit: 1,
      persist: false,
      poolOverride: pool,
      historyOverride: [],
    });
    assert.equal(out.jobs.length, 2, "1 content + 1 random seed");
    assert.equal(out.jobs[1].source, "random");
    assert.equal(out.meta.randomSeedCount, 1);
  });

  it("history with callback on IB analyst ranks IB first", async () => {
    const pool = [
      rawJob({ job_id: "1", title: "Data Scientist" }),
      rawJob({ job_id: "2", title: "Investment Banking Analyst", board: "liontree" }),
    ];
    const out = await buildCandidateJobs({
      userId: "u",
      crawlerApi: "http://fake",
      limit: 2,
      includeRandomSeed: false,
      persist: false,
      poolOverride: pool,
      historyOverride: [hist({ title: "Investment Banking Analyst", status: "callback", jobId: "88" })],
    });
    assert.equal(out.jobs[0].title, "Investment Banking Analyst");
    assert.equal(out.meta.randomSeedCount, 0);
  });

  it("already-applied jobs are not returned", async () => {
    const pool = [
      rawJob({ board: "williamblair", job_id: "123", title: "Analyst" }),
      rawJob({ board: "liontree", job_id: "456", title: "Capital Advisory" }),
    ];
    const out = await buildCandidateJobs({
      userId: "u",
      crawlerApi: "http://fake",
      limit: 10,
      includeRandomSeed: false,
      persist: false,
      poolOverride: pool,
      historyOverride: [hist({ board: "williamblair", jobId: "123", status: "applied" })],
    });
    assert.ok(out.jobs.every((j) => !(j.board === "williamblair" && j.jobId === "123")));
    assert.equal(out.meta.historyEntries, 1);
  });

  it("honors an external filter callback", async () => {
    const pool = [
      rawJob({ board: "williamblair", job_id: "1", title: "Analyst" }),
      rawJob({ board: "liontree", job_id: "2", title: "Analyst" }),
    ];
    const out = await buildCandidateJobs({
      userId: "u",
      crawlerApi: "http://fake",
      limit: 5,
      includeRandomSeed: false,
      persist: false,
      poolOverride: pool,
      historyOverride: [],
      filter: (j) => j.board === "liontree",
    });
    assert.ok(out.jobs.every((j) => j.board === "liontree"));
  });

  it("random seed is distinct from content picks when possible", async () => {
    const pool = [
      rawJob({ job_id: "a", title: "Analyst" }),
      rawJob({ job_id: "b", title: "Banker" }),
      rawJob({ job_id: "c", title: "Wildcard Role" }),
    ];
    const out = await buildCandidateJobs({
      userId: "u",
      crawlerApi: "http://fake",
      limit: 1,
      persist: false,
      poolOverride: pool,
      historyOverride: [hist({ title: "Analyst", status: "applied" })],
    });
    const content = out.jobs.filter((j) => j.source === "content");
    const random = out.jobs.filter((j) => j.source === "random");
    assert.equal(content.length, 1);
    assert.equal(random.length, 1);
    assert.notEqual(content[0].jobId, random[0].jobId);
  });
});
