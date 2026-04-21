import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as greenhouse from "./greenhouse.mjs";
import * as lever from "./lever.mjs";
import * as ashby from "./ashby.mjs";
import * as workable from "./workable.mjs";
import { sourceFor } from "./index.mjs";

function mockFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  });
}

describe("sourceFor", () => {
  it("returns the right module for each ats", () => {
    assert.equal(sourceFor("greenhouse").ATS, "greenhouse");
    assert.equal(sourceFor("lever").ATS, "lever");
    assert.equal(sourceFor("ashby").ATS, "ashby");
    assert.equal(sourceFor("workable").ATS, "workable");
  });
  it("throws on unknown ats", () => {
    assert.throws(() => sourceFor("monster"), /unknown ATS/);
  });
});

describe("greenhouse.fetchBoard", () => {
  it("normalizes a job payload", async () => {
    const fetchImpl = mockFetch({
      jobs: [{
        id: 100, title: "Analyst", absolute_url: "https://ex/100",
        location: { name: "NY" }, departments: [{ name: "Risk" }],
        updated_at: "2026-01-01T00:00:00Z",
      }],
    });
    const out = await greenhouse.fetchBoard("aqr", { fetchImpl, companyName: "AQR" });
    assert.equal(out.ok, true);
    assert.equal(out.jobs.length, 1);
    const j = out.jobs[0];
    assert.equal(j.ats, "greenhouse");
    assert.equal(j.company, "aqr");
    assert.equal(j.title, "Analyst");
    assert.equal(j.host, "boards-api.greenhouse.io");
    assert.ok(j.content_hash);
    assert.equal(j.tier, 1);
  });

  it("HTTP 404 propagates as not-ok", async () => {
    const fetchImpl = mockFetch({}, { ok: false, status: 404 });
    const out = await greenhouse.fetchBoard("missing", { fetchImpl });
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
  });
});

describe("lever.fetchBoard", () => {
  it("normalizes an array response", async () => {
    const fetchImpl = mockFetch([
      { id: "L1", text: "Data Scientist", categories: { location: "Remote", department: "Research" }, hostedUrl: "https://ex/L1" },
    ]);
    const out = await lever.fetchBoard("ramp", { fetchImpl, companyName: "Ramp" });
    assert.equal(out.ok, true);
    assert.equal(out.jobs[0].ats, "lever");
    assert.equal(out.jobs[0].title, "Data Scientist");
    assert.equal(out.jobs[0].host, "api.lever.co");
  });
});

describe("ashby.fetchBoard", () => {
  it("normalizes an ashby payload", async () => {
    const fetchImpl = mockFetch({
      jobs: [{ id: "abc", title: "ML Engineer", location: "SF", department: "AI", jobUrl: "https://ex/abc", publishedDate: "2026-01-01T00:00:00Z" }],
    });
    const out = await ashby.fetchBoard("openai", { fetchImpl, companyName: "OpenAI" });
    assert.equal(out.jobs[0].ats, "ashby");
    assert.equal(out.jobs[0].title, "ML Engineer");
  });
});

describe("workable.fetchBoard", () => {
  it("normalizes results with location object", async () => {
    const fetchImpl = mockFetch({
      results: [
        { shortcode: "WRK-1", title: "Backend Engineer", location: { city: "Lisbon", country: "Portugal" }, department: "Engineering", url: "https://apply.workable.com/gitlab/j/WRK-1/" },
      ],
    });
    const out = await workable.fetchBoard("gitlab", { fetchImpl, companyName: "GitLab" });
    assert.equal(out.jobs[0].ats, "workable");
    assert.equal(out.jobs[0].location, "Lisbon, Portugal");
  });
});
