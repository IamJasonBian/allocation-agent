# Documentation Index

## Overview

This directory contains operational and security documentation for the Allocation Agent browser automation system.

---

## Documents

### 📋 [Quick Reference](./QUICK_REFERENCE.md)
**TL;DR for operators** - Quick lookup for:
- Browser permissions by platform (Greenhouse/Lever/Dover)
- Service dependencies and access patterns
- Security flags explanation
- Pre-flight checklists
- Incident response procedures

**Use when:** You need quick answers during operations.

### 🔐 [Browser Permissions & Service Access Audit](./BROWSER_PERMISSIONS_AND_ACCESS.md)
**Comprehensive security audit** covering:
- Detailed browser launch configurations
- Chrome flags security implications
- External service access patterns (Gmail/Redis/Netlify/Slack)
- Data retention and privacy analysis
- Security risks and mitigations
- Production deployment checklist

**Use when:** Planning production deployment, security reviews, or compliance audits.

---

## Quick Start

```bash
# Verify all services are accessible before running batch jobs
npm run audit-access

# Check specific service with detailed output
npm run audit-access -- --service=gmail --verbose

# View application history
npm run check-status
```

---

## Key Findings Summary

### Browser Permissions
- **JavaScript Execution:** Full access to page context (required for form automation)
- **File Upload:** Resume PDFs only (no executable files)
- **Network:** Can make requests to any domain (limited by CORS)
- **reCAPTCHA:** Can execute `grecaptcha.enterprise.execute()` for Greenhouse
- **Webcam/Mic/Geolocation:** Never requested

### Critical Security Flags
- `--no-sandbox` - **HIGH RISK** - Required for containerized environments
- `--disable-blink-features=AutomationControlled` - Stealth mode (ToS violation risk)
- `--disable-dev-shm-usage` - Container memory fix (no security impact)

### External Services
| Service | Purpose | Critical | Credentials |
|---------|---------|----------|-------------|
| Gmail API | Security codes | ✅ Yes | OAuth 2.0 refresh token |
| Redis Cloud | Deduplication | ✅ Yes | Password |
| Netlify Blobs | State storage | ❌ Optional | Auth token |
| Slack Webhooks | Alerts | ❌ Optional | Webhook URL |

### Data Privacy
- **PII stored:** Name, email, phone, resume, screenshots
- **Retention:** 90 days (Redis) / Indefinite (Netlify)
- **Encryption:** ❌ None (plaintext storage)
- **GDPR compliance:** ⚠️ Manual deletion required

---

## Production Readiness Checklist

### Critical (Blocks Production)
- [ ] Migrate credentials to secrets manager
- [ ] Enable Redis TLS connections
- [ ] Implement Netlify Blob TTL (90 days)
- [ ] Add IP rotation (residential proxies)
- [ ] Set up monitoring/alerting

### High Priority
- [ ] Encrypt PII at rest
- [ ] Implement data export (GDPR)
- [ ] Add per-company rate limiting (max 10/hour)
- [ ] Document incident response
- [ ] Set up CAPTCHA solver fallback

### Medium Priority
- [ ] Automated secret rotation
- [ ] Audit logging for data access
- [ ] SIEM integration
- [ ] Data deletion workflow
- [ ] Compliance documentation

---

## Incident Response

### Browser Blocked by CAPTCHA
1. Switch to headful mode (lever-apply.mjs / dover-apply.mjs)
2. Manually solve CAPTCHA when prompted
3. Wait 24 hours before retrying headless
4. Consider CAPTCHA solver service (2Captcha)

### Gmail Security Codes Not Arriving
1. Check inbox manually
2. Verify OAuth token: `npm run audit-access -- --service=gmail --verbose`
3. Re-authenticate if token revoked: `node scripts/get-oauth-token.mjs`

### IP Banned by ATS
1. Wait 24 hours minimum
2. Implement IP rotation (residential proxies)
3. Reduce rate to 1 submission per 30 seconds
4. Review application patterns for bot-like behavior

### Redis Connection Failure
1. Verify credentials: `npm run audit-access -- --service=redis`
2. Check Redis Cloud dashboard for incidents
3. Inspect application history: `node scripts/redis-queries.mjs`

---

## Contributing

When adding new documentation:
1. Update this index with a summary
2. Add operational checklists to Quick Reference
3. Add security analysis to Browser Permissions doc
4. Update incident response procedures

---

**Last Updated:** 2026-03-07
**Maintained By:** Jason Bian (jason.bian64@gmail.com)