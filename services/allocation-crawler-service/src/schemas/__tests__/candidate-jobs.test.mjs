import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANDIDATE_SOURCES,
  makeCandidateJob,
  makeCandidateJobs,
  validateCandidateJobs,
} from "../candidate-jobs.mjs";

describe("candidate-jobs schema", () => {
  it("builds a content job with defaults", () => {
    const j = makeCandidateJob({
      board: "williamblair",
      jobId: "123",
      title: "Investment Banking Analyst",
      source: "content",
    });
    assert.equal(j.score, 0);
    assert.deepEqual(j.tags, []);
    assert.equal(j.source, "content");
  });

  it("rejects an unknown source", () => {
    assert.throws(
      () => makeCandidateJob({ board: "b", jobId: "1", title: "t", source: "manual" }),
      /source must be one of/
    );
  });

  it("makeCandidateJobs normalizes plain objects into CandidateJob", () => {
    const pkg = makeCandidateJobs({
      userId: "u",
      jobs: [
        { board: "b1", jobId: "1", title: "Analyst", source: "content" },
        { board: "b2", jobId: "2", title: "Wildcard", source: "random" },
      ],
    });
    assert.equal(pkg.jobs.length, 2);
    assert.equal(pkg.jobs[1].source, "random");
    assert.ok(pkg.runId.startsWith("run-"));
    assert.equal(pkg.strategy, "history-tokens+random-seed");
  });

  it("validateCandidateJobs catches missing fields", () => {
    const { ok, errors } = validateCandidateJobs({ userId: "u", jobs: [{ jobId: "1", source: "content" }] });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /missing board/.test(e)));
  });

  it("CANDIDATE_SOURCES is frozen and exactly two entries", () => {
    assert.ok(Object.isFrozen(CANDIDATE_SOURCES));
    assert.deepEqual([...CANDIDATE_SOURCES].sort(), ["content", "random"]);
  });
});
