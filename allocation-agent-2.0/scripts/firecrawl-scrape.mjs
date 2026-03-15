/**
 * Firecrawl-based scraper for structured web content extraction.
 * Usage: FIRECRAWL_API_KEY=... node scripts/firecrawl-scrape.mjs <url>
 */

import FirecrawlApp from "@mendable/firecrawl-js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.FIRECRAWL_API_KEY;
if (!API_KEY) {
  console.error("Error: FIRECRAWL_API_KEY environment variable is required.");
  console.error("Get one at https://www.firecrawl.dev/");
  process.exit(1);
}

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/firecrawl-scrape.mjs <url>");
  process.exit(1);
}

const app = new FirecrawlApp({ apiKey: API_KEY });

console.log(`Scraping ${url} via Firecrawl...`);

try {
  const result = await app.scrapeUrl(url, {
    formats: ["markdown", "html"],
  });

  if (!result.success) {
    console.error("Firecrawl scrape failed:", result.error);
    process.exit(1);
  }

  const outPath = join(__dirname, "..", "output", "firecrawl-result.json");
  const outDir = join(__dirname, "..", "output");
  await import("fs").then((fs) => fs.mkdirSync(outDir, { recursive: true }));

  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Result saved to ${outPath}`);

  // Also dump markdown for easy reading
  if (result.markdown) {
    const mdPath = join(outDir, "firecrawl-result.md");
    writeFileSync(mdPath, result.markdown);
    console.log(`Markdown saved to ${mdPath}`);
  }

  console.log("\n--- Preview (first 2000 chars) ---");
  console.log((result.markdown || result.html || "").slice(0, 2000));
} catch (err) {
  console.error("Firecrawl error:", err.message);
  process.exit(1);
}
