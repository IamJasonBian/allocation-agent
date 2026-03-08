#!/usr/bin/env node
/**
 * Service Access Auditor
 *
 * Checks which external services are accessible with current credentials.
 * Does NOT perform any write operations - read-only health checks.
 *
 * Usage:
 *   node scripts/audit-access.mjs
 *   node scripts/audit-access.mjs --service=gmail
 *   node scripts/audit-access.mjs --verbose
 *
 * Exit codes:
 *   0 - All configured services accessible
 *   1 - One or more services inaccessible or misconfigured
 *   2 - Critical service failure (blocks application submission)
 */

import Redis from "ioredis";
import { existsSync } from "fs";
import { resolve } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const serviceFilter = args.find(a => a.startsWith("--service="))?.split("=")[1];

const SERVICES = {
  gmail: { name: "Gmail API", critical: true, env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] },
  redis: { name: "Redis Cloud", critical: true, env: ["REDIS_PASSWORD"] },
  netlify: { name: "Netlify Blobs", critical: false, env: ["NETLIFY_AUTH_TOKEN"] },
  slack: { name: "Slack Webhooks", critical: false, env: ["SLACK_WEBHOOK_URL"] },
  chrome: { name: "Chrome Browser", critical: true, env: ["CHROME_PATH"] },
  resume: { name: "Resume PDF", critical: true, env: ["RESUME_PATH"] },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: "ℹ️ ",
    success: "✅",
    warning: "⚠️ ",
    error: "❌",
    debug: "🔍",
  }[level] || "";

  if (level === "debug" && !verbose) return;
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function checkEnvVars(varNames) {
  const missing = [];
  const present = [];
  for (const v of varNames) {
    if (process.env[v]) {
      present.push(v);
      if (verbose) log(`  ${v}: SET (${process.env[v].substring(0, 20)}...)`, "debug");
    } else {
      missing.push(v);
      log(`  ${v}: NOT SET`, "warning");
    }
  }
  return { missing, present };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Checks
// ─────────────────────────────────────────────────────────────────────────────

async function checkGmail() {
  log("Checking Gmail API access...", "info");
  const { missing } = checkEnvVars(SERVICES.gmail.env);

  if (missing.length > 0) {
    log(`Gmail: Missing credentials (${missing.join(", ")})`, "error");
    return { accessible: false, error: "Missing credentials" };
  }

  try {
    // Attempt token refresh
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      log(`Gmail: Token refresh failed (${res.status}): ${err.substring(0, 100)}`, "error");
      return { accessible: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const accessToken = data.access_token;

    // Test mailbox access
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      log(`Gmail: Mailbox access denied (${listRes.status})`, "error");
      return { accessible: false, error: `Mailbox HTTP ${listRes.status}` };
    }

    const listData = await listRes.json();
    const messageCount = listData.messages?.length || 0;

    log(`Gmail: ✓ Token refresh OK, mailbox accessible (${listData.resultSizeEstimate || 0} messages)`, "success");
    return {
      accessible: true,
      metadata: {
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        scope: data.scope,
        messageCount: listData.resultSizeEstimate
      }
    };
  } catch (err) {
    log(`Gmail: Connection error: ${err.message}`, "error");
    return { accessible: false, error: err.message };
  }
}

async function checkRedis() {
  log("Checking Redis Cloud access...", "info");
  const { missing } = checkEnvVars(SERVICES.redis.env);

  if (missing.length > 0) {
    log(`Redis: Missing credentials (${missing.join(", ")})`, "error");
    return { accessible: false, error: "Missing credentials" };
  }

  const host = process.env.REDIS_HOST || "redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com";
  const port = parseInt(process.env.REDIS_PORT || "17054", 10);
  const password = process.env.REDIS_PASSWORD;

  let client = null;
  try {
    client = new Redis({
      host,
      port,
      password,
      connectTimeout: 5000,
      commandTimeout: 10000,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });

    await client.connect();

    // Test commands
    const pong = await client.ping();
    const info = await client.info("server");
    const dbSize = await client.dbsize();

    // Parse version from INFO
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : "unknown";

    log(`Redis: ✓ Connected to ${host}:${port} (v${version}, ${dbSize} keys)`, "success");

    // Check application-specific keys
    const ghAppliedCount = await client.eval("return #redis.call('keys', ARGV[1])", 0, "gh_applied:*");
    const leverAppliedCount = await client.eval("return #redis.call('keys', ARGV[1])", 0, "lever_applications:*");
    const doverAppliedCount = await client.eval("return #redis.call('keys', ARGV[1])", 0, "dover_applications:*");
    const formFieldsCount = await client.eval("return #redis.call('keys', ARGV[1])", 0, "form_fields:*");

    if (verbose) {
      log(`  gh_applied: ${ghAppliedCount} keys`, "debug");
      log(`  lever_applications: ${leverAppliedCount} keys`, "debug");
      log(`  dover_applications: ${doverAppliedCount} keys`, "debug");
      log(`  form_fields: ${formFieldsCount} keys`, "debug");
    }

    await client.quit();
    return {
      accessible: true,
      metadata: {
        host,
        port,
        version,
        dbSize,
        appKeys: {
          greenhouse: ghAppliedCount,
          lever: leverAppliedCount,
          dover: doverAppliedCount,
          formFields: formFieldsCount,
        }
      }
    };
  } catch (err) {
    if (client) await client.quit().catch(() => {});
    log(`Redis: Connection error: ${err.message}`, "error");
    return { accessible: false, error: err.message };
  }
}

async function checkNetlify() {
  log("Checking Netlify Blobs access...", "info");
  const { missing } = checkEnvVars(SERVICES.netlify.env);

  if (missing.length > 0) {
    log(`Netlify: Credentials not configured (optional)`, "warning");
    return { accessible: false, error: "Not configured", optional: true };
  }

  const siteId = process.env.NETLIFY_SITE_ID || "f369d057-d9f8-43a6-9433-acf31d4b2751";
  const token = process.env.NETLIFY_AUTH_TOKEN;

  try {
    // List blobs in "applications" store
    const res = await fetch(
      `https://api.netlify.com/api/v1/blobs/${siteId}/applications`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        }
      }
    );

    if (!res.ok) {
      log(`Netlify: API access denied (${res.status})`, "error");
      return { accessible: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const blobCount = data.blobs?.length || 0;

    log(`Netlify: ✓ Blobs accessible (${blobCount} objects in "applications" store)`, "success");
    return {
      accessible: true,
      metadata: { siteId, blobCount }
    };
  } catch (err) {
    log(`Netlify: Connection error: ${err.message}`, "error");
    return { accessible: false, error: err.message };
  }
}

async function checkSlack() {
  log("Checking Slack Webhooks access...", "info");
  const { missing } = checkEnvVars(SERVICES.slack.env);

  if (missing.length > 0) {
    log(`Slack: Webhook not configured (optional)`, "warning");
    return { accessible: false, error: "Not configured", optional: true };
  }

  try {
    // Send test message (dry-run)
    const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "🔍 Allocation Agent: Service Access Audit (Test Message)",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "🔍 *Service Access Audit*\nThis is a test message from the access auditor. All systems operational." }
          }
        ]
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log(`Slack: Webhook failed (${res.status}): ${err.substring(0, 100)}`, "error");
      return { accessible: false, error: `HTTP ${res.status}` };
    }

    log(`Slack: ✓ Webhook test successful`, "success");
    return { accessible: true, metadata: {} };
  } catch (err) {
    log(`Slack: Connection error: ${err.message}`, "error");
    return { accessible: false, error: err.message };
  }
}

async function checkChrome() {
  log("Checking Chrome browser access...", "info");

  const candidatePaths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/opt/chrome/chrome", // Lambda @sparticuz/chromium
  ].filter(Boolean);

  for (const path of candidatePaths) {
    if (existsSync(path)) {
      log(`Chrome: ✓ Found at ${path}`, "success");
      return { accessible: true, metadata: { path } };
    }
  }

  log(`Chrome: Not found in any candidate paths`, "error");
  if (verbose) {
    log(`  Checked paths:`, "debug");
    candidatePaths.forEach(p => log(`    - ${p}`, "debug"));
  }
  return { accessible: false, error: "Chrome executable not found" };
}

async function checkResume() {
  log("Checking resume PDF access...", "info");

  const defaultPath = resolve(import.meta.dirname, "../.context/attachments/resume_jasonzb_oct10 (2).pdf");
  const resumePath = process.env.RESUME_PATH || defaultPath;

  if (existsSync(resumePath)) {
    const fs = await import("fs");
    const stats = fs.statSync(resumePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    log(`Resume: ✓ Found at ${resumePath} (${sizeMB} MB)`, "success");
    return { accessible: true, metadata: { path: resumePath, size: stats.size } };
  }

  log(`Resume: Not found at ${resumePath}`, "error");
  return { accessible: false, error: "Resume PDF not found" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 ALLOCATION AGENT - SERVICE ACCESS AUDIT");
  console.log("=".repeat(70) + "\n");

  const checks = {
    gmail: checkGmail,
    redis: checkRedis,
    netlify: checkNetlify,
    slack: checkSlack,
    chrome: checkChrome,
    resume: checkResume,
  };

  const servicesToCheck = serviceFilter
    ? [serviceFilter]
    : Object.keys(checks);

  const results = {};
  for (const service of servicesToCheck) {
    if (!checks[service]) {
      log(`Unknown service: ${service}`, "error");
      continue;
    }
    results[service] = await checks[service]();
    console.log(""); // spacing
  }

  // Summary
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70) + "\n");

  let criticalFailures = 0;
  let warnings = 0;
  let successes = 0;

  for (const [service, result] of Object.entries(results)) {
    const serviceInfo = SERVICES[service];
    const status = result.accessible ? "✅ PASS" : (result.optional ? "⚠️  SKIP" : "❌ FAIL");
    const criticalMarker = serviceInfo.critical ? " [CRITICAL]" : "";

    console.log(`${status} ${serviceInfo.name}${criticalMarker}`);
    if (!result.accessible && result.error) {
      console.log(`     Error: ${result.error}`);
    }
    if (result.metadata && verbose) {
      console.log(`     Metadata: ${JSON.stringify(result.metadata, null, 2).replace(/\n/g, "\n     ")}`);
    }

    if (result.accessible) {
      successes++;
    } else if (result.optional) {
      warnings++;
    } else if (serviceInfo.critical) {
      criticalFailures++;
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Total: ${successes} accessible, ${warnings} optional skipped, ${criticalFailures} critical failures`);
  console.log("─".repeat(70) + "\n");

  if (criticalFailures > 0) {
    console.error("❌ CRITICAL: Application submission is BLOCKED due to missing services.");
    console.error("   Fix the above errors before running batch jobs.\n");
    process.exit(2);
  } else if (warnings > 0) {
    console.log("⚠️  WARNING: Some optional services are unavailable (non-blocking).\n");
    process.exit(0);
  } else {
    console.log("✅ SUCCESS: All required services are accessible.\n");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("\n❌ FATAL ERROR:", err.message);
  if (verbose) console.error(err.stack);
  process.exit(1);
});