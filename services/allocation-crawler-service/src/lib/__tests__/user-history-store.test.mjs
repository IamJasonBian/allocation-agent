import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendHistory, readHistory, hasInteracted, historyKey } from "../user-history-store.mjs";

/**
 * In-memory fake ioredis that supports just the ZSET commands we use:
 *   zadd, zrangebyscore, zrevrangebyscore.
 */
class FakeRedis {
  constructor() { this.z = new Map(); }
  async zadd(key, score, member) {
    if (!this.z.has(key)) this.z.set(key, []);
    this.z.get(key).push({ score: Number(score), member: String(member) });
    this.z.get(key).sort((a, b) => a.score - b.score);
    return 1;
  }
  _filter(key, min, max) {
    const arr = this.z.get(key) || [];
    const lo = min === "-inf" ? -Infinity : Number(min);
    const hi = max === "+inf" ? Infinity : Number(max);
    return arr.filter((r) => r.score >= lo && r.score <= hi);
  }
  async zrangebyscore(key, min, max) { return this._filter(key, min, max).map((r) => r.member); }
  async zrevrangebyscore(key, max, min) { return this._filter(key, min, max).map((r) => r.member).reverse(); }
}

describe("user-history-store", () => {
  it("appends and reads back an entry", async () => {
    const r = new FakeRedis();
    await appendHistory(r, "u@ex.com", {
      board: "williamblair",
      jobId: "123",
      status: "applied",
      title: "IB Analyst",
    });
    const entries = await readHistory(r, "u@ex.com");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, "applied");
    assert.equal(entries[0].board, "williamblair");
  });

  it("key format is user_history:{userId}", () => {
    assert.equal(historyKey("u@ex.com"), "user_history:u@ex.com");
  });

  it("filters by status", async () => {
    const r = new FakeRedis();
    await appendHistory(r, "u", { board: "b", jobId: "1", status: "applied" });
    await appendHistory(r, "u", { board: "b", jobId: "2", status: "callback" });
    await appendHistory(r, "u", { board: "b", jobId: "3", status: "rejection" });
    const onlyCallbacks = await readHistory(r, "u", { statuses: ["callback"] });
    assert.equal(onlyCallbacks.length, 1);
    assert.equal(onlyCallbacks[0].jobId, "2");
  });

  it("hasInteracted dedupes across statuses", async () => {
    const r = new FakeRedis();
    await appendHistory(r, "u", { board: "b", jobId: "1", status: "applied" });
    assert.equal(await hasInteracted(r, "u", "b", "1"), true);
    assert.equal(await hasInteracted(r, "u", "b", "nope"), false);
  });

  it("skips malformed members without breaking the read", async () => {
    const r = new FakeRedis();
    await r.zadd(historyKey("u"), Date.now(), "{not valid json");
    await appendHistory(r, "u", { board: "b", jobId: "1", status: "applied" });
    const entries = await readHistory(r, "u");
    assert.equal(entries.length, 1);
  });

  it("respects order desc", async () => {
    const r = new FakeRedis();
    await appendHistory(r, "u", { board: "b", jobId: "1", status: "applied", timestamp: "2026-01-01T00:00:00Z" });
    await appendHistory(r, "u", { board: "b", jobId: "2", status: "applied", timestamp: "2026-02-01T00:00:00Z" });
    const desc = await readHistory(r, "u", { order: "desc" });
    assert.equal(desc[0].jobId, "2");
  });
});
