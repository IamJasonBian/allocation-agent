# allocation-agent

Browser automation agent for auto-applying to jobs across Greenhouse, Lever, and Dover platforms. Uses headful Chrome with stealth flags to bypass bot detection (reCAPTCHA, hCaptcha, Cloudflare Turnstile).

## Prerequisites

- Node.js 18+
- Google Chrome installed locally
- Redis Cloud instance (for deduplication)
- Gmail OAuth credentials (for Greenhouse security codes)

## Setup

```bash
npm install
```

### Environment Variables

Create a `.env` file or export:

| Variable | Description |
|----------|-------------|
| `REDIS_PASSWORD` | Redis Cloud password |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Gmail API refresh token |
| `RESUME_PATH` | Path to resume PDF (optional, defaults to blob/) |

## Usage

### Single Application Test
```bash
node scripts/test-apply.mjs <boardToken> <jobId>
```

### Batch Greenhouse Applications
```bash
node scripts/batch-greenhouse.mjs
```

### Lever Applications
```bash
node scripts/lever-apply.mjs
```

### Dover Applications
```bash
node scripts/batch-dover.mjs
```

### Check Application Status
```bash
node scripts/check-status.mjs
```

## Architecture

- **Puppeteer + headful Chrome** — Form automation with stealth flags
- **Gmail API** — Retrieves Greenhouse security codes
- **Redis Cloud** — Application deduplication (90-day TTL)
- **3 ATS Platforms**: Greenhouse (reCAPTCHA), Lever (hCaptcha), Dover (Cloudflare Turnstile)

## Operations & Security

### Service Access Audit
```bash
npm run audit-access              # Check all services
npm run audit-access -- --verbose  # Detailed output
```

### Documentation
- **[Quick Reference](./docs/QUICK_REFERENCE.md)** - TL;DR for permissions, service access, and operational limits
- **[Full Security Audit](./docs/BROWSER_PERMISSIONS_AND_ACCESS.md)** - Comprehensive browser permissions, service access, and security analysis
