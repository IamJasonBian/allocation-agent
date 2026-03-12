#!/usr/bin/env node

/**
 * Brute Force Job Application
 *
 * Aggressively tries to apply to ANY job by:
 * - Clicking all visible buttons
 * - Filling all visible inputs
 * - Uploading resume to all file inputs
 * - Answering all questions with best-effort heuristics
 * - Clicking through multi-step forms
 */

import puppeteer from "puppeteer-core";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RESUME_PATH = resolve(process.cwd(), "blob/resume_tmp.pdf");

const candidate = {
  firstName: "Jason",
  lastName: "Bian",
  fullName: "Jason Bian",
  email: "jason.bian64@gmail.com",
  phone: "+1-734-730-6569",
  phoneClean: "7347306569",
  linkedin: "https://www.linkedin.com/in/jason-bian-7b9027a5/",
  github: "https://github.com/IamJasonBian",
  location: "New York, NY",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "United States",
  currentCompany: "Amazon",
  currentTitle: "Data Engineer II",
  yearsExperience: 5,
  degree: "Bachelor of Science",
  major: "Computer Science",
  university: "University of Michigan",
  graduationYear: "2019",
};

// Comprehensive answer database for ANY question
const answerHeuristics = {
  // Personal info
  "name": candidate.fullName,
  "first": candidate.firstName,
  "last": candidate.lastName,
  "email": candidate.email,
  "phone": candidate.phone,
  "linkedin": candidate.linkedin,
  "github": candidate.github,
  "website": candidate.github,
  "portfolio": candidate.github,

  // Location
  "city": candidate.city,
  "state": candidate.state,
  "zip": candidate.zip,
  "country": candidate.country,
  "location": candidate.location,
  "address": candidate.location,

  // Work
  "company": candidate.currentCompany,
  "employer": candidate.currentCompany,
  "title": candidate.currentTitle,
  "position": candidate.currentTitle,
  "years": candidate.yearsExperience.toString(),
  "experience": candidate.yearsExperience.toString(),

  // Education
  "degree": candidate.degree,
  "major": candidate.major,
  "school": candidate.university,
  "university": candidate.university,
  "college": candidate.university,
  "graduation": candidate.graduationYear,

  // Common questions
  "why": "I'm excited about this opportunity because it aligns perfectly with my experience in ML infrastructure and data engineering at Amazon.",
  "interested": "I'm excited about this opportunity because it aligns perfectly with my experience in ML infrastructure and data engineering at Amazon.",
  "motivat": "I'm motivated by building scalable ML systems that solve real-world problems.",
  "hear": "LinkedIn",
  "referral": "LinkedIn",
  "source": "LinkedIn",

  // Authorization
  "authorized": "Yes",
  "authorization": "Yes",
  "eligib": "Yes",
  "legal": "Yes",
  "citizen": "Yes",
  "work": "Yes",

  // Sponsorship
  "sponsor": "No",
  "visa": "No",
  "h1b": "No",

  // Availability
  "start": "2 weeks",
  "available": "2 weeks",
  "notice": "2 weeks",
  "when": "2 weeks",

  // Salary
  "salary": "Market rate",
  "compensation": "Market rate",
  "pay": "Market rate",
  "expect": "Market rate",

  // Diversity
  "gender": "Male",
  "race": "Asian",
  "ethnicity": "Asian",
  "veteran": "No",
  "disability": "No",

  // References
  "reference": "Available upon request",

  // Default catch-all
  "default": "Yes"
};

function getAnswerForQuestion(question) {
  const q = question.toLowerCase();

  // Check each heuristic
  for (const [keyword, answer] of Object.entries(answerHeuristics)) {
    if (q.includes(keyword)) {
      return answer;
    }
  }

  // Default
  return answerHeuristics.default;
}

async function bruteForceApply(url, dryRun = true) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`BRUTE FORCE APPLICATION`);
  console.log(`${"=".repeat(80)}`);
  console.log(`URL: ${url}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();

    console.log(`🌐 Navigating to job...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Handle cookie banners
    console.log(`🍪 Handling cookie banners...`);
    const cookieButtons = await page.$$('button');
    for (const button of cookieButtons) {
      try {
        const text = await button.evaluate(el => el.textContent || '');
        if (text.toLowerCase().includes('accept all') || text.toLowerCase().includes('accept cookies')) {
          await button.click();
          console.log(`  ✅ Clicked: "${text}"`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      } catch (e) {}
    }

    let iteration = 1;
    let maxIterations = 10; // Safety limit

    while (iteration <= maxIterations) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`ITERATION ${iteration}/${maxIterations}`);
      console.log(`${"=".repeat(80)}`);

      // Step 1: Fill ALL text inputs (including required ones)
      console.log(`\n📝 Step 1: Filling all text inputs...`);
      const textInputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"], input:not([type]), input[required]');

      for (let i = 0; i < textInputs.length; i++) {
        try {
          const input = textInputs[i];

          // Check if visible
          const isVisible = await input.evaluate(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   rect.width > 0 && rect.height > 0;
          });

          if (!isVisible) continue;

          const currentValue = await input.evaluate(el => el.value);

          if (currentValue && currentValue.trim()) {
            // Already filled, skip
            continue;
          }

          const isRequired = await input.evaluate(el => el.required || el.hasAttribute('required') || el.getAttribute('aria-required') === 'true');
          const label = await page.evaluate(el => {
            const labelEl = el.labels?.[0];
            if (labelEl) return labelEl.textContent;
            const prevLabel = el.previousElementSibling;
            if (prevLabel?.tagName === 'LABEL') return prevLabel.textContent;
            const parentLabel = el.closest('label');
            if (parentLabel) return parentLabel.textContent;
            return el.placeholder || el.name || el.id || '';
          }, input);

          if (label || isRequired) {
            const answer = getAnswerForQuestion(label || "default");
            await input.click({clickCount: 3}); // Select all existing text
            await page.keyboard.press('Backspace'); // Clear
            await input.type(answer, { delay: 30 });
            console.log(`  ✅ Filled${isRequired ? ' (REQUIRED)' : ''}: "${label?.substring(0, 50) || 'unknown'}" = "${answer.substring(0, 30)}"`);
          }
        } catch (e) {
          // Skip errors
        }
      }

      // Step 2: Fill ALL textareas
      console.log(`\n📝 Step 2: Filling all textareas...`);
      const textareas = await page.$$('textarea');

      for (const textarea of textareas) {
        try {
          const currentValue = await textarea.evaluate(el => el.value);
          if (currentValue) continue;

          const label = await page.evaluate(el => {
            const labelEl = el.labels?.[0];
            if (labelEl) return labelEl.textContent;
            return el.placeholder || el.name || '';
          }, textarea);

          const answer = getAnswerForQuestion(label || "why interested");
          await textarea.click();
          await textarea.type(answer, { delay: 20 });
          console.log(`  ✅ Filled textarea: "${label?.substring(0, 50)}" = "${answer.substring(0, 30)}..."`);
        } catch (e) {}
      }

      // Step 3: Select ALL dropdowns (prioritize required ones)
      console.log(`\n📝 Step 3: Selecting from all dropdowns...`);
      const selects = await page.$$('select');

      for (const select of selects) {
        try {
          // Check if visible
          const isVisible = await select.evaluate(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   rect.width > 0 && rect.height > 0;
          });

          if (!isVisible) continue;

          const isRequired = await select.evaluate(el => el.required || el.hasAttribute('required'));
          const currentValue = await select.evaluate(el => el.value);

          // Skip if already selected (and not empty)
          if (currentValue && currentValue.trim() && currentValue !== 'Select an option') {
            continue;
          }

          const label = await page.evaluate(el => {
            const labelEl = el.labels?.[0];
            if (labelEl) return labelEl.textContent;
            const prevLabel = el.previousElementSibling;
            if (prevLabel?.tagName === 'LABEL') return prevLabel.textContent;
            return el.name || el.id || '';
          }, select);

          const options = await select.$$('option');
          if (options.length > 1) {
            const answer = getAnswerForQuestion(label || "");

            // Try to find matching option
            let matched = false;
            for (const option of options) {
              const text = await option.evaluate(el => el.textContent.toLowerCase().trim());
              const value = await option.evaluate(el => el.value);

              // Skip empty/placeholder options
              if (!value || value === '' || text === 'select an option') continue;

              if (text.includes(answer.toLowerCase()) || answer.toLowerCase().includes(text)) {
                await select.select(value);
                console.log(`  ✅ Selected${isRequired ? ' (REQUIRED)' : ''}: "${label}" = "${text}"`);
                matched = true;
                break;
              }
            }

            if (!matched && options[1]) {
              // Select second option as default (skip first which is usually placeholder)
              const value = await options[1].evaluate(el => el.value);
              if (value && value.trim()) {
                await select.select(value);
                const text = await options[1].evaluate(el => el.textContent);
                console.log(`  ✅ Selected (default)${isRequired ? ' (REQUIRED)' : ''}: "${label}" = "${text.trim()}"`);
              }
            }
          }
        } catch (e) {}
      }

      // Step 4: Upload resume to ALL file inputs
      console.log(`\n📎 Step 4: Uploading resume to all file inputs...`);
      const fileInputs = await page.$$('input[type="file"]');

      for (const fileInput of fileInputs) {
        try {
          await fileInput.uploadFile(RESUME_PATH);
          console.log(`  ✅ Resume uploaded`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {}
      }

      // Step 5: Check ALL checkboxes (if needed)
      console.log(`\n☑️  Step 5: Checking required checkboxes...`);
      const checkboxes = await page.$$('input[type="checkbox"]');

      for (const checkbox of checkboxes) {
        try {
          const isRequired = await checkbox.evaluate(el => el.required || el.hasAttribute('required'));
          const isChecked = await checkbox.evaluate(el => el.checked);

          if (isRequired && !isChecked) {
            await checkbox.click();
            console.log(`  ✅ Checked required checkbox`);
          }
        } catch (e) {}
      }

      // Step 6: Click "Next" or "Continue" buttons
      console.log(`\n👉 Step 6: Looking for Next/Continue buttons...`);
      const allButtons = await page.$$('button, input[type="submit"], a[role="button"]');

      let clickedNext = false;
      for (const button of allButtons) {
        try {
          const text = await button.evaluate(el => el.textContent || el.value || '');
          const textLower = text.toLowerCase().trim();
          const isVisible = await button.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });

          if ((textLower.includes('next') || textLower.includes('continue') || textLower.includes('proceed')) && isVisible) {
            console.log(`  🔘 Found button: "${text.trim()}"`);

            // Try to click with JavaScript if normal click fails
            try {
              await button.click();
            } catch {
              await button.evaluate(el => el.click());
            }

            console.log(`  ✅ Clicked: "${text.trim()}"`);
            clickedNext = true;
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for page load
            break;
          }
        } catch (e) {
          console.log(`  ⚠️  Error clicking button: ${e.message}`);
        }
      }

      if (!clickedNext) {
        console.log(`  ℹ️  No Next/Continue button found`);

        // Look for Submit button
        console.log(`\n🚀 Step 7: Looking for Submit button...`);
        for (const button of allButtons) {
          try {
            const text = await button.evaluate(el => el.textContent || el.value || '');
            const textLower = text.toLowerCase();

            if (textLower.includes('submit') || textLower.includes('apply')) {
              console.log(`  🔘 Found SUBMIT button: "${text}"`);

              if (!dryRun) {
                console.log(`  ⚠️  Ready to submit! Review the form before clicking.`);
              } else {
                console.log(`  ℹ️  Would submit (dry run mode)`);
              }

              // We're done
              iteration = maxIterations + 1;
              break;
            }
          } catch (e) {}
        }

        break; // Exit loop if no next button
      }

      iteration++;
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`BRUTE FORCE COMPLETE`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Iterations: ${iteration - 1}`);
    console.log(`Browser will stay open for ${dryRun ? '60' : '120'} seconds...`);
    console.log();

    await new Promise(resolve => setTimeout(resolve, dryRun ? 60000 : 120000));

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    await browser.close();
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const dryRun = !process.argv.includes('--live');

  if (!url) {
    console.log('Usage: node brute-force-apply.mjs <url> [--live]');
    console.log();
    console.log('This script will aggressively try to apply to ANY job by:');
    console.log('  - Filling ALL text inputs with best-effort answers');
    console.log('  - Uploading resume to ALL file inputs');
    console.log('  - Selecting from ALL dropdowns');
    console.log('  - Clicking through multi-step forms');
    console.log('  - Finding and preparing Submit button');
    console.log();
    console.log('Examples:');
    console.log('  node brute-force-apply.mjs "https://jobs.mckinsey.com/..."');
    console.log('  node brute-force-apply.mjs "https://jobs.mckinsey.com/..." --live');
    process.exit(1);
  }

  bruteForceApply(url, dryRun).catch(console.error);
}

export { bruteForceApply };
