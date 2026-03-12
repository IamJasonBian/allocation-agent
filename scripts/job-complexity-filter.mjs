#!/usr/bin/env node

/**
 * Job Complexity Pre-Filter
 *
 * Analyzes job applications to determine complexity and filters for:
 * - Jobs with minimal custom questions
 * - Quick-apply enabled jobs
 * - Jobs with standard fields only (name, email, resume)
 *
 * Skips jobs with:
 * - Essay questions
 * - Multiple custom questions (>3)
 * - Video/portfolio requirements
 * - Long application forms
 */

import puppeteer from "puppeteer-core";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Complexity scoring
const COMPLEXITY_WEIGHTS = {
  textareaCount: 5,        // Each textarea/essay question adds 5 points
  customQuestions: 3,       // Each custom question adds 3 points
  requiredFields: 1,        // Each required field adds 1 point
  fileUploads: 2,          // Each file upload (beyond resume) adds 2 points
  videoRequired: 20,        // Video questions add 20 points (instant reject)
  portfolioRequired: 10,    // Portfolio requirements add 10 points
  multiStepForm: 10,       // Multi-step forms add 10 points
};

const COMPLEXITY_THRESHOLDS = {
  veryEasy: 5,    // 0-5: Just basic info + resume
  easy: 15,       // 6-15: Basic info + 1-2 simple questions
  moderate: 30,   // 16-30: Multiple questions but manageable
  hard: 50,       // 31-50: Many questions, essays, or complex requirements
  veryHard: 100,  // 50+: Skip these (video, portfolios, extensive essays)
};

async function analyzeJobComplexity(url, platform = "unknown") {
  console.log(`\n🔍 Analyzing job complexity...`);
  console.log(`URL: ${url}`);
  console.log(`Platform: ${platform}`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Analyze form complexity
    const complexity = await page.evaluate(() => {
      const analysis = {
        textareaCount: 0,
        customQuestions: 0,
        requiredFields: 0,
        fileUploads: 0,
        videoRequired: false,
        portfolioRequired: false,
        multiStepForm: false,
        questionTexts: [],
        fieldTypes: {},
      };

      // Count textareas (essay questions)
      const textareas = document.querySelectorAll('textarea');
      analysis.textareaCount = textareas.length;
      textareas.forEach(ta => {
        const label = ta.labels?.[0]?.textContent || ta.placeholder || '';
        if (label) analysis.questionTexts.push(label);
      });

      // Count custom text inputs (beyond basic info)
      const textInputs = document.querySelectorAll('input[type="text"]');
      const basicFields = ['first', 'last', 'name', 'email', 'phone', 'address', 'city', 'state', 'zip'];

      textInputs.forEach(input => {
        const name = (input.name || input.id || '').toLowerCase();
        const isBasic = basicFields.some(field => name.includes(field));

        if (!isBasic && name) {
          analysis.customQuestions++;
          const label = input.labels?.[0]?.textContent || input.placeholder || name;
          analysis.questionTexts.push(label);
        }
      });

      // Count required fields
      const requiredFields = document.querySelectorAll('input[required], textarea[required], select[required]');
      analysis.requiredFields = requiredFields.length;

      // Count file uploads (beyond single resume)
      const fileInputs = document.querySelectorAll('input[type="file"]');
      analysis.fileUploads = fileInputs.length;

      // Check for video requirements
      const bodyText = document.body.textContent.toLowerCase();
      if (bodyText.includes('video') && (bodyText.includes('interview') || bodyText.includes('record'))) {
        analysis.videoRequired = true;
      }

      // Check for portfolio requirements
      if (bodyText.includes('portfolio') || bodyText.includes('work sample')) {
        analysis.portfolioRequired = true;
      }

      // Check for multi-step forms
      const stepIndicators = document.querySelectorAll('[class*="step"], [class*="stage"], [class*="progress"]');
      const buttons = Array.from(document.querySelectorAll('button'));
      const hasNextButton = buttons.some(b =>
        b.textContent.toLowerCase().includes('next') ||
        b.textContent.toLowerCase().includes('continue')
      );

      if (stepIndicators.length > 1 || hasNextButton) {
        analysis.multiStepForm = true;
      }

      // Field type breakdown
      analysis.fieldTypes = {
        text: document.querySelectorAll('input[type="text"]').length,
        email: document.querySelectorAll('input[type="email"]').length,
        tel: document.querySelectorAll('input[type="tel"]').length,
        file: document.querySelectorAll('input[type="file"]').length,
        textarea: textareas.length,
        select: document.querySelectorAll('select').length,
        radio: document.querySelectorAll('input[type="radio"]').length,
        checkbox: document.querySelectorAll('input[type="checkbox"]').length,
      };

      return analysis;
    });

    // Calculate complexity score
    let score = 0;
    score += complexity.textareaCount * COMPLEXITY_WEIGHTS.textareaCount;
    score += complexity.customQuestions * COMPLEXITY_WEIGHTS.customQuestions;
    score += complexity.requiredFields * COMPLEXITY_WEIGHTS.requiredFields;
    score += (complexity.fileUploads - 1) * COMPLEXITY_WEIGHTS.fileUploads; // Subtract 1 for resume

    if (complexity.videoRequired) score += COMPLEXITY_WEIGHTS.videoRequired;
    if (complexity.portfolioRequired) score += COMPLEXITY_WEIGHTS.portfolioRequired;
    if (complexity.multiStepForm) score += COMPLEXITY_WEIGHTS.multiStepForm;

    // Determine difficulty level
    let difficulty = 'veryEasy';
    if (score > COMPLEXITY_THRESHOLDS.veryHard) difficulty = 'veryHard';
    else if (score > COMPLEXITY_THRESHOLDS.hard) difficulty = 'hard';
    else if (score > COMPLEXITY_THRESHOLDS.moderate) difficulty = 'moderate';
    else if (score > COMPLEXITY_THRESHOLDS.easy) difficulty = 'easy';

    // Recommendation
    const shouldApply = score <= COMPLEXITY_THRESHOLDS.moderate;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`COMPLEXITY ANALYSIS`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Score: ${score}`);
    console.log(`Difficulty: ${difficulty.toUpperCase()}`);
    console.log(`Recommendation: ${shouldApply ? '✅ PROCEED' : '❌ SKIP'}`);
    console.log();
    console.log(`Form Details:`);
    console.log(`  - Textareas (essays): ${complexity.textareaCount}`);
    console.log(`  - Custom questions: ${complexity.customQuestions}`);
    console.log(`  - Required fields: ${complexity.requiredFields}`);
    console.log(`  - File uploads: ${complexity.fileUploads}`);
    console.log(`  - Video required: ${complexity.videoRequired ? 'Yes ⚠️' : 'No'}`);
    console.log(`  - Portfolio required: ${complexity.portfolioRequired ? 'Yes ⚠️' : 'No'}`);
    console.log(`  - Multi-step form: ${complexity.multiStepForm ? 'Yes' : 'No'}`);
    console.log();
    console.log(`Field Types:`);
    Object.entries(complexity.fieldTypes).forEach(([type, count]) => {
      if (count > 0) console.log(`  - ${type}: ${count}`);
    });

    if (complexity.questionTexts.length > 0) {
      console.log();
      console.log(`Questions Found (${complexity.questionTexts.length}):`);
      complexity.questionTexts.slice(0, 10).forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.substring(0, 100)}${q.length > 100 ? '...' : ''}`);
      });
      if (complexity.questionTexts.length > 10) {
        console.log(`  ... and ${complexity.questionTexts.length - 10} more`);
      }
    }

    console.log();
    console.log(`${"=".repeat(80)}`);

    await browser.close();

    return {
      url,
      platform,
      score,
      difficulty,
      shouldApply,
      analysis: complexity,
      breakdown: {
        textareas: complexity.textareaCount,
        customQuestions: complexity.customQuestions,
        requiredFields: complexity.requiredFields,
        hasVideo: complexity.videoRequired,
        hasPortfolio: complexity.portfolioRequired,
        isMultiStep: complexity.multiStepForm,
      }
    };

  } catch (error) {
    console.error(`❌ Error analyzing job: ${error.message}`);
    await browser.close();
    return {
      url,
      platform,
      score: 999,
      difficulty: 'unknown',
      shouldApply: false,
      error: error.message
    };
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  const maxComplexity = process.argv.find(arg => arg.startsWith('--max-score='))?.split('=')[1] || 30;

  if (!url) {
    console.log('Usage: node job-complexity-filter.mjs <url> [--max-score=30]');
    console.log();
    console.log('Examples:');
    console.log('  node job-complexity-filter.mjs "https://jobs.example.com/job"');
    console.log('  node job-complexity-filter.mjs "https://jobs.example.com/job" --max-score=15');
    console.log();
    console.log('Complexity Levels:');
    console.log('  0-5:   Very Easy (basic info only)');
    console.log('  6-15:  Easy (1-2 simple questions)');
    console.log('  16-30: Moderate (several questions)');
    console.log('  31-50: Hard (many questions/essays)');
    console.log('  50+:   Very Hard (video/portfolio/extensive)');
    process.exit(1);
  }

  const result = await analyzeJobComplexity(url);

  if (result.shouldApply && result.score <= maxComplexity) {
    console.log(`\n✅ Job passes complexity filter (score: ${result.score} <= ${maxComplexity})`);
    console.log(`Ready to proceed with auto-apply!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Job too complex (score: ${result.score} > ${maxComplexity})`);
    console.log(`Skipping this job.`);
    process.exit(1);
  }
}

export { analyzeJobComplexity, COMPLEXITY_THRESHOLDS };
