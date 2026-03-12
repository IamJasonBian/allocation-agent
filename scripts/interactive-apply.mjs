#!/usr/bin/env node

/**
 * Interactive Auto-Apply - Fill forms live with user input for gaps
 *
 * Workflow:
 * 1. Get Chrome tabs and parse job URLs
 * 2. For each job, open the form in Puppeteer
 * 3. Auto-fill fields we're confident about
 * 4. PAUSE and prompt user for low-confidence fields
 * 5. Submit with user confirmation
 *
 * Usage:
 *   node scripts/interactive-apply.mjs [--limit N]
 */

import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { existsSync } from "fs";
import { resolve } from "path";

const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex !== -1 ? parseInt(process.argv[limitIndex + 1], 10) : Infinity;

const RESUME_PDF_PATH = process.env.RESUME_PATH || resolve(process.cwd(), "blob/resume_tmp.pdf");

const candidate = {
  firstName: "Jason",
  lastName: "Bian",
  email: "jason.bian64@gmail.com",
  phone: "+1-734-730-6569",
  linkedin: "https://www.linkedin.com/in/jason-bian-7b9027a5/",
  github: "https://github.com/IamJasonBian",
  location: "New York, NY",
  currentCompany: "Amazon",
  currentTitle: "Data Engineer II",
  yearsExperience: "5+",
  authorizedToWork: true,
  requiresSponsorship: false,
};

// ── Readline helper for user input ──

function askUser(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

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
    const companyMatch = url.match(/https?:\/\/(?:jobs\.ashbyhq\.com\/)?([^.\/]+)/);
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

  return null;
}

// ── Answer suggestion helper ──

function getAutoAnswer(label, options = []) {
  const q = label.toLowerCase();

  // Yes/No questions
  if (options.includes("Yes") && options.includes("No")) {
    if (q.includes("authorized to work") || q.includes("legally authorized")) return "Yes";
    if (q.includes("sponsorship") || q.includes("require sponsor") || q.includes("visa")) return "No";
    if (q.includes("previously applied")) return "No";
    if (q.includes("veteran") || q.includes("military")) return "No";
    if (q.includes("privacy") || q.includes("consent") || q.includes("agree")) return "Yes";
    return null; // Needs user input
  }

  // Text questions with high confidence
  if (q.includes("linkedin")) return candidate.linkedin;
  if (q.includes("github")) return candidate.github;
  if (q.includes("website") || q.includes("portfolio")) return candidate.github;
  if (q.includes("current") && (q.includes("company") || q.includes("employer"))) return candidate.currentCompany;
  if (q.includes("current") && (q.includes("title") || q.includes("role"))) return candidate.currentTitle;
  if (q.includes("years of") && q.includes("experience")) return candidate.yearsExperience;
  if (q.includes("location") || q.includes("where are you")) return candidate.location;

  // Medium confidence - return null to prompt user
  if (q.includes("how did you hear")) return null;
  if (q.includes("salary") || q.includes("compensation")) return null;
  if (q.includes("why are you interested") || q.includes("why do you want")) return null;
  if (q.includes("cover letter")) return null;

  return null; // Unknown field - needs user input
}

// ── Fill form interactively ──

async function fillFormInteractively(page, job) {
  console.log("\n📝 Filling form fields...\n");

  // Fill basic fields
  await page.type("#first_name", candidate.firstName, { delay: 30 });
  await page.type("#last_name", candidate.lastName, { delay: 30 });
  await page.type("#email", candidate.email, { delay: 30 });
  const phoneField = await page.$("#phone");
  if (phoneField) await phoneField.type(candidate.phone, { delay: 30 });

  console.log("✅ Basic info: Jason Bian, jason.bian64@gmail.com, +1-734-730-6569");

  // Upload resume if available
  if (existsSync(RESUME_PDF_PATH)) {
    const fileInput = await page.$("#s3_upload_for_resume input[type='file']");
    if (fileInput) {
      await fileInput.uploadFile(RESUME_PDF_PATH);
      await new Promise(r => setTimeout(r, 3000));
      console.log("✅ Resume uploaded");
    }
  }

  // Get all form questions
  const questions = await page.evaluate(() => {
    const results = [];

    // Text/textarea questions
    document.querySelectorAll("input[type='text'][name*='answers_attributes'], textarea[name*='answers_attributes']").forEach(el => {
      const container = el.closest(".field") || el.closest("fieldset");
      const labelEl = container?.querySelector("label");
      const label = labelEl?.textContent?.trim() || "";
      if (!["first_name", "last_name", "email", "phone"].includes(el.id)) {
        results.push({
          type: el.tagName === "TEXTAREA" ? "textarea" : "text",
          label: label.replace(/\s*\*\s*$/, ""),
          name: el.name,
          required: label.includes("*"),
        });
      }
    });

    // Select questions
    document.querySelectorAll("select[name*='answers_attributes']").forEach(el => {
      const container = el.closest(".field") || el.closest("fieldset");
      const labelEl = container?.querySelector("label");
      const label = labelEl?.textContent?.trim() || "";
      const options = Array.from(el.options).map(o => o.textContent.trim()).filter(t => t && t !== "Please select");
      results.push({
        type: "select",
        label: label.replace(/\s*\*\s*$/, ""),
        name: el.name,
        id: el.id,
        options,
        required: label.includes("*"),
      });
    });

    return results;
  });

  console.log(`\nFound ${questions.length} application questions\n`);

  // Process each question
  for (const q of questions) {
    const autoAnswer = getAutoAnswer(q.label, q.options);

    if (autoAnswer !== null) {
      // Auto-fill with confidence
      console.log(`✅ ${q.label}`);
      console.log(`   Auto-filling: "${autoAnswer}"\n`);

      if (q.type === "select") {
        const optionValue = await page.evaluate((id, text) => {
          const select = document.querySelector(`#${id}`);
          if (!select) return null;
          for (const opt of select.options) {
            if (opt.textContent.trim() === text) return opt.value;
          }
          return null;
        }, q.id, autoAnswer);

        if (optionValue) {
          await page.evaluate((id, val) => {
            const select = document.querySelector(`#${id}`);
            if (select) {
              select.value = val;
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, q.id, optionValue);
        }
      } else {
        await page.evaluate((name, val) => {
          const el = document.querySelector(`[name="${name}"]`);
          if (el) {
            el.focus();
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, q.name, autoAnswer);
      }
    } else {
      // Need user input
      console.log(`❓ ${q.label}`);
      if (q.type === "select" && q.options.length > 0) {
        console.log(`   Options: ${q.options.join(", ")}`);
      }
      console.log(`   Required: ${q.required ? "Yes" : "No"}`);

      const userAnswer = await askUser(`   Your answer (press Enter to skip): `);
      console.log();

      if (userAnswer) {
        if (q.type === "select") {
          const optionValue = await page.evaluate((id, text) => {
            const select = document.querySelector(`#${id}`);
            if (!select) return null;
            for (const opt of select.options) {
              if (opt.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
                return opt.value;
              }
            }
            return null;
          }, q.id, userAnswer);

          if (optionValue) {
            await page.evaluate((id, val) => {
              const select = document.querySelector(`#${id}`);
              if (select) {
                select.value = val;
                select.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }, q.id, optionValue);
            console.log(`   ✅ Set to: "${userAnswer}"\n`);
          }
        } else {
          await page.evaluate((name, val) => {
            const el = document.querySelector(`[name="${name}"]`);
            if (el) {
              el.focus();
              el.value = val;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }, q.name, userAnswer);
          console.log(`   ✅ Filled with your answer\n`);
        }
      } else {
        console.log(`   ⏭️  Skipped\n`);
      }
    }
  }

  // Take screenshot for review
  await page.screenshot({ path: `/tmp/form_filled_${job.company}.png`, fullPage: true });
  console.log(`\n📸 Screenshot saved: /tmp/form_filled_${job.company}.png`);
}

// ── Main ──

async function main() {
  console.log("=".repeat(80));
  console.log("INTERACTIVE AUTO-APPLY FROM CHROME TABS");
  console.log("=".repeat(80));
  console.log("I'll auto-fill what I know and ask you for the rest!\n");

  // Get Chrome tabs
  const allURLs = getChromeTabURLs();
  console.log(`Found ${allURLs.length} Chrome tabs`);

  // Parse job URLs
  const jobs = allURLs
    .map(url => parseJobURL(url))
    .filter(job => job !== null)
    .slice(0, limit);

  console.log(`Filtered to ${jobs.length} job applications\n`);

  if (jobs.length === 0) {
    console.log("No job application tabs found. Exiting.");
    return;
  }

  // List jobs
  console.log("Jobs to process:");
  jobs.forEach((job, i) => {
    console.log(`  ${i + 1}. ${job.company} (${job.platform})`);
  });
  console.log();

  const confirmStart = await askUser("Ready to start? (y/n): ");
  if (confirmStart.toLowerCase() !== "y") {
    console.log("Cancelled.");
    return;
  }

  // Find Chrome
  const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  // Process each job
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    console.log("\n" + "=".repeat(80));
    console.log(`[${i + 1}/${jobs.length}] ${job.company.toUpperCase()} - ${job.platform}`);
    console.log("=".repeat(80));
    console.log(`URL: ${job.url}\n`);

    const confirmJob = await askUser(`Process this job? (y/n/q to quit): `);
    if (confirmJob.toLowerCase() === "q") {
      console.log("Quitting...");
      break;
    }
    if (confirmJob.toLowerCase() !== "y") {
      console.log("Skipping...\n");
      continue;
    }

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false, // Show browser so user can see
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(job.url, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for form
      await new Promise(r => setTimeout(r, 2000));

      // Check if it's a Greenhouse old-style form
      const isGreenhouseOld = await page.evaluate(() => !!document.querySelector("#application_form"));

      if (isGreenhouseOld) {
        console.log("✅ Detected Greenhouse classic form\n");
        await page.waitForSelector("#first_name", { timeout: 5000 });
        await fillFormInteractively(page, job);

        console.log("\n" + "=".repeat(80));
        console.log("FORM FILLED - READY TO SUBMIT");
        console.log("=".repeat(80));
        console.log("Please review the form in the browser window.");
        console.log("Screenshot saved at: /tmp/form_filled_" + job.company + ".png\n");

        const confirmSubmit = await askUser("Submit this application? (y/n): ");

        if (confirmSubmit.toLowerCase() === "y") {
          console.log("\n🚀 Submitting...");
          await page.evaluate(() => document.querySelector("#submit_app")?.click());
          await new Promise(r => setTimeout(r, 5000));

          const finalUrl = page.url();
          if (finalUrl.includes("confirmation") || finalUrl.includes("thank")) {
            console.log("✅ SUCCESS - Application submitted!\n");
          } else {
            console.log("⚠️  Submitted, but confirmation unclear. Check the browser.\n");
          }
        } else {
          console.log("❌ Submission cancelled\n");
        }
      } else {
        console.log("⚠️  Non-Greenhouse or new-style form - please fill manually");
        console.log("Browser will stay open for manual completion.\n");
        await askUser("Press Enter when done (browser will close): ");
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
    } finally {
      await browser.close();
    }

    console.log("\n");
  }

  console.log("=".repeat(80));
  console.log("ALL DONE!");
  console.log("=".repeat(80));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
