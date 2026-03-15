/**
 * Firecrawl-based scraper for structured web content extraction.
 * Usage: node scripts/firecrawl-scrape.mjs <url> [--only-main-content]
 *
 * Loads FIRECRAWL_API_KEY from .env automatically.
 */

import "dotenv/config";
import FirecrawlApp from "@mendable/firecrawl-js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output");

const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) {
  console.error("Error: FIRECRAWL_API_KEY not found in .env or environment.");
  console.error("Get one at https://www.firecrawl.dev/");
  process.exit(1);
}

const args = process.argv.slice(2);
const onlyMainContent = args.includes("--only-main-content");
const url = args.find((a) => !a.startsWith("--"));

if (!url) {
  console.error("Usage: node scripts/firecrawl-scrape.mjs <url> [--only-main-content]");
  process.exit(1);
}

const app = new FirecrawlApp({ apiKey: API_KEY });

console.log(`Scraping ${url} via Firecrawl...`);
if (onlyMainContent) console.log("  (extracting main content only)");

try {
  const scrapeOptions = {
    formats: ["markdown", "html"],
  };
  if (onlyMainContent) {
    scrapeOptions.onlyMainContent = true;
  }

  const result = await app.scrapeUrl(url, scrapeOptions);

  if (!result.success) {
    console.error("Firecrawl scrape failed:", result.error);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outPath = join(OUTPUT_DIR, "firecrawl-result.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Result saved to ${outPath}`);

  if (result.markdown) {
    const mdPath = join(OUTPUT_DIR, "firecrawl-result.md");
    writeFileSync(mdPath, result.markdown);
    console.log(`Markdown saved to ${mdPath}`);
  }

  console.log("\n--- Preview (first 2000 chars) ---");
  console.log((result.markdown || result.html || "").slice(0, 2000));
} catch (err) {
  console.error("Firecrawl error:", err.message);
  process.exit(1);
}
