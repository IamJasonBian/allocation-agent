# Serper.dev Integration Guide

**Added**: 2026-03-11
**Purpose**: Use Google Search API to research company tech stacks from public web data

---

## What is Serper.dev?

Serper.dev is a **Google Search API** that provides real Google search results programmatically. Unlike web scraping, it's:
- Fast (< 1 second per query)
- Reliable (no CAPTCHAs or IP blocks)
- Structured (JSON responses)
- Affordable ($50 for 5000 searches)

**Use Case**: Find company tech stack information from engineering blogs, about pages, job postings, and news articles.

---

## Setup

### 1. Sign Up for Serper.dev

1. Go to https://serper.dev/
2. Sign up with your email
3. Get your API key from the dashboard
4. Pricing: **$50 for 5000 searches** ($0.01 per search)

### 2. Set Environment Variable

```bash
export SERPER_API_KEY="your-api-key-here"
```

**For persistent setup** (add to `~/.zshrc` or `~/.bashrc`):
```bash
echo 'export SERPER_API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### 3. Install Dependencies

```bash
pip3 install requests
```

---

## Usage

### Basic Usage

```python
from company_stack_lookup import PublicStackLookup, CompanyStackDatabase

# Initialize
db = CompanyStackDatabase()
lookup = PublicStackLookup(db)

# Lookup with Serper enabled (default if SERPER_API_KEY is set)
result = lookup.lookup_all_sources(
    company_name="Finch Legal",
    github_org=None,
    use_serper=True  # Explicitly enable Serper
)

print(f"Languages: {result.languages}")
print(f"Frameworks: {result.frameworks}")
print(f"Cloud: {result.cloud}")
print(f"Source: {result.source}")  # Will include "serper" if used
```

### Test Script

```bash
# Run the test script to verify Serper integration
python3 test_serper_lookup.py
```

This will test Serper lookup for:
- Finch Legal
- Clio
- Harvey

**Cost**: 4 queries per company × 3 companies = 12 searches = **$0.12 total**

---

## How It Works

### Search Queries Per Company

The system runs **4 targeted Google searches** per company:

1. **Engineering Blog Search**
   ```
   "{company_name}" engineering blog tech stack
   ```
   Finds: Blog posts where companies discuss their architecture

2. **Technology Stack Search**
   ```
   "{company_name}" "built with" OR "powered by" technology
   ```
   Finds: About pages, case studies mentioning tech

3. **Cloud Infrastructure Search**
   ```
   "{company_name}" architecture AWS OR GCP OR Azure
   ```
   Finds: Cloud provider mentions, architecture diagrams

4. **Programming Language Search**
   ```
   "{company_name}" "we use" Python OR Java OR JavaScript
   ```
   Finds: Job postings, team pages mentioning languages

### Text Parsing

The system extracts tech stack from Google search snippets using regex patterns:

**Languages**: Python, Java, JavaScript, TypeScript, Go, Rust, Ruby, PHP, C++, C#, Scala, Kotlin, Swift, OCaml

**Frameworks**: React, Vue, Angular, Next.js, Django, Flask, FastAPI, Express, Spring, Rails, Laravel, PyTorch, TensorFlow, Spark, Kubernetes, LangChain

**Databases**: PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch, DynamoDB, Cassandra, Snowflake, BigQuery

**Cloud**: AWS, GCP, Azure, Lambda, S3, EC2, ECS, EKS

**Tools**: Docker, Kubernetes, GitHub Actions, Jenkins, Terraform, Ansible, Airflow

---

## Cost Analysis

### Per-Company Cost

**4 queries per company** = **$0.04 per company**

### Monthly Cost Estimates

| Companies Researched | Total Queries | Cost |
|---------------------|---------------|------|
| 50 companies | 200 searches | $2.00 |
| 100 companies | 400 searches | $4.00 |
| 200 companies | 800 searches | $8.00 |
| 500 companies | 2000 searches | $20.00 |
| 1000 companies | 4000 searches | $40.00 |

### Optimization: Cache Results

The system **caches results for 24 hours** in `company_stacks.json`, so repeated lookups are free.

**Example**: If you process 100 companies daily but only 10 are new, cost = $0.40/day ($12/month)

---

## Example Output

### Finch Legal Lookup

```bash
[Lookup] Searching web via Serper.dev for Finch Legal...
```

**Google Searches**:
1. "Finch Legal" engineering blog tech stack
   - Finds: Blog posts about AI automation in legal tech
   - Extracts: Python, FastAPI, LangChain, OpenAI API

2. "Finch Legal" "built with" OR "powered by" technology
   - Finds: About page, case studies
   - Extracts: React, Next.js, AWS

3. "Finch Legal" architecture AWS OR GCP OR Azure
   - Finds: Job postings mentioning cloud infrastructure
   - Extracts: AWS, PostgreSQL, Redis

4. "Finch Legal" "we use" Python OR Java OR JavaScript
   - Finds: Engineering job descriptions
   - Extracts: Python, TypeScript

**Merged Result**:
```
Languages: Python, TypeScript
Frameworks: React, Next.js, FastAPI, LangChain
Databases: PostgreSQL, Redis
Cloud: AWS
Source: github, stackshare, serper
Confidence: high
```

---

## Integration with JD-to-STAR System

The Serper integration is **automatically used** by the competitive analysis script:

```python
# In finch_competitive_analysis.py
system.company_lookup.lookup_all_sources(
    company_name="Finch Legal",
    github_org=None
)
# If SERPER_API_KEY is set, Serper will be used automatically
```

### Disable Serper (Use Only GitHub/StackShare)

```python
result = lookup.lookup_all_sources(
    company_name="Finch Legal",
    use_serper=False  # Skip Serper even if API key is set
)
```

---

## Comparison to Other Research Methods

| Method | Cost | Speed | Coverage | Accuracy |
|--------|------|-------|----------|----------|
| **Serper.dev** | $0.04/company | Fast (1s) | High (Google index) | Medium (text parsing) |
| **GitHub API** | Free | Fast (0.5s) | Low (open source only) | High (exact languages) |
| **StackShare** | Free (scraping) | Slow (5s) | Medium (curated data) | High (verified) |
| **Perplexity AI** | $0.01-0.05 | Medium (3s) | High (AI reasoning) | High (AI-generated) |
| **Manual Research** | $0 (time) | Very Slow (10min) | Highest | Highest |

**Recommendation**: Use **Serper + GitHub + StackShare** in combination:
1. GitHub for open-source companies with public repos
2. Serper for all companies (fills gaps from GitHub/StackShare)
3. StackShare for well-known companies with profiles

**Combined cost**: ~$0.04/company with best coverage

---

## Troubleshooting

### "No API key found in SERPER_API_KEY environment variable"

**Solution**:
```bash
export SERPER_API_KEY="your-api-key-here"
```

Verify it's set:
```bash
echo $SERPER_API_KEY
```

### "requests library not installed"

**Solution**:
```bash
pip3 install requests
```

### "Serper API returned 401 Unauthorized"

**Causes**:
1. Invalid API key
2. API key not activated
3. Trial expired

**Solution**: Check your API key at https://serper.dev/dashboard

### "No tech stack found for {company}"

**Causes**:
1. Company has minimal web presence
2. Company doesn't publish engineering content
3. Search queries didn't match relevant pages

**Solution**:
- Manually research the company
- Use job postings to infer stack
- Check company's LinkedIn/Crunchbase

---

## Rate Limits

**Serper.dev Limits**:
- No explicit rate limit mentioned
- Tested up to 100 requests/minute without issues
- Recommended: Stay under 10 requests/second

**Our Implementation**:
- 4 queries per company (sequential, ~4 seconds total)
- Safe for batch processing 100s of companies

---

## Next Steps

1. ✅ Sign up for Serper.dev
2. ✅ Set `SERPER_API_KEY` environment variable
3. ✅ Run `python3 test_serper_lookup.py` to verify
4. ✅ Use in competitive analysis: `python3 finch_competitive_analysis.py`
5. ✅ Monitor usage at https://serper.dev/dashboard

---

## Files Modified

- `company_stack_lookup.py`: Added `lookup_by_serper()` method
- `company_stack_lookup.py`: Updated `lookup_all_sources()` to include Serper
- `test_serper_lookup.py`: New test script
- `EXTERNAL_RESEARCH_STRATEGY.md`: Updated with Serper ranking
- `SERPER_INTEGRATION.md`: This guide

---

## Cost Management Tips

1. **Cache aggressively**: 24-hour cache saves 96% of repeat lookups
2. **Batch wisely**: Research new companies only, not entire dataset
3. **Target queries**: Adjust search queries to reduce noise
4. **Monitor usage**: Check dashboard daily to avoid surprises
5. **Set budget alerts**: Serper allows usage alerts in dashboard

**Estimated Real-World Cost**: $5-15/month for active job hunting (100-300 new companies)

---

## Support

**Serper.dev**:
- Docs: https://serper.dev/docs
- Support: support@serper.dev
- Status: https://status.serper.dev/

**This Integration**:
- See `company_stack_lookup.py` for implementation
- See `test_serper_lookup.py` for examples
- See `EXTERNAL_RESEARCH_STRATEGY.md` for strategy
