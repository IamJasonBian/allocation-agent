import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completeness, trust, freshness, penalty, qualityScore, isGhostJob } from "./score.mjs";

const fullJob = () => ({
  title: "Senior Analyst",
  location: "New York, NY",
  url: "https://example.com/x",
  department: "Risk",
  tags: ["analyst", "finance"],
  tier: 1,
  company: "aqr",
  posted_at: new Date().toISOString(),
});

describe("completeness", () => {
  it("full job scores 1.0", () => { assert.equal(completeness(fullJob()), 1); });
  it("empty job scores 0.0", () => { assert.equal(completeness({}), 0); });
  it("partial job scores proportionally", () => {
    const j = { title: "Analyst", location: "NY", url: "", department: "", tags: [] };
    assert.equal(completeness(j), 2 / 5);
  });
});

describe("trust", () => {
  it("T1 defaults to 1.0", () => { assert.equal(trust({ tier: 1 }), 1.0); });
  it("T2 is 0.7", () => { assert.equal(trust({ tier: 2 }), 0.7); });
  it("known-company bonus caps at 1.0", () => {
    const known = new Set(["aqr"]);
    assert.equal(trust({ tier: 1, company: "aqr" }, { knownCompanies: known }), 1.0);
    assert.ok(Math.abs(trust({ tier: 2, company: "aqr" }, { knownCompanies: known }) - 0.9) < 1e-9);
  });
});

describe("freshness", () => {
  it("today scores near 1.0", () => {
    assert.ok(freshness(fullJob()) > 0.99);
  });
  it("30 days old scores ~e^-1", () => {
    const old = { posted_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() };
    const f = freshness(old);
    assert.ok(f > 0.35 && f < 0.4);
  });
  it("unknown date → 0.5 neutral", () => { assert.equal(freshness({}), 0.5); });
});

describe("ghost-job detection", () => {
  it("flags a 100-day-old job with no updates", () => {
    const firstSeen = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isGhostJob({ first_seen_at: firstSeen, updated_at: firstSeen }), true);
  });
  it("does not flag a 30-day-old job", () => {
    const firstSeen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isGhostJob({ first_seen_at: firstSeen, updated_at: firstSeen }), false);
  });
});

describe("penalty", () => {
  it("dead jobs take a full penalty", () => { assert.equal(penalty({ status: "dead" }), 1.0); });
  it("alive and fresh jobs take no penalty", () => { assert.equal(penalty(fullJob()), 0); });
});

describe("qualityScore", () => {
  it("high-quality job scores high", () => {
    const { score, breakdown } = qualityScore(fullJob());
    assert.ok(score > 0.9);
    assert.ok(breakdown.completeness === 1);
  });
  it("dead job scores 0", () => {
    const j = { ...fullJob(), status: "dead" };
    const { score } = qualityScore(j);
    assert.equal(score, 0);
  });
});
