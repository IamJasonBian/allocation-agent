#!/usr/bin/env node

/**
 * Non-Standard Job Portal Automation
 *
 * Handles company-specific career sites that don't use standard ATS:
 * - McKinsey Careers (jobs.mckinsey.com)
 * - Workday-based systems
 * - SAP SuccessFactors
 * - Custom internal portals
 * - Taleo
 * - iCIMS
 */

import puppeteer from "puppeteer-core";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { logSubmission } from "./submission-tracker.mjs";

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
  country: "United States",
  zipCode: "10001",
  currentCompany: "Amazon",
  currentTitle: "Data Engineer II",
  yearsExperience: 5,
  degree: "Bachelor of Science",
  major: "Computer Science",
  university: "University of Michigan",
  graduationYear: "2019",
};

// Platform detection patterns
const PLATFORM_PATTERNS = {
  mckinsey: {
    urlPattern: /jobs\.mckinsey\.com/,
    name: "McKinsey Careers",
    type: "custom"
  },
  workday: {
    urlPattern: /myworkdayjobs\.com/,
    name: "Workday",
    type: "workday"
  },
  successfactors: {
    urlPattern: /successfactors\.com|sfcareer/,
    name: "SAP SuccessFactors",
    type: "successfactors"
  },
  taleo: {
    urlPattern: /taleo\.net/,
    name: "Oracle Taleo",
    type: "taleo"
  },
  icims: {
    urlPattern: /icims\.com/,
    name: "iCIMS",
    type: "icims"
  },
  jobvite: {
    urlPattern: /jobvite\.com/,
    name: "Jobvite",
    type: "jobvite"
  },
  smartrecruiters: {
    urlPattern: /smartrecruiters\.com/,
    name: "SmartRecruiters",
    type: "smartrecruiters"
  },
  bamboohr: {
    urlPattern: /bamboohr\.com/,
    name: "BambooHR",
    type: "bamboohr"
  }
};

function detectPlatform(url) {
  for (const [key, config] of Object.entries(PLATFORM_PATTERNS)) {
    if (config.urlPattern.test(url)) {
      return { platform: key, ...config };
    }
  }
  return { platform: "unknown", name: "Unknown", type: "custom" };
}

// McKinsey-specific automation
async function fillMcKinseyApplication(page, jobData) {
  console.log(`\n📝 Filling McKinsey application...`);

  try {
    // Wait for form to load
    await page.waitForSelector('input, select, textarea', { timeout: 10000 });

    // McKinsey typically has:
    // - Personal info (name, email, phone, location)
    // - Resume upload
    // - Education details
    // - Work experience
    // - Custom questions about consulting interest

    // Fill first name
    const firstNameSelectors = [
      'input[name*="firstName"]',
      'input[name*="first_name"]',
      'input[id*="firstName"]',
      'input[placeholder*="First"]'
    ];

    for (const selector of firstNameSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.firstName, { delay: 50 });
          console.log(`  ✅ First name: ${candidate.firstName}`);
          break;
        }
      } catch (e) {}
    }

    // Fill last name
    const lastNameSelectors = [
      'input[name*="lastName"]',
      'input[name*="last_name"]',
      'input[id*="lastName"]',
      'input[placeholder*="Last"]'
    ];

    for (const selector of lastNameSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.lastName, { delay: 50 });
          console.log(`  ✅ Last name: ${candidate.lastName}`);
          break;
        }
      } catch (e) {}
    }

    // Fill email
    const emailSelectors = [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]'
    ];

    for (const selector of emailSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.email, { delay: 50 });
          console.log(`  ✅ Email: ${candidate.email}`);
          break;
        }
      } catch (e) {}
    }

    // Fill phone
    const phoneSelectors = [
      'input[type="tel"]',
      'input[name*="phone"]',
      'input[id*="phone"]'
    ];

    for (const selector of phoneSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.phone, { delay: 50 });
          console.log(`  ✅ Phone: ${candidate.phone}`);
          break;
        }
      } catch (e) {}
    }

    // Fill location/city
    const citySelectors = [
      'input[name*="city"]',
      'input[id*="city"]',
      'input[placeholder*="City"]'
    ];

    for (const selector of citySelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.city, { delay: 50 });
          console.log(`  ✅ City: ${candidate.city}`);
          break;
        }
      } catch (e) {}
    }

    // Fill state (dropdown or text)
    const stateSelectors = [
      'select[name*="state"]',
      'select[id*="state"]',
      'input[name*="state"]'
    ];

    for (const selector of stateSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName);
          if (tagName === 'SELECT') {
            await element.select(candidate.state);
          } else {
            await element.click();
            await element.type(candidate.state, { delay: 50 });
          }
          console.log(`  ✅ State: ${candidate.state}`);
          break;
        }
      } catch (e) {}
    }

    // Upload resume
    console.log(`  📎 Uploading resume...`);
    const fileInputSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[name*="cv"]'
    ];

    for (const selector of fileInputSelectors) {
      try {
        const fileInput = await page.$(selector);
        if (fileInput) {
          await fileInput.uploadFile(RESUME_PATH);
          console.log(`  ✅ Resume uploaded`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      } catch (e) {}
    }

    // Fill LinkedIn
    const linkedinSelectors = [
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
      'input[placeholder*="LinkedIn"]'
    ];

    for (const selector of linkedinSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.linkedin, { delay: 50 });
          console.log(`  ✅ LinkedIn: ${candidate.linkedin}`);
          break;
        }
      } catch (e) {}
    }

    // Education fields
    const degreeSelectors = [
      'select[name*="degree"]',
      'select[id*="degree"]',
      'input[name*="degree"]'
    ];

    for (const selector of degreeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName);
          if (tagName === 'SELECT') {
            // Try to select "Bachelor" or similar
            const options = await element.$$('option');
            for (const option of options) {
              const text = await option.evaluate(el => el.textContent);
              if (text.includes('Bachelor')) {
                await element.select(await option.evaluate(el => el.value));
                break;
              }
            }
          } else {
            await element.click();
            await element.type(candidate.degree, { delay: 50 });
          }
          console.log(`  ✅ Degree: ${candidate.degree}`);
          break;
        }
      } catch (e) {}
    }

    const universitySelectors = [
      'input[name*="school"]',
      'input[name*="university"]',
      'input[id*="school"]'
    ];

    for (const selector of universitySelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.university, { delay: 50 });
          console.log(`  ✅ University: ${candidate.university}`);
          break;
        }
      } catch (e) {}
    }

    // Years of experience
    const yearsExpSelectors = [
      'input[name*="experience"]',
      'select[name*="experience"]',
      'input[id*="years"]'
    ];

    for (const selector of yearsExpSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const tagName = await element.evaluate(el => el.tagName);
          if (tagName === 'SELECT') {
            await element.select(candidate.yearsExperience.toString());
          } else {
            await element.click();
            await element.type(candidate.yearsExperience.toString(), { delay: 50 });
          }
          console.log(`  ✅ Years of experience: ${candidate.yearsExperience}`);
          break;
        }
      } catch (e) {}
    }

    console.log(`  ✅ McKinsey application filled`);
    return true;

  } catch (error) {
    console.error(`  ❌ Error filling McKinsey form: ${error.message}`);
    return false;
  }
}

// Workday automation
async function fillWorkdayApplication(page, jobData) {
  console.log(`\n📝 Filling Workday application...`);

  try {
    // Wait for Workday-specific elements
    await page.waitForSelector('[data-automation-id], input, select', { timeout: 10000 });

    // Workday uses data-automation-id attributes
    // Common patterns: data-automation-id="firstName", "lastName", etc.

    const automationIdMap = {
      'firstName': candidate.firstName,
      'lastName': candidate.lastName,
      'email': candidate.email,
      'phone': candidate.phone,
      'city': candidate.city,
      'state': candidate.state
    };

    for (const [automationId, value] of Object.entries(automationIdMap)) {
      try {
        const element = await page.$(`[data-automation-id*="${automationId}"]`);
        if (element) {
          await element.click();
          await element.type(value, { delay: 50 });
          console.log(`  ✅ ${automationId}: ${value}`);
        }
      } catch (e) {}
    }

    // Resume upload in Workday
    const uploadButton = await page.$('[data-automation-id*="upload"], input[type="file"]');
    if (uploadButton) {
      await uploadButton.uploadFile(RESUME_PATH);
      console.log(`  ✅ Resume uploaded`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`  ✅ Workday application filled`);
    return true;

  } catch (error) {
    console.error(`  ❌ Error filling Workday form: ${error.message}`);
    return false;
  }
}

// Generic custom portal handler
async function fillGenericApplication(page, jobData) {
  console.log(`\n📝 Filling application (generic handler)...`);

  try {
    await page.waitForSelector('input, select, textarea', { timeout: 10000 });

    // Use our standard field detection from auto-submit.mjs
    // This is a fallback for unknown portals

    const fields = [
      { selectors: ['input[name*="first"]', 'input[id*="first"]'], value: candidate.firstName, label: 'First name' },
      { selectors: ['input[name*="last"]', 'input[id*="last"]'], value: candidate.lastName, label: 'Last name' },
      { selectors: ['input[type="email"]'], value: candidate.email, label: 'Email' },
      { selectors: ['input[type="tel"]', 'input[name*="phone"]'], value: candidate.phone, label: 'Phone' },
      { selectors: ['input[name*="linkedin"]'], value: candidate.linkedin, label: 'LinkedIn' },
    ];

    for (const field of fields) {
      for (const selector of field.selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await element.type(field.value, { delay: 50 });
            console.log(`  ✅ ${field.label}: ${field.value}`);
            break;
          }
        } catch (e) {}
      }
    }

    // Resume upload
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(RESUME_PATH);
      console.log(`  ✅ Resume uploaded`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`  ✅ Generic application filled`);
    return true;

  } catch (error) {
    console.error(`  ❌ Error filling form: ${error.message}`);
    return false;
  }
}

// Main submission function
async function submitToNonStandardPortal(url, jobData = {}, dryRun = true) {
  const platformInfo = detectPlatform(url);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`NON-STANDARD PORTAL SUBMISSION`);
  console.log(`${"=".repeat(80)}`);
  console.log(`URL: ${url}`);
  console.log(`Detected Platform: ${platformInfo.name} (${platformInfo.platform})`);
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

    console.log(`🌐 Navigating to ${platformInfo.name}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Route to appropriate fill function
    let filled = false;

    switch (platformInfo.platform) {
      case 'mckinsey':
        filled = await fillMcKinseyApplication(page, jobData);
        break;
      case 'workday':
        filled = await fillWorkdayApplication(page, jobData);
        break;
      default:
        filled = await fillGenericApplication(page, jobData);
    }

    // Log submission
    const submissionData = {
      company: jobData.company || 'Unknown',
      title: jobData.title || 'Unknown',
      url: url,
      platform: platformInfo.platform,
      resumeUploaded: filled,
      coverLetterFilled: false,
      answersProvided: []
    };

    const status = dryRun ? 'dry_run' : 'submitted';
    logSubmission(submissionData, status, `Platform: ${platformInfo.name}`);

    if (dryRun) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`DRY RUN COMPLETE`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Platform: ${platformInfo.name}`);
      console.log(`Form filled: ${filled ? 'Yes' : 'Partial'}`);
      console.log(`Browser will stay open for 60 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
    } else {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`READY TO SUBMIT`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Review and click Submit when ready`);
      console.log(`Browser will stay open for 2 minutes...`);
      await new Promise(resolve => setTimeout(resolve, 120000));
    }

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
    console.log('Usage: node non-standard-portals.mjs <url> [--live]');
    console.log();
    console.log('Supported platforms:');
    Object.values(PLATFORM_PATTERNS).forEach(p => {
      console.log(`  - ${p.name}`);
    });
    process.exit(1);
  }

  submitToNonStandardPortal(url, {}, dryRun).catch(console.error);
}

export { submitToNonStandardPortal, detectPlatform };
