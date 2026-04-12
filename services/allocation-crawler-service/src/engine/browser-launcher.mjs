/**
 * Browser Launcher — abstracts Chrome (Puppeteer) and Safari (safaridriver/open).
 *
 * Chrome: full Puppeteer control — navigate, fill, upload, inspect.
 * Safari: opens via safaridriver (WebDriver), fills via executeScript.
 *
 * Usage:
 *   import { launchBrowser } from './browser-launcher.mjs';
 *   const ctx = await launchBrowser("chrome"); // or "safari"
 *   const page = await ctx.openPage(url);
 *   await ctx.close();
 */

import puppeteer from "puppeteer-core";
import { execSync, spawn } from "child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ── Chrome via Puppeteer ──

async function launchChrome() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1300,900"],
    defaultViewport: null,
  });

  return {
    type: "chrome",
    browser,
    async openPage(url) {
      const page = await browser.newPage();
      await page.setUserAgent(UA);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await page.waitForSelector("input[type=text], input[type=email]", { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
      return page;
    },
    async closePage(page) {
      await page.close();
    },
    isConnected() {
      return browser.isConnected();
    },
    async close() {
      await browser.close();
    },
  };
}

// ── Safari via safaridriver (WebDriver) ──

async function launchSafari() {
  // Enable safaridriver automation (one-time setup; may prompt user)
  try { execSync("safaridriver --enable 2>/dev/null", { timeout: 5000 }); } catch {}

  // Start safaridriver on a random port
  const port = 9515 + Math.floor(Math.random() * 100);
  const driver = spawn("safaridriver", ["-p", String(port)], { stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1000)); // wait for startup

  const baseUrl = `http://localhost:${port}`;

  // Create a WebDriver session
  let sessionId;
  try {
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: "safari" } } }),
    });
    const data = await res.json();
    sessionId = data.value?.sessionId;
    if (!sessionId) throw new Error("No session ID: " + JSON.stringify(data));
  } catch (err) {
    driver.kill();
    throw new Error("Safari WebDriver session failed: " + err.message);
  }

  async function wdCommand(method, path, body) {
    const res = await fetch(`${baseUrl}/session/${sessionId}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
  }

  return {
    type: "safari",
    driver,
    sessionId,
    async openPage(url) {
      await wdCommand("POST", "/url", { url });
      await new Promise(r => setTimeout(r, 2000)); // wait for load
      // Return a page-like object with evaluate + $ for basic compat
      return {
        _wdCommand: wdCommand,
        async evaluate(fn, ...args) {
          const script = `return (${fn.toString()})(${args.map(a => JSON.stringify(a)).join(",")})`;
          const result = await wdCommand("POST", "/execute/sync", { script, args: [] });
          return result.value;
        },
        async $(selector) {
          const result = await wdCommand("POST", "/element", { using: "css selector", value: selector });
          if (!result.value) return null;
          const elemId = Object.values(result.value)[0];
          return {
            async click() { await wdCommand("POST", `/element/${elemId}/click`, {}); },
            async type(text) {
              await wdCommand("POST", `/element/${elemId}/value`, { text });
            },
            async uploadFile(path) {
              await wdCommand("POST", `/element/${elemId}/value`, { text: path });
            },
            async focus() { await wdCommand("POST", "/execute/sync", { script: `arguments[0].focus()`, args: [{ "element-6066-11e4-a52e-4f735466cecf": elemId }] }); },
            evaluate: async (fn) => {
              const script = `return (${fn.toString()})(arguments[0])`;
              const r = await wdCommand("POST", "/execute/sync", { script, args: [{ "element-6066-11e4-a52e-4f735466cecf": elemId }] });
              return r.value;
            },
          };
        },
        async waitForSelector(sel, opts = {}) {
          const timeout = opts.timeout || 10000;
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const r = await wdCommand("POST", "/elements", { using: "css selector", value: sel });
            if (r.value && r.value.length > 0) return;
            await new Promise(r => setTimeout(r, 500));
          }
        },
        async close() {
          await wdCommand("DELETE", "/window", {});
        },
        keyboard: {
          async press(key) {
            const keyMap = { ArrowDown: "\uE015", Escape: "\uE00C", Backspace: "\uE003" };
            await wdCommand("POST", "/actions", {
              actions: [{ type: "key", id: "key", actions: [{ type: "keyDown", value: keyMap[key] || key }, { type: "keyUp", value: keyMap[key] || key }] }],
            });
          },
        },
        setUserAgent: async () => {}, // no-op for Safari
      };
    },
    async closePage(page) {
      // Safari has single-window model in WebDriver
    },
    isConnected() { return !!sessionId; },
    async close() {
      try { await wdCommand("DELETE", "", {}); } catch {}
      driver.kill();
    },
  };
}

/**
 * Launch a browser instance.
 * @param {"chrome"|"safari"} type
 */
export async function launchBrowser(type = "chrome") {
  if (type === "safari") return launchSafari();
  return launchChrome();
}
