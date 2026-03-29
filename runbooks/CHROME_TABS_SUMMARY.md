# Chrome Tabs Auto-Apply Summary

**Generated**: 2026-03-11
**Total Tabs**: 87
**Job Application Tabs Found**: 40+

---

## Script Created: `scripts/apply-from-chrome-tabs.mjs`

### Features:
1. ✅ Reads all currently open Chrome tabs via AppleScript
2. ✅ Filters out LinkedIn tabs
3. ✅ Parses job URLs for: Greenhouse, Ashby, Lever, Dover, YC
4. ✅ Suggests simple answers for common questions
5. ✅ Dry-run mode to preview before submitting

### Usage:

```bash
# Preview first 5 jobs without submitting
node scripts/apply-from-chrome-tabs.mjs --dry-run --limit 5

# Process all jobs (LIVE MODE - will submit!)
node scripts/apply-from-chrome-tabs.mjs
```

---

## Sample Jobs Found (First 5)

| # | Company | Platform | Job ID | URL |
|---|---------|----------|--------|-----|
| 1 | Finch Legal | Ashby | 102f64ba... | [Link](https://www.finchlegal.com/careers?ashby_jid=102f64ba-a1f2-4c0a-a575-a611798ec59f) |
| 2 | Trunk Tools | Ashby | 83375669... | [Link](https://trunktools.com/careers/?ashby_jid=83375669-1d4a-479d-83e3-a754c19397e2) |
| 3 | Galaxy Digital | Greenhouse | 5812855004 | [Link](https://job-boards.greenhouse.io/galaxydigitalservices/jobs/5812855004) |
| 4 | Mistral AI | Lever | fb15ec7f... | [Link](https://jobs.lever.co/mistral/fb15ec7f-d9e9-4246-9d36-486d46c289e4) |
| 5 | Anthropic | Greenhouse | 4956672008 | [Link](https://job-boards.greenhouse.io/anthropic/jobs/4956672008) |

---

## Answer Suggestions

### High Confidence (✅)

| Question | Suggested Answer | Reason |
|----------|------------------|--------|
| Authorized to work in US? | Yes | US work authorized |
| Require sponsorship? | No | No sponsorship needed |
| LinkedIn profile | https://www.linkedin.com/in/jason-bian-7b9027a5/ | LinkedIn URL |
| GitHub profile | https://github.com/IamJasonBian | GitHub URL |
| Current employer | Amazon | From resume |
| Current title | Data Engineer II | From resume |
| Years of experience | 5+ years | Based on resume |
| Current location | New York, NY | Current city |
| Start date | 2 weeks notice | Standard notice |

### Medium Confidence (⚠️)

| Question | Suggested Answer | Reason |
|----------|------------------|--------|
| How did you hear about us? | Company website | Generic |
| Website/Portfolio | https://github.com/IamJasonBian | GitHub as portfolio |
| Salary expectations | Open to discussion based on role | Flexible |
| Open to relocation? | Yes, for the right opportunity | Flexible |

### Low Confidence (❌ - Manual Review Needed)

- "Why are you interested in [Company]?" - **Needs custom answer per company**
- Cover letter - **Skip or write custom**
- Additional comments - **Skip**

---

## Next Steps

### Immediate Actions:

1. **Review the script output** above to see which jobs were detected
2. **Check answer suggestions** - update `suggestAnswer()` function if needed
3. **Test on one job** first before batch applying

### For Better Results:

The script currently has issues detecting field labels on some platforms (especially Ashby). Two options:

**Option A: Use existing test-apply.mjs for Greenhouse jobs**
```bash
# For Greenhouse jobs, use the working auto-apply script
node scripts/test-apply.mjs galaxydigitalservices 5812855004
node scripts/test-apply.mjs anthropic 4956672008
```

**Option B: Manually apply with script assistance**
- Keep the Chrome tabs open
- Use the script to get suggested answers
- Manually copy-paste into forms

---

## Store URLs for Future Use

The user requested storing these URLs. Options:

### Option 1: Store in Redis

```javascript
// Add to scripts/apply-from-chrome-tabs.mjs
import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

for (const job of jobs) {
  const key = `chrome_tabs:${job.platform}:${job.company}:${job.jobId}`;
  await redis.set(key, JSON.stringify({
    url: job.url,
    platform: job.platform,
    company: job.company,
    jobId: job.jobId,
    discoveredAt: new Date().toISOString(),
    source: "chrome_tabs",
  }));
  await redis.expire(key, 60 * 60 * 24 * 90); // 90 days
  await redis.zadd("chrome_tabs:index", Date.now(), key);
}
```

### Option 2: Store in Netlify Blobs

```javascript
import { getStore } from "@netlify/blobs";

const store = getStore({
  name: "chrome-tabs",
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN,
});

await store.setJSON("job-urls-seed.json", {
  discoveredAt: new Date().toISOString(),
  source: "chrome_tabs",
  totalCount: jobs.length,
  jobs: jobs,
});
```

---

## Recommended Workflow

1. **Use Greenhouse auto-apply** for confirmed Greenhouse jobs:
   - Galaxy Digital (5812855004)
   - Anthropic (4956672008)

2. **Research + manual apply** for high-value targets:
   - Finch Legal (already researched via competitive analysis)
   - Mistral AI (French AI company)
   - Trunk Tools

3. **Batch the rest** after refining the script

---

## Files Created

- ✅ `scripts/apply-from-chrome-tabs.mjs` - Main script
- ✅ `CHROME_TABS_SUMMARY.md` - This summary

## Test Results

- ✅ Successfully detected 87 Chrome tabs
- ✅ Filtered to 5 job applications (limited for testing)
- ⚠️ Field label detection needs improvement for Ashby/Lever
- ✅ Greenhouse detection working
- ✅ Answer suggestion logic working for common questions

**Status**: Script is functional for URL extraction and answer suggestions. Auto-fill needs platform-specific improvements.
