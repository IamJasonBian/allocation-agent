# Quick Reference - Browser Agent Permissions

**Last Updated:** 2026-03-07

---

## TL;DR - Browser Permissions

| Permission | Greenhouse | Lever | Dover | Lambda Agent |
|------------|------------|-------|-------|--------------|
| **JavaScript Execution** | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **DOM Read/Write** | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **File Upload** | ✅ PDF only | ✅ PDF only | ✅ PDF only | ✅ PDF only |
| **Screenshots** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Network Requests** | ✅ Any domain | ✅ Any domain | ✅ Any domain | ✅ Any domain |
| **reCAPTCHA** | ✅ Execute | ❌ No | ❌ No | ✅ Execute |
| **hCaptcha** | ❌ No | ✅ Headful solve | ❌ No | ❌ No |
| **Cloudflare Turnstile** | ❌ No | ❌ No | ✅ Headful solve | ❌ No |
| **Webcam/Mic** | ❌ Never | ❌ Never | ❌ Never | ❌ Never |
| **Geolocation** | ❌ Never | ❌ Never | ❌ Never | ❌ Never |

---

## Service Access at a Glance

```bash
# Check all services
npm run audit-access

# Check specific service
npm run audit-access -- --service=gmail
npm run audit-access -- --service=redis --verbose
```

### Service Dependencies by Script

**Greenhouse (test-apply.mjs):**
- ✅ **REQUIRED:** Gmail API, Redis, Chrome, Resume PDF
- ⚠️ **OPTIONAL:** Netlify Blobs, Slack Webhooks

**Lever (lever-apply.mjs):**
- ✅ **REQUIRED:** Chrome (headful), Resume PDF
- ⚠️ **OPTIONAL:** Redis, Slack Webhooks

**Dover (dover-apply.mjs):**
- ✅ **REQUIRED:** Chrome (headful), Resume PDF
- ⚠️ **OPTIONAL:** Redis

---

## Security Flags Decoder

### `--no-sandbox`
```
⚠️  CRITICAL SECURITY RISK
Disables Chrome's process isolation sandbox.
Required for: Docker, Lambda, any containerized environment
Risk: Malicious page JS can escape browser
Mitigation: Only visit trusted domains (Greenhouse/Lever/Dover)
```

### `--disable-blink-features=AutomationControlled`
```
🕵️ STEALTH MODE
Hides automation detection markers.
Removes: navigator.webdriver property
Risk: Violates ATS terms of service
Mitigation: Rate limiting, respectful usage
```

### `--disable-dev-shm-usage`
```
🐳 CONTAINER FIX
Uses /tmp instead of /dev/shm for shared memory.
Required for: Docker with limited shm (default 64MB)
Risk: None (performance trade-off only)
```

### `headless: "new"` vs `headless: false`
```
headless: "new"     → Invisible browser (production)
headless: false     → Visible browser (CAPTCHA solving)

Greenhouse: "new" (reCAPTCHA Enterprise works headless)
Lever:      false (hCaptcha needs headful)
Dover:      false (Cloudflare Turnstile needs headful)
```

---

## Environment Variables

### Critical (Application Blocked Without)

```bash
# Gmail (Greenhouse security codes)
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
GOOGLE_REFRESH_TOKEN="1//xxx"

# Redis (deduplication)
REDIS_PASSWORD="xxx"
REDIS_HOST="redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com"
REDIS_PORT="17054"

# Chrome
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Resume
RESUME_PATH="/path/to/resume.pdf"
```

### Optional (Graceful Degradation)

```bash
# Netlify Blobs (state storage)
NETLIFY_AUTH_TOKEN="xxx"
NETLIFY_SITE_ID="f369d057-d9f8-43a6-9433-acf31d4b2751"

# Slack (alerts)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/xxx"
```

---

## Data Flow Map

```
┌─────────────────┐
│  Browser Agent  │
└────────┬────────┘
         │
         ├─► Gmail API ────────► Security codes (read-only)
         │                       └─ Scope: gmail.readonly
         │
         ├─► Redis Cloud ───────► Application history (read/write)
         │                       ├─ gh_applied:*
         │                       ├─ lever_applications:*
         │                       ├─ dover_applications:*
         │                       └─ form_fields:*
         │
         ├─► Netlify Blobs ─────► State snapshots (write-only)
         │                       ├─ metadata.json
         │                       ├─ page.html
         │                       └─ screenshots/*.png
         │
         ├─► Slack Webhooks ────► Alerts (write-only)
         │                       └─ Unhandled field warnings
         │
         └─► File System ───────► Resume PDFs (read-only)
                                 └─ /tmp/screenshots (write)
```

---

## PII Exposure Points

| Data Type | Location | Retention | Encryption |
|-----------|----------|-----------|------------|
| **Name** | Redis, Netlify, Slack alerts | 90 days / Indefinite | ❌ Plaintext |
| **Email** | Redis, Netlify, Slack alerts | 90 days / Indefinite | ❌ Plaintext |
| **Phone** | Redis, Netlify | 90 days / Indefinite | ❌ Plaintext |
| **Resume** | Netlify, file uploads | Indefinite | ❌ Plaintext |
| **Security Codes** | Netlify metadata | Indefinite | ❌ Plaintext |
| **OAuth Tokens** | Environment variables | Session | ❌ Plaintext |
| **Screenshots** | Netlify, /tmp | Indefinite / Session | ❌ Plaintext |

**Recommendation:** Implement encryption at rest for all PII storage.

---

## Rate Limits & Throttling

```
Gmail API:       250 quota units/sec (unlikely to hit)
Redis Cloud:     30-50 connections (plan-dependent)
Greenhouse:      ~10-20 submissions/hour (IP-based, unofficial)
Lever:           Unknown (use headful to appear human)
Dover:           Unknown (use headful to appear human)

Implemented:     5s between apps (batch-greenhouse.mjs)
                 8s between Gmail polls (test-apply.mjs)
```

---

## Pre-Flight Checklist

**Before running batch jobs:**

```bash
# 1. Verify all services accessible
npm run audit-access

# 2. Check Redis deduplication
npm run check-status

# 3. Verify resume PDF exists
ls -lh "$RESUME_PATH"

# 4. Test single application
npm run test-apply -- <company> <jobId>

# 5. Monitor first 3 submissions manually
npm run batch-greenhouse -- <company> | tee batch.log

# 6. Check for validation errors
grep "VALIDATION ERROR" batch.log
```

---

## Incident Response

**If blocked by CAPTCHA:**
```bash
# Switch to headful mode (lever-apply.mjs / dover-apply.mjs)
# Manually solve CAPTCHA when prompted
# Wait 24 hours before retrying headless
```

**If Gmail security codes not arriving:**
```bash
# Check inbox for manual codes
node scripts/debug-gmail.mjs

# Verify OAuth token refresh
npm run audit-access -- --service=gmail --verbose
```

**If Redis connection fails:**
```bash
# Verify credentials
npm run audit-access -- --service=redis

# Check application history
node scripts/redis-queries.mjs
```

**If IP banned:**
```bash
# Wait 24 hours
# Implement IP rotation (residential proxies)
# Reduce submission rate to 1 per 30 seconds
```

---

## Operational Limits

**The agent CANNOT:**
- ❌ Solve CAPTCHAs without browser execution
- ❌ Submit to React-based Greenhouse forms (v2)
- ❌ Handle MFA/2FA on application forms
- ❌ Parse job descriptions for keyword matching (see: job-matcher.ts)
- ❌ Update existing applications (one-way submission)
- ❌ Delete data from Redis/Netlify (manual cleanup required)
- ❌ Recover from Gmail token revocation (manual re-auth)

**The agent CAN:**
- ✅ Fill 95%+ of standard ATS form fields
- ✅ Upload PDF resumes (not DOCX/TXT)
- ✅ Handle Select2 autocomplete (AJAX-based)
- ✅ Solve reCAPTCHA Enterprise via browser execution
- ✅ Parse email for 8-12 character security codes
- ✅ Retry failed submissions (manual retry only)
- ✅ Store form metadata for future analysis

---

## Production Deployment TODOs

**Critical (blocks production):**
- [ ] Migrate credentials to secrets manager (AWS Secrets / GCP Secret Manager)
- [ ] Enable Redis TLS connections
- [ ] Implement Netlify Blob TTL (90 days)
- [ ] Add IP rotation (residential proxies)
- [ ] Set up CloudWatch monitoring

**High Priority:**
- [ ] Encrypt PII at rest (Redis + Netlify)
- [ ] Implement data export script (GDPR compliance)
- [ ] Add rate limiting per company (max 10/hour)
- [ ] Set up alerting for CAPTCHA blocks
- [ ] Document incident response playbook

**Medium Priority:**
- [ ] Add CAPTCHA solver fallback (2Captcha/Anti-Captcha)
- [ ] Implement automated secret rotation
- [ ] Add audit logging for all data access
- [ ] Set up SIEM integration
- [ ] Create data deletion workflow

---

**For full details, see:** [BROWSER_PERMISSIONS_AND_ACCESS.md](./BROWSER_PERMISSIONS_AND_ACCESS.md)