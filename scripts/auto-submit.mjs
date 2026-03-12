#!/usr/bin/env node

/**
 * Automated Job Application Submission
 *
 * Uses Puppeteer to automatically fill and submit job applications
 * with prepared materials (resume, cover letters, answers).
 */

import puppeteer from "puppeteer-core";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { logSubmission } from "./submission-tracker.mjs";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RESUME_PATH = resolve(process.cwd(), "blob/resume_tmp.pdf");

// Check if resume exists
if (!existsSync(RESUME_PATH)) {
  console.error(`❌ Resume not found at: ${RESUME_PATH}`);
  process.exit(1);
}

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
  currentCompany: "Amazon",
  currentTitle: "Data Engineer II",
};

const jobs = [
  {
    id: "galaxy_digital",
    company: "Galaxy Digital",
    title: "Infrastructure Engineer (AI Platforms)",
    url: "https://job-boards.greenhouse.io/galaxydigitalservices/jobs/5812855004",
    platform: "greenhouse",
    priority: 1,
    coverLetter: `Dear Galaxy Digital Hiring Team,

I'm drawn to your Infrastructure Engineer (AI Platforms) role because it sits exactly where I've built my career: at the intersection of ML and infrastructure engineering.

At Amazon, I architected the ML platform infrastructure that supported RL-driven inventory purchasing for 5% of US retail. This required:
- Deploying containerized models on EKS (Kubernetes) with Python inference pipelines
- Building MLOps workflows for 1,102+ weekly model runs
- Establishing DevOps best practices across data, ML, and application layers

Your requirements for "Kubernetes-based platforms for scalable AI workloads" and "MLOps pipeline operations" directly match this experience.

What excites me about Galaxy is the intersection of Web3 and AI infrastructure—building platforms that must be both cutting-edge and enterprise-reliable for finance. The crypto space has unique latency, security, and compliance requirements that make AI infrastructure more challenging than typical SaaS platforms.

I'd love to discuss how my background in production ML systems (Python/Go/Java), Kubernetes orchestration, and DevOps automation can accelerate Galaxy's AI platform development.

Best regards,
Jason Bian`,
    answers: {
      "why are you interested in galaxy digital": "I'm excited about Galaxy's position at the intersection of Web3 and AI infrastructure. My experience building production ML platforms at Amazon—specifically architecting RL agent infrastructure on Kubernetes—directly aligns with your need for scalable, enterprise-grade AI systems.",
      "how did you hear about this role": "LinkedIn",
      "are you legally authorized to work": "Yes",
      "will you require future sponsorship": "No",
      "when is the earliest you would want to start": "2 weeks notice",
      "start date": "2 weeks notice",
    }
  }
];

async function fillGreenhouseApplication(page, job) {
  console.log(`\n📝 Filling Greenhouse application for ${job.company}...`);

  try {
    // Wait for page to load
    await page.waitForSelector('input, textarea', { timeout: 10000 });

    // Fill first name
    const firstNameSelectors = [
      'input[name*="first_name"]',
      'input[placeholder*="First"]',
      'input[autocomplete="given-name"]',
      '#first_name'
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
      'input[name*="last_name"]',
      'input[placeholder*="Last"]',
      'input[autocomplete="family-name"]',
      '#last_name'
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
      'input[autocomplete="email"]',
      '#email'
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
      'input[autocomplete="tel"]',
      '#phone'
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

    // Upload resume
    console.log(`  📎 Uploading resume...`);
    const fileInputSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[accept*="pdf"]'
    ];

    for (const selector of fileInputSelectors) {
      try {
        const fileInput = await page.$(selector);
        if (fileInput) {
          await fileInput.uploadFile(RESUME_PATH);
          console.log(`  ✅ Resume uploaded`);
          submissionData.resumeUploaded = true;
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for upload
          break;
        }
      } catch (e) {}
    }

    // Fill LinkedIn
    const linkedinSelectors = [
      'input[name*="linkedin"]',
      'input[placeholder*="LinkedIn"]',
      'input[placeholder*="linkedin"]'
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

    // Fill GitHub/Website
    const websiteSelectors = [
      'input[name*="website"]',
      'input[placeholder*="Website"]',
      'input[placeholder*="GitHub"]'
    ];

    for (const selector of websiteSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await element.type(candidate.github, { delay: 50 });
          console.log(`  ✅ Website/GitHub: ${candidate.github}`);
          break;
        }
      } catch (e) {}
    }

    // Fill cover letter / additional info
    console.log(`  📝 Looking for cover letter field...`);
    const textareaSelectors = [
      'textarea[name*="cover"]',
      'textarea[placeholder*="cover"]',
      'textarea[name*="letter"]',
      'textarea'
    ];

    for (const selector of textareaSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const placeholder = await element.evaluate(el => el.placeholder || el.name);
          if (placeholder && (
            placeholder.toLowerCase().includes('cover') ||
            placeholder.toLowerCase().includes('letter') ||
            placeholder.toLowerCase().includes('additional')
          )) {
            await element.click();
            await element.type(job.coverLetter, { delay: 10 });
            console.log(`  ✅ Cover letter filled`);
            submissionData.coverLetterFilled = true;
            break;
          }
        }
      } catch (e) {}
    }

    // Fill custom questions
    console.log(`  ❓ Filling custom questions...`);
    const allInputs = await page.$$('input[type="text"], textarea, select');

    for (const input of allInputs) {
      try {
        const label = await page.evaluate(el => {
          const labelEl = el.labels?.[0];
          if (labelEl) return labelEl.textContent;

          const prevLabel = el.previousElementSibling;
          if (prevLabel?.tagName === 'LABEL') return prevLabel.textContent;

          return el.placeholder || el.name || '';
        }, input);

        if (!label) continue;

        const labelLower = label.toLowerCase();

        // Match against prepared answers
        for (const [question, answer] of Object.entries(job.answers)) {
          if (labelLower.includes(question.toLowerCase())) {
            const currentValue = await input.evaluate(el => el.value);
            if (!currentValue) {
              await input.click();
              await input.type(answer, { delay: 30 });
              console.log(`  ✅ Answered: "${label.substring(0, 50)}..."`);
              submissionData.answersProvided.push(label.substring(0, 100));
            }
            break;
          }
        }

        // Handle Yes/No questions
        if (labelLower.includes('authorized') && labelLower.includes('work')) {
          await input.click();
          await input.type('Yes', { delay: 30 });
          console.log(`  ✅ Work authorization: Yes`);
        }

        if (labelLower.includes('sponsorship')) {
          await input.click();
          await input.type('No', { delay: 30 });
          console.log(`  ✅ Sponsorship: No`);
        }

      } catch (e) {
        // Skip errors for individual fields
      }
    }

    console.log(`  ✅ Application form filled`);
    return true;

  } catch (error) {
    console.error(`  ❌ Error filling form: ${error.message}`);
    return false;
  }
}

async function submitApplication(job, dryRun = true) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[${job.priority}] ${job.company} - ${job.title}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`URL: ${job.url}`);
  console.log(`Platform: ${job.platform}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (review only)" : "LIVE (will submit)"}`);

  const submissionData = {
    company: job.company,
    title: job.title,
    url: job.url,
    platform: job.platform,
    resumeUploaded: false,
    coverLetterFilled: false,
    answersProvided: []
  };

  const browser = await puppeteer.launch({
    headless: false, // Show browser so you can see what's happening
    executablePath: CHROME_PATH,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();

    // Navigate to job posting
    console.log(`\n🌐 Navigating to job posting...`);
    await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fill the form based on platform
    let filled = false;
    if (job.platform === 'greenhouse') {
      filled = await fillGreenhouseApplication(page, job);
    }

    if (!filled) {
      console.log(`\n⚠️  Could not auto-fill form. Please review and fill manually.`);
    }

    // Wait for user review
    // Log submission
    const status = dryRun ? 'dry_run' : 'submitted';
    const notes = `Resume: ${submissionData.resumeUploaded ? 'Yes' : 'No'}, Cover: ${submissionData.coverLetterFilled ? 'Yes' : 'No'}, Answers: ${submissionData.answersProvided.length}`;

    logSubmission(submissionData, status, notes);
    console.log(`\n📊 Logged to submissions.json`);

    if (dryRun) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`DRY RUN COMPLETE - REVIEW THE FORM`);
      console.log(`${"=".repeat(80)}`);
      console.log(`The browser will stay open for you to review.`);
      console.log(`Submission logged as: ${status}`);
      console.log(`Press Ctrl+C when done, or wait 60 seconds...`);

      await new Promise(resolve => setTimeout(resolve, 60000));
    } else {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`READY TO SUBMIT`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Review the form carefully.`);
      console.log(`If everything looks good, click Submit manually.`);
      console.log(`Submission logged as: ${status}`);
      console.log(`Browser will stay open for 2 minutes...`);

      await new Promise(resolve => setTimeout(resolve, 120000));
    }

    return submissionData;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--live');
  const jobId = args.find(arg => !arg.startsWith('--'));

  console.log(`${"=".repeat(80)}`);
  console.log(`AUTOMATED JOB APPLICATION SUBMISSION`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Resume: ${RESUME_PATH}`);
  console.log(``);

  // Filter jobs
  let jobsToProcess = jobs;
  if (jobId) {
    jobsToProcess = jobs.filter(j => j.id === jobId);
    if (jobsToProcess.length === 0) {
      console.error(`❌ Job not found: ${jobId}`);
      console.log(`Available jobs: ${jobs.map(j => j.id).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Jobs to process: ${jobsToProcess.length}`);
  jobsToProcess.forEach(j => {
    console.log(`  ${j.priority}. ${j.company} - ${j.title}`);
  });

  // Process each job
  for (const job of jobsToProcess) {
    try {
      await submitApplication(job, dryRun);
      console.log(`\n✅ Completed: ${job.company}`);
    } catch (error) {
      console.error(`\n❌ Failed: ${job.company} - ${error.message}`);
    }

    // Wait between applications
    if (jobsToProcess.indexOf(job) < jobsToProcess.length - 1) {
      console.log(`\n⏳ Waiting 5 seconds before next application...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`ALL APPLICATIONS PROCESSED`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Check APPLICATION_LOG.md for status`);
}

main().catch(console.error);
