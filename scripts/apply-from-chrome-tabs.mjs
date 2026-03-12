#!/usr/bin/env node

/**
 * Auto-apply to jobs from currently open Chrome tabs
 *
 * Workflow:
 * 1. Get all Chrome tab URLs
 * 2. Filter out LinkedIn and non-job-application tabs
 * 3. Parse each URL to identify platform (Greenhouse, Ashby, Lever, etc.)
 * 4. For each job:
 *    - Fetch job description and parse questions
 *    - Suggest simple responses for each question
 *    - Present to user for approval
 *    - Auto-fill and submit application
 *
 * Usage:
 *   node scripts/apply-from-chrome-tabs.mjs [--dry-run] [--limit N]
 */

import { execSync } from "child_process";
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";

const isDryRun = process.argv.includes("--dry-run");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex !== -1 ? parseInt(process.argv[limitIndex + 1], 10) : Infinity;

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

// ── Filter and parse job URLs ──

function parseJobURL(url) {
  // Skip LinkedIn
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

  // Dover
  if (url.includes("dover.com") || url.includes("dover.io")) {
    const match = url.match(/dover\.(?:com|io)\/([^/]+)\/jobs\/([a-f0-9-]+)/);
    if (match) {
      return {
        platform: "dover",
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

// ── Suggest answers for questions ──

function suggestAnswer(question, options = []) {
  const q = question.toLowerCase();

  // Yes/No questions
  if (options.includes("Yes") && options.includes("No")) {
    if (q.includes("authorized to work") || q.includes("legally authorized")) {
      return { answer: "Yes", confidence: "high", reason: "US work authorized" };
    }
    if (q.includes("sponsorship") || q.includes("require sponsor") || q.includes("visa")) {
      return { answer: "No", confidence: "high", reason: "No sponsorship needed" };
    }
    if (q.includes("previously applied") || q.includes("have you ever worked")) {
      return { answer: "No", confidence: "high", reason: "First application" };
    }
    if (q.includes("veteran") || q.includes("military")) {
      return { answer: "No", confidence: "high", reason: "Not a veteran" };
    }
    if (q.includes("privacy") || q.includes("consent") || q.includes("agree") || q.includes("acknowledge")) {
      return { answer: "Yes", confidence: "high", reason: "Standard consent" };
    }
    return { answer: "No", confidence: "low", reason: "Default conservative answer" };
  }

  // Text questions
  if (q.includes("linkedin")) {
    return { answer: "https://www.linkedin.com/in/jason-bian-7b9027a5/", confidence: "high", reason: "LinkedIn profile" };
  }
  if (q.includes("github")) {
    return { answer: "https://github.com/IamJasonBian", confidence: "high", reason: "GitHub profile" };
  }
  if (q.includes("website") || q.includes("portfolio")) {
    return { answer: "https://github.com/IamJasonBian", confidence: "medium", reason: "GitHub as portfolio" };
  }
  if (q.includes("how did you hear") || q.includes("referral") || q.includes("how did you find")) {
    return { answer: "Company website", confidence: "medium", reason: "Generic source" };
  }
  if (q.includes("salary") || q.includes("compensation")) {
    return { answer: "Open to discussion based on role and responsibilities", confidence: "high", reason: "Flexible on comp" };
  }
  if (q.includes("years of") && q.includes("experience")) {
    return { answer: "5+ years", confidence: "high", reason: "Based on resume" };
  }
  if (q.includes("current") && (q.includes("company") || q.includes("employer"))) {
    return { answer: "Amazon", confidence: "high", reason: "Current employer" };
  }
  if (q.includes("current") && (q.includes("title") || q.includes("role"))) {
    return { answer: "Data Engineer II", confidence: "high", reason: "Current title" };
  }
  if (q.includes("sponsorship") || q.includes("visa")) {
    return { answer: "No sponsorship needed - US work authorized", confidence: "high", reason: "Work authorization" };
  }
  if (q.includes("relocat") || q.includes("willing to move")) {
    return { answer: "Yes, open to relocation for the right opportunity", confidence: "medium", reason: "Flexible on location" };
  }
  if (q.includes("start date") || q.includes("available to start") || q.includes("earliest start")) {
    return { answer: "2 weeks notice", confidence: "high", reason: "Standard notice period" };
  }
  if (q.includes("location") || q.includes("where are you")) {
    return { answer: "New York, NY", confidence: "high", reason: "Current location" };
  }
  if (q.includes("cover letter")) {
    return { answer: "", confidence: "high", reason: "Skip optional cover letter" };
  }
  if (q.includes("additional") || q.includes("anything else")) {
    return { answer: "", confidence: "high", reason: "Skip optional field" };
  }

  // Select dropdown questions
  if (options.length > 0) {
    // Location preference
    if (q.includes("location") || q.includes("office") || q.includes("work location")) {
      const nyOption = options.find(o => o.toLowerCase().includes("new york"));
      if (nyOption) {
        return { answer: nyOption, confidence: "high", reason: "New York location match" };
      }
      const remoteOption = options.find(o => o.toLowerCase().includes("remote") || o.toLowerCase().includes("anywhere"));
      if (remoteOption) {
        return { answer: remoteOption, confidence: "medium", reason: "Remote option" };
      }
    }

    // How did you hear
    if (q.includes("how did you") || q.includes("hear about") || q.includes("source")) {
      const websiteOption = options.find(o => o.toLowerCase().includes("website") || o.toLowerCase().includes("career"));
      if (websiteOption) {
        return { answer: websiteOption, confidence: "medium", reason: "Found via website" };
      }
      const otherOption = options.find(o => o.toLowerCase().includes("other"));
      if (otherOption) {
        return { answer: otherOption, confidence: "low", reason: "Fallback to other" };
      }
    }

    // Privacy/consent
    if (q.includes("privacy") || q.includes("consent") || q.includes("acknowledge") || q.includes("agree")) {
      const acceptOption = options.find(o => o.toLowerCase().includes("accept") || o.toLowerCase().includes("agree") || o.toLowerCase().includes("yes"));
      if (acceptOption) {
        return { answer: acceptOption, confidence: "high", reason: "Accept terms" };
      }
    }

    // Default: first non-empty option
    const firstValid = options.find(o => o && o !== "Please select" && o !== "");
    if (firstValid) {
      return { answer: firstValid, confidence: "low", reason: "Default first option" };
    }
  }

  return { answer: "", confidence: "low", reason: "No suggestion available - manual review needed" };
}

// ── Fetch and parse job application form ──

async function fetchJobQuestions(job, chromePath) {
  console.log(`\n  Fetching application form for ${job.company} (${job.platform})...`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(job.url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for form to load
    await new Promise(r => setTimeout(r, 2000));

    // Extract questions based on platform
    const questions = await page.evaluate(() => {
      const results = [];

      // Standard HTML form fields
      document.querySelectorAll("input, select, textarea").forEach(el => {
        if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
        if (["first_name", "last_name", "email", "phone"].includes(el.id)) return;

        const container = el.closest(".field, fieldset, div, label");
        const labelEl = container?.querySelector("label") || container?.querySelector("[class*='label']");
        const label = labelEl?.textContent?.trim() || el.placeholder || el.name || "Unknown field";

        const options = el.tagName === "SELECT"
          ? Array.from(el.options).map(o => o.textContent.trim()).filter(t => t && t !== "Please select")
          : [];

        results.push({
          type: el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text",
          label: label.replace(/\s*\*\s*$/, ""),
          required: label.includes("*") || el.required,
          options,
          name: el.name,
          id: el.id,
        });
      });

      return results;
    });

    return questions;
  } catch (err) {
    console.error(`  Error fetching form: ${err.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

// ── Main ──

async function main() {
  console.log("=".repeat(80));
  console.log("AUTO-APPLY FROM CHROME TABS");
  console.log("=".repeat(80));
  console.log(`Mode: ${isDryRun ? "DRY RUN (no submissions)" : "LIVE (will submit applications)"}`);
  console.log(`Limit: ${limit === Infinity ? "No limit" : `${limit} jobs`}\n`);

  // Step 1: Get Chrome tabs
  console.log("Step 1: Fetching Chrome tabs...");
  const allURLs = getChromeTabURLs();
  console.log(`  Found ${allURLs.length} total tabs`);

  // Step 2: Filter and parse job URLs
  console.log("\nStep 2: Filtering job application tabs...");
  const jobs = allURLs
    .map(url => parseJobURL(url))
    .filter(job => job !== null)
    .slice(0, limit);

  console.log(`  Found ${jobs.length} job application tabs:`);
  for (const job of jobs) {
    console.log(`    - ${job.company} (${job.platform}): ${job.jobId}`);
  }

  if (jobs.length === 0) {
    console.log("\n  No job application tabs found. Exiting.");
    return;
  }

  // Step 3: Find Chrome path
  const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  // Step 4: Process each job
  console.log("\n" + "=".repeat(80));
  console.log("PROCESSING JOBS");
  console.log("=".repeat(80));

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`\n[${i + 1}/${jobs.length}] ${job.company.toUpperCase()} - ${job.platform}`);
    console.log(`  URL: ${job.url}`);

    // Fetch application form questions
    const questions = await fetchJobQuestions(job, chromePath);

    if (questions.length === 0) {
      console.log(`  ⚠️  No questions found - may be a confirmation page or unsupported platform`);
      continue;
    }

    console.log(`\n  Found ${questions.length} form fields:\n`);

    // Suggest answers for each question
    const suggestions = [];
    for (const q of questions) {
      const suggestion = suggestAnswer(q.label, q.options);
      suggestions.push({ ...q, ...suggestion });

      const confidenceIcon =
        suggestion.confidence === "high" ? "✅" :
        suggestion.confidence === "medium" ? "⚠️" :
        "❌";

      console.log(`  ${confidenceIcon} ${q.label}`);
      console.log(`     Type: ${q.type} | Required: ${q.required ? "Yes" : "No"}`);
      if (q.options.length > 0) {
        console.log(`     Options: ${q.options.slice(0, 3).join(", ")}${q.options.length > 3 ? "..." : ""}`);
      }
      console.log(`     Suggested Answer: "${suggestion.answer}"`);
      console.log(`     Reason: ${suggestion.reason}`);
      console.log();
    }

    // Check if any required fields have low confidence
    const lowConfidenceRequired = suggestions.filter(s => s.required && s.confidence === "low");
    if (lowConfidenceRequired.length > 0) {
      console.log(`  ⚠️  WARNING: ${lowConfidenceRequired.length} required field(s) need manual review:`);
      for (const field of lowConfidenceRequired) {
        console.log(`     - ${field.label}`);
      }
    }

    if (isDryRun) {
      console.log(`\n  DRY RUN: Would submit application with ${suggestions.length} fields filled`);
    } else {
      console.log(`\n  TODO: Implement actual submission for ${job.platform}`);
      console.log(`  This would require platform-specific auto-fill logic`);
    }

    console.log("\n" + "-".repeat(80));
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total jobs processed: ${jobs.length}`);
  console.log(`Mode: ${isDryRun ? "DRY RUN - no applications submitted" : "LIVE"}`);
  console.log("\nNext steps:");
  console.log("  1. Review suggested answers above");
  console.log("  2. For low-confidence fields, manually update suggestions in suggestAnswer()");
  console.log("  3. Remove --dry-run flag to submit applications");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
