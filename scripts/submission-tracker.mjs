#!/usr/bin/env node

/**
 * Submission Tracker
 *
 * Logs and reports what applications were submitted
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const LOG_FILE = resolve(process.cwd(), "submissions.json");

function loadSubmissions() {
  if (existsSync(LOG_FILE)) {
    return JSON.parse(readFileSync(LOG_FILE, "utf8"));
  }
  return {
    submissions: [],
    metadata: {
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }
  };
}

function saveSubmissions(data) {
  data.metadata.lastUpdated = new Date().toISOString();
  writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

function logSubmission(jobData, status = "submitted", notes = "") {
  const data = loadSubmissions();

  const submission = {
    timestamp: new Date().toISOString(),
    company: jobData.company,
    title: jobData.title,
    url: jobData.url,
    platform: jobData.platform,
    status: status, // "submitted", "failed", "dry_run"
    notes: notes,
    materials: {
      resume: jobData.resumeUploaded || false,
      coverLetter: jobData.coverLetterFilled || false,
      customAnswers: jobData.answersProvided || []
    }
  };

  data.submissions.push(submission);
  saveSubmissions(data);

  return submission;
}

function getSubmissionReport() {
  const data = loadSubmissions();

  const report = {
    total: data.submissions.length,
    byStatus: {},
    byCompany: {},
    byPlatform: {},
    recent: data.submissions.slice(-10).reverse()
  };

  // Count by status
  data.submissions.forEach(sub => {
    report.byStatus[sub.status] = (report.byStatus[sub.status] || 0) + 1;
    report.byCompany[sub.company] = (report.byCompany[sub.company] || 0) + 1;
    report.byPlatform[sub.platform] = (report.byPlatform[sub.platform] || 0) + 1;
  });

  return report;
}

function printReport() {
  const report = getSubmissionReport();

  console.log("="  .repeat(80));
  console.log("SUBMISSION REPORT");
  console.log("="  .repeat(80));
  console.log();

  console.log(`Total Submissions: ${report.total}`);
  console.log();

  console.log("By Status:");
  Object.entries(report.byStatus).forEach(([status, count]) => {
    const emoji = status === 'submitted' ? '✅' : status === 'failed' ? '❌' : '🔍';
    console.log(`  ${emoji} ${status}: ${count}`);
  });
  console.log();

  console.log("By Company:");
  Object.entries(report.byCompany)
    .sort((a, b) => b[1] - a[1])
    .forEach(([company, count]) => {
      console.log(`  - ${company}: ${count}`);
    });
  console.log();

  console.log("By Platform:");
  Object.entries(report.byPlatform).forEach(([platform, count]) => {
    console.log(`  - ${platform}: ${count}`);
  });
  console.log();

  console.log("Recent Submissions (Last 10):");
  console.log("-"  .repeat(80));
  report.recent.forEach((sub, i) => {
    const statusEmoji = sub.status === 'submitted' ? '✅' : sub.status === 'failed' ? '❌' : '🔍';
    console.log(`${i + 1}. ${statusEmoji} ${sub.company} - ${sub.title}`);
    console.log(`   Platform: ${sub.platform}`);
    console.log(`   Time: ${new Date(sub.timestamp).toLocaleString()}`);
    console.log(`   Status: ${sub.status}`);
    if (sub.notes) {
      console.log(`   Notes: ${sub.notes}`);
    }
    console.log();
  });
}

// CLI usage
const command = process.argv[2];

if (command === 'report') {
  printReport();
} else if (command === 'add') {
  const company = process.argv[3];
  const title = process.argv[4];
  const url = process.argv[5];
  const platform = process.argv[6] || 'unknown';
  const status = process.argv[7] || 'submitted';

  if (!company || !title || !url) {
    console.error('Usage: node submission-tracker.mjs add <company> <title> <url> [platform] [status]');
    process.exit(1);
  }

  const submission = logSubmission({ company, title, url, platform }, status);
  console.log('✅ Logged submission:');
  console.log(JSON.stringify(submission, null, 2));
} else {
  console.log('Submission Tracker');
  console.log();
  console.log('Commands:');
  console.log('  report - Show submission report');
  console.log('  add <company> <title> <url> [platform] [status] - Log a submission');
  console.log();
  console.log('Example:');
  console.log('  node submission-tracker.mjs add "Galaxy Digital" "Infrastructure Engineer" "https://..." greenhouse submitted');
}

export { logSubmission, getSubmissionReport, printReport };
