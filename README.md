# allocation-agent

Greenhouse auto-apply agent for quant trading firms. Tracks job postings across 20+ companies, matches to candidate profile, and auto-submits applications with reCAPTCHA + email security code verification.

## Features

- **Job Tracking**: Monitors Greenhouse boards for 20 quant firms (Point72, Jump Trading, Jane Street, etc.)
- **Job Matching**: Scores jobs against candidate profile (role, location, skills)
- **Auto-Apply**: Headless browser fills forms, handles reCAPTCHA Enterprise, retrieves security codes from Gmail
- **State Storage**: Application state (metadata, HTML, screenshots) persisted to Netlify Blobs

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET | List tracked companies |
| `/api/status` | GET | Job tracking metrics per company |
| `/api/find-matching-jobs` | GET | Scan all boards, match to candidate |
| `/api/auto-apply` | POST | Submit application(s) |
| `/api/applications` | GET | Query stored application records |
| `/api/bot-status` | GET | Bot health and config summary |
| `/api/check-email` | GET | Check Gmail for security codes |
| `/api/auth/google` | GET | Initiate Gmail OAuth flow |

## Setup

```bash
npm install
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Gmail API refresh token |
| `REDIS_HOST` | Redis host for job tracking state |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password |

### Local Testing

```bash
# Apply to a specific job
node scripts/test-apply.mjs <boardToken> <jobId>

# Example: Jump Trading AI Research Scientist
node scripts/test-apply.mjs jumptrading 4982814
```

## Architecture

- **Netlify Functions** (`.mts`) — serverless API endpoints
- **Puppeteer** — headless Chrome for form automation
- **Gmail API** — retrieve Greenhouse security codes
- **Netlify Blobs** — application state storage
- **Redis** — job diff tracking over time
