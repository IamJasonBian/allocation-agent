/**
 * Distributed batch scraper for 1point3acres interview posts.
 * Uploads to Netlify Blobs store "route-agent-prod" under key prefix "scrapemart".
 *
 * Features:
 *   - Parallel Chrome tabs (configurable concurrency)
 *   - Deduplication: skips already-scraped threads
 *   - Resumable: reads existing output to skip completed work
 *   - Rate-limited per-tab to avoid bans
 *
 * Requires Chrome with --remote-debugging-port=9222
 *
 * Usage:
 *   node scripts/batch-scrape-upload.mjs                              # 1 page, 4 workers
 *   node scripts/batch-scrape-upload.mjs --pages 10 --concurrency 6   # 10 pages, 6 tabs
 *   node scripts/batch-scrape-upload.mjs --pages 20 --company meta    # meta only, 20 pages
 *   node scripts/batch-scrape-upload.mjs --resume                     # skip already-done threads
 */

import "dotenv/config";
import puppeteer from "puppeteer-core";
import { getStore } from "@netlify/blobs";
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output", "batch");

const DEBUG_PORT = process.env.CHROME_DEBUG_PORT || "9222";
const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || "f369d057-d9f8-43a6-9433-acf31d4b2751";
const STORE_NAME = "route-agent-prod";
const KEY_PREFIX = "scrapemart";

const BASE_URL = "https://www.1point3acres.com";
const TRPC_BASE = "https://trpc.1point3acres.com/trpc";
const PER_TAB_DELAY_MS = 1500;

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const maxPages = parseInt(getArg("pages") || "3", 10);
const concurrency = parseInt(getArg("concurrency") || "4", 10);
const targetCompany = getArg("company") || "";
const resumeMode = hasFlag("resume");

// --- Stats ---
const stats = { queued: 0, scraped: 0, uploaded: 0, skipped: 0, failed: 0 };
const startTime = Date.now();

function elapsed() {
  const s = ((Date.now() - startTime) / 1000).toFixed(1);
  return `${s}s`;
}

// --- Netlify Blobs ---
function getBlobs() {
  if (!NETLIFY_TOKEN) {
    console.warn("No NETLIFY_AUTH_TOKEN — local-only mode.");
    return null;
  }
  return getStore({ name: STORE_NAME, siteID: NETLIFY_SITE_ID, token: NETLIFY_TOKEN });
}

// --- Chrome CDP ---
async function connectChrome() {
  const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const data = await resp.json();
  console.log(`Chrome ${data.Browser} on :${DEBUG_PORT}`);
  return puppeteer.connect({ browserWSEndpoint: data.webSocketDebuggerUrl });
}

// --- Load already-scraped thread IDs for dedup ---
function loadCompletedTids() {
  const done = new Set();
  if (!existsSync(OUTPUT_DIR)) return done;
  for (const f of readdirSync(OUTPUT_DIR)) {
    const m = f.match(/_(\d+)\.json$/);
    if (m) done.add(parseInt(m[1], 10));
  }
  return done;
}

// --- Fetch thread list via TRPC API ---
async function fetchThreadList(page, pageNum, lastDateline = 0) {
  const input = JSON.stringify({
    "0": { json: { fid: 145, company: targetCompany, filters: {}, page: pageNum, lastDateline } },
  });
  const apiUrl = `${TRPC_BASE}/interview.getInterviewThreadList?batch=1&input=${encodeURIComponent(input)}`;
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "include" });
    return r.json();
  }, apiUrl);
}

// --- Collect all thread IDs across pages ---
async function collectThreads(page) {
  const threads = [];
  let lastDateline = 0;

  for (let p = 1; p <= maxPages; p++) {
    process.stdout.write(`  page ${p}/${maxPages}...`);
    try {
      const result = await fetchThreadList(page, p, lastDateline);
      const items = result?.[0]?.result?.data?.json?.data;
      if (!items || items.length === 0) {
        console.log(" empty, stopping.");
        break;
      }
      for (const t of items) {
        threads.push({
          tid: t.tid,
          subject: t.enSubject || t.subject,
          company: t.options?.company || "unknown",
          dateline: t.dateline,
        });
      }
      lastDateline = items[items.length - 1].dateline || 0;
      console.log(` ${items.length} threads (total: ${threads.length})`);
    } catch (err) {
      console.log(` error: ${err.message}`);
      break;
    }
    if (p < maxPages) await new Promise((r) => setTimeout(r, 800));
  }
  return threads;
}

// --- Scrape a single thread ---
async function scrapeThread(page, threadId) {
  const url = `${BASE_URL}/interview/thread/${threadId}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));

  return page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    h1: document.querySelector("h1")?.innerText?.trim() || null,
    h2s: [...document.querySelectorAll("h2")].map((el) => el.innerText.trim()),
    bodyText: document.body.innerText,
    timestamp: new Date().toISOString(),
  }));
}

// --- Worker: processes threads from a shared queue ---
async function worker(id, browser, queue, store, results) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  while (queue.length > 0) {
    const thread = queue.shift();
    if (!thread) break;

    const { tid, company } = thread;
    const companyKey = (targetCompany || company || "unknown").toLowerCase().replace(/\s+/g, "-");
    const label = `[W${id}] [${stats.scraped + stats.failed + 1}/${stats.queued}]`;

    try {
      const data = await scrapeThread(page, tid);

      const payload = {
        threadId: tid,
        company: companyKey,
        title: data.title,
        url: data.url,
        h1: data.h1,
        h2s: data.h2s,
        content: data.bodyText,
        scrapedAt: data.timestamp,
      };

      // Save locally
      writeFileSync(join(OUTPUT_DIR, `${companyKey}_${tid}.json`), JSON.stringify(payload, null, 2));

      // Upload to blob
      if (store) {
        const blobKey = `${KEY_PREFIX}/${companyKey}/${tid}`;
        await store.setJSON(blobKey, payload);
        stats.uploaded++;
      }

      stats.scraped++;
      console.log(`${label} ${elapsed()} tid=${tid} ${companyKey} OK`);
      results.push({ tid, company: companyKey, status: "ok" });
    } catch (err) {
      stats.failed++;
      console.error(`${label} ${elapsed()} tid=${tid} ${companyKey} FAIL: ${err.message}`);
      results.push({ tid, company: companyKey, status: "error", error: err.message });
    }

    // Per-tab rate limit
    await new Promise((r) => setTimeout(r, PER_TAB_DELAY_MS));
  }

  await page.close();
}

// --- Main ---
async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const store = getBlobs();

  console.log(`\n=== Batch Scraper ===`);
  console.log(`Pages: ${maxPages} | Concurrency: ${concurrency} tabs | Company: ${targetCompany || "all"}`);
  console.log(`Resume mode: ${resumeMode ? "ON (skipping done)" : "OFF"}\n`);

  const browser = await connectChrome();

  // Use first tab for API calls
  const apiPage = await browser.newPage();
  await apiPage.setViewport({ width: 1440, height: 900 });
  await apiPage.goto(`${BASE_URL}/interview/sde`, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  console.log("Collecting threads...");
  const allThreads = await collectThreads(apiPage);
  await apiPage.close();

  // Dedup
  const completedTids = resumeMode ? loadCompletedTids() : new Set();
  const queue = allThreads.filter((t) => !completedTids.has(t.tid));
  stats.skipped = allThreads.length - queue.length;
  stats.queued = queue.length;

  console.log(`\nThreads: ${allThreads.length} found, ${stats.skipped} already done, ${queue.length} to scrape`);

  if (queue.length === 0) {
    console.log("Nothing to do.");
    browser.disconnect();
    return;
  }

  // Save thread list
  writeFileSync(join(OUTPUT_DIR, "thread-list.json"), JSON.stringify(allThreads, null, 2));

  // Launch parallel workers
  console.log(`\nLaunching ${concurrency} parallel workers...\n`);
  const results = [];
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(worker(i + 1, browser, queue, store, results));
  }
  await Promise.all(workers);

  browser.disconnect();

  // Summary
  const summary = {
    totalFound: allThreads.length,
    skipped: stats.skipped,
    scraped: stats.scraped,
    uploaded: stats.uploaded,
    failed: stats.failed,
    concurrency,
    durationSec: ((Date.now() - startTime) / 1000).toFixed(1),
    store: STORE_NAME,
    keyPrefix: KEY_PREFIX,
    timestamp: new Date().toISOString(),
    results,
  };

  writeFileSync(join(OUTPUT_DIR, "scrape-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\n=== Done in ${summary.durationSec}s ===`);
  console.log(`Scraped: ${stats.scraped} | Uploaded: ${stats.uploaded} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
  console.log(`Throughput: ${(stats.scraped / (parseFloat(summary.durationSec) || 1) * 60).toFixed(0)} posts/min`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
