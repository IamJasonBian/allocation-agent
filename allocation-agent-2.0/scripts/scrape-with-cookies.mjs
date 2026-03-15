/**
 * Scrape a URL using the running Chrome instance via CDP (Chrome DevTools Protocol).
 * This attaches to your actual Chrome so all login sessions are preserved.
 *
 * PREREQUISITE: Chrome must be running with remote debugging enabled:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * Or relaunch Chrome with:
 *   npm run scrape:setup   (kills Chrome and relaunches with debugging)
 *
 * Usage: node scripts/scrape-with-cookies.mjs [url]
 * Default URL: https://www.1point3acres.com/interview/post/7100133
 */

import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output");

const TARGET_URL =
  process.argv[2] || "https://www.1point3acres.com/interview/post/7100133";

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DEBUG_PORT = process.env.CHROME_DEBUG_PORT || "9222";

async function connectToRunningChrome() {
  // Try connecting to an already-running debug instance
  try {
    const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const data = await resp.json();
    console.log(`Connected to Chrome ${data["Browser"]}`);
    return await puppeteer.connect({
      browserWSEndpoint: data.webSocketDebuggerUrl,
    });
  } catch {
    // Not available — launch Chrome with debugging ourselves
    console.log("No debug-enabled Chrome found. Launching one...");
    console.log("(Your existing Chrome tabs will NOT be affected if Chrome is not running.)");

    // Check if Chrome is running without debugging
    let chromeRunning = false;
    try {
      execSync("pgrep -x 'Google Chrome'", { stdio: "pipe" });
      chromeRunning = true;
    } catch {}

    if (chromeRunning) {
      console.log("\nChrome is running but without --remote-debugging-port.");
      console.log("Please restart Chrome with debugging enabled:");
      console.log(`\n  1. Quit Chrome completely`);
      console.log(`  2. Run: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${DEBUG_PORT}`);
      console.log(`  3. Re-run this script\n`);
      console.log("Or run: npm run scrape:setup");
      process.exit(1);
    }

    // Launch Chrome with debugging + user data dir
    const userDataDir = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
    const child = execSync(
      `"${CHROME_PATH}" --remote-debugging-port=${DEBUG_PORT} --user-data-dir="${userDataDir}" --profile-directory=Default &`,
      { shell: true, stdio: "ignore" }
    );

    // Wait for Chrome to start
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const resp = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        const data = await resp.json();
        console.log(`Connected to Chrome ${data["Browser"]}`);
        return await puppeteer.connect({
          browserWSEndpoint: data.webSocketDebuggerUrl,
        });
      } catch {}
    }
    throw new Error("Failed to connect to Chrome after launch");
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Target: ${TARGET_URL}`);

  let browser;
  let shouldDisconnect = true;
  try {
    browser = await connectToRunningChrome();

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log("Navigating...");
    await page.goto(TARGET_URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    const title = await page.title();
    console.log(`Page title: ${title}`);

    const pageContent = await page.content();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Save full HTML
    const htmlPath = join(OUTPUT_DIR, "scraped-page.html");
    writeFileSync(htmlPath, pageContent);
    console.log(`HTML saved to ${htmlPath}`);

    // Save text content
    const textPath = join(OUTPUT_DIR, "scraped-page.txt");
    writeFileSync(textPath, bodyText);
    console.log(`Text saved to ${textPath}`);

    // Save structured data extraction
    const structured = await page.evaluate(() => {
      const getTextOf = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.innerText.trim() : null;
      };
      const getAllText = (sel) =>
        [...document.querySelectorAll(sel)].map((el) => el.innerText.trim());

      return {
        title: document.title,
        url: window.location.href,
        h1: getTextOf("h1"),
        h2s: getAllText("h2"),
        mainContent:
          getTextOf("article") ||
          getTextOf(".post-content") ||
          getTextOf(".content") ||
          getTextOf("main"),
        paragraphs: getAllText("p").slice(0, 50),
        timestamp: new Date().toISOString(),
      };
    });

    const jsonPath = join(OUTPUT_DIR, "scraped-data.json");
    writeFileSync(jsonPath, JSON.stringify(structured, null, 2));
    console.log(`Structured data saved to ${jsonPath}`);

    // Take a screenshot
    const screenshotPath = join(OUTPUT_DIR, "scraped-page.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Print preview
    console.log("\n--- Content Preview ---");
    console.log(`Title: ${structured.title}`);
    console.log(`H1: ${structured.h1 || "(none)"}`);
    if (structured.mainContent) {
      console.log(
        `\nMain content (first 3000 chars):\n${structured.mainContent.slice(0, 3000)}`
      );
    } else {
      console.log(
        `\nBody text (first 3000 chars):\n${bodyText.slice(0, 3000)}`
      );
    }

    // Check for login wall
    const loginIndicators = ["登录", "login", "sign in", "请登录", "Log In"];
    const isLoginWalled = loginIndicators.some(
      (ind) =>
        bodyText.toLowerCase().includes(ind.toLowerCase()) &&
        bodyText.length < 500
    );

    if (isLoginWalled) {
      console.warn(
        "\n⚠ Page appears to be behind a login wall. You may need to log in manually first."
      );
    }

    // Close only the tab we opened, not the whole browser
    await page.close();
  } catch (err) {
    console.error("Scraping error:", err.message);
  } finally {
    if (browser) {
      // Disconnect (don't close — it's the user's browser)
      browser.disconnect();
    }
  }
}

main();
