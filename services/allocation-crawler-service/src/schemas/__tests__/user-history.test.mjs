import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_STATUSES,
  HISTORY_SOURCES,
  STATUS_WEIGHTS,
  makeUserHistoryEntry,
  validateUserHistoryEntry,
} from "../user-history.mjs";

describe("user-history schema", () => {
  it("accepts a minimal well-formed entry", () => {
    const e = makeUserHistoryEntry({
      userId: "u@example.com",
      board: "williamblair",
      jobId: "12345",
      status: "applied",
    });
    assert.equal(e.userId, "u@example.com");
    assert.equal(e.status, "applied");
    assert.equal(e.source, "manual");
    assert.ok(Date.parse(e.timestamp) > 0);
  });

  it("rejects an unknown status", () => {
    assert.throws(
      () => makeUserHistoryEntry({ userId: "u", board: "b", jobId: "1", status: "maybe" }),
      /status must be one of/
    );
  });

  it("rejects an unknown source", () => {
    assert.throws(
      () => makeUserHistoryEntry({ userId: "u", board: "b", jobId: "1", status: "applied", source: "telepathy" }),
      /source must be one of/
    );
  });

  it("require userId/board/jobId", () => {
    assert.throws(() => makeUserHistoryEntry({ board: "b", jobId: "1", status: "applied" }), /userId required/);
    assert.throws(() => makeUserHistoryEntry({ userId: "u", jobId: "1", status: "applied" }), /board required/);
    assert.throws(() => makeUserHistoryEntry({ userId: "u", board: "b", status: "applied" }), /jobId required/);
  });

  it("validateUserHistoryEntry reports errors without throwing", () => {
    const { ok, errors } = validateUserHistoryEntry({ userId: "u", board: "b", jobId: "1", status: "bogus" });
    assert.equal(ok, false);
    assert.ok(errors.some((e) => e.includes("invalid status")));
  });

  it("enums are frozen and exhaustive", () => {
    assert.ok(Object.isFrozen(HISTORY_STATUSES));
    assert.ok(Object.isFrozen(HISTORY_SOURCES));
    for (const s of HISTORY_STATUSES) assert.ok(s in STATUS_WEIGHTS, `${s} missing weight`);
  });

  it("callback/offer weigh more than applied; rejection is negative", () => {
    assert.ok(STATUS_WEIGHTS.callback > STATUS_WEIGHTS.applied);
    assert.ok(STATUS_WEIGHTS.offer > STATUS_WEIGHTS.applied);
    assert.ok(STATUS_WEIGHTS.rejection < 0);
  });
});
