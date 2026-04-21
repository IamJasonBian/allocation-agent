import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenize, buildSignal, scoreByHistory } from "../score-by-history.mjs";

const mkEntry = (overrides) => ({
  userId: "u",
  board: "b",
  jobId: "1",
  status: "applied",
  source: "manual",
  timestamp: new Date().toISOString(),
  title: "",
  tags: [],
  notes: "",
  ...overrides,
});

describe("tokenize", () => {
  it("splits and normalizes", () => {
    const out = tokenize("Investment Banking Analyst (NYC)");
    assert.ok(out.includes("investment"));
    assert.ok(out.includes("banking"));
    assert.ok(out.includes("analyst"));
  });
  it("drops stopwords and single-char tokens", () => {
    const out = tokenize("A B the of");
    assert.deepEqual(out, []);
  });
});

describe("buildSignal", () => {
  it("accumulates weighted tokens across statuses", () => {
    const history = [
      mkEntry({ title: "Data Analyst", status: "applied" }),
      mkEntry({ title: "Data Scientist", status: "callback" }), // 3x
    ];
    const { weights } = buildSignal(history);
    assert.ok(weights.get("data") > weights.get("analyst"), "'data' should beat 'analyst' because of callback weight");
  });
  it("rejection subtracts", () => {
    const history = [
      mkEntry({ title: "Backend Engineer", status: "rejection" }),
    ];
    const { weights } = buildSignal(history);
    assert.ok(weights.get("backend") < 0);
  });
});

describe("scoreByHistory", () => {
  const pool = [
    { board: "aqr", jobId: "1", title: "Data Scientist", tags: [] },
    { board: "williamblair", jobId: "2", title: "Investment Banking Analyst", tags: ["analyst"] },
    { board: "datadog", jobId: "3", title: "Backend Engineer", tags: [] },
  ];

  it("ranks IB analyst first when user called back on IB analyst", () => {
    const history = [
      mkEntry({ title: "Investment Banking Analyst", status: "callback", board: "liontree", jobId: "9" }),
    ];
    const { scored } = scoreByHistory(pool, history);
    assert.equal(scored[0].title, "Investment Banking Analyst");
  });

  it("ranks data scientist first when user called back on data scientist", () => {
    const history = [
      mkEntry({ title: "Data Scientist", status: "callback", board: "aqr", jobId: "9" }),
    ];
    const { scored } = scoreByHistory(pool, history);
    assert.equal(scored[0].title, "Data Scientist");
  });

  it("rejections push matching jobs down", () => {
    const history = [
      mkEntry({ title: "Backend Engineer", status: "rejection", board: "datadog", jobId: "9" }),
    ];
    const { scored } = scoreByHistory(pool, history);
    assert.notEqual(scored[0].title, "Backend Engineer");
  });

  it("empty history yields all-zero scores (so random seed still works)", () => {
    const { scored } = scoreByHistory(pool, []);
    for (const c of scored) assert.equal(c.score, 0);
  });
});
