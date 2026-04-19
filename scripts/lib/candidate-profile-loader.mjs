/**
 * Candidate-profile loader.
 *
 * Resolves a user's full application profile from one of two sources:
 *  1. Static file import (used for Aastha until her full profile is migrated
 *     into the crawler API).
 *  2. The crawler `/users` endpoint — pulls the `answers` blob and any
 *     uploaded resume variants, writes the first resume to /tmp for upload.
 *
 * Returns both shapes the batch-apply script expects:
 *   { profile, candidate, resumePath }
 *
 *   - `profile` — rich object passed to field-resolver (50+ fields)
 *   - `candidate` — subset used directly by the form-fill calls
 *   - `resumePath` — local file path Puppeteer can upload
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AASTHA_ID = "aastha.aggarwal1@gmail.com";

export async function loadProfile({ userId, crawlerApi }) {
  if (!userId) throw new Error("loadProfile: userId is required");

  if (userId === AASTHA_ID) {
    const { profile } = await import("./candidate-profile-aastha.mjs");
    return { profile, candidate: toCandidate(profile, userId), resumePath: profile.resumePath };
  }

  const res = await fetch(`${crawlerApi}/users?id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`fetch user ${userId} failed: ${res.status}`);
  const data = await res.json();
  const user = data.user || data;
  const answers = user.answers || {};

  const resumePath = await downloadFirstResume(crawlerApi, userId, user.resumes || []);
  const profile = toProfile(answers, resumePath);
  return { profile, candidate: toCandidate(profile, userId), resumePath };
}

async function downloadFirstResume(crawlerApi, userId, variants) {
  if (!variants.length) return null;
  const chosen = variants[0];
  if (!chosen.blob_key) return null;
  const res = await fetch(`${crawlerApi}/users?blob=${encodeURIComponent(chosen.blob_key)}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const outDir = resolve(tmpdir(), "apply-resumes");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const safe = userId.replace(/[^a-z0-9]/gi, "_");
  const path = resolve(outDir, `${safe}.pdf`);
  writeFileSync(path, buf);
  return path;
}

// Maps a flat answers blob (from POST /users) into the shape field-resolver
// expects. Anything missing stays empty — field-resolver will fall through to
// the LLM layer for those questions.
function toProfile(a, resumePath) {
  const full = `${a.firstName || ""} ${a.lastName || ""}`.trim();
  return {
    firstName: a.firstName || "",
    lastName: a.lastName || "",
    fullName: full,
    preferredFirstName: a.firstName || "",
    legalFirstName: a.firstName || "",
    legalLastName: a.lastName || "",
    email: a.email || "",
    phone: a.phone || "",
    phoneRaw: (a.phone || "").replace(/\D/g, ""),
    linkedIn: a.linkedIn || "",

    city: splitLocation(a.location).city,
    state: splitLocation(a.location).state,
    stateAbbrev: splitLocation(a.location).state,
    zip: a.zip || "",
    country: a.country || "United States",
    location: a.location || "",
    address: a.location || "",
    willingToRelocate: a.willingToRelocate !== "false",
    relocateDetails: a.relocateDetails || "",

    authorizedToWork: a.authorizedToWork === "true",
    requiresSponsorship: a.requiresSponsorship === "true",

    school: a.school || "",
    degree: a.degree || "",
    degreeShort: a.degreeShort || "",
    discipline: a.discipline || "",
    gpa: a.gpa || "",
    graduationMonth: parseMonth(a.eduEnd).month,
    graduationYear: parseMonth(a.eduEnd).year,
    eduStartMonth: parseMonth(a.eduStart).month,
    eduStartYear: parseMonth(a.eduStart).year,

    employer: a.employer || "",
    jobTitle: a.jobTitle || "",
    yearsExperience: a.yearsExperience || "",
    empStartMonth: parseMonth(a.empStart).monthNum,
    empStartYear: parseMonth(a.empStart).year,
    empEndMonth: parseMonth(a.empEnd).monthNum,
    empEndYear: parseMonth(a.empEnd).year,

    gender: a.gender || "",
    race: a.race || "",
    hispanicLatino: a.hispanicLatino || "",
    sexualOrientation: a.sexualOrientation || "",
    veteranStatus: a.veteranStatus || "",
    disability: a.disability || "",

    startDate: a.startDate || "Immediately",
    noticePeriod: a.noticePeriod || "None",
    salaryExpectation: a.salaryExpectation || "Open to discussion",
    howDidYouHear: a.howDidYouHear || "Company website",

    resumePath: resumePath || "",
    resumeText: a.resumeText || "",
  };
}

// The inline `candidate` object used by form-fill calls. Narrower than the
// full profile — sticks to the fields the script actually dereferences.
function toCandidate(p, userId) {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    linkedIn: p.linkedIn,
    location: p.location,
    authorizedToWork: p.authorizedToWork,
    requiresSponsorship: p.requiresSponsorship,
    veteranStatus: p.veteranStatus,
    userId,
    school: p.school,
    degree: p.degree,
    discipline: p.discipline,
    gpa: p.gpa,
    graduationMonth: p.graduationMonth,
    graduationYear: p.graduationYear,
    gender: p.gender,
    race: p.race,
    sexualOrientation: p.sexualOrientation,
    disability: p.disability,
    hispanicLatino: p.hispanicLatino,
    employer: p.employer,
    jobTitle: p.jobTitle,
    eduStartMonth: p.eduStartMonth,
    eduStartYear: p.eduStartYear,
    eduEndMonth: p.graduationMonth,
    eduEndYear: p.graduationYear,
    empStartMonth: p.empStartMonth,
    empStartYear: p.empStartYear,
    empEndMonth: p.empEndMonth,
    empEndYear: p.empEndYear,
    resumeText: p.resumeText,
  };
}

function splitLocation(loc) {
  if (!loc) return { city: "", state: "" };
  const parts = loc.split(",").map((s) => s.trim());
  return { city: parts[0] || "", state: parts[1] || "" };
}

// Accepts "MM/YYYY", "YYYY-MM", or "September 2023" — returns both month-name
// and month-number forms since different fields in the profile expect
// different formats.
function parseMonth(v) {
  if (!v) return { month: "", monthNum: "", year: "" };
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const slash = v.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (slash) {
    const m = parseInt(slash[1], 10);
    return { month: months[m - 1] || "", monthNum: String(m).padStart(2, "0"), year: slash[2] };
  }
  const iso = v.match(/^(\d{4})[/\-](\d{1,2})$/);
  if (iso) {
    const m = parseInt(iso[2], 10);
    return { month: months[m - 1] || "", monthNum: String(m).padStart(2, "0"), year: iso[1] };
  }
  const named = v.match(/^(\w+)\s+(\d{4})$/);
  if (named) {
    const idx = months.findIndex((m) => m.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3)));
    return { month: idx >= 0 ? months[idx] : named[1], monthNum: idx >= 0 ? String(idx + 1).padStart(2, "0") : "", year: named[2] };
  }
  return { month: v, monthNum: "", year: "" };
}
