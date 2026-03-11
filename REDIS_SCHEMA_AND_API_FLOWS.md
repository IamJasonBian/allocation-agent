# Redis Schema & API Flows Documentation

Complete documentation of the allocation-agent's Redis schema and API flows for job parsing and auto-apply.

---

## Table of Contents

1. [Redis Schema](#redis-schema)
2. [Job Parsing API Flow](#job-parsing-api-flow)
3. [Auto-Apply API Flow](#auto-apply-api-flow)
4. [Data Flow Diagrams](#data-flow-diagrams)

---

## Redis Schema

### Connection Configuration

**Location**: `src/lib/redis.ts`

```typescript
{
  host: "redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com",
  port: 17054,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  commandTimeout: 10000
}
```

**Provider**: Redis Labs (cloud-hosted)

---

### Key Patterns

#### 1. **Job Metadata** (`jobs:{company}:{jobId}`)

**Type**: Hash
**TTL**: Persistent (no expiration)
**Purpose**: Store parsed job metadata from Greenhouse API

**Fields**:
```json
{
  "job_id": "8303740002",
  "company": "point72",
  "company_name": "Point72",
  "title": "Data Engineer [New York]",
  "url": "https://boards.greenhouse.io/point72/jobs/8303740002",
  "department": "Technology",
  "location": "new_york_ny",
  "status": "active",
  "first_seen_at": "2026-03-11T10:30:00.000Z",
  "last_seen_at": "2026-03-11T15:45:00.000Z",
  "updated_at": "2026-03-10T14:20:00.000Z",
  "content_hash": "a3f5e9b2c1d4f7e8",  // SHA256 hash of (title|location|dept)
  "tags": "data,engineering"           // Comma-separated tags
}
```

**Hash Function** (`refresh-jobs.mjs:33`):
```javascript
contentHash(title, location, dept) {
  return createHash("sha256")
    .update(`${title}|${location}|${dept}`)
    .digest("hex")
    .slice(0, 16);
}
```

---

#### 2. **Company Index** (`idx:company:{company}`)

**Type**: Set
**Purpose**: Fast lookup of all jobs for a company

**Members**: Composite keys `{company}:{jobId}`

Example:
```
idx:company:point72 = {
  "point72:8303740002",
  "point72:7829230002",
  "point72:8352153002",
  ...
}
```

---

#### 3. **Status Index** (`idx:status:{status}`)

**Type**: Set
**Purpose**: Filter jobs by status (active, archived, etc.)

Example:
```
idx:status:active = {
  "point72:8303740002",
  "clearstreet:6675504",
  ...
}
```

---

#### 4. **Tag Index** (`idx:tag:{tag}`)

**Type**: Set
**Purpose**: Search jobs by tags

**Tags Extracted** (`refresh-jobs.mjs:37`):
- `quantitative` - if title/dept contains "quant"
- `data` - if contains "data"
- `engineering` - if contains "software" or "engineer"
- `research` - if contains "research"
- `ml` - if contains "machine learning", "ml", or "ai"
- `trading` - if contains "trad"
- `infrastructure` - if contains "infra"
- `devops` - if contains "devops", "sre", "reliability"

Example:
```
idx:tag:ml = {
  "point72:8170176002",   // Machine Learning Engineer
  "imc:4570309101",       // Machine Learning Engineer
  ...
}
```

---

#### 5. **Feed: New Jobs** (`feed:new`)

**Type**: Sorted Set
**Score**: Unix timestamp (seconds)
**Purpose**: Time-ordered feed of newly discovered jobs

Example:
```
feed:new = {
  1710158400 => "point72:8303740002",
  1710158410 => "clearstreet:7361221",
  ...
}
```

---

#### 6. **Feed: Company Jobs** (`feed:company:{company}`)

**Type**: Sorted Set
**Score**: Unix timestamp
**Purpose**: Time-ordered feed per company

---

#### 7. **Application Tracking** (`gh_applied:{company}:{jobId}`)

**Type**: String (JSON)
**TTL**: 90 days
**Purpose**: Track application status to prevent duplicate submissions

**Schema**:
```json
{
  "status": "PASS | FAIL | ERROR | in_progress",
  "title": "Data Engineer [New York]",
  "resumeVariant": "resume_jasonzb_oct15_m.pdf",
  "appliedAt": "2026-03-11T16:20:00.000Z",
  "startedAt": "2026-03-11T16:15:00.000Z",
  "output": "Last 500 chars of execution output",
  "error": "Error message if failed"
}
```

**States**:
- `in_progress` - Application in flight (set immediately before submission)
- `PASS` - Successfully submitted
- `FAIL` - Submission failed (form errors, validation issues)
- `ERROR` - Execution error (timeout, network failure, crash)

---

#### 8. **Job Runs** (`job_runs:{platform}:{company}:{jobId}`)

**Type**: String (JSON)
**TTL**: 90 days
**Purpose**: Track application metadata for analytics

**Schema** (`scripts/lib/job-runs.mjs:50`):
```json
{
  "platform": "greenhouse",
  "company": "point72",
  "jobId": "8303740002",
  "jobTitle": "Data Engineer [New York]",
  "resumeVariant": "resume_tmp.pdf",
  "resumeSkillsMatched": ["python", "spark", "aws"],
  "jdStackDetected": ["Python", "Spark", "Airflow", "AWS"],
  "status": "PASS",
  "message": "Application submitted successfully",
  "appliedAt": "2026-03-11T16:20:00.000Z"
}
```

**Index** (`job_runs:index`):
- **Type**: Sorted Set
- **Score**: Unix timestamp
- **Members**: Keys of all `job_runs:*` entries
- **Purpose**: Time-ordered query of all applications

---

#### 9. **Fetch Metadata** (`meta:last_fetch:{company}`)

**Type**: String (ISO timestamp)
**Purpose**: Track when jobs were last fetched for each company

Example:
```
meta:last_fetch:point72 = "2026-03-11T15:30:00.000Z"
```

---

## Job Parsing API Flow

### Flow 1: Refresh Jobs (Periodic Fetch)

**Script**: `scripts/refresh-jobs.mjs`
**Trigger**: Manual or scheduled (cron)
**Platforms**: Greenhouse only (Lever/Dover use different scripts)

```
┌────────────────────────────────────────────────────────────┐
│                    REFRESH JOBS FLOW                       │
└────────────────────────────────────────────────────────────┘

1. USER INVOKES
   │
   ├─> node scripts/refresh-jobs.mjs [company]
   │
   └─> Reads company list:
       [clearstreet, imc, point72, janestreet, ...]

2. FOR EACH COMPANY
   │
   ├─> Fetch: GET https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
   │   Headers: Accept: application/json
   │   Timeout: 15s
   │
   ├─> Response:
   │   {
   │     "jobs": [
   │       {
   │         "id": 8303740002,
   │         "title": "Data Engineer [New York]",
   │         "location": { "name": "New York, NY" },
   │         "departments": [{ "name": "Technology" }],
   │         "absolute_url": "https://...",
   │         "updated_at": "2026-03-10T14:20:00.000Z"
   │       },
   │       ...
   │     ]
   │   }
   │
   ├─> FOR EACH JOB:
   │   │
   │   ├─> Calculate content_hash = SHA256(title|location|dept).slice(0,16)
   │   │
   │   ├─> Extract tags: extractTags(title, dept)
   │   │   • "quant" → quantitative
   │   │   • "data" → data
   │   │   • "engineer" → engineering
   │   │   • "ml" → ml
   │   │   • ...
   │   │
   │   ├─> Check: HGET jobs:{company}:{jobId} content_hash
   │   │
   │   ├─> IF hash == null:          // New job
   │   │   │
   │   │   ├─> HSET jobs:{company}:{jobId} {all fields}
   │   │   ├─> SADD idx:company:{company} {company}:{jobId}
   │   │   ├─> SADD idx:status:active {company}:{jobId}
   │   │   ├─> ZADD feed:new {timestamp} {company}:{jobId}
   │   │   ├─> ZADD feed:company:{company} {timestamp} {company}:{jobId}
   │   │   └─> FOR EACH tag: SADD idx:tag:{tag} {company}:{jobId}
   │   │
   │   ├─> ELSE IF hash != existing: // Updated job
   │   │   │
   │   │   └─> HSET jobs:{company}:{jobId} {updated fields}
   │   │
   │   └─> ELSE:                     // Unchanged job
   │       │
   │       └─> HSET jobs:{company}:{jobId} last_seen_at {now}
   │
   ├─> SET meta:last_fetch:{company} {now}
   │
   └─> Wait 300ms (rate limiting)

3. OUTPUT
   │
   └─> Console: "Total: new=5 updated=2 unchanged=48"
```

**Rate Limiting**: 300ms delay between companies
**Concurrency**: Sequential (one company at a time)
**Error Handling**: Skip company on failure, continue to next

---

### Flow 2: Parse JD Tech Stack

**Script**: `scripts/lib/jd-parser.mjs`
**Used By**: `batch-greenhouse.mjs`, `batch-dover.mjs`
**Purpose**: Extract tech stack from job description

```
┌────────────────────────────────────────────────────────────┐
│                  JD PARSING FLOW                           │
└────────────────────────────────────────────────────────────┘

1. INPUT
   │
   └─> Job description (HTML or plain text)

2. STRIP HTML (jd-parser.mjs:10)
   │
   ├─> Replace <br>, <p>, <div>, <li> → \n
   ├─> Remove all other HTML tags
   └─> Decode HTML entities (&amp;, &lt;, etc.)

3. PATTERN MATCHING (jd-parser.mjs:30-154)
   │
   ├─> FOR EACH CATEGORY:
   │   │
   │   ├─> Languages: /\bpython\b/, /\bjava\b/, /\btypescript\b/, ...
   │   │   • Special: /\bgo\b/ requires context (golang, go lang, etc.)
   │   │
   │   ├─> Frameworks: /\breact\b/, /\bspark\b/, /\bpytorch\b/, ...
   │   │   • Includes ML: PyTorch, TensorFlow, Keras, scikit-learn
   │   │   • Data: Spark, Airflow, Dagster, dbt
   │   │
   │   ├─> Databases: /\bpostgres\b/, /\bmongo\b/, /\bredshift\b/, ...
   │   │   • Includes data formats: Parquet, Avro, Delta Lake
   │   │
   │   ├─> Cloud: /\baws\b/, /\bgcp\b/, /\bazure\b/, ...
   │   │   • AWS services: S3, EC2, Lambda, EKS, EMR, SageMaker
   │   │   • IaC: CloudFormation, CDK, Terraform
   │   │
   │   ├─> Tools: /\bkafka\b/, /\bdocker\b/, /\bkubernetes\b/, ...
   │   │   • CI/CD: Jenkins, GitHub Actions, CircleCI
   │   │   • Monitoring: Prometheus, Grafana, Datadog
   │   │
   │   └─> Niche (jd-parser.mjs:161-251):
   │       • Low-latency: Aeron, eBPF, DPDK, kernel bypass
   │       • Financial: FIX Protocol, Order Book, SBE, ITCH
   │       • Distributed: Raft, Paxos, ZooKeeper, etcd
   │       • ML Inference: ONNX, TensorRT, Triton, vLLM
   │       • 3D/CV: CUDA, cuDNN, OpenCL
   │       • Storage: RocksDB, TiKV, CockroachDB
   │       • ...
   │
   └─> Return:
       {
         languages: ["Python", "Java"],
         frameworks: ["Spark", "PyTorch"],
         databases: ["PostgreSQL", "Redshift"],
         cloud: ["AWS", "S3", "EMR"],
         tools: ["Docker", "Kubernetes"],
         niche: ["FIX Protocol", "Low-Latency Systems"]
       }

4. FLATTEN (jd-parser.mjs:293)
   │
   └─> flattenStack(stack) → ["Python", "Java", "Spark", ...]
```

**Regex Patterns**: Word boundary aware (`\b...\b`)
**Deduplication**: Set-based (no duplicates per category)
**Canonicalization**: Maps variants to standard names (e.g., "postgres" → "PostgreSQL")

---

## Auto-Apply API Flow

### Flow 1: Greenhouse Application (Old-Style Embed Form)

**Script**: `src/lib/greenhouse-apply.ts`
**Method**: HTTP POST (form submission)
**Used For**: Companies with server-rendered forms (no reCAPTCHA)

```
┌────────────────────────────────────────────────────────────┐
│            GREENHOUSE AUTO-APPLY (HTTP)                    │
└────────────────────────────────────────────────────────────┘

1. FETCH JOB DETAILS
   │
   ├─> GET https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs/{jobId}?questions=true
   │   Headers: Accept: application/json
   │   Timeout: 15s
   │
   └─> Response:
       {
         "id": 8303740002,
         "title": "Data Engineer",
         "absolute_url": "https://...",
         "questions": [
           {
             "label": "Are you authorized to work in the US?",
             "required": true,
             "fields": [{
               "name": "question_30496562002",
               "type": "multi_value_single_select",
               "values": [
                 {"label": "Yes", "value": 1},
                 {"label": "No", "value": 0}
               ]
             }]
           },
           ...
         ]
       }

2. FETCH EMBED PAGE TOKENS (Anti-Fraud)
   │
   ├─> GET https://boards.greenhouse.io/embed/job_app?for={boardToken}&token={jobId}
   │   Headers:
   │     User-Agent: Mozilla/5.0 (Macintosh; ...)
   │     Accept: text/html
   │
   ├─> Parse HTML for hidden fields:
   │   │
   │   ├─> <input name="fingerprint" value="a3f5e9b2c1d4f7e8">
   │   ├─> <input name="render_date" value="2026-03-11T16:15:00.000Z">
   │   └─> <input name="page_load_time" value="1234567890">
   │
   └─> Return: { fingerprint, renderDate, pageLoadTime }

3. PARSE EMBED QUESTION STRUCTURE
   │
   ├─> Extract question indices from HTML:
   │   job_application[answers_attributes][0][question_id]="30496562002"
   │   job_application[answers_attributes][1][question_id]="30496563003"
   │   ...
   │
   ├─> Detect field types:
   │   • boolean_value: <select> with Yes/No
   │   • text_value: <textarea> or <input type="text">
   │
   └─> Return: [
         { index: 0, questionId: "30496562002", fieldType: "boolean" },
         { index: 1, questionId: "30496563003", fieldType: "text" },
         ...
       ]

4. MAP QUESTIONS TO ANSWERS
   │
   ├─> Match API questions to embed fields by question_id
   │
   ├─> Apply rules based on label keywords:
   │   │
   │   ├─> "previously applied" → No (0)
   │   ├─> "authorized to work" → candidate.authorizedToWork
   │   ├─> "sponsorship" | "visa" → candidate.requiresSponsorship
   │   ├─> "military" | "veteran" → candidate.veteranStatus
   │   ├─> "privacy" | "consent" → Yes (1)
   │   ├─> "note to hiring" → Empty string
   │   └─> Unknown → "N/A" or Yes (1) for booleans
   │
   └─> Return: {
         "job_application[answers_attributes][0][question_id]": "30496562002",
         "job_application[answers_attributes][0][boolean_value]": "1",
         "job_application[answers_attributes][0][priority]": "0",
         ...
       }

5. BUILD FORM DATA
   │
   └─> URLSearchParams:
       utf8=✓
       fingerprint={token}
       render_date={token}
       page_load_time={token}
       from_embed=true
       security_code=                      // Empty (no code needed for some forms)
       job_application[first_name]=Jason
       job_application[last_name]=Bian
       job_application[email]=jason@...
       job_application[phone]=+1-734-...
       job_application[resume_text]={full resume}
       job_application[answers_attributes][0][question_id]=30496562002
       job_application[answers_attributes][0][boolean_value]=1
       ...

6. SUBMIT APPLICATION
   │
   ├─> POST https://boards.greenhouse.io/embed/{boardToken}/jobs/{jobId}
   │   Headers:
   │     Content-Type: application/x-www-form-urlencoded
   │     User-Agent: Mozilla/5.0 (Macintosh; ...)
   │     Origin: https://boards.greenhouse.io
   │     Referer: https://boards.greenhouse.io/embed/job_app?for=...
   │   Body: {form data from step 5}
   │   Redirect: manual (don't follow)
   │   Timeout: 30s
   │
   ├─> Check Response:
   │   │
   │   ├─> Status 302/301 + Location: /confirmation → SUCCESS
   │   ├─> Status 302/301 + Location: other → REDIRECT (check URL)
   │   ├─> Status 200 + "thank you" in body → SUCCESS
   │   ├─> Status 200 + "error" in body → FAIL (extract error messages)
   │   └─> Other → UNKNOWN (analyze response)
   │
   └─> Return: ApplicationResult {
         success: true/false,
         jobId, boardToken, companyName,
         jobTitle, jobUrl,
         status: 302,
         message: "Application submitted! Redirect: /confirmation",
         timestamp: "2026-03-11T16:20:00.000Z"
       }
```

**Success Indicators**:
- HTTP 302 redirect to URL containing "confirmation" or "thank"
- HTTP 200 with body containing "thank you" or "submitted"

**Failure Indicators**:
- HTTP 200 with body containing "error", "invalid", "required"
- Extracted error messages from `<li class="error">` elements

---

### Flow 2: Greenhouse Application (reCAPTCHA / Browser-Based)

**Script**: `src/lib/greenhouse-browser-apply.ts`
**Method**: Puppeteer (headless Chrome)
**Used For**: Companies with reCAPTCHA Enterprise or React forms

```
┌────────────────────────────────────────────────────────────┐
│        GREENHOUSE AUTO-APPLY (BROWSER/PUPPETEER)          │
└────────────────────────────────────────────────────────────┘

1. FETCH JOB DETAILS (Same as HTTP flow)
   │
   └─> GET API for questions

2. LAUNCH BROWSER
   │
   ├─> import @sparticuz/chromium (Lambda-compatible)
   ├─> import puppeteer-core
   │
   └─> browser = puppeteer.launch({
         args: chromium.args,
         executablePath: chromium.executablePath(),
         headless: true
       })

3. NAVIGATE TO FORM
   │
   ├─> page.setUserAgent("Mozilla/5.0 (Macintosh; ...)")
   │
   ├─> page.goto("https://boards.greenhouse.io/embed/job_app?for={token}&token={jobId}")
   │   waitUntil: networkidle2
   │   timeout: 30s
   │
   └─> page.waitForSelector("#application_form", timeout: 10s)

4. FILL FORM FIELDS
   │
   ├─> page.type("#first_name", "Jason", { delay: 30ms })
   ├─> page.type("#last_name", "Bian", { delay: 30ms })
   ├─> page.type("#email", "jason@...", { delay: 30ms })
   ├─> page.type("#phone", "+1-734-...", { delay: 30ms })
   │
   ├─> Click "paste resume" link if available
   └─> page.type('textarea[name="job_application[resume_text]"]', {resume}, { delay: 5ms })

5. ANSWER CUSTOM QUESTIONS
   │
   ├─> FOR EACH question in job.questions:
   │   │
   │   ├─> IF type == "multi_value_single_select":
   │   │   │
   │   │   ├─> Find: select[name="job_application[answers_attributes][{i}][boolean_value]"]
   │   │   ├─> Apply rule based on label (same as HTTP flow)
   │   │   └─> page.select(selectEl, value)
   │   │
   │   └─> ELSE IF type == "textarea" or "input_text":
   │       │
   │       ├─> Find: textarea or input with matching name
   │       ├─> IF required: page.type(textEl, "")
   │       └─> ELSE: skip
   │
   └─> Wait 2s for reCAPTCHA to process

6. SUBMIT FORM
   │
   ├─> Find submit button: '#submit_app' or 'button[type="submit"]'
   │
   ├─> await Promise.all([
   │     page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30s }),
   │     submitButton.click()
   │   ])
   │
   ├─> finalUrl = page.url()
   ├─> bodyText = page.evaluate(() => document.body.innerText)
   │
   └─> Check success:
       • URL contains "confirmation"
       • Body contains "thank you" or "application has been submitted"
       • Body does NOT contain "error" or "required"

7. CLOSE BROWSER
   │
   └─> await browser.close()
```

**reCAPTCHA Handling**:
- Browser context auto-solves reCAPTCHA (passive detection)
- No manual token extraction needed
- 2-second wait allows background processing

**Advantages over HTTP**:
- Handles React-based forms (SPA)
- Auto-solves reCAPTCHA Enterprise
- Mimics real user behavior (typing delays)

**Disadvantages**:
- Slower (~15-30s vs ~2-5s for HTTP)
- More resource-intensive (Chrome instance)
- Less reliable (can hang on network issues)

---

### Flow 3: Security Code Retrieval (Gmail OAuth)

**Script**: `src/lib/gmail.ts`
**Purpose**: Fetch Greenhouse security codes from Gmail
**Used By**: Some companies require email verification during application

```
┌────────────────────────────────────────────────────────────┐
│              GMAIL SECURITY CODE FLOW                      │
└────────────────────────────────────────────────────────────┘

1. OAUTH SETUP (One-Time)
   │
   ├─> USER: Visit GET /api/auth/google
   │
   ├─> Redirect to Google OAuth:
   │   https://accounts.google.com/o/oauth2/v2/auth?
   │     client_id={GOOGLE_CLIENT_ID}
   │     redirect_uri={callback_url}
   │     scope=https://www.googleapis.com/auth/gmail.readonly
   │     access_type=offline
   │     prompt=consent
   │
   ├─> USER: Approve access
   │
   ├─> Google redirects: GET /api/auth/callback?code={auth_code}
   │
   ├─> Exchange code for tokens:
   │   POST https://oauth2.googleapis.com/token
   │   Body:
   │     code={auth_code}
   │     client_id={GOOGLE_CLIENT_ID}
   │     client_secret={GOOGLE_CLIENT_SECRET}
   │     redirect_uri={callback_url}
   │     grant_type=authorization_code
   │
   └─> Store tokens:
       {
         "access_token": "ya29.a0AfH6SMB...",
         "refresh_token": "1//0gZ5N...",  // Long-lived
         "expires_in": 3600,
         "token_type": "Bearer"
       }

2. TOKEN REFRESH (When Needed)
   │
   ├─> POST https://oauth2.googleapis.com/token
   │   Body:
   │     refresh_token={refresh_token}
   │     client_id={GOOGLE_CLIENT_ID}
   │     client_secret={GOOGLE_CLIENT_SECRET}
   │     grant_type=refresh_token
   │
   └─> Return: { "access_token": "ya29.a0AfH6SMB...", ... }

3. SEARCH FOR SECURITY CODE EMAIL
   │
   ├─> Build query:
   │   from:greenhouse-mail.io
   │   subject:"security code"
   │   newer_than:10m              // Only last 10 minutes
   │
   ├─> GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=5
   │   Headers: Authorization: Bearer {access_token}
   │
   └─> Response:
       {
         "messages": [
           { "id": "18d3a5b2f1c9e8a0", "threadId": "..." },
           ...
         ]
       }

4. FETCH EMAIL CONTENT
   │
   ├─> FOR EACH message in messages:
   │   │
   │   ├─> GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}?format=full
   │   │   Headers: Authorization: Bearer {access_token}
   │   │
   │   ├─> Decode base64url body:
   │   │   • Payload parts → find text/plain or text/html
   │   │   • body.data → base64url decode
   │   │
   │   ├─> Strip HTML tags (if HTML):
   │   │   html.replace(/<[^>]+>/g, "")
   │   │
   │   ├─> Extract security code via regex:
   │   │   /application:\s+([A-Za-z0-9]{6,12})\s+After/i
   │   │   OR
   │   │   /security code:\s*([A-Za-z0-9]{6,12})/i
   │   │
   │   └─> IF found: return code
   │
   └─> IF no code found in any message: return null

5. USE CODE IN APPLICATION
   │
   ├─> Add to form data:
   │   security_code={code}
   │
   └─> Submit application (same as normal flow)
```

**Email Format** (Greenhouse):
```
From: no-reply@us.greenhouse-mail.io
Subject: Security code for your job application

Your security code for your job application:

ABC123XY

After submitting your application...
```

**Timing Considerations**:
- Email arrives within 30-60 seconds of form submission
- Script polls Gmail every 5-10 seconds
- Timeout after 2 minutes (email may not arrive)

**Rate Limiting**:
- Gmail API: 1 billion quota units/day
- Search: ~5 quota units per request
- Get message: ~5 quota units per request
- Practical limit: ~100M requests/day

---

## Data Flow Diagrams

### Complete Application Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ALLOCATION AGENT FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1: JOB DISCOVERY
──────────────────────
scripts/refresh-jobs.mjs
    │
    ├─> Fetch: Greenhouse API
    │   https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true
    │
    └─> Store: Redis
        HSET jobs:{company}:{jobId} {metadata}
        SADD idx:company:{company} {company}:{jobId}
        ZADD feed:new {timestamp} {company}:{jobId}


STEP 2: JOB SELECTION
──────────────────────
scripts/batch-greenhouse.mjs
    │
    ├─> Query: Redis
    │   GET gh_applied:{company}:{jobId}  // Check if already applied
    │
    ├─> IF already applied:
    │   └─> SKIP
    │
    └─> ELSE:
        │
        ├─> SET gh_applied:{company}:{jobId} {"status":"in_progress",...}
        │
        └─> Continue to STEP 3


STEP 3: JD PARSING
───────────────────
scripts/lib/jd-parser.mjs
    │
    ├─> Fetch: Greenhouse API (job details)
    │   https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{jobId}
    │
    ├─> Parse: Extract tech stack
    │   • Strip HTML
    │   • Regex match: languages, frameworks, databases, cloud, tools, niche
    │
    └─> Return: {
          languages: ["Python", "Java"],
          frameworks: ["Spark"],
          databases: ["Redshift"],
          cloud: ["AWS"],
          tools: ["Docker"],
          niche: []
        }


STEP 4: RESUME BUILDING
────────────────────────
scripts/lib/resume-builder.mjs
    │
    ├─> Input:
    │   • Resume text (plain text)
    │   • Candidate skills: ["python", "spark", "aws", ...]
    │   • JD tech stack (from STEP 3)
    │
    ├─> Match:
    │   matchedSkills = candidateSkills.filter(cs =>
    │     jdStack.some(jd => cs.includes(jd) || jd.includes(cs))
    │   )
    │
    ├─> Reorder TECH SKILLS section:
    │   • Matched skills first
    │   • Unmatched skills after
    │
    ├─> Add RELEVANT TECHNOLOGIES section (if niche tech):
    │   "JD Stack: {niche tech}"
    │
    └─> Generate PDF:
        Output: blob/resume_tmp.pdf


STEP 5: APPLICATION SUBMISSION
───────────────────────────────
src/lib/greenhouse-apply.ts OR greenhouse-browser-apply.ts
    │
    ├─> Fetch: Job details + questions
    │   https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{jobId}?questions=true
    │
    ├─> IF old-style form (no reCAPTCHA):
    │   │
    │   ├─> Fetch embed tokens
    │   ├─> Parse question structure
    │   ├─> Map answers
    │   ├─> POST form data
    │   └─> Check: 302 redirect or "thank you" in response
    │
    └─> ELSE IF reCAPTCHA / React form:
        │
        ├─> Launch Puppeteer browser
        ├─> Fill form fields
        ├─> Wait for reCAPTCHA
        ├─> Click submit
        └─> Check: URL or body text


STEP 6: SECURITY CODE (If Required)
────────────────────────────────────
src/lib/gmail.ts
    │
    ├─> Search Gmail:
    │   from:greenhouse-mail.io
    │   subject:"security code"
    │   newer_than:10m
    │
    ├─> Fetch message content
    │
    ├─> Extract code: /application:\s+([A-Za-z0-9]{6,12})/
    │
    └─> Resubmit form with security_code={code}


STEP 7: RESULT TRACKING
────────────────────────
scripts/batch-greenhouse.mjs
    │
    ├─> Check output for PASS/FAIL
    │
    ├─> Update Redis:
    │   SET gh_applied:{company}:{jobId} {
    │     "status": "PASS" | "FAIL" | "ERROR",
    │     "appliedAt": "2026-03-11T16:20:00.000Z",
    │     "output": "Last 500 chars...",
    │     "resumeVariant": "resume_tmp.pdf"
    │   }
    │
    └─> Record metadata:
        SET job_runs:greenhouse:{company}:{jobId} {
          "resumeSkillsMatched": ["python", "spark"],
          "jdStackDetected": ["Python", "Spark", "AWS"],
          "status": "PASS",
          ...
        }
        ZADD job_runs:index {timestamp} job_runs:greenhouse:{company}:{jobId}
```

---

## Key Design Patterns

### 1. **Content Hashing for Change Detection**

Instead of storing full job content, we hash `(title|location|dept)`:

```javascript
const hash = SHA256(title + "|" + location + "|" + dept).slice(0, 16)
```

**Benefits**:
- Fast comparison (16 bytes vs multi-KB content)
- Detects meaningful changes (title/location/dept updates)
- Ignores cosmetic HTML changes

**Trade-off**: Can't detect description-only changes

---

### 2. **Multi-Level Indexing**

Redis keys are organized for multiple query patterns:

- **By company**: `idx:company:{company}` → Fast lookup of all Point72 jobs
- **By status**: `idx:status:active` → Filter active vs archived
- **By tag**: `idx:tag:ml` → Find all ML jobs across companies
- **By time**: `feed:new` (sorted set) → Chronological feed

**Query Examples**:
```redis
# All active jobs at Point72
SINTER idx:company:point72 idx:status:active

# All ML jobs (any company)
SMEMBERS idx:tag:ml

# 10 newest jobs (any company)
ZREVRANGE feed:new 0 9
```

---

### 3. **Idempotent Application Tracking**

Before applying:
```javascript
const existing = await redis.get(`gh_applied:${company}:${jobId}`)
if (existing) {
  console.log("SKIP - already applied")
  return
}
```

**Prevents**:
- Duplicate applications (Greenhouse flags as spam)
- Rate limit violations
- Wasted API quota

---

### 4. **Resume Variant Rotation**

```javascript
const RESUME_VARIANTS = [
  "/path/to/resume_v1.pdf",
  "/path/to/resume_v2.pdf",
  ...
]

const variant = RESUME_VARIANTS[counter % RESUME_VARIANTS.length]
counter++
```

**Purpose**:
- Avoid Greenhouse deduplication (same resume hash)
- Test different resume formats
- Track which format performs best

---

### 5. **Graceful Degradation**

```javascript
try {
  const stack = parseJdTechStack(jd.content)
  const resume = await buildResume(resumeText, skills, stack)
} catch (err) {
  console.log("JD parse failed, using default resume")
  resume = fallbackVariant
}
```

**Fallbacks**:
- JD parse fails → Use round-robin resume
- Resume build fails → Use pre-built variant
- API fails → Skip and continue to next job

---

## Performance Metrics

### Job Parsing
- **API latency**: ~200-500ms per company
- **Parse time**: ~10ms per JD
- **Redis write**: ~5ms per job
- **Total**: ~60-90s for 17 companies (300ms delay between)

### Auto-Apply
- **HTTP method**: 2-5s per application
- **Browser method**: 15-30s per application
- **With security code**: +30-60s (Gmail polling)
- **Batch of 50 jobs**: ~5-15 minutes (HTTP), ~20-40 minutes (browser)

### Redis Operations
- **HGET/HSET**: <1ms
- **SADD/SMEMBERS**: <1ms for sets <1000 members
- **ZADD/ZRANGE**: <2ms for sorted sets <10K members
- **Pattern scan**: ~10ms for KEYS * (500 keys)

---

## Error Handling

### Common Failure Modes

1. **Greenhouse API 404**: Job no longer exists
   - **Action**: Skip, mark as archived

2. **Embed page missing tokens**: New-style React form
   - **Action**: Fall back to browser method

3. **reCAPTCHA timeout**: Browser stuck waiting
   - **Action**: Kill browser after 30s, retry

4. **Gmail no security code**: Email not delivered
   - **Action**: Poll for 2 minutes, then fail

5. **Form validation errors**: Missing required fields
   - **Action**: Extract error messages, log for manual review

6. **Network timeout**: API or form submission hangs
   - **Action**: AbortSignal.timeout(30s), mark as ERROR

---

## Security Considerations

### Credentials
- **Redis password**: Environment variable only
- **Google OAuth**: Client secret never exposed to frontend
- **Refresh token**: Stored server-side, never in Redis

### Rate Limiting
- **Greenhouse API**: No documented limit, use 300ms delays
- **Gmail API**: 1B quota units/day (effectively unlimited)
- **Application submissions**: 5s delay between jobs (avoid spam detection)

### PII
- **Resume text**: Stored in candidate-data.mjs (local only)
- **Email/phone**: Hard-coded, not in Redis
- **Application data**: 90-day TTL in Redis (auto-expires)

---

## Future Improvements

1. **PostgreSQL migration**: Replace Redis with relational DB for complex queries
2. **Job content storage**: Store full JD text for later analysis
3. **Resume A/B testing**: Track which variants get highest response rate
4. **Webhook integration**: Real-time updates when new jobs posted
5. **ML-based matching**: Score jobs based on STAR alignment (already built!)
6. **Distributed locking**: Prevent concurrent applications from multiple machines

---

**Last Updated**: 2026-03-11
**Author**: Jason Bian
**Version**: 1.0
