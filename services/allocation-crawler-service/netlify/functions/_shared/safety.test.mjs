import assert from "node:assert/strict";
import test from "node:test";

import { getIdempotencyKey, hashPayload, isDryRun } from "./safety.mjs";

function mockRequest(headers) {
  return new Request("https://example.test/", { headers });
}

test("isDryRun accepts 1, true, yes (case-insensitive)", () => {
  assert.equal(isDryRun(mockRequest({ "x-dry-run": "1" })), true);
  assert.equal(isDryRun(mockRequest({ "X-Dry-Run": "TRUE" })), true);
  assert.equal(isDryRun(mockRequest({ "x-dry-run": "yes" })), true);
  assert.equal(isDryRun(mockRequest({})), false);
});

test("getIdempotencyKey trims", () => {
  assert.equal(getIdempotencyKey(mockRequest({ "idempotency-key": "  abc  " })), "abc");
  assert.equal(getIdempotencyKey(mockRequest({})), null);
});

test("hashPayload is stable", () => {
  const a = { runId: "r1", jobs: [] };
  assert.equal(hashPayload(a), hashPayload({ ...a }));
  assert.notEqual(hashPayload(a), hashPayload({ ...a, runId: "r2" }));
});
