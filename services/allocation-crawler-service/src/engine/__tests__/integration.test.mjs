import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepare, fetchEmbed, detectCaptcha } from "../apply-operator.mjs";

// These tests hit real Greenhouse endpoints. Run with:
//   node --test services/allocation-crawler-service/src/engine/__tests__/integration.test.mjs
//
// Skip in CI with: NODE_ENV=ci node --test (these check for it)

const SKIP = process.env.CI === "true" || process.env.NODE_ENV === "ci";

describe("integration: fetchEmbed", { skip: SKIP }, () => {
  it("fetches a real Greenhouse embed page", async () => {
    const { html, embedUrl } = await fetchEmbed("generalatlantic", "5669453004");
    assert.ok(html.length > 1000, "HTML should be substantial");
    assert.ok(embedUrl.includes("greenhouse.io"), "URL should be Greenhouse domain");
    assert.ok(html.includes("__remixContext"), "Should contain Remix SSR data");
  });

  it("detects enterprise captcha on real page", async () => {
    const { html } = await fetchEmbed("generalatlantic", "5669453004");
    const captcha = detectCaptcha(html);
    assert.equal(captcha.type, "enterprise");
  });
});

describe("integration: prepare (React form)", { skip: SKIP }, () => {
  // Minimal profile for testing -- just enough fields to resolve
  const testProfile = {
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    preferredFirstName: "Test",
    legalFirstName: "Test",
    legalLastName: "User",
    email: "test@example.com",
    phone: "555-0100",
    phoneRaw: "5550100",
    linkedIn: "https://linkedin.com/in/test",
    city: "New York",
    state: "New York",
    stateAbbrev: "NY",
    zip: "10001",
    country: "United States",
    location: "New York, NY",
    address: "New York, NY 10001",
    authorizedToWork: true,
    requiresSponsorship: false,
    school: "Test University",
    degree: "Bachelor of Science",
    discipline: "Computer Science",
    gpa: "3.8",
    graduationMonth: "May",
    graduationYear: "2024",
    graduationMonthNum: 5,
    startMonthEdu: 9,
    startYearEdu: 2020,
    employer: "Test Corp",
    jobTitle: "Analyst",
    yearsExperience: "2",
    gender: "Decline",
    race: "Decline",
    veteranStatus: "No",
    disability: "No",
    sexualOrientation: "Decline",
    hispanicLatino: "Decline",
    salaryExpectation: "Open",
    startDate: "Immediately",
    howDidYouHear: "Website",
    spokenLanguagesStr: "English",
    programmingLanguages: "Python",
    noticePeriod: "None",
    noticePeriodDetails: "No",
    hasBachelorsDegree: true,
    enrolledInMBA: false,
    standardizedTestScores: "N/A",
    hasLicenses: false,
    hasNonCompete: false,
    relocateDetails: "Open",
    resumeText: "Test resume content",
    resumePath: "",
  };

  it("prepares a General Atlantic job (React form)", async () => {
    const app = await prepare(testProfile, { board: "generalatlantic", job_id: "5669453004" });

    assert.equal(app.formType, "react");
    assert.equal(app.stage, "build");
    assert.equal(app.error, null);
    assert.ok(app.captcha);
    assert.equal(app.captcha.type, "enterprise");
    assert.ok(app.submitPath?.includes("greenhouse.io"));
    assert.ok(app.fields.length > 5, `Expected >5 fields, got ${app.fields.length}`);
    assert.ok(app.resolved.length > 5, `Expected >5 resolved, got ${app.resolved.length}`);
    assert.ok(app.payload, "Should have built a payload");

    // Check that core fields resolved
    const firstNameField = app.resolved.find(f => f.label === "First Name");
    assert.ok(firstNameField, "Should have First Name field");
    assert.equal(firstNameField.value, "Test");
  });

  it("prepares a William Blair job (React form via redirect)", async () => {
    const app = await prepare(testProfile, { board: "williamblair", job_id: "5059036007" });

    assert.equal(app.formType, "react");
    assert.equal(app.stage, "build");
    assert.equal(app.error, null);
    assert.ok(app.fields.length > 10, `Expected >10 fields, got ${app.fields.length}`);
    assert.equal(app.missing.length, 0, `Unexpected missing fields: ${app.missing.map(f => f.label)}`);
  });

  it("reports field resolution coverage", async () => {
    const app = await prepare(testProfile, { board: "generalatlantic", job_id: "5669453004" });

    const resolved = app.resolved.filter(f => f.value && f.fieldType !== "file");
    const total = app.resolved.filter(f => f.fieldType !== "file");
    const coverage = resolved.length / total.length;

    console.log(`    Coverage: ${resolved.length}/${total.length} (${Math.round(coverage * 100)}%)`);
    assert.ok(coverage > 0.5, `Coverage should be >50%, got ${Math.round(coverage * 100)}%`);
  });
});
