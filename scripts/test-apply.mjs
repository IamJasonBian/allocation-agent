#!/usr/bin/env node

/**
 * Greenhouse Auto-Apply with Email Verification
 *
 * Full flow:
 *   1. Open application form in headless browser
 *   2. Fill all fields + trigger reCAPTCHA
 *   3. Submit → Greenhouse sends security code to email
 *   4. Poll Gmail API for the security code
 *   5. Enter code into the security_code field
 *   6. Resubmit the form
 *
 * Usage:
 *   node scripts/test-apply.mjs [boardToken] [jobId]
 *
 * Env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   CHROME_PATH (optional)
 */

import puppeteer from "puppeteer-core";
import { getStore } from "@netlify/blobs";
import { readFileSync } from "fs";

const boardToken = process.argv[2] || "clearstreet";
const jobId = process.argv[3] || "6675504";

// Google OAuth config (from env)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const candidate = {
  firstName: "Jason",
  lastName: "Bian",
  email: "jason.bian64@gmail.com",
  phone: "+1-734-730-6569",
  authorizedToWork: true,
  requiresSponsorship: false,
  veteranStatus: false,
  resumeText: `JASON BIAN
New York, New York | +1 734-730-6569 | jason.bian64@gmail.com

PROFESSIONAL EXPERIENCE

AMAZON.COM — Data Engineer II (2021 – Present)
• High Cardinality Forecast Generation in Java, Python and Spark
• Reduced latency of ~550 input signals, shortening pipeline runtime of 4 deep learning models to 6.4x
• Sev2 real-time support for 4 core forecasting models with 1120 weekly runs
• Reduced data ingestion pipeline audits from 48 hours to 5 hours
• Increased pipeline test coverage from 33% to 90%
• Extended CI/CD, logging, integration testing covering ~15.3B daily read/writes

AMAZON.COM — Business Intelligence Engineer II (2021 – 2022)
• Weekly Delivery Associate Hiring Targets via LP solves
• 10% forecast error reduction across 500+ delivery stations
• Automated scenario analysis reducing ~450 hours/month of lab work

MICROSOFT — Program Manager (2020 – 2021)
• Azure Decision Science - capacity management programs
• Managed ~$5M monthly infrastructure capex
• Scaled offer restriction from 30% to 65% of Azure services

OPTIMASON — Founder (2022 – Present)
• Consulting shop for azure cloud migrations and data estate development
• Migrated aging manual systems with 1800+ hours of man-hours saved

TECH SKILLS
Python, Java, SQL, Spark, Scala, TypeScript, C++, R
Apache (Presto, Beam, Flink), AWS (Glue, Sagemaker, Lambda, Redshift), Azure (Databricks)
ARIMA, PCA, Convex Optimization, Linear Programming, Markov Chains

EDUCATION
B.S.E Industrial and Operations Engineering, University of Michigan Ann Arbor — GPA 3.83`,
};

function getAnswerForQuestion(label) {
  label = label.toLowerCase();
  if (label.includes("previously applied") || label.includes("have you ever worked")) return "0";
  if (label.includes("authorized to work") || label.includes("legally authorized")) return candidate.authorizedToWork ? "1" : "0";
  if (label.includes("sponsorship") || label.includes("require sponsor") || label.includes("visa")) return candidate.requiresSponsorship ? "1" : "0";
  if (label.includes("military") || label.includes("veteran")) return candidate.veteranStatus ? "1" : "0";
  if (label.includes("privacy") || label.includes("consent") || label.includes("i accept")) return "1";
  return "1";
}

function getTextAnswerForQuestion(label) {
  label = label.toLowerCase();
  if (label.includes("linkedin")) return "https://www.linkedin.com/in/jasonzbian/";
  if (label.includes("non-compete") || label.includes("notice period") || label.includes("non compete"))
    return "No non-compete agreement. Available to start immediately.";
  if (label.includes("github")) return "https://github.com/IamJasonBian";
  if (label.includes("website") || label.includes("portfolio")) return "";
  if (label.includes("salary") || label.includes("compensation")) return "Open to discussion";
  if (label.includes("how did you hear") || label.includes("referral") || label.includes("how did you find"))
    return "Company website";
  if (label.includes("years of") || label.includes("experience")) return "5";
  if (label.includes("employer") || label.includes("current company")) return "Amazon";
  return "";
}

async function findChromePath() {
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];
  const { existsSync } = await import("fs");
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  throw new Error("Chrome not found. Set CHROME_PATH env var.");
}

// ── Gmail API helpers ──

async function getGmailAccessToken() {
  if (!GOOGLE_REFRESH_TOKEN) {
    console.log("   No GOOGLE_REFRESH_TOKEN set - skipping email check");
    return null;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: GOOGLE_REFRESH_TOKEN,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`   Gmail token refresh failed: ${err}`);
    return null;
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchSecurityCodeFromGmail(accessToken, afterEpochMs) {
  // Use Gmail's after: filter with epoch seconds to only get emails after submission
  const afterSec = Math.floor(afterEpochMs / 1000);
  const query = encodeURIComponent(
    `from:greenhouse-mail.io subject:"security code" after:${afterSec}`
  );
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=3`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) return null;

  const listData = await listRes.json();
  if (!listData.messages || listData.messages.length === 0) return null;

  // Get most recent message
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${listData.messages[0].id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!msgRes.ok) return null;

  const msg = await msgRes.json();

  // Verify message is actually newer than our submission (internalDate is epoch ms)
  if (Number(msg.internalDate) < afterEpochMs) {
    return null;
  }

  // Extract body
  let bodyText = "";
  if (msg.payload.body?.data) {
    bodyText = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
  }
  if (!bodyText && msg.payload.parts) {
    for (const part of msg.payload.parts) {
      if ((part.mimeType === "text/plain" || part.mimeType === "text/html") && part.body.data) {
        bodyText = Buffer.from(part.body.data, "base64url").toString("utf-8");
        if (part.mimeType === "text/plain") break;
      }
    }
  }

  // Strip HTML tags (Greenhouse sends HTML-only emails)
  const stripped = bodyText.replace(/<[^>]+>/g, " ").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim();

  // Primary: "application: M42moqCu After"
  const match = stripped.match(/application:\s+([A-Za-z0-9]{6,12})\s+After/i);
  if (match) return match[1];

  // Broad: any "security code" context followed by code
  const broad = stripped.match(/(?:security\s*code|verification\s*code|code\s*into)[^:]*:\s*([A-Za-z0-9]{6,12})/i);
  if (broad) return broad[1];

  // Fallback: standalone 8-char code on its own line
  const fallback = bodyText.match(/\n\s*([A-Za-z0-9]{8})\s*\n/);
  if (fallback) return fallback[1];

  console.log("   Could not parse code from email body:", stripped.substring(0, 200));
  return null;
}

async function pollForSecurityCode(accessToken, afterEpochMs, maxWaitMs = 90_000, intervalMs = 5_000) {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    process.stdout.write(`   Polling Gmail (attempt ${attempt})...`);
    const code = await fetchSecurityCodeFromGmail(accessToken, afterEpochMs);
    if (code) {
      console.log(` FOUND: ${code}`);
      return code;
    }
    console.log(" not yet");
    if (Date.now() + intervalMs < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
    } else break;
  }
  return null;
}

// ── Form filling helper ──

async function fillFormAndSubmit(page, token, id) {
  // Fill basic info
  await page.type("#first_name", candidate.firstName, { delay: 30 });
  await page.type("#last_name", candidate.lastName, { delay: 30 });
  await page.type("#email", candidate.email, { delay: 30 });
  const phoneField = await page.$("#phone");
  if (phoneField) await phoneField.type(candidate.phone, { delay: 30 });
  console.log("   Basic info filled");

  // Click "or enter manually" button to reveal resume textarea
  await page.evaluate(() => {
    const btn = document.querySelector('button[data-source="paste"]');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Fill resume text
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea[name="job_application[resume_text]"]');
    if (ta) {
      ta.focus();
      ta.value = text;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      ta.dispatchEvent(new Event("blur", { bubbles: true }));
    }
  }, candidate.resumeText);
  // Ensure field is marked as dirty
  const resumeTextarea = await page.$('textarea[name="job_application[resume_text]"]');
  if (resumeTextarea) {
    await resumeTextarea.press("Space");
    await resumeTextarea.press("Backspace");
  }
  console.log("   Resume text filled");

  // Fill location autocomplete
  const locationInput = await page.$("#auto_complete_input");
  if (locationInput) {
    await locationInput.click();
    await locationInput.type("New York, NY", { delay: 60 });
    await new Promise((r) => setTimeout(r, 1500));
    const selected = await page.evaluate(() => {
      const items = document.querySelectorAll("[role='option'], .pelias-results li, .autocomplete-suggestions li");
      for (const item of items) {
        if (item.textContent.includes("New York")) {
          item.click();
          return item.textContent.trim();
        }
      }
      return null;
    });
    if (!selected) {
      await page.keyboard.press("ArrowDown");
      await new Promise((r) => setTimeout(r, 200));
      await page.keyboard.press("Enter");
    }
    console.log(`   Location: ${selected || "New York, NY (fallback)"}`);
  }

  // Answer dropdown (select) questions
  const questionData = await page.evaluate(() => {
    const results = [];
    const selects = document.querySelectorAll("select[name*='answers_attributes']");
    for (const select of selects) {
      const container = select.closest(".field") || select.closest("fieldset") || select.parentElement;
      const labelEl = container ? container.querySelector("label") : null;
      results.push({ type: "select", name: select.name, label: labelEl?.textContent?.trim() || "" });
    }
    return results;
  });

  for (const q of questionData) {
    const answer = getAnswerForQuestion(q.label);
    await page.select(`select[name="${q.name}"]`, answer);
    console.log(`   Q(select): ${q.label.substring(0, 50).padEnd(50)} -> ${answer === "1" ? "Yes" : "No"}`);
  }

  // Answer text input questions (excluding basic fields already filled)
  const textQuestionData = await page.evaluate(() => {
    const results = [];
    const basicIds = ["first_name", "last_name", "email", "phone", "auto_complete_input", "security_code"];
    const inputs = document.querySelectorAll("input[type='text'][name*='answers_attributes'], input:not([type])[name*='answers_attributes'], textarea[name*='answers_attributes']:not([name*='resume_text'])");
    for (const input of inputs) {
      if (basicIds.includes(input.id)) continue;
      const container = input.closest(".field") || input.closest("fieldset") || input.parentElement;
      const labelEl = container ? container.querySelector("label") : null;
      const label = labelEl?.textContent?.trim() || "";
      results.push({ type: input.tagName.toLowerCase() === "textarea" ? "textarea" : "text", name: input.name, label });
    }
    return results;
  });

  for (const q of textQuestionData) {
    const answer = getTextAnswerForQuestion(q.label);
    if (answer) {
      await page.evaluate((name, val) => {
        const el = document.querySelector(`[name="${name}"]`);
        if (el) {
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, q.name, answer);
      console.log(`   Q(text):   ${q.label.substring(0, 50).padEnd(50)} -> ${answer.substring(0, 40)}`);
    }
  }

  // Check acknowledge/consent checkboxes
  const checkboxCount = await page.evaluate(() => {
    let count = 0;
    const checkboxes = document.querySelectorAll("input[type='checkbox'][name*='answers_attributes']");
    for (const cb of checkboxes) {
      if (!cb.checked) {
        cb.click();
        count++;
      }
    }
    return count;
  });
  if (checkboxCount > 0) console.log(`   Checked ${checkboxCount} acknowledge/consent checkbox(es)`);

  // Wait for reCAPTCHA Enterprise
  console.log("   Waiting for reCAPTCHA...");
  await new Promise((r) => setTimeout(r, 2000));

  // Trigger reCAPTCHA token generation
  const recaptchaToken = await page.evaluate(async () => {
    try {
      if (typeof grecaptcha === "undefined" || !JBEN?.Recaptcha?.publicKey) return null;
      const token = await grecaptcha.enterprise.execute(JBEN.Recaptcha.publicKey, { action: "apply_to_job" });
      let input = document.querySelector('input[name="g-recaptcha-enterprise-token"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "g-recaptcha-enterprise-token";
        document.querySelector("#application_form").appendChild(input);
      }
      input.value = token;
      return token ? token.substring(0, 20) + "..." : null;
    } catch (e) {
      return `error: ${e.message}`;
    }
  });
  console.log(`   reCAPTCHA token: ${recaptchaToken || "not available"}`);

  // Submit - click and wait for response (no full page navigation expected)
  console.log("   Submitting...");
  const submitButton = await page.$("#submit_app");
  if (!submitButton) throw new Error("Submit button not found");

  await submitButton.click();

  // Wait for either navigation or security code field to appear
  await Promise.race([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null),
    page.waitForSelector('#security_code, input[name="security_code"]', { timeout: 15_000 }).catch(() => null),
    new Promise((r) => setTimeout(r, 15_000)),
  ]);

  await new Promise((r) => setTimeout(r, 3000));
  console.log("   Submit complete.");
  return { questionData, textQuestionData };
}

// ── Main application flow ──

async function applyToJob(chromePath, token, id) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`APPLYING: ${token} / ${id}`);
  console.log(`${"=".repeat(60)}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    // Load application page
    const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${token}&token=${id}`;
    console.log(`   Loading: ${embedUrl}`);
    await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 30_000 });

    // Check form style
    const isOldStyle = await page.evaluate(() => !!document.querySelector("#application_form"));
    if (!isOldStyle) {
      return { success: false, message: "New-style React form - browser automation not supported" };
    }
    await page.waitForSelector("#first_name", { timeout: 5_000 });

    // Step 1: Fill form and submit (triggers security code email)
    console.log("\n[Step 1] Filling form and submitting...");
    const submitTimestamp = Date.now();
    const { questionData, textQuestionData } = await fillFormAndSubmit(page, token, id);

    // Capture page state after submission
    const firstUrl = page.url();
    const firstBody = await page.evaluate(() => document.body.innerText);
    const pageHtml = await page.content();
    await page.screenshot({ path: `/tmp/gh_apply_${token}_${id}_step1.png`, fullPage: true });

    // Build field values record
    const fieldValues = {
      first_name: candidate.firstName,
      last_name: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      resume_text: "[provided]",
      location: "New York, NY",
    };
    for (const q of questionData) {
      fieldValues[q.label.substring(0, 80)] = getAnswerForQuestion(q.label) === "1" ? "Yes" : "No";
    }
    for (const q of textQuestionData) {
      const answer = getTextAnswerForQuestion(q.label);
      if (answer) fieldValues[q.label.substring(0, 80)] = answer;
    }

    let result;
    let securityCode = null;
    let stepReached = "submitted";

    if (firstUrl.includes("confirmation") || firstBody.toLowerCase().includes("thank you")) {
      console.log("\n   Application submitted (no security code needed)!");
      stepReached = "confirmed";
      result = { success: true, message: "Application submitted without security code" };
    } else {
      // Check if there's a security_code field visible
      const hasSecurityField = await page.evaluate(() => {
        const field = document.querySelector('#security_code, input[name="security_code"]');
        return field ? true : false;
      });

      if (!hasSecurityField) {
        console.log("\n   No security code field found. Checking page state...");
        console.log(`   URL: ${firstUrl}`);
        console.log(`   Body: ${firstBody.substring(0, 300)}`);
        stepReached = "failed";
        result = { success: false, message: `No security code field. Page: ${firstBody.substring(0, 150)}` };
      } else {
        // Step 2: Fetch security code from Gmail
        console.log("\n[Step 2] Checking Gmail for security code...");
        const accessToken = await getGmailAccessToken();
        if (!accessToken) {
          stepReached = "failed";
          result = { success: false, message: "Cannot check Gmail - no OAuth tokens" };
        } else {
          securityCode = await pollForSecurityCode(accessToken, submitTimestamp);
          if (!securityCode) {
            stepReached = "failed";
            result = { success: false, message: "Security code not received in time" };
          } else {
            // Step 3: Enter security code and resubmit
            console.log(`\n[Step 3] Entering security code: ${securityCode}`);
            stepReached = "security_code_entered";

            await page.evaluate((code) => {
              const field = document.querySelector('#security_code, input[name="security_code"]');
              if (field) {
                field.focus();
                field.value = code;
                field.dispatchEvent(new Event("input", { bubbles: true }));
                field.dispatchEvent(new Event("change", { bubbles: true }));
                field.dispatchEvent(new Event("blur", { bubbles: true }));
              }
            }, securityCode);

            await page.screenshot({ path: `/tmp/gh_apply_${token}_${id}_step3_code.png`, fullPage: true });

            // Re-trigger reCAPTCHA and resubmit
            console.log("   Re-triggering reCAPTCHA and resubmitting...");
            await page.evaluate(async () => {
              try {
                if (typeof grecaptcha !== "undefined" && JBEN?.Recaptcha?.publicKey) {
                  const token = await grecaptcha.enterprise.execute(JBEN.Recaptcha.publicKey, { action: "apply_to_job" });
                  let input = document.querySelector('input[name="g-recaptcha-enterprise-token"]');
                  if (!input) {
                    input = document.createElement("input");
                    input.type = "hidden";
                    input.name = "g-recaptcha-enterprise-token";
                    document.querySelector("#application_form").appendChild(input);
                  }
                  input.value = token;
                }
              } catch {}
            });

            await page.evaluate(() => {
              const btn = document.querySelector("#submit_app");
              if (btn) btn.click();
            });

            await Promise.race([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null),
              new Promise((r) => setTimeout(r, 15_000)),
            ]);

            await new Promise((r) => setTimeout(r, 3000));

            const finalUrl = page.url();
            const finalBody = await page.evaluate(() => document.body.innerText);
            await page.screenshot({ path: `/tmp/gh_apply_${token}_${id}_final.png`, fullPage: true });

            const isSuccess =
              finalUrl.includes("confirmation") ||
              finalBody.toLowerCase().includes("thank you") ||
              finalBody.toLowerCase().includes("submitted") ||
              finalBody.toLowerCase().includes("we have received");

            stepReached = isSuccess ? "confirmed" : "failed";
            console.log(`\n   Final URL: ${finalUrl}`);
            console.log(`   Success: ${isSuccess}`);

            result = {
              success: isSuccess,
              finalUrl,
              message: isSuccess ? "Application submitted with security code!" : finalBody.substring(0, 200),
            };
          }
        }
      }
    }

    // Store application state to Netlify Blobs
    const authToken = process.env.NETLIFY_AUTH_TOKEN;
    if (authToken) {
      try {
        const store = getStore({
          name: "applications",
          siteID: process.env.NETLIFY_SITE_ID || "f369d057-d9f8-43a6-9433-acf31d4b2751",
          token: authToken,
        });

        const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
        const prefix = `${token}/${id}/${ts}`;
        const screenshotKeys = [];

        // Store metadata
        await store.setJSON(`${prefix}/metadata.json`, {
          metadata: {
            boardToken: token,
            jobId: id,
            companyName: token,
            candidateEmail: candidate.email,
            timestamp: new Date().toISOString(),
            success: result.success,
            message: result.message,
            securityCodeUsed: securityCode,
            finalUrl: result.finalUrl,
            stepReached,
          },
          fieldValues,
          screenshotKeys,
        });

        // Store page HTML
        if (pageHtml) {
          await store.set(`${prefix}/page.html`, pageHtml);
        }

        // Store screenshots from /tmp/
        const ssFiles = [
          `/tmp/gh_apply_${token}_${id}_step1.png`,
          `/tmp/gh_apply_${token}_${id}_step3_code.png`,
          `/tmp/gh_apply_${token}_${id}_final.png`,
        ];
        for (const ssFile of ssFiles) {
          try {
            const buf = readFileSync(ssFile);
            const name = ssFile.split("/").pop();
            await store.set(`${prefix}/${name}`, new Blob([buf], { type: "image/png" }));
            screenshotKeys.push(`${prefix}/${name}`);
          } catch {}
        }

        console.log(`   State stored to Netlify Blobs: ${prefix}`);
      } catch (err) {
        console.error(`   Failed to store state: ${err.message}`);
      }
    } else {
      console.log("   Skipping blob storage (no NETLIFY_AUTH_TOKEN)");
    }

    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("Greenhouse Auto-Apply with Email Verification");
  console.log(`Candidate: ${candidate.firstName} ${candidate.lastName}`);
  console.log(`Gmail configured: ${GOOGLE_REFRESH_TOKEN ? "YES" : "NO - set GOOGLE_REFRESH_TOKEN"}`);

  const chromePath = process.env.CHROME_PATH || (await findChromePath());

  const jobs = [
    { token: boardToken, id: jobId },
  ];

  const results = [];
  for (const { token, id } of jobs) {
    try {
      const result = await applyToJob(chromePath, token, id);
      results.push({ token, id, ...result });
    } catch (err) {
      results.push({ token, id, success: false, message: err.message });
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    console.log(`${r.success ? "PASS" : "FAIL"} ${r.token}/${r.id}: ${r.message?.substring(0, 100)}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
