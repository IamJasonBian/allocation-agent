import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalQueue } from "./local-queue.mjs";

describe("LocalQueue", () => {
  it("enqueue + dequeue respects priority within a host", () => {
    const q = new LocalQueue({ defaultHostDelayMs: 0 });
    q.enqueue({ host: "a.com", boardToken: "lo", priority: 1 });
    q.enqueue({ host: "a.com", boardToken: "hi", priority: 9 });
    assert.equal(q.dequeue(1000).boardToken, "hi");
    assert.equal(q.dequeue(2000).boardToken, "lo");
  });

  it("per-host cooldown prevents reaping the same host twice too fast", () => {
    const q = new LocalQueue({ defaultHostDelayMs: 2000 });
    q.enqueue({ host: "a.com", boardToken: "one" });
    q.enqueue({ host: "a.com", boardToken: "two" });
    const now = 1000;
    assert.equal(q.dequeue(now).boardToken, "one");
    assert.equal(q.dequeue(now + 500), null, "host still on cooldown");
    assert.equal(q.dequeue(now + 2001).boardToken, "two");
  });

  it("round-robins across hosts that are both ready", () => {
    const q = new LocalQueue({ defaultHostDelayMs: 1000 });
    q.enqueue({ host: "a.com", boardToken: "aa", priority: 5 });
    q.enqueue({ host: "b.com", boardToken: "bb", priority: 5 });
    // priority tie — lastAttemptAt tiebreak (neither attempted) is stable
    // on insertion order via Map iteration.
    const first = q.dequeue(100);
    const second = q.dequeue(200); // same priority, different host → ready
    assert.notEqual(first.host, second.host);
  });

  it("msUntilReady reports min host-cooldown remaining", () => {
    const q = new LocalQueue({ defaultHostDelayMs: 2000 });
    q.enqueue({ host: "a.com", boardToken: "one" });
    q.enqueue({ host: "b.com", boardToken: "two" });
    q.dequeue(1000); // starts cooldown on whichever host
    const wait = q.msUntilReady(1100);
    assert.ok(wait >= 0);
  });

  it("size and stats update", () => {
    const q = new LocalQueue({ defaultHostDelayMs: 0 });
    q.enqueue({ host: "a.com", boardToken: "x" });
    assert.equal(q.size(), 1);
    const item = q.dequeue();
    q.markDone(item, { ok: true, durationMs: 42 });
    assert.equal(q.stats.enqueued, 1);
    assert.equal(q.stats.dequeued, 1);
    assert.equal(q.stats.done, 1);
  });
});
