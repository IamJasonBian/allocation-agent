import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveField, getSynonyms, SYNONYMS } from "../lib/field-resolver.mjs";
import { profile } from "../lib/candidate-profile-aastha.mjs";

// Helper: resolve without LLM
const resolve = (label, type = "text", options = null) =>
  resolveField(label, type, options, profile, { useLLM: false });

// ── Layer 1: Canonical Resolution ──

describe("resolveCanonical (via resolveField)", () => {
  it("resolves 'First Name' to FIRST_NAME", async () => {
    const r = await resolve("First Name");
    assert.equal(r.canonical, "FIRST_NAME");
    assert.equal(r.value, "Aastha");
    assert.equal(r.source, "heuristic");
  });

  it("resolves 'Preferred First Name' to PREFERRED_FIRST_NAME (not FIRST_NAME)", async () => {
    const r = await resolve("Preferred first name");
    assert.equal(r.canonical, "PREFERRED_FIRST_NAME");
  });

  it("resolves 'Legal First Name' to LEGAL_FIRST_NAME", async () => {
    const r = await resolve("Legal first name");
    assert.equal(r.canonical, "LEGAL_FIRST_NAME");
  });

  it("resolves 'Email' case-insensitively", async () => {
    for (const label of ["EMAIL", "Email", "email", "Email Address"]) {
      const r = await resolve(label);
      assert.equal(r.canonical, "EMAIL", `failed for label "${label}"`);
      assert.equal(r.value, "aastha.aggarwal1@gmail.com");
    }
  });

  it("resolves 'LinkedIn' to LINKEDIN", async () => {
    const r = await resolve("LinkedIn Profile");
    assert.equal(r.canonical, "LINKEDIN");
    assert.equal(r.value, "https://www.linkedin.com/in/aastar");
  });

  it("resolves unknown label to none", async () => {
    const r = await resolve("Completely unknown question xyz");
    assert.equal(r.value, null);
    assert.equal(r.source, "none");
    assert.equal(r.canonical, null);
  });

  it("resolves empty label to none", async () => {
    const r = await resolve("");
    assert.equal(r.value, null);
    assert.equal(r.source, "none");
  });
});

// ── Pattern Ordering (first-match-wins edge cases) ──

describe("pattern ordering", () => {
  it("'notice period' matches NOTICE_PERIOD before CURRENT_EMPLOYER", async () => {
    const r = await resolve("Do you have a notice period with your current employer?");
    assert.equal(r.canonical, "NOTICE_PERIOD");
  });

  it("'post-employment obligations' matches NON_COMPETE, not CURRENT_EMPLOYER", async () => {
    const r = await resolve("Are you bound to any post-employment obligations or restrictive covenants?");
    assert.equal(r.canonical, "NON_COMPETE");
    assert.equal(r.value, "No");
  });

  it("'Why are you interested' matches WHY_INTERESTED, not WEBSITE", async () => {
    const r = await resolve("Why are you interested in this role at Portfolio Human Capital?");
    assert.equal(r.canonical, "WHY_INTERESTED");
  });

  it("'authorized to work in the country' matches AUTHORIZED_TO_WORK, not COUNTRY", async () => {
    const r = await resolve("Are you legally authorized to work in the country?");
    assert.equal(r.canonical, "AUTHORIZED_TO_WORK");
  });

  it("GPA matches before SCHOOL for 'current cumulative GPA'", async () => {
    const r = await resolve("What is your current cumulative GPA?");
    assert.equal(r.canonical, "GPA");
  });
});

// ── Layer 2: Value Map Correctness ──

describe("value map", () => {
  it("formats GPA with scale", async () => {
    const r = await resolve("GPA");
    assert.equal(r.value, "3.6 / 4.0");
  });

  it("maps authorizedToWork=true to Yes", async () => {
    const r = await resolve("Are you legally authorized to work in the United States?");
    assert.equal(r.value, "Yes");
  });

  it("maps requiresSponsorship=true to Yes", async () => {
    const r = await resolve("Will you require sponsorship?");
    assert.equal(r.value, "Yes");
  });

  it("maps hasBachelorsDegree=true to Yes", async () => {
    const r = await resolve("Do you have a bachelor's degree?");
    assert.equal(r.value, "Yes");
  });

  it("maps enrolledInMBA=false to No", async () => {
    const r = await resolve("Are you currently enrolled in an MBA program?");
    assert.equal(r.value, "No");
  });

  it("maps hasLicenses=false to No", async () => {
    const r = await resolve("Do you have any licenses or certifications?");
    assert.equal(r.value, "No");
  });

  it("maps noticePeriod=None to No", async () => {
    const r = await resolve("Do you have a notice period?");
    assert.equal(r.value, "No");
  });

  it("returns location fields correctly", async () => {
    assert.equal((await resolve("City")).value, "New York");
    assert.equal((await resolve("What country do you reside in?")).value, "United States");
    assert.equal((await resolve("Your state of residence")).value, "New York");
    assert.equal((await resolve("Address")).value, "New York, NY 10001");
  });

  it("returns employment fields", async () => {
    assert.equal((await resolve("Current Company")).value, "Ironhold Capital");
    assert.equal((await resolve("Current Title")).value, "Investment Analyst");
    assert.equal((await resolve("Years of experience")).value, "3");
  });

  it("returns education fields", async () => {
    assert.equal((await resolve("School")).value, "Columbia University");
    assert.equal((await resolve("Degree")).value, "Master of Science");
    assert.equal((await resolve("Major")).value, "Applied Analytics");
    assert.equal((await resolve("Graduation year")).value, "2025");
    assert.equal((await resolve("Graduation month")).value, "May");
  });

  it("returns EEO fields", async () => {
    assert.equal((await resolve("Sex assigned at birth")).value, "Female");
    assert.equal((await resolve("Gender identity")).value, "Female");
    assert.equal((await resolve("Race")).value, "Asian");
    assert.equal((await resolve("Sexual orientation")).value, "Straight");
    assert.equal((await resolve("Veteran status")).value, "No");
    assert.equal((await resolve("Disability")).value, "No");
  });

  it("returns common defaults", async () => {
    assert.equal((await resolve("Salary expectations")).value, "Open to discussion");
    assert.equal((await resolve("When can you start?")).value, "Immediately");
    assert.equal((await resolve("How did you hear about us?")).value, "Company website");
    assert.equal((await resolve("Have you previously applied?")).value, "No");
    assert.equal((await resolve("Are you at least 18 years of age?")).value, "Yes");
  });
});

// ── Synonym Expansion ──

describe("getSynonyms", () => {
  it("expands Yes with synonyms", () => {
    const s = getSynonyms("Yes");
    assert.ok(s.includes("Yes"));
    assert.ok(s.includes("True"));
    assert.ok(s.includes("Y"));
  });

  it("expands No with synonyms", () => {
    const s = getSynonyms("No");
    assert.ok(s.includes("No"));
    assert.ok(s.includes("False"));
    assert.ok(s.includes("N/A"));
  });

  it("expands United States", () => {
    const s = getSynonyms("United States");
    assert.ok(s.includes("USA"));
    assert.ok(s.includes("US"));
    assert.ok(s.includes("United States of America"));
  });

  it("expands Female", () => {
    const s = getSynonyms("Female");
    assert.ok(s.includes("Woman"));
    assert.ok(s.includes("Cisgender Female"));
    assert.ok(s.includes("F"));
  });

  it("expands Master of Science", () => {
    const s = getSynonyms("Master of Science");
    assert.ok(s.includes("Master's Degree"));
    assert.ok(s.includes("MS"));
    assert.ok(s.includes("MA"));
  });

  it("expands Asian", () => {
    const s = getSynonyms("Asian");
    assert.ok(s.includes("Asian"));
    assert.ok(s.includes("Asian (Not Hispanic or Latino)"));
  });

  it("expands veteran decline", () => {
    const s = getSynonyms("I am not a veteran");
    assert.ok(s.includes("I am not a Veteran or active member of the military"));
    assert.ok(s.includes("No"));
  });

  it("passes through unknown values", () => {
    const s = getSynonyms("unknown_value");
    assert.deepEqual(s, ["unknown_value"]);
  });

  it("handles null", () => {
    const s = getSynonyms(null);
    assert.deepEqual(s, [null]);
  });

  it("is case-insensitive on lookup", () => {
    const s1 = getSynonyms("yes");
    const s2 = getSynonyms("YES");
    assert.ok(s1.includes("True"));
    assert.ok(s2.includes("True"));
  });
});

// ── SYNONYMS table invariants ──

describe("SYNONYMS table", () => {
  it("no synonym includes 'None' (avoids matching Non-*)", () => {
    // "None" was causing false matches like "Non-United States military"
    for (const [key, vals] of Object.entries(SYNONYMS)) {
      if (key === "n/a") continue; // n/a synonyms can have None
      assert.ok(
        !vals.includes("None"),
        `SYNONYMS["${key}"] should not include "None" — use specific alternatives`
      );
    }
  });

  it("no synonym includes bare 'I am not' (too broad)", () => {
    for (const [key, vals] of Object.entries(SYNONYMS)) {
      assert.ok(
        !vals.includes("I am not"),
        `SYNONYMS["${key}"] should not include bare "I am not"`
      );
    }
  });
});
