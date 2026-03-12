#!/usr/bin/env node

/**
 * Minimal Answer Generator
 *
 * Generates short, factual answers to unexpected application questions
 * using pattern matching and backup heuristics.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const heuristicPath = resolve(process.cwd(), "scripts/minimal-answer-heuristic.json");
const heuristic = JSON.parse(readFileSync(heuristicPath, "utf8"));

function findMatchingPattern(question) {
  const questionLower = question.toLowerCase();

  for (const [key, config] of Object.entries(heuristic.question_patterns)) {
    if (key === "default_fallback") continue;

    const patterns = config.pattern;
    for (const pattern of patterns) {
      if (questionLower.includes(pattern.toLowerCase())) {
        return config.answer;
      }
    }
  }

  return heuristic.question_patterns.default_fallback.answer;
}

function getCompanySpecificAnswer(question, company) {
  const questionLower = question.toLowerCase();
  const companyLower = company?.toLowerCase();

  // Check for company-specific overrides
  if (companyLower && heuristic.company_specific_overrides[companyLower]) {
    const overrides = heuristic.company_specific_overrides[companyLower];

    if (questionLower.includes("why") && (questionLower.includes("company") || questionLower.includes("us"))) {
      return overrides.why_this_company;
    }

    if (questionLower.includes("long term") || questionLower.includes("career goal")) {
      return overrides.long_term_goals;
    }
  }

  return null;
}

function generateAnswer(question, company = null) {
  // Try company-specific first
  const companyAnswer = getCompanySpecificAnswer(question, company);
  if (companyAnswer) {
    return companyAnswer;
  }

  // Fall back to pattern matching
  return findMatchingPattern(question);
}

// CLI usage
if (process.argv.length > 2) {
  const question = process.argv[2];
  const company = process.argv[3] || null;

  console.log(`Question: ${question}`);
  if (company) {
    console.log(`Company: ${company}`);
  }
  console.log(`Answer: ${generateAnswer(question, company)}`);
} else {
  // Interactive mode
  console.log("Minimal Answer Generator");
  console.log("=" .repeat(60));
  console.log();

  const testQuestions = [
    { q: "What are your salary expectations?", c: null },
    { q: "When can you start?", c: null },
    { q: "Why do you want to work at Anthropic?", c: "anthropic" },
    { q: "Why are you interested in Galaxy Digital?", c: "galaxy" },
    { q: "What is your greatest strength?", c: null },
    { q: "Tell me about a time you failed", c: null },
    { q: "Are you interviewing elsewhere?", c: null },
  ];

  testQuestions.forEach(({ q, c }) => {
    console.log(`Q: ${q}`);
    if (c) console.log(`   (Company: ${c})`);
    console.log(`A: ${generateAnswer(q, c)}`);
    console.log();
  });

  console.log("=" .repeat(60));
  console.log("Usage: node answer-generator.mjs \"<question>\" [company]");
}

export { generateAnswer, findMatchingPattern };
