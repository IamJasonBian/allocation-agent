import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveField, getSynonyms } from "../field-resolver.mjs";

// Minimal profile stub for testing
const profile = {
  firstName: "Test",
  lastName: "User",
  fullName: "Test User",
  preferredFirstName: "Test",
  legalFirstName: "Test",
  legalLastName: "User",
  email: "test@example.com",
  phone: "555-1234",
  phoneRaw: "5551234",
  linkedIn: "https://linkedin.com/in/testuser",
  city: "New York",
  state: "New York",
  stateAbbrev: "NY",
  zip: "10001",
  country: "United States",
  location: "New York, NY",
  address: "New York, NY 10001",
  authorizedToWork: true,
  requiresSponsorship: true,
  school: "Columbia University",
  degree: "Master of Science",
  discipline: "Applied Analytics",
  gpa: "3.6",
  graduationMonth: "May",
  graduationYear: "2025",
  employer: "Acme Corp",
  jobTitle: "Analyst",
  yearsExperience: "3",
  gender: "Female",
  race: "Asian",
  veteranStatus: "No",
  disability: "No",
  sexualOrientation: "Straight",
  hispanicLatino: "No",
  salaryExpectation: "Open to discussion",
  startDate: "Immediately",
  howDidYouHear: "Company website",
  spokenLanguagesStr: "English, Hindi",
  programmingLanguages: "Python, R, SQL",
  noticePeriod: "None",
  noticePeriodDetails: "No",
  hasBachelorsDegree: true,
  bachelorsDegreeField: "Business",
  enrolledInMBA: false,
  standardizedTestScores: "N/A",
  hasLicenses: false,
  hasNonCompete: false,
  relocateDetails: "Based in New York",
};

describe("field-resolver: Layer 1+2 heuristic resolution", () => {
  it("resolves first name", async () => {
    const r = await resolveField("First Name", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Test");
    assert.equal(r.source, "heuristic");
    assert.equal(r.canonical, "FIRST_NAME");
  });

  it("resolves last name", async () => {
    const r = await resolveField("Last Name", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "User");
    assert.equal(r.canonical, "LAST_NAME");
  });

  it("resolves email", async () => {
    const r = await resolveField("Email Address", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "test@example.com");
  });

  it("resolves LinkedIn", async () => {
    const r = await resolveField("LinkedIn Profile URL", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "https://linkedin.com/in/testuser");
  });

  it("resolves school", async () => {
    const r = await resolveField("What school did you attend?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Columbia University");
  });

  it("resolves GPA before school when label contains both patterns", async () => {
    const r = await resolveField(
      "What is your current cumulative GPA? Please include the scale at your institution",
      "text", null, profile, { useLLM: false }
    );
    assert.equal(r.canonical, "GPA");
    assert.ok(r.value.includes("3.6"));
  });

  it("resolves work authorization", async () => {
    const r = await resolveField("Are you legally authorized to work in the US?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Yes");
    assert.equal(r.canonical, "AUTHORIZED_TO_WORK");
  });

  it("resolves sponsorship requirement", async () => {
    const r = await resolveField("Will you require visa sponsorship?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Yes");
    assert.equal(r.canonical, "REQUIRES_SPONSORSHIP");
  });

  it("resolves salary expectation", async () => {
    const r = await resolveField("What are your compensation expectations?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Open to discussion");
  });

  it("resolves how did you hear", async () => {
    const r = await resolveField("How did you hear about this role?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "Company website");
  });

  it("resolves veteran status", async () => {
    const r = await resolveField("Are you a veteran?", "text", null, profile, { useLLM: false });
    assert.equal(r.value, "No");
  });

  it("returns none for unrecognized labels without LLM", async () => {
    const r = await resolveField("What is your favorite color?", "text", null, profile, { useLLM: false });
    assert.equal(r.source, "none");
    assert.equal(r.value, null);
  });
});

describe("getSynonyms", () => {
  it("returns synonyms for yes", () => {
    const syns = getSynonyms("Yes");
    assert.ok(syns.includes("Yes"));
    assert.ok(syns.includes("True") || syns.includes("Y"));
  });

  it("returns synonyms for asian", () => {
    const syns = getSynonyms("Asian");
    assert.ok(syns.length > 1);
  });

  it("returns original value for unknown input", () => {
    const syns = getSynonyms("xyzunknown");
    assert.deepEqual(syns, ["xyzunknown"]);
  });

  it("handles null", () => {
    const syns = getSynonyms(null);
    assert.deepEqual(syns, [null]);
  });
});
