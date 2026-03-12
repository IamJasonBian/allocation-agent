#!/usr/bin/env node

/**
 * Smart Auto-Apply with Competitive Research
 *
 * Enhanced workflow:
 * 1. Get Chrome tabs and parse job URLs
 * 2. For each job:
 *    a. Fetch job description
 *    b. Run company tech stack lookup (company_stack_lookup.py)
 *    c. Generate tailored "why this company" using research
 *    d. Match JD to relevant STAR examples (jd_star_integration.py)
 *    e. Auto-fill form with personalized content
 *    f. Submit (or save for review)
 *
 * Usage:
 *   node scripts/smart-apply-with-research.mjs [--dry-run] [--limit N] [--research-only]
 */

import { execSync, spawn } from "child_process";
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const isDryRun = process.argv.includes("--dry-run");
const researchOnly = process.argv.includes("--research-only");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex !== -1 ? parseInt(process.argv[limitIndex + 1], 10) : Infinity;

// ── Configuration ──

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RESEARCH_CACHE = resolve(process.cwd(), "research_cache.json");

// ── Get Chrome tabs ──

function getChromeTabURLs() {
  try {
    const script = `
      tell application "Google Chrome"
        set urlList to {}
        repeat with w in windows
          repeat with t in tabs of w
            set end of urlList to URL of t
          end repeat
        end repeat
        return urlList
      end tell
    `;
    const output = execSync(`osascript -e '${script}'`, { encoding: "utf8" });
    return output.split(", ").map(url => url.trim());
  } catch (err) {
    console.error("Failed to get Chrome tabs:", err.message);
    return [];
  }
}

// ── Parse job URLs ──

function parseJobURL(url) {
  if (url.includes("linkedin.com")) return null;

  // Greenhouse
  if (url.includes("greenhouse.io") || url.includes("greenhouse")) {
    const match = url.match(/greenhouse(?:\.io)?\/([^/]+)\/jobs\/(\d+)/);
    if (match) {
      return {
        platform: "greenhouse",
        company: match[1],
        jobId: match[2],
        url,
      };
    }
  }

  // Ashby
  if (url.includes("ashbyhq.com") || url.includes("ashby_jid=")) {
    const jidMatch = url.match(/ashby_jid=([a-f0-9-]+)/);
    const companyMatch = url.match(/https?:\/\/([^.]+)\./);
    if (jidMatch) {
      return {
        platform: "ashby",
        company: companyMatch?.[1] || "unknown",
        jobId: jidMatch[1],
        url,
      };
    }
  }

  // Lever
  if (url.includes("lever.co")) {
    const match = url.match(/lever\.co\/([^/]+)\/([a-f0-9-]+)/);
    if (match) {
      return {
        platform: "lever",
        company: match[1],
        jobId: match[2],
        url,
      };
    }
  }

  // YC jobs
  if (url.includes("ycombinator.com/companies")) {
    const match = url.match(/ycombinator\.com\/companies\/([^/]+)\/jobs\/([^?]+)/);
    if (match) {
      return {
        platform: "yc",
        company: match[1],
        jobId: match[2],
        url,
      };
    }
  }

  return null;
}

// ── Run Python research scripts ──

function runCompanyStackLookup(companyName) {
  console.log(`  [Research] Looking up tech stack for ${companyName}...`);

  try {
    const pythonScript = `
from company_stack_lookup import CompanyStackDatabase, PublicStackLookup
import json
import sys

db = CompanyStackDatabase()
lookup = PublicStackLookup(db)

company_name = "${companyName}"
result = lookup.lookup_all_sources(company_name)

# Print JSON to stdout
print(json.dumps(result.to_dict()))
`;

    const output = execSync(`python3 -c '${pythonScript}'`, {
      encoding: "utf8",
      env: { ...process.env, SERPER_API_KEY: process.env.SERPER_API_KEY }
    });

    const lines = output.split('\n');
    const jsonLine = lines.find(line => line.trim().startsWith('{'));

    if (jsonLine) {
      return JSON.parse(jsonLine);
    }

    return null;
  } catch (err) {
    console.error(`  [Research] Failed to lookup ${companyName}:`, err.message);
    return null;
  }
}

function runJDStarMatcher(jobDescription, companyName) {
  console.log(`  [Research] Matching JD to STAR examples...`);

  try {
    const pythonScript = `
from jd_star_integration import JDSTARIntegrationEngine
import json
import sys

engine = JDSTARIntegrationEngine()

jd_text = """${jobDescription.replace(/"/g, '\\"').replace(/\n/g, ' ')}"""
company_name = "${companyName}"

result = engine.process_job_posting(
    job_url="chrome_tab",
    job_title="Software Engineer",
    company_name=company_name,
    jd_text=jd_text
)

# Print JSON to stdout
output = {
    'matched_stars': result.get('matched_stars', []),
    'why_work_here': result.get('why_work_here', ''),
    'company_stack': result.get('company_stack', {})
}
print(json.dumps(output))
`;

    const output = execSync(`python3 -c '${pythonScript}'`, {
      encoding: "utf8",
      timeout: 30000
    });

    const lines = output.split('\n');
    const jsonLine = lines.find(line => line.trim().startsWith('{'));

    if (jsonLine) {
      return JSON.parse(jsonLine);
    }

    return null;
  } catch (err) {
    console.error(`  [Research] Failed to match STAR examples:`, err.message);
    return null;
  }
}

// ── Fetch job description ──

async function fetchJobDescription(job) {
  console.log(`  Fetching job description for ${job.company}...`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });

  try {
    const page = await browser.newPage();
    await page.goto(job.url, { waitUntil: "networkidle2", timeout: 30000 });

    // Extract text content
    const textContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    return textContent;
  } catch (err) {
    console.error(`  Failed to fetch JD:`, err.message);
    return "";
  } finally {
    await browser.close();
  }
}

// ── Generate tailored cover letter ──

function generateCoverLetter(job, research) {
  const { company_stack, matched_stars, why_work_here } = research;

  let letter = `Dear ${job.company} Hiring Team,\n\n`;

  // Why this company (from research)
  if (why_work_here) {
    letter += why_work_here + "\n\n";
  }

  // Tech stack alignment
  if (company_stack && company_stack.languages && company_stack.languages.length > 0) {
    const myStack = ["Python", "Java", "SQL", "JavaScript", "TypeScript"];
    const overlap = company_stack.languages.filter(lang =>
      myStack.some(myLang => myLang.toLowerCase() === lang.toLowerCase())
    );

    if (overlap.length > 0) {
      letter += `I noticed ${job.company} uses ${overlap.join(", ")} - technologies I've worked with extensively at Amazon. `;
      letter += `My experience building production ML systems with these tools directly translates to your stack.\n\n`;
    }
  }

  // Relevant STAR examples
  if (matched_stars && matched_stars.length > 0) {
    letter += `Some relevant experience I'd bring:\n`;
    matched_stars.slice(0, 2).forEach(star => {
      letter += `- ${star.situation}\n`;
    });
    letter += `\n`;
  }

  letter += `I'd love to discuss how my background in data engineering and ML infrastructure can contribute to ${job.company}'s mission.\n\n`;
  letter += `Best regards,\nJason Bian`;

  return letter;
}

// ── Main workflow ──

async function main() {
  console.log("="  .repeat(80));
  console.log("SMART AUTO-APPLY WITH RESEARCH");
  console.log("="  .repeat(80));
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Research: ${researchOnly ? "RESEARCH ONLY" : "FULL WORKFLOW"}`);
  console.log(`Limit: ${limit === Infinity ? "No limit" : limit}`);
  console.log("");

  // Step 1: Get Chrome tabs
  console.log("Step 1: Fetching Chrome tabs...");
  const allTabs = getChromeTabURLs();
  console.log(`  Found ${allTabs.length} total tabs`);

  // Step 2: Filter job application tabs
  console.log("\nStep 2: Filtering job application tabs...");
  const jobs = allTabs
    .map(parseJobURL)
    .filter(Boolean)
    .slice(0, limit);

  console.log(`  Found ${jobs.length} job application tabs:`);
  jobs.forEach(job => {
    console.log(`    - ${job.company} (${job.platform}): ${job.jobId}`);
  });

  // Step 3: Research each company
  console.log("\n" + "="  .repeat(80));
  console.log("RUNNING COMPETITIVE RESEARCH");
  console.log("="  .repeat(80));

  const researchResults = {};

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`\n[${i + 1}/${jobs.length}] ${job.company.toUpperCase()} - ${job.platform}`);
    console.log(`  URL: ${job.url}\n`);

    // Fetch job description
    const jobDescription = await fetchJobDescription(job);

    if (!jobDescription) {
      console.log(`  ⚠️  Failed to fetch job description, skipping research`);
      continue;
    }

    // Run company stack lookup
    const companyStack = runCompanyStackLookup(job.company);

    // Run JD-STAR matcher (includes company research)
    const starMatch = runJDStarMatcher(jobDescription, job.company);

    researchResults[job.company] = {
      job,
      jobDescription,
      companyStack,
      starMatch,
    };

    console.log(`  ✅ Research complete for ${job.company}`);

    if (companyStack) {
      console.log(`     - Languages: ${companyStack.languages?.join(", ") || "Unknown"}`);
      console.log(`     - Frameworks: ${companyStack.frameworks?.join(", ") || "Unknown"}`);
    }

    if (starMatch) {
      console.log(`     - Matched ${starMatch.matched_stars?.length || 0} STAR examples`);
      console.log(`     - Generated "why work here" statement`);
    }
  }

  // Save research cache
  writeFileSync(RESEARCH_CACHE, JSON.stringify(researchResults, null, 2));
  console.log(`\n✅ Research saved to ${RESEARCH_CACHE}`);

  if (researchOnly) {
    console.log("\n--research-only flag set, stopping here.");
    return;
  }

  // Step 4: Generate cover letters
  console.log("\n" + "="  .repeat(80));
  console.log("GENERATING TAILORED COVER LETTERS");
  console.log("="  .repeat(80));

  for (const [companyName, research] of Object.entries(researchResults)) {
    console.log(`\n${companyName}:`);

    const coverLetter = generateCoverLetter(research.job, {
      company_stack: research.companyStack,
      matched_stars: research.starMatch?.matched_stars || [],
      why_work_here: research.starMatch?.why_work_here || "",
    });

    console.log(coverLetter);
    console.log("-" .repeat(80));
  }

  console.log("\n" + "="  .repeat(80));
  console.log("NEXT STEPS:");
  console.log("="  .repeat(80));
  console.log("1. Review research_cache.json for all company insights");
  console.log("2. Use generated cover letters for applications");
  console.log("3. Run interactive-apply.mjs to submit with auto-fill");
  console.log("");
}

main().catch(console.error);
