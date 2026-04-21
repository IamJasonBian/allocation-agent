import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { MockRedis } from "./mock-redis.mjs";

function tmp() {
  const dir = mkdtempSync(resolve(tmpdir(), "mock-redis-"));
  return { dir, path: resolve(dir, "state.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("mock-redis hashes", () => {
  it("hset accepts object form and individual field-value args", async () => {
    const { path, cleanup } = tmp();
    try {
      const r = new MockRedis({ path, autosave: false });
      await r.hset("jobs:a:1", { title: "Analyst", location: "NY" });
      assert.equal(await r.hget("jobs:a:1", "title"), "Analyst");
      await r.hset("jobs:a:1", "title", "Senior Analyst");
      assert.equal(await r.hget("jobs:a:1", "title"), "Senior Analyst");
      const all = await r.hgetall("jobs:a:1");
      assert.equal(all.location, "NY");
    } finally { cleanup(); }
  });
});

describe("mock-redis sets", () => {
  it("sadd dedupes, smembers returns array", async () => {
    const { path, cleanup } = tmp();
    try {
      const r = new MockRedis({ path, autosave: false });
      await r.sadd("idx:x", "a", "b", "a");
      assert.equal(await r.scard("idx:x"), 2);
      const members = await r.smembers("idx:x");
      assert.deepEqual(members.sort(), ["a", "b"]);
    } finally { cleanup(); }
  });
});

describe("mock-redis zsets", () => {
  it("zadd updates scores in place", async () => {
    const { path, cleanup } = tmp();
    try {
      const r = new MockRedis({ path, autosave: false });
      await r.zadd("feed:new", 100, "a", 200, "b");
      await r.zadd("feed:new", 150, "a");
      const asc = await r.zrangebyscore("feed:new", "-inf", "+inf");
      assert.deepEqual(asc, ["a", "b"]);
    } finally { cleanup(); }
  });
});

describe("mock-redis persistence", () => {
  it("roundtrips state to disk", async () => {
    const { path, cleanup } = tmp();
    try {
      let r = new MockRedis({ path });
      await r.hset("jobs:a:1", { title: "t" });
      await r.sadd("idx:x", "a:1");
      await r.zadd("feed:new", 1, "a:1");
      await r.set("meta:last_fetch:a", "now");
      r.save();

      r = new MockRedis({ path });
      assert.equal(await r.hget("jobs:a:1", "title"), "t");
      assert.deepEqual(await r.smembers("idx:x"), ["a:1"]);
      assert.deepEqual(await r.zrangebyscore("feed:new", "-inf", "+inf"), ["a:1"]);
      assert.equal(await r.get("meta:last_fetch:a"), "now");
    } finally { cleanup(); }
  });
});

describe("mock-redis pipeline", () => {
  it("replays queued commands in order", async () => {
    const { path, cleanup } = tmp();
    try {
      const r = new MockRedis({ path, autosave: false });
      await r.pipeline()
        .hset("jobs:a:1", { title: "t" })
        .sadd("idx:x", "a:1")
        .zadd("feed:new", 1, "a:1")
        .exec();
      assert.equal(await r.hget("jobs:a:1", "title"), "t");
      assert.equal(await r.scard("idx:x"), 1);
    } finally { cleanup(); }
  });
});
