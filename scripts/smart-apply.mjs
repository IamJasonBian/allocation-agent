#!/usr/bin/env node

/**
 * Smart Apply - Complexity-Aware Job Application
 *
 * Combines complexity filtering with automation:
 * 1. Analyzes job complexity
 * 2. Filters for easy jobs (minimal questions)
 * 3. Auto-applies only to filtered jobs
 */

import { analyzeJobComplexity } from "./job-complexity-filter.mjs";
import { submitToNonStandardPortal, detectPlatform } from "./non-standard-portals.mjs";
import { execSync } from "child_process";

const DEFAULT_MAX_SCORE = 15; // Only apply to "easy" jobs

async function smartApply(url, options = {}) {
  const {
    maxScore = DEFAULT_MAX_SCORE,
    dryRun = true,
    skipFilter = false,
  } = options;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`SMART APPLY - COMPLEXITY-AWARE AUTOMATION`);
  console.log(`${"=".repeat(80)}`);
  console.log(`URL: ${url}`);
  console.log(`Max Complexity Score: ${maxScore}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Filter: ${skipFilter ? 'DISABLED' : 'ENABLED'}`);
  console.log();

  // Step 1: Detect platform
  const platformInfo = detectPlatform(url);
  console.log(`Platform: ${platformInfo.name}`);
  console.log();

  // Step 2: Analyze complexity (unless skipped)
  if (!skipFilter) {
    console.log(`Step 1/2: Analyzing job complexity...`);
    const analysis = await analyzeJobComplexity(url, platformInfo.platform);

    if (!analysis.shouldApply || analysis.score > maxScore) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`❌ JOB FILTERED OUT`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Score: ${analysis.score} (max: ${maxScore})`);
      console.log(`Difficulty: ${analysis.difficulty}`);
      console.log(`Reason: ${analysis.score > maxScore ? 'Too complex' : 'Failed filters'}`);

      if (analysis.breakdown.hasVideo) {
        console.log(`  - Has video requirement`);
      }
      if (analysis.breakdown.hasPortfolio) {
        console.log(`  - Has portfolio requirement`);
      }
      if (analysis.breakdown.textareas > 2) {
        console.log(`  - Has ${analysis.breakdown.textareas} essay questions`);
      }
      if (analysis.breakdown.customQuestions > 5) {
        console.log(`  - Has ${analysis.breakdown.customQuestions} custom questions`);
      }

      console.log();
      console.log(`Recommendation: SKIP this job and focus on easier applications.`);
      console.log(`${"=".repeat(80)}`);
      return {
        applied: false,
        filtered: true,
        reason: 'complexity',
        analysis
      };
    }

    console.log(`\n✅ Job passed complexity filter!`);
    console.log(`Score: ${analysis.score} <= ${maxScore}`);
    console.log(`Proceeding to auto-apply...`);
    console.log();
  }

  // Step 3: Auto-apply
  console.log(`Step 2/2: Auto-applying...`);

  try {
    // Check if it's a standard platform (Greenhouse, Lever, Ashby)
    if (['greenhouse', 'lever', 'ashby'].includes(platformInfo.platform)) {
      console.log(`Using standard automation (auto-submit.mjs)...`);
      // Not implemented yet - would call auto-submit.mjs
      console.log(`⚠️  Standard platform automation not integrated yet`);
      console.log(`Please use: node scripts/auto-submit.mjs <job_id> ${dryRun ? '' : '--live'}`);
      return {
        applied: false,
        filtered: false,
        reason: 'not_implemented',
        platform: platformInfo.platform
      };
    } else {
      // Use non-standard portal automation
      console.log(`Using non-standard portal automation...`);
      await submitToNonStandardPortal(url, {}, dryRun);
      return {
        applied: true,
        filtered: false,
        platform: platformInfo.platform
      };
    }
  } catch (error) {
    console.error(`❌ Error during application: ${error.message}`);
    return {
      applied: false,
      filtered: false,
      reason: 'error',
      error: error.message
    };
  }
}

// Batch apply to multiple URLs
async function batchSmartApply(urls, options = {}) {
  const results = [];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`BATCH SMART APPLY`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Total jobs: ${urls.length}`);
  console.log(`Max complexity: ${options.maxScore || DEFAULT_MAX_SCORE}`);
  console.log();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[${ i + 1}/${urls.length}] Processing: ${url.substring(0, 80)}...`);

    const result = await smartApply(url, options);
    results.push({ url, ...result });

    // Wait between applications
    if (i < urls.length - 1) {
      const waitTime = 5;
      console.log(`\n⏳ Waiting ${waitTime} seconds before next job...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }
  }

  // Summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`BATCH SUMMARY`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Total jobs: ${results.length}`);
  console.log(`Applied: ${results.filter(r => r.applied).length}`);
  console.log(`Filtered out: ${results.filter(r => r.filtered).length}`);
  console.log(`Failed: ${results.filter(r => !r.applied && !r.filtered).length}`);
  console.log();

  const appliedJobs = results.filter(r => r.applied);
  if (appliedJobs.length > 0) {
    console.log(`✅ Successfully Applied (${appliedJobs.length}):`);
    appliedJobs.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.url.substring(0, 70)}...`);
    });
  }

  const filteredJobs = results.filter(r => r.filtered);
  if (filteredJobs.length > 0) {
    console.log();
    console.log(`❌ Filtered Out (${filteredJobs.length}):`);
    filteredJobs.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.url.substring(0, 70)}... (score: ${r.analysis?.score})`);
    });
  }

  console.log(`${"=".repeat(80)}`);

  return results;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const urls = args.filter(arg => !arg.startsWith('--'));
  const maxScore = parseInt(args.find(arg => arg.startsWith('--max-score='))?.split('=')[1]) || DEFAULT_MAX_SCORE;
  const dryRun = !args.includes('--live');
  const skipFilter = args.includes('--skip-filter');

  if (urls.length === 0) {
    console.log('Usage: node smart-apply.mjs <url> [url2] [url3] ... [options]');
    console.log();
    console.log('Options:');
    console.log('  --max-score=N     Max complexity score (default: 15)');
    console.log('  --live            Actually submit (default: dry run)');
    console.log('  --skip-filter     Skip complexity filter');
    console.log();
    console.log('Examples:');
    console.log('  # Single job (dry run, max score 15)');
    console.log('  node smart-apply.mjs "https://jobs.example.com/job"');
    console.log();
    console.log('  # Multiple jobs (only apply to score <= 10)');
    console.log('  node smart-apply.mjs "https://job1.com" "https://job2.com" --max-score=10');
    console.log();
    console.log('  # Live submit (very easy jobs only, score <= 5)');
    console.log('  node smart-apply.mjs "https://job.com" --max-score=5 --live');
    console.log();
    console.log('Complexity Levels:');
    console.log('  0-5:   Very Easy (basic info only) ← Safest');
    console.log('  6-15:  Easy (1-2 simple questions) ← Recommended');
    console.log('  16-30: Moderate (several questions)');
    console.log('  31+:   Hard/Very Hard (skip these)');
    process.exit(1);
  }

  const options = { maxScore, dryRun, skipFilter };

  if (urls.length === 1) {
    await smartApply(urls[0], options);
  } else {
    await batchSmartApply(urls, options);
  }
}

export { smartApply, batchSmartApply };
