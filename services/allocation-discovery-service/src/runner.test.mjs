import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { MockRedis } from "./redis/mock-redis.mjs";
import { LocalQueue } from "./queue/local-queue.mjs";
import { seedQueue, runTick, runUntilEmpty } from "./runner.mjs";

function tmpState() {
  const dir = mkdtempSync(resolve(tmpdir(), "runner-"));
  return { path: resolve(dir, "state.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function stubFetch(responses) {
  // responses: [{ url-match → { ok, status, jobs }] or plain body by URL substring
  return async (url) => {
    const hit = responses.find((r) => url.includes(r.match));
    const body = hit?.body ?? { jobs: [] };
    return {
      ok: hit?.ok ?? true,
      status: hit?.status ?? 200,
      async json() { return body; },
      async text() { return JSON.stringify(body); },
    };
  };
}

const gh = (id, title = "Analyst") => ({
  id, title, absolute_url: `https://ex/${id}`,
  location: { name: "NY" }, departments: [{ name: "Risk" }],
  updated_at: new Date().toISOString(),
});

describe("runTick: new jobs are inserted and indexed", async () => {
  const { path, cleanup } = tmpState();
  try {
    const redis = new MockRedis({ path, autosave: false });
    const queue = new LocalQueue({ defaultHostDelayMs: 0 });
    seedQueue(queue, [{ ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 }]);
    const fetchImpl = stubFetch([
      { match: "boards-api.greenhouse.io/v1/boards/aqr", body: { jobs: [gh(1), gh(2)] } },
    ]);
    const out = await runTick({ queue, redis, fetchImpl, knownCompanies: new Set(["aqr"]) });

    await it("processes two new jobs", () => {
      assert.equal(out.status, "ok");
      assert.equal(out.counts.new, 2);
      assert.equal(out.counts.total, 2);
    });
    await it("populates job hash, indexes, and quality keys", async () => {
      const job = await redis.hgetall("jobs:aqr:1");
      assert.equal(job.title, "Analyst");
      assert.equal(job.ats, "greenhouse");
      assert.equal((await redis.smembers("idx:company:aqr")).length, 2);
      assert.equal((await redis.smembers("idx:ats:greenhouse")).length, 2);
      assert.equal((await redis.smembers("idx:status:active")).length, 2);
      const q = await redis.get("quality:aqr:1");
      assert.ok(JSON.parse(q).score > 0);
    });
  } finally { cleanup(); }
});

describe("runTick: existing job with same hash is unchanged", async () => {
  const { path, cleanup } = tmpState();
  try {
    const redis = new MockRedis({ path, autosave: false });
    const queue = new LocalQueue({ defaultHostDelayMs: 0 });
    seedQueue(queue, [{ ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 }]);
    const fetchImpl = stubFetch([
      { match: "boards-api.greenhouse.io/v1/boards/aqr", body: { jobs: [gh(1)] } },
    ]);

    // first tick — insert
    await runTick({ queue, redis, fetchImpl });
    // reseed for second tick
    seedQueue(queue, [{ ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 }]);
    const out2 = await runTick({ queue, redis, fetchImpl });

    await it("second tick counts unchanged", () => {
      assert.equal(out2.counts.unchanged, 1);
      assert.equal(out2.counts.new, 0);
    });
  } finally { cleanup(); }
});

describe("runTick: dropped job marked dead", async () => {
  const { path, cleanup } = tmpState();
  try {
    const redis = new MockRedis({ path, autosave: false });
    const queue = new LocalQueue({ defaultHostDelayMs: 0 });

    // first tick: two jobs
    seedQueue(queue, [{ ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 }]);
    let fetchImpl = stubFetch([{ match: "aqr", body: { jobs: [gh(1), gh(2)] } }]);
    await runTick({ queue, redis, fetchImpl });

    // second tick: only job 1 remains → job 2 becomes dead
    seedQueue(queue, [{ ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 }]);
    fetchImpl = stubFetch([{ match: "aqr", body: { jobs: [gh(1)] } }]);
    const out = await runTick({ queue, redis, fetchImpl });

    await it("counts dead job", () => assert.equal(out.counts.dead, 1));
    await it("marks status=dead on the job hash", async () => {
      const dead = await redis.hgetall("jobs:aqr:2");
      assert.equal(dead.status, "dead");
      assert.equal(dead.dead_reason, "api_dropout");
    });
    await it("moves composite key from active to dead set", async () => {
      const active = await redis.smembers("idx:status:active");
      const deadSet = await redis.smembers("idx:dead");
      assert.ok(!active.includes("aqr:2"));
      assert.ok(deadSet.includes("aqr:2"));
    });
  } finally { cleanup(); }
});

describe("runTick: fetch failure doesn't crash", async () => {
  const { path, cleanup } = tmpState();
  try {
    const redis = new MockRedis({ path, autosave: false });
    const queue = new LocalQueue({ defaultHostDelayMs: 0 });
    seedQueue(queue, [{ ats: "greenhouse", token: "missing", name: "Missing", tier: 1 }]);
    const fetchImpl = stubFetch([{ match: "missing", ok: false, status: 404, body: {} }]);
    const out = await runTick({ queue, redis, fetchImpl });
    await it("returns fetch-failed status", () => assert.equal(out.status, "fetch-failed"));
  } finally { cleanup(); }
});

describe("runUntilEmpty drains the queue", async () => {
  const { path, cleanup } = tmpState();
  try {
    const redis = new MockRedis({ path, autosave: false });
    const queue = new LocalQueue({ defaultHostDelayMs: 0 });
    seedQueue(queue, [
      { ats: "greenhouse", token: "aqr", name: "AQR", tier: 1 },
      { ats: "lever", token: "ramp", name: "Ramp", tier: 1 },
    ]);
    const fetchImpl = stubFetch([
      { match: "boards-api.greenhouse.io", body: { jobs: [gh(1)] } },
      { match: "api.lever.co", body: [{ id: "L1", text: "PM", categories: { location: "NY", department: "Product" }, hostedUrl: "https://ex/L1" }] },
    ]);
    const stats = await runUntilEmpty({ queue, redis, fetchImpl });
    await it("processes 2 tasks across two ATSes", () => {
      assert.equal(stats.ticks, 2);
      assert.equal(stats.counts.new, 2);
    });
  } finally { cleanup(); }
});
