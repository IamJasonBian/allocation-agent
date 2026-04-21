import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markDroppedFromApi, probeUrl } from "./liveness.mjs";

describe("markDroppedFromApi", () => {
  it("returns known minus seen", () => {
    const known = new Set(["a:1", "a:2", "a:3"]);
    const seen = new Set(["a:1", "a:3"]);
    assert.deepEqual(Array.from(markDroppedFromApi({ known, seen })).sort(), ["a:2"]);
  });
  it("empty known returns empty", () => {
    assert.equal(markDroppedFromApi({ known: new Set(), seen: new Set(["a:1"]) }).size, 0);
  });
});

describe("probeUrl", () => {
  it("empty url returns null", async () => {
    const out = await probeUrl("");
    assert.equal(out.live, null);
  });

  it("200 OK → live", async () => {
    const fetchImpl = async () => new Response(null, { status: 200 });
    const out = await probeUrl("https://x/a", { fetchImpl });
    assert.equal(out.live, true);
  });

  it("404 → dead", async () => {
    const fetchImpl = async () => new Response(null, { status: 404 });
    const out = await probeUrl("https://x/a", { fetchImpl });
    assert.equal(out.live, false);
    assert.equal(out.status, 404);
  });

  it("410 → dead", async () => {
    const fetchImpl = async () => new Response(null, { status: 410 });
    const out = await probeUrl("https://x/a", { fetchImpl });
    assert.equal(out.live, false);
    assert.equal(out.status, 410);
  });

  it("405 HEAD → falls back to GET, detects closure phrase", async () => {
    let call = 0;
    const fetchImpl = async (_url, opts) => {
      call++;
      if (opts?.method === "HEAD") return new Response(null, { status: 405 });
      return new Response("Oops — position filled.", { status: 200 });
    };
    const out = await probeUrl("https://x/a", { fetchImpl });
    assert.equal(out.live, false);
    assert.match(out.reason, /closure phrase/);
    assert.equal(call, 2);
  });

  it("network error → inconclusive", async () => {
    const fetchImpl = async () => { throw new Error("boom"); };
    const out = await probeUrl("https://x/a", { fetchImpl });
    assert.equal(out.live, null);
    assert.match(out.reason, /boom/);
  });
});
