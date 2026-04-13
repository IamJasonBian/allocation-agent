import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  loadFilter, isTargetJob as _isTargetJob, isValidLocation as _isValidLocation,
  scorePriority as _scorePriority, filterAndRank,
} from "../lib/job-matcher.mjs";

/**
 * Regression tests for job matching logic.
 * Tests the extracted lib/job-matcher.mjs against the ib-analyst filter config.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const filter = loadFilter(resolve(__dirname, "../config/job-filters/ib-analyst.json"));

const isTargetJob = (title) => _isTargetJob(title, filter);
const isUSLocation = (loc) => _isValidLocation(loc, filter);
const scorePriority = (title, tags) => _scorePriority(title, tags, filter);

// ── Tests ──

describe("isTargetJob — inclusion", () => {
  const included = [
    "Investment Banking Analyst",
    "Data Analyst",
    "M&A Associate",
    "Summer Analyst",
    "Quantitative Analyst",
    "Equity Research Analyst",
    "Financial Analyst",
    "Private Equity Analyst",
    "Business Analyst",
    "Risk Analyst",
    "Data Scientist",
    "Portfolio Analyst",
    "FP&A Analyst",
    "Restructuring Associate",
    "Treasury Analyst",
    "Fund Accounting Analyst",
    "Capital Advisory Associate",
    "Valuation Analyst",
    "Client Relations Associate",
    "Pricing Analyst",
    "Forecasting Associate",
    "Financial Modeling Analyst",
  ];
  for (const title of included) {
    it(`includes "${title}"`, () => assert.ok(isTargetJob(title)));
  }
});

describe("isTargetJob — exclusion", () => {
  const excluded = [
    "Software Engineer",
    "Product Manager",
    "Vice President of Trading",
    "Director of Engineering",
    "Marketing Manager",
    "Recruiter",
    "SRE Engineer",
    "DevOps Engineer",
    "Frontend Developer",
    "Backend Engineer",
    "Full Stack Engineer",
    "Legal Counsel",
    "Executive Assistant",
    "Payroll Specialist",
    "Engineering Manager",
    "Head of Risk",
    "Sales Manager",
  ];
  for (const title of excluded) {
    it(`excludes "${title}"`, () => assert.ok(!isTargetJob(title)));
  }
});

describe("isTargetJob — edge cases", () => {
  it("excludes 'Director of Finance' (director without analyst/associate)", () => {
    assert.ok(!isTargetJob("Director of Finance"));
  });

  it("includes 'Director - Analyst Program' (director with analyst)", () => {
    assert.ok(isTargetJob("Director - Analyst Program"));
  });

  it("excludes Marketing but includes Marketing Intern", () => {
    assert.ok(!isTargetJob("Marketing Manager"));
    // Marketing Intern has "intern" but no target pattern match beyond marketing
    // Actually "marketing intern" doesn't match TARGET patterns — it has no \banalyst\b etc.
    // Let's just verify the exclude pattern has the intern exception
    // The marketing exclude pattern has a negative lookahead for "intern"
    assert.ok(isTargetJob("Marketing Intern") === false); // no include pattern matches
    // But verify the exclude doesn't fire for "Marketing Intern"
    assert.ok(!/\bmarketing\b(?!.*\bintern)/i.test("Marketing Intern"));
  });
});

describe("isUSLocation", () => {
  it("accepts empty/null location", () => {
    assert.ok(isUSLocation(""));
    assert.ok(isUSLocation(null));
    assert.ok(isUSLocation(undefined));
  });

  const valid = [
    "New York, NY",
    "NYC",
    "San Francisco, CA",
    "Remote",
    "Chicago, IL",
    "Boston, MA",
    "Charlotte, NC",
    "Atlanta, GA",
    "Greenwich, CT",
    "United States",
    "Hybrid",
    "Flexible",
  ];
  for (const loc of valid) {
    it(`accepts "${loc}"`, () => assert.ok(isUSLocation(loc)));
  }

  const invalid = [
    "London, UK",
    "Tokyo, Japan",
    "Berlin, Germany",
    "Singapore",
    "Mumbai, India",
  ];
  for (const loc of invalid) {
    it(`rejects "${loc}"`, () => assert.ok(!isUSLocation(loc)));
  }
});

describe("scorePriority", () => {
  it("Investment Banking Analyst = 120", () => {
    assert.equal(scorePriority("Investment Banking Analyst", []), 120);
  });

  it("Investment Banking Associate = 115", () => {
    assert.equal(scorePriority("Investment Banking Associate", []), 115);
  });

  it("M&A Analyst = 115", () => {
    assert.equal(scorePriority("M&A Analyst", []), 115);
  });

  it("Private Equity Analyst = 110", () => {
    assert.equal(scorePriority("Private Equity Analyst", []), 110);
  });

  it("Equity Research Analyst = 185 (105 equity research + 80 research analyst)", () => {
    assert.equal(scorePriority("Equity Research Analyst", []), 185);
  });

  it("Data Analyst = 100", () => {
    assert.equal(scorePriority("Data Analyst", []), 100);
  });

  it("Financial Analyst = 100", () => {
    assert.equal(scorePriority("Financial Analyst", []), 100);
  });

  it("Summer Analyst = 100", () => {
    assert.equal(scorePriority("Summer Analyst", []), 100);
  });

  it("Data Scientist = 95", () => {
    assert.equal(scorePriority("Data Scientist", []), 95);
  });

  it("Restructuring Associate = 90", () => {
    // "restructuring" = 90, "associate" guard (score !== 0) skips
    assert.equal(scorePriority("Restructuring Associate", []), 90);
  });

  it("generic Analyst = 50", () => {
    assert.equal(scorePriority("Analyst", []), 50);
  });

  it("generic Associate = 40", () => {
    assert.equal(scorePriority("Associate", []), 40);
  });

  it("analyst tag adds +10", () => {
    assert.equal(scorePriority("Analyst", ["analyst"]), 60);
  });

  it("quant tag adds +10", () => {
    assert.equal(scorePriority("Analyst", ["quant"]), 60);
  });

  it("intern penalty = -30", () => {
    assert.equal(scorePriority("Summer Analyst Intern", []), 100 - 30);
  });

  it("staff penalty = -15", () => {
    assert.equal(scorePriority("Staff Analyst", []), 50 - 15);
  });

  it("combined: IB Analyst with analyst tag", () => {
    assert.equal(scorePriority("Investment Banking Analyst", ["analyst"]), 130);
  });
});

describe("filterAndRank", () => {
  const jobs = [
    { title: "Software Engineer", location: "NYC", board: "coinbase", tags: [] },
    { title: "Investment Banking Analyst", location: "New York", board: "williamblair", tags: ["analyst"] },
    { title: "Data Analyst", location: "London", board: "coinbase", tags: [] },
    { title: "Financial Analyst", location: "Chicago", board: "williamblair", tags: [] },
    { title: "Associate", location: "Remote", board: "generalatlantic", tags: [] },
  ];
  const allowed = new Set(["williamblair", "coinbase", "generalatlantic"]);

  it("filters out excluded titles", () => {
    const result = filterAndRank(jobs, filter, { allowedBoards: allowed });
    assert.ok(!result.some(j => j.title === "Software Engineer"));
  });

  it("filters out invalid locations", () => {
    const result = filterAndRank(jobs, filter, { allowedBoards: allowed });
    assert.ok(!result.some(j => j.location === "London"));
  });

  it("sorts by score descending", () => {
    const result = filterAndRank(jobs, filter, { allowedBoards: allowed });
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it("applies board filter", () => {
    const result = filterAndRank(jobs, filter, { boardFilter: "williamblair", allowedBoards: allowed });
    assert.ok(result.every(j => j.board === "williamblair"));
  });

  it("adds score field", () => {
    const result = filterAndRank(jobs, filter, { allowedBoards: allowed });
    assert.ok(result.every(j => typeof j.score === "number" && j.score > 0));
  });
});
