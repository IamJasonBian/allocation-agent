# API Integration Analysis - Allocation Crawler Service

**Target API:** `https://allocation-crawler-service.netlify.app/api`
**Purpose:** Agent job orchestration and submission tracking

---

## Expected agentRuns Workflow

### Typical Agent Run Pattern

```
1. Agent polls for available jobs → GET /agentRuns?status=pending
2. Agent claims a job           → POST /agentRuns/{id}/claim
3. Agent executes submission    → [Local browser automation]
4. Agent reports progress       → PATCH /agentRuns/{id}/progress
5. Agent reports completion     → POST /agentRuns/{id}/complete
6. (Optional) Agent uploads artifacts → POST /agentRuns/{id}/artifacts
```

---

## Required Endpoints (Assumed)

### 1. **Get Pending Jobs**
```http
GET /agentRuns?status=pending&platform=greenhouse
```

**Expected Response:**
```json
{
  "runs": [
    {
      "id": "run_abc123",
      "jobId": "7829230002",
      "boardToken": "point72",
      "platform": "greenhouse",
      "companyName": "Point72",
      "jobTitle": "Data Engineer",
      "jobUrl": "https://boards.greenhouse.io/point72/jobs/7829230002",
      "priority": 1,
      "createdAt": "2026-03-07T12:00:00Z",
      "status": "pending",
      "metadata": {
        "requiresSecurityCode": true,
        "captchaType": "recaptcha-enterprise"
      }
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 10
}
```

**Missing Considerations:**
- ❓ Filtering by `platform` (greenhouse/lever/dover)
- ❓ Priority-based sorting
- ❓ Pagination support
- ❓ Rate limit headers

---

### 2. **Claim a Job**
```http
POST /agentRuns/{id}/claim
```

**Request Body:**
```json
{
  "agentId": "agent-macos-01",
  "agentVersion": "1.0.0",
  "capabilities": ["greenhouse", "recaptcha", "gmail-security-codes"]
}
```

**Expected Response:**
```json
{
  "runId": "run_abc123",
  "claimed": true,
  "claimedAt": "2026-03-07T12:05:00Z",
  "expiresAt": "2026-03-07T12:20:00Z",  // 15-min claim timeout
  "candidateProfile": {
    "firstName": "Jason",
    "lastName": "Bian",
    "email": "jason.bian64@gmail.com",
    "phone": "+1-734-730-6569",
    "resumeId": "resume_jasonzb_8",
    "resumeUrl": "https://cdn.netlify.app/resumes/resume_jasonzb_8.pdf"
  }
}
```

**Missing Considerations:**
- ❓ Claim expiration/timeout mechanism
- ❓ Agent capability matching (don't assign Lever jobs to agents without hCaptcha)
- ❓ Candidate profile selection (if multi-candidate support)
- ❓ Resume variant selection strategy

---

### 3. **Update Progress**
```http
PATCH /agentRuns/{id}/progress
```

**Request Body:**
```json
{
  "status": "in_progress",
  "step": "filling_form",
  "progress": 0.6,
  "message": "Education section filled, awaiting reCAPTCHA",
  "metadata": {
    "formFieldsFilled": 12,
    "formFieldsTotal": 20,
    "validationErrors": []
  }
}
```

**Missing Considerations:**
- ❓ Real-time progress tracking (WebSocket alternative?)
- ❓ Error state handling (retry vs. fatal failure)
- ❓ Screenshot upload during progress updates

---

### 4. **Report Completion**
```http
POST /agentRuns/{id}/complete
```

**Request Body:**
```json
{
  "status": "completed",
  "success": true,
  "message": "Application submitted successfully",
  "submittedAt": "2026-03-07T12:15:00Z",
  "evidence": {
    "finalUrl": "https://boards.greenhouse.io/point72/jobs/7829230002/confirmation",
    "securityCodeUsed": true,
    "screenshotKeys": [
      "netlify-blob://screenshots/run_abc123_step1.png",
      "netlify-blob://screenshots/run_abc123_final.png"
    ],
    "formFieldsMetadata": {
      "totalFields": 20,
      "filledFields": 20,
      "unhandledFields": []
    }
  }
}
```

**Expected Response:**
```json
{
  "runId": "run_abc123",
  "status": "completed",
  "completedAt": "2026-03-07T12:15:00Z",
  "nextRun": {
    "id": "run_def456",
    "jobId": "7667745002",
    "boardToken": "point72"
  }
}
```

**Missing Considerations:**
- ❓ Failure reason taxonomy (captcha_failed, security_code_timeout, validation_error, etc.)
- ❓ Retry policy specification
- ❓ Evidence storage (screenshots, page HTML, logs)

---

### 5. **Report Failure**
```http
POST /agentRuns/{id}/fail
```

**Request Body:**
```json
{
  "status": "failed",
  "success": false,
  "errorCode": "SECURITY_CODE_TIMEOUT",
  "message": "Gmail security code not received within 3 minutes",
  "retryable": true,
  "failedAt": "2026-03-07T12:18:00Z",
  "evidence": {
    "screenshot": "netlify-blob://screenshots/run_abc123_timeout.png",
    "logs": "netlify-blob://logs/run_abc123.log"
  }
}
```

**Missing Considerations:**
- ❓ Error code standardization
- ❓ Retry backoff strategy
- ❓ Circuit breaker for repeatedly failing jobs

---

### 6. **Upload Artifacts** (Optional)
```http
POST /agentRuns/{id}/artifacts
Content-Type: multipart/form-data
```

**Form Data:**
```
screenshot_step1: <binary PNG>
screenshot_final: <binary PNG>
page_html: <text/html>
logs: <text/plain>
```

**Missing Considerations:**
- ❓ Artifact size limits (screenshots can be large)
- ❓ Alternative: Signed URL upload to Netlify Blobs
- ❓ Automatic cleanup (90-day TTL)

---

## Missing Infrastructure Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "netlify": "healthy"
  }
}
```

### Agent Registration
```http
POST /agents/register
```

**Request:**
```json
{
  "agentId": "agent-macos-01",
  "hostname": "Jasons-MacBook-Pro.local",
  "capabilities": ["greenhouse", "lever", "dover", "recaptcha", "hcaptcha"],
  "version": "1.0.0",
  "platform": "darwin",
  "chromeVersion": "120.0.0.0"
}
```

### Agent Heartbeat
```http
POST /agents/{id}/heartbeat
```

**Purpose:** Track agent liveness, detect stalled jobs

---

## Data Model Gaps (Assumed)

### Resume Management

**Current:** Resume assumed to exist locally (`resume_jasonzb_8.pdf`)

**Missing:**
- ❓ Resume versioning/variants API
- ❓ Resume metadata (skills, experience level, target roles)
- ❓ Resume selection strategy (random rotation? job-matching?)
- ❓ CDN/signed URLs for resume delivery to agent

**Proposed Endpoint:**
```http
GET /resumes?candidateId=jason_bian&active=true
```

**Response:**
```json
{
  "resumes": [
    {
      "id": "resume_jasonzb_8",
      "version": 8,
      "fileName": "resume_jasonzb (8).pdf",
      "url": "https://cdn.netlify.app/resumes/resume_jasonzb_8.pdf",
      "signedUrl": "https://cdn.netlify.app/resumes/...",
      "uploadedAt": "2026-03-01T00:00:00Z",
      "skills": ["Python", "Java", "Spark", "SQL"],
      "targetRoles": ["Data Engineer", "ML Engineer"]
    }
  ]
}
```

---

### Job Metadata

**Missing from agentRuns response:**
- ❓ Form complexity score (simple/medium/complex)
- ❓ Historical success rate for this job
- ❓ Estimated completion time
- ❓ Known unhandled fields (from previous runs)

**Example Enhancement:**
```json
{
  "runId": "run_abc123",
  "metadata": {
    "formComplexity": "medium",
    "historicalSuccessRate": 0.85,
    "estimatedDuration": 180,  // seconds
    "knownIssues": [
      {
        "field": "education_school_name",
        "type": "select2_ajax",
        "workaround": "Use keyboard navigation"
      }
    ]
  }
}
```

---

### Candidate Profile Extensions

**Current:** Basic fields (name, email, phone)

**Missing:**
- ❓ Work authorization status
- ❓ Sponsorship requirements
- ❓ Veteran status
- ❓ LinkedIn/GitHub URLs
- ❓ Location preference
- ❓ Start date availability

**These are ALREADY in the agent code** (`test-apply.mjs:244-286`) but not in API spec.

---

## Authentication & Authorization

**Missing:**
- ❓ API authentication scheme (API key? JWT? OAuth?)
- ❓ Agent authorization (can agent A claim jobs intended for agent B?)
- ❓ Rate limiting per agent

**Proposed:**
```http
GET /agentRuns?status=pending
Authorization: Bearer {AGENT_API_KEY}
X-Agent-ID: agent-macos-01
```

---

## Error Handling

**Missing Standardization:**

**Proposed Error Response Schema:**
```json
{
  "error": {
    "code": "JOB_ALREADY_CLAIMED",
    "message": "This job was claimed by agent-linux-02 at 2026-03-07T12:00:00Z",
    "details": {
      "claimedBy": "agent-linux-02",
      "claimedAt": "2026-03-07T12:00:00Z"
    },
    "retryable": true,
    "retryAfter": 300  // seconds
  }
}
```

**Error Codes Needed:**
- `JOB_ALREADY_CLAIMED`
- `JOB_NOT_FOUND`
- `CLAIM_EXPIRED`
- `INVALID_AGENT_ID`
- `RATE_LIMIT_EXCEEDED`
- `INVALID_STATUS_TRANSITION` (e.g., pending → completed without claiming)

---

## Monitoring & Observability

**Missing:**
- ❓ Agent metrics endpoint (`GET /agents/{id}/metrics`)
- ❓ Run statistics (`GET /agentRuns/stats`)
- ❓ Failure analysis (`GET /agentRuns/failures?groupBy=errorCode`)

**Example Metrics Endpoint:**
```http
GET /agents/{id}/metrics
```

**Response:**
```json
{
  "agentId": "agent-macos-01",
  "metrics": {
    "totalRuns": 142,
    "successfulRuns": 121,
    "failedRuns": 21,
    "successRate": 0.852,
    "avgDuration": 165.3,  // seconds
    "last24h": {
      "runs": 12,
      "successes": 11,
      "failures": 1
    }
  }
}
```

---

## Integration Code Gaps

**Current agent is standalone** - no API client for agentRuns orchestration.

**Missing:**
```javascript
// src/lib/agent-client.ts
export class AgentClient {
  async pollForJobs(platform?: string): Promise<AgentRun[]>
  async claimJob(runId: string, agentId: string): Promise<ClaimedRun>
  async reportProgress(runId: string, progress: ProgressUpdate): Promise<void>
  async reportCompletion(runId: string, result: RunResult): Promise<void>
  async reportFailure(runId: string, error: RunError): Promise<void>
  async uploadArtifact(runId: string, artifact: Artifact): Promise<string>
}
```

**Missing:**
```javascript
// scripts/agent-worker.mjs (orchestration loop)
while (true) {
  const jobs = await agentClient.pollForJobs('greenhouse');
  if (jobs.length === 0) {
    await sleep(30_000);  // Poll every 30s
    continue;
  }

  const job = jobs[0];
  const claimed = await agentClient.claimJob(job.id, AGENT_ID);

  try {
    await applyToJob(claimed.boardToken, claimed.jobId);
    await agentClient.reportCompletion(job.id, { success: true, ... });
  } catch (err) {
    await agentClient.reportFailure(job.id, { error: err.message, ... });
  }
}
```

---

## Recommendations

### Critical (Blocks Agent Integration)
1. **Document actual API endpoints** - Provide Swagger/OpenAPI spec
2. **Implement agent claim/release** - Prevent job duplication
3. **Add authentication** - Secure API access
4. **Define error taxonomy** - Standardize failure reasons

### High Priority
5. **Resume delivery API** - Stop hardcoding local paths
6. **Progress tracking** - Real-time visibility into agent state
7. **Agent registration** - Track agent capabilities and health
8. **Retry policy** - Specify when/how to retry failed jobs

### Medium Priority
9. **Artifact upload** - Standardize screenshot/log storage
10. **Metrics endpoint** - Monitor agent performance
11. **Job metadata** - Share known issues between agents
12. **Heartbeat mechanism** - Detect stalled agents

---

## Next Steps

1. **Share actual Swagger spec** - I'll compare against this analysis
2. **Implement AgentClient** - TypeScript client for API
3. **Create agent-worker loop** - Poll → Claim → Execute → Report
4. **Add resume management** - API or environment variable strategy
5. **Test end-to-end flow** - Single job from API → submission → completion report

---

**Status:** ⚠️ Waiting for actual API specification
**Blocker:** Cannot access `https://allocation-crawler-service.netlify.app/api`