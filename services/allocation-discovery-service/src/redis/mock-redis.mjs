/**
 * File-backed mock ioredis for local discovery runs.
 *
 * Implements the subset of ioredis commands the discovery runner + downstream
 * builder actually use. State is persisted to a JSON file so consecutive
 * local runs see each other (`last_seen_at`, `content_hash`, quality scores
 * accumulate across ticks the same way prod Redis would).
 *
 * Everything is synchronous under the hood; commands return Promises so the
 * runner code is the same shape you'd use against real ioredis.
 *
 * Swap for real ioredis by passing a different client to the runner — the
 * shared key schema (`jobs:{company}:{jobId}`, `idx:*`, `feed:*`,
 * `meta:last_fetch:*`, plus the new `quality:*` keys we add) is identical.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DEFAULT_PATH = "./.discovery-state/mock-redis.json";

export class MockRedis {
  constructor({ path = DEFAULT_PATH, autosave = true } = {}) {
    this.path = path;
    this.autosave = autosave;
    this.state = { hashes: {}, sets: {}, zsets: {}, strings: {}, ttls: {} };
    this._load();
  }

  _load() {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      this.state = { hashes: {}, sets: {}, zsets: {}, strings: {}, ttls: {}, ...raw };
      // sets serialize as arrays — rehydrate back to Set
      for (const k of Object.keys(this.state.sets)) {
        this.state.sets[k] = new Set(this.state.sets[k]);
      }
    } catch {
      // corrupt — start fresh
    }
  }

  save() {
    const serializable = {
      ...this.state,
      sets: Object.fromEntries(
        Object.entries(this.state.sets).map(([k, v]) => [k, Array.from(v)])
      ),
    };
    const dir = dirname(this.path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(serializable, null, 2));
  }

  _autosave() {
    if (this.autosave) this.save();
  }

  // ── Connection lifecycle (ioredis shape) ──
  async ping() { return "PONG"; }
  async quit() { this.save(); return "OK"; }

  // ── Strings ──
  async get(key) { return this.state.strings[key] ?? null; }
  async set(key, val, ...rest) {
    this.state.strings[key] = String(val);
    // optional EX seconds
    const exIdx = rest.findIndex((x) => String(x).toUpperCase() === "EX");
    if (exIdx >= 0) this.state.ttls[key] = Date.now() + parseInt(rest[exIdx + 1], 10) * 1000;
    this._autosave();
    return "OK";
  }
  async del(...keys) {
    let count = 0;
    for (const k of keys) {
      if (k in this.state.strings) { delete this.state.strings[k]; count++; }
      if (k in this.state.hashes) { delete this.state.hashes[k]; count++; }
      if (k in this.state.sets) { delete this.state.sets[k]; count++; }
      if (k in this.state.zsets) { delete this.state.zsets[k]; count++; }
    }
    this._autosave();
    return count;
  }

  // ── Hashes ──
  async hset(key, ...args) {
    if (!this.state.hashes[key]) this.state.hashes[key] = {};
    const h = this.state.hashes[key];
    // hset key field val field val ... OR hset key { field: val, ... }
    if (args.length === 1 && typeof args[0] === "object") {
      for (const [f, v] of Object.entries(args[0])) h[f] = String(v);
    } else {
      for (let i = 0; i < args.length; i += 2) h[args[i]] = String(args[i + 1]);
    }
    this._autosave();
    return Object.keys(h).length;
  }
  async hget(key, field) { return this.state.hashes[key]?.[field] ?? null; }
  async hgetall(key) { return { ...(this.state.hashes[key] || {}) }; }
  async hkeys(key) { return Object.keys(this.state.hashes[key] || {}); }

  // ── Sets ──
  async sadd(key, ...members) {
    if (!this.state.sets[key]) this.state.sets[key] = new Set();
    let added = 0;
    for (const m of members) {
      const s = String(m);
      if (!this.state.sets[key].has(s)) { this.state.sets[key].add(s); added++; }
    }
    this._autosave();
    return added;
  }
  async srem(key, ...members) {
    const s = this.state.sets[key];
    if (!s) return 0;
    let removed = 0;
    for (const m of members) { if (s.delete(String(m))) removed++; }
    this._autosave();
    return removed;
  }
  async smembers(key) { return Array.from(this.state.sets[key] || []); }
  async scard(key) { return (this.state.sets[key] || new Set()).size; }
  async sismember(key, member) { return this.state.sets[key]?.has(String(member)) ? 1 : 0; }

  // ── Sorted sets ──
  async zadd(key, ...args) {
    if (!this.state.zsets[key]) this.state.zsets[key] = [];
    // zadd key score member score member ...
    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = String(args[i + 1]);
      const z = this.state.zsets[key];
      const existing = z.findIndex((r) => r.member === member);
      if (existing >= 0) z[existing].score = score;
      else { z.push({ score, member }); added++; }
    }
    this.state.zsets[key].sort((a, b) => a.score - b.score);
    this._autosave();
    return added;
  }
  _zFilter(key, min, max) {
    const arr = this.state.zsets[key] || [];
    const lo = min === "-inf" ? -Infinity : Number(min);
    const hi = max === "+inf" ? Infinity : Number(max);
    return arr.filter((r) => r.score >= lo && r.score <= hi);
  }
  async zrangebyscore(key, min, max) { return this._zFilter(key, min, max).map((r) => r.member); }
  async zrevrangebyscore(key, max, min) { return this._zFilter(key, min, max).map((r) => r.member).reverse(); }
  async zcard(key) { return (this.state.zsets[key] || []).length; }

  // ── ioredis pipeline shim ──
  // We don't optimize batching — we just replay the calls. The runner only
  // uses pipeline for convenience; prod gets real batching when swapped to
  // ioredis.
  pipeline() {
    const queue = [];
    const proxy = {};
    const methods = ["hset", "sadd", "zadd", "set", "srem", "del"];
    for (const m of methods) {
      proxy[m] = (...args) => { queue.push([m, args]); return proxy; };
    }
    proxy.exec = async () => {
      const results = [];
      for (const [m, args] of queue) results.push([null, await this[m](...args)]);
      return results;
    };
    return proxy;
  }
}
