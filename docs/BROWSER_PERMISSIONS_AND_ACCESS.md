# Browser Agent Permissions & Service Access Audit

**Generated:** 2026-03-07
**Purpose:** Security audit of browser automation permissions, external service access, and operational boundaries

---

## Browser Launch Permissions

### Greenhouse Agent (`test-apply.mjs`)

**Launch Configuration:**
```javascript
puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage"
  ]
})
```

**Chrome Flags Breakdown:**
- `--no-sandbox` - **CRITICAL SECURITY FLAG** - Disables Chrome's sandboxing. Required for containerized environments (Docker/Lambda) but increases attack surface
- `--disable-setuid-sandbox` - Disables the SUID sandbox (alternative sandboxing mechanism)
- `--disable-dev-shm-usage` - Uses `/tmp` instead of `/dev/shm` for shared memory (fixes crashes in Docker with limited shared memory)

**Browser Permissions Granted:**
- ✅ **JavaScript execution** - Full access to execute arbitrary JS in page context
- ✅ **DOM manipulation** - Read/write access to all page elements
- ✅ **Network requests** - Can make XHR/fetch to any domain (subject to CORS)
- ✅ **File system (upload)** - Can upload local files to forms
- ✅ **Screenshots** - Can capture full page screenshots
- ✅ **Cookies/Storage** - Read/write localStorage, sessionStorage, cookies
- ✅ **reCAPTCHA execution** - Can trigger `grecaptcha.enterprise.execute()`
- ❌ **Webcam/Microphone** - Not requested
- ❌ **Geolocation** - Not requested
- ❌ **Notifications** - Not requested
- ❌ **Clipboard** - Not explicitly requested (may have implicit access)

**Page Capabilities:**
```javascript
page.evaluate()           // Execute arbitrary JS in browser context
page.type()               // Simulate keyboard input
page.click()              // Simulate mouse clicks
page.goto()               // Navigate to any URL
page.screenshot()         // Capture visual state
page.setUserAgent()       // Spoof browser identity
page.uploadFile()         // Upload local files
```

### Lever Agent (`lever-apply.mjs`)

**Launch Configuration:**
```javascript
puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: false,  // HEADFUL MODE - shows browser window
  args: [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1200,900"
  ],
  ignoreDefaultArgs: ["--enable-automation"]
})
```

**Additional Flags:**
- `--disable-blink-features=AutomationControlled` - Hides automation detection (removes `navigator.webdriver`)
- `ignoreDefaultArgs: ["--enable-automation"]` - Removes automation indicator
- **Stealth injection:**
  ```javascript
  page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  })
  ```

**hCaptcha Handling:**
- Relies on headful mode for auto-solve
- May pause for manual intervention if challenge appears

### Dover Agent (`dover-apply.mjs`)

**Launch Configuration:**
```javascript
puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: false,
  args: [
    "--no-sandbox",
    "--window-size=1200,900",
    "--disable-blink-features=AutomationControlled"
  ],
  defaultViewport: { width: 1200, height: 900 },
  ignoreDefaultArgs: ["--enable-automation"]
})
```

**Cloudflare Turnstile Handling:**
- Auto-passes in headful Chrome (no manual intervention)
- Simple form automation (no complex field logic)

### Lambda-Ready Agent (`greenhouse-browser-apply.ts`)

**Launch Configuration:**
```javascript
puppeteer.launch({
  args: chromium.default.args,  // @sparticuz/chromium optimized args
  defaultViewport: chromium.default.defaultViewport,
  executablePath: await chromium.default.executablePath(),
  headless: true
})
```

**Sparticuz/Chromium Args (typical):**
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`
- `--disable-gpu`
- `--single-process` (for Lambda memory constraints)
- `--disable-extensions`
- `--disable-default-apps`

---

## External Service Access & Credentials

### 1. Gmail API (OAuth 2.0)

**Purpose:** Retrieve Greenhouse security codes from email
**Scopes Required:** `https://www.googleapis.com/auth/gmail.readonly` (or broader mail access)

**Credentials:**
```bash
GOOGLE_CLIENT_ID          # OAuth 2.0 client ID
GOOGLE_CLIENT_SECRET      # OAuth 2.0 client secret
GOOGLE_REFRESH_TOKEN      # Long-lived refresh token
```

**Access Pattern:**
```javascript
// Token refresh
POST https://oauth2.googleapis.com/token
  refresh_token: GOOGLE_REFRESH_TOKEN
  → Returns short-lived access_token

// Email search
GET https://gmail.googleapis.com/gmail/v1/users/me/messages
  q: "from:greenhouse-mail.io subject:security code after:{epoch}"
  maxResults: 3
  Authorization: Bearer {access_token}

// Message fetch
GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full
  Authorization: Bearer {access_token}
```

**Data Accessed:**
- ✅ Email subject lines
- ✅ Email body content (HTML + plain text)
- ✅ Email timestamps (`internalDate`)
- ✅ Sender addresses
- ❌ Email attachments (not accessed)
- ❌ Email deletion/modification (read-only)

**Security Considerations:**
- Refresh token has indefinite lifetime until revoked
- Access token expires in 1 hour
- Full mailbox read access (not scoped to specific senders)

### 2. Redis Cloud

**Purpose:** Application deduplication, form field metadata storage
**Connection:**
```bash
REDIS_HOST      # redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com
REDIS_PORT      # 17054
REDIS_PASSWORD  # Authentication password
```

**Data Stored:**

**Application tracking:**
```
gh_applied:{company}:{jobId}         → JSON { status, title, resumeVariant, appliedAt }
lever_applications:{company}:{id}    → JSON { company, postingId, jobTitle, appliedAt, ... }
dover_applications:{company}:{id}    → JSON { companySlug, jobId, appliedAt, status }
```

**Form field metadata:**
```
form_fields:{token}:{id}              → JSON { boardToken, jobId, scannedAt, success, sections, fields[] }
form_fields:index                     → ZSET (score=timestamp, member="{token}:{id}")
form_fields:questions:{token}:{id}    → HASH (question_label → { type, required, options })
```

**TTL:** 90 days (7,776,000 seconds)

**Operations:**
- `SET` - Store application results
- `GET` - Check for existing applications
- `ZADD` - Add to sorted index
- `HSET` - Store question metadata
- `EXPIRE` - Set TTL

**Security Considerations:**
- No encryption at rest (Redis Cloud default)
- Password-based auth (no mTLS)
- Contains PII: candidate names, emails, phone numbers
- Contains job search history

### 3. Netlify Blobs

**Purpose:** Store application state, screenshots, page HTML
**Credentials:**
```bash
NETLIFY_AUTH_TOKEN    # API token for blob storage
NETLIFY_SITE_ID       # f369d057-d9f8-43a6-9433-acf31d4b2751
```

**Data Stored:**
```
{token}/{jobId}/{timestamp}/metadata.json      → Application metadata + field values
{token}/{jobId}/{timestamp}/page.html          → Full page HTML
{token}/{jobId}/{timestamp}/gh_apply_*.png     → Screenshots (step1, step3_code, final)
```

**Blob Keys Structure:**
```javascript
{
  metadata: {
    boardToken, jobId, companyName, candidateEmail,
    timestamp, success, message, securityCodeUsed, finalUrl, stepReached
  },
  fieldValues: { first_name, last_name, email, phone, ... },
  screenshotKeys: [ ... ]
}
```

**Security Considerations:**
- Contains full candidate PII
- Contains plaintext security codes
- Contains complete page HTML (may include tokens)
- No explicit retention policy
- Auth token has broad site access

### 4. Slack Webhooks (Optional)

**Purpose:** Alert on unhandled form fields
**Credentials:**
```bash
SLACK_WEBHOOK_URL    # Incoming webhook URL
```

**Data Sent:**
```javascript
{
  blocks: [
    { type: "header", text: "Auto-Apply: Unhandled Fields" },
    { type: "section", text: "Job: <url|{token}/{id}>" },
    { type: "section", text: "Required fields not filled: ..." },
    { type: "section", text: "Validation errors: ..." }
  ]
}
```

**Security Considerations:**
- Webhook URL is a secret (grants write access to channel)
- May leak job application URLs
- No encryption in transit (HTTPS only)

### 5. File System Access

**Local Paths (Development):**
```bash
# Resume PDFs (local development)
/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb*.pdf

# Screenshots (temporary)
/tmp/gh_apply_{token}_{id}_step1.png
/tmp/gh_apply_{token}_{id}_step3_code.png
/tmp/gh_apply_{token}_{id}_final.png

# Chrome executable
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

**Lambda/Serverless:**
```bash
# Only /tmp is writable
/tmp/*                                    # Screenshots, temp files
/opt/chrome                               # Chrome binary (@sparticuz/chromium)
/var/task/.context/attachments/*.pdf      # Resume PDFs (bundled)
```

**Permissions:**
- ✅ Read local resume PDFs
- ✅ Write screenshots to `/tmp`
- ✅ Execute Chrome binary
- ❌ No access to home directory in production
- ❌ No write access outside `/tmp` in Lambda

---

## Network Access Patterns

### Outbound Connections

**Application Submission:**
- `https://boards.greenhouse.io/*` - Greenhouse ATS
- `https://jobs.lever.co/*` - Lever ATS
- `https://app.dover.com/*` - Dover ATS

**CAPTCHA Services:**
- `https://www.google.com/recaptcha/*` - reCAPTCHA Enterprise
- `https://hcaptcha.com/*` - hCaptcha (Lever)
- `https://challenges.cloudflare.com/*` - Cloudflare Turnstile (Dover)

**External APIs:**
- `https://oauth2.googleapis.com/token` - Gmail token refresh
- `https://gmail.googleapis.com/gmail/v1/*` - Gmail API

**CDNs & Assets:**
- `https://www.gstatic.com/*` - Google static assets
- `https://*.cloudflare.com/*` - Cloudflare assets

### Inbound Connections

**None** - The browser agent does not accept inbound connections. All communication is outbound-initiated.

---

## Script-Specific Access Matrix

| Script | Browser | Gmail | Redis | Netlify | Slack | File System |
|--------|---------|-------|-------|---------|-------|-------------|
| `test-apply.mjs` | ✅ Headless | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Read/Write |
| `batch-greenhouse.mjs` | ✅ Via subprocess | ✅ Via subprocess | ✅ Yes | ✅ Via subprocess | ✅ Via subprocess | ✅ Read (resumes) |
| `lever-apply.mjs` | ✅ Headful | ❌ No | ✅ Yes | ❌ No | ✅ Yes | ✅ Read (resume) |
| `dover-apply.mjs` | ✅ Headful | ❌ No | ✅ Yes | ❌ No | ❌ No | ✅ Read (resume) |
| `greenhouse-browser-apply.ts` | ✅ Headless (Lambda) | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Read (resume) |
| `batch-dover.mjs` | ✅ Via subprocess | ❌ No | ✅ Yes | ❌ No | ❌ No | ✅ Read (resumes) |
| `dover-crawl*.mjs` | ✅ Headful | ❌ No | ✅ Yes | ❌ No | ❌ No | ✅ Write (job list JSON) |
| `check-status.mjs` | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| `redis-queries.mjs` | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No |
| `debug-gmail.mjs` | ❌ No | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| `get-oauth-token.mjs` | ❌ No | ✅ OAuth setup | ❌ No | ❌ No | ❌ No | ❌ No |

---

## Data Retention & Privacy

### Personal Information Collected

**Candidate Data (in code):**
- First name: "Jason"
- Last name: "Bian"
- Email: "jason.bian64@gmail.com"
- Phone: "+1-734-730-6569"
- Full resume text (embedded in `test-apply.mjs:252-285`)
- LinkedIn URL, GitHub URL

**Stored in Redis:**
- Application status (PASS/FAIL/ERROR)
- Job titles, company names
- Timestamps of applications
- Resume variant used
- Form field metadata (labels, types, options)

**Stored in Netlify Blobs:**
- All candidate data
- Security codes (plaintext)
- Full page HTML (may contain CSRF tokens)
- Screenshots showing filled forms
- Field values submitted

**Stored in Gmail:**
- Security codes received from Greenhouse
- Email history (never deleted by agent)

### Retention Policies

| Service | Retention | Deletion Method |
|---------|-----------|-----------------|
| Redis Cloud | 90 days (auto-expire) | Automatic via `EXPIRE` command |
| Netlify Blobs | Indefinite | Manual deletion required |
| Gmail | Indefinite | Manual deletion required |
| `/tmp` screenshots | Until server restart | Automatic (ephemeral) |
| Slack messages | Indefinite (per workspace policy) | Manual deletion required |

### GDPR/Privacy Considerations

**Data Subject Rights:**
- ❌ **Right to be forgotten:** Not implemented (manual deletion needed)
- ❌ **Data export:** No automated export mechanism
- ❌ **Consent mechanism:** No opt-in/opt-out for data collection
- ❌ **Data minimization:** Stores full page HTML (excessive)

**Recommendations:**
1. Implement TTL for Netlify Blobs (match Redis 90 days)
2. Redact security codes before storage
3. Remove full HTML storage (store only metadata)
4. Add data export script
5. Implement candidate data encryption at rest

---

## Security Risks & Mitigations

### High Risk

**1. `--no-sandbox` flag**
- **Risk:** Disables Chrome's process isolation. Malicious page JS can escape browser.
- **Mitigation:** Only visit trusted domains (Greenhouse/Lever/Dover). Use Content Security Policy.
- **Status:** ⚠️ Required for containerized environments

**2. Plaintext credentials in environment**
- **Risk:** `GOOGLE_REFRESH_TOKEN`, `REDIS_PASSWORD`, `NETLIFY_AUTH_TOKEN` in cleartext.
- **Mitigation:** Use secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault).
- **Status:** ⚠️ Not implemented

**3. Broad Gmail access**
- **Risk:** Refresh token can read entire mailbox, not scoped to Greenhouse emails.
- **Mitigation:** Use Gmail API filters, implement principle of least privilege.
- **Status:** ⚠️ Not scoped

### Medium Risk

**4. PII in Redis without encryption**
- **Risk:** Candidate names, emails, phone numbers stored in plaintext.
- **Mitigation:** Enable Redis encryption at rest, use TLS for connections.
- **Status:** ⚠️ Not encrypted

**5. Indefinite Netlify Blob storage**
- **Risk:** Sensitive data accumulates without cleanup.
- **Mitigation:** Implement automated cleanup (90-day TTL).
- **Status:** ⚠️ No TTL

**6. Stealth mode / bot detection evasion**
- **Risk:** Violates ATS terms of service, may result in IP bans.
- **Mitigation:** Rate limiting, respect robots.txt, add User-Agent identification.
- **Status:** ⚠️ Active evasion

### Low Risk

**7. Local file path hardcoding**
- **Risk:** Resume paths are macOS-specific, won't work in production.
- **Mitigation:** Use environment variables, validate paths exist.
- **Status:** ✅ Mitigated via `RESUME_PATH` env var

**8. Screenshot storage in `/tmp`**
- **Risk:** May fill disk on long-running processes.
- **Mitigation:** Implement cleanup, use bounded storage.
- **Status:** ⚠️ No cleanup

---

## Operational Boundaries

### What the Agent CAN Do

✅ Submit job applications to Greenhouse/Lever/Dover
✅ Fill text, select, textarea, checkbox fields
✅ Upload resume PDFs
✅ Handle reCAPTCHA Enterprise (via browser execution)
✅ Handle hCaptcha (via headful mode)
✅ Handle Cloudflare Turnstile (via headful mode)
✅ Retrieve security codes from Gmail
✅ Store application history in Redis
✅ Capture screenshots of submission process
✅ Parse form field metadata
✅ Send Slack alerts on validation errors

### What the Agent CANNOT Do

❌ Bypass CAPTCHAs without browser execution
❌ Submit to new-style React forms (Greenhouse v2)
❌ Handle file downloads/email attachments
❌ Create Gmail filters or delete emails
❌ Modify Redis data outside this application
❌ Access Netlify Blobs from other sites
❌ Read from or write to home directory in Lambda
❌ Accept inbound network connections
❌ Access webcam, microphone, or geolocation
❌ Modify system settings or install software

### Rate Limits

**Gmail API:**
- 250 quota units per user per second
- `users.messages.list`: 5 quota units per call
- `users.messages.get`: 5 quota units per call
- **Effective limit:** ~50 email fetches/second (unlikely to hit)

**Redis Cloud:**
- Plan-dependent (likely 30-50 connections max)
- No explicit rate limit for free tier

**Greenhouse/Lever/Dover:**
- No official API rate limits (using public web forms)
- Risk: IP-based rate limiting after ~10-20 submissions/hour

**Implemented Throttling:**
- 5 seconds between applications (`batch-greenhouse.mjs:243`)
- 8 seconds between Gmail polls (`test-apply.mjs:436`)

---

## Deployment Security Checklist

**Pre-Production:**
- [ ] Rotate all API credentials
- [ ] Enable Redis TLS connections
- [ ] Implement secrets manager (not env vars)
- [ ] Add Netlify Blob TTL (90 days)
- [ ] Implement data export script
- [ ] Add rate limiting per company
- [ ] Set up monitoring/alerting for failures
- [ ] Document incident response plan
- [ ] Add CAPTCHA solver fallback (2Captcha/Anti-Captcha)
- [ ] Implement IP rotation (residential proxies)

**Production:**
- [ ] Use least-privilege IAM roles (Lambda/ECS)
- [ ] Enable CloudWatch Logs encryption
- [ ] Implement VPC for Redis connections
- [ ] Add WAF rules for outbound traffic
- [ ] Enable AWS GuardDuty
- [ ] Set up automated secret rotation
- [ ] Implement data deletion on request
- [ ] Add audit logging for all data access
- [ ] Configure SIEM integration
- [ ] Document data retention policies

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-07 | Initial audit | Claude Code |

---

**Document Version:** 1.0
**Next Review:** 2026-04-07 (30 days)