/**
 * Normalized job shape.
 *
 * Every ATS source (greenhouse, lever, ashby, workable, ...) returns an
 * array of NormalizedJob so the runner doesn't care where a job came from.
 *
 * Fields mirror the Redis hash schema in REDIS_SCHEMA_AND_API_FLOWS.md plus
 * the new quality-related fields the blog post recommends.
 *
 * @typedef {Object} NormalizedJob
 * @property {string}  job_id              ATS-native id
 * @property {string}  company             boardToken (primary key piece)
 * @property {string}  company_name        Display name
 * @property {string}  ats                 "greenhouse" | "lever" | "ashby" | "workable"
 * @property {string}  title
 * @property {string}  location
 * @property {string}  department
 * @property {string}  url                 Direct apply URL
 * @property {string}  posted_at           ISO timestamp if the ATS gives it
 * @property {string}  updated_at          ISO timestamp if the ATS gives it
 * @property {string}  host                Hostname for per-host queue politeness
 * @property {string}  content_hash        16-char SHA256 of title|location|dept
 * @property {string[]} tags               lowercase, deduped
 * @property {number}  tier                1 = Official API, 2 = HTML, ...
 */

import { createHash } from "node:crypto";

export function contentHash(title, location, department) {
  return createHash("sha256")
    .update(`${title || ""}|${location || ""}|${department || ""}`)
    .digest("hex")
    .slice(0, 16);
}

export function extractTags(title, department = "", body = "") {
  const t = `${title || ""} ${department || ""} ${body || ""}`.toLowerCase();
  const tags = new Set();
  if (t.includes("quant")) tags.add("quantitative");
  if (t.includes("data")) tags.add("data");
  if (t.includes("engineer") || t.includes("software")) tags.add("engineering");
  if (t.includes("research")) tags.add("research");
  if (/\bml\b|machine learning|\bai\b|\bllm\b/.test(t)) tags.add("ml");
  if (t.includes("analyst")) tags.add("analyst");
  if (t.includes("associate")) tags.add("associate");
  if (t.includes("intern")) tags.add("intern");
  if (t.includes("trad")) tags.add("trading");
  if (t.includes("infra")) tags.add("infrastructure");
  if (/devops|sre|reliability/.test(t)) tags.add("devops");
  if (t.includes("finance")) tags.add("finance");
  if (t.includes("investment")) tags.add("investment");
  if (t.includes("bank")) tags.add("banking");
  if (t.includes("equity")) tags.add("equity");
  return Array.from(tags).sort();
}
