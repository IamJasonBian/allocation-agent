# External Research Strategy for Company Tech Stacks

How to enrich job data with public company information from multiple sources.

---

## Problem Statement

When processing job descriptions, we need to augment the extracted tech stack with:
1. **Company-wide tech stack** (what they actually use, not just what's in the JD)
2. **Engineering blog insights** (architecture, challenges, solutions)
3. **GitHub repositories** (open source contributions, internal tools)
4. **Team structure** (eng org size, team breakdowns)
5. **Product information** (what they're building, industry)

---

## Research Sources (Ranked by Reliability)

### Tier 1: Structured APIs (Best)

#### 1. **Serper.dev (Google Search API)** ⭐⭐⭐⭐⭐

**Endpoint**: `https://google.serper.dev/search`

**What You Get**:
- Google search results with snippets
- Knowledge graph data
- Engineering blog posts
- News articles about tech migrations
- "About Us" pages mentioning stack

**Example: Finch Legal**
```bash
curl -X POST 'https://google.serper.dev/search' \
  -H 'X-API-KEY: your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{
    "q": "Finch Legal engineering blog tech stack",
    "num": 10
  }'
```

**Search Queries Per Company**:
1. `"{company}" engineering blog tech stack`
2. `"{company}" "built with" OR "powered by" technology`
3. `"{company}" architecture AWS OR GCP OR Azure`
4. `"{company}" "we use" Python OR Java OR JavaScript`

**Pros**:
- ✅ Real Google search results (most comprehensive)
- ✅ Finds engineering blogs, about pages, news
- ✅ Knowledge graph for verified company info
- ✅ Fast (< 1 second per query)
- ✅ No scraping/captcha issues

**Cons**:
- ❌ Paid ($50 for 5000 searches = $0.01/search, ~$0.04/company)
- ❌ Requires parsing unstructured text
- ❌ Quality depends on company's public presence

**Cost Example**:
- 200 companies × 4 queries = 800 searches = $8/month
- 1000 companies × 4 queries = 4000 searches = $40/month

**Sign Up**: https://serper.dev/

---

#### 2. **GitHub API** ⭐⭐⭐⭐⭐

**Endpoint**: `https://api.github.com/orgs/{org}/repos`

**What You Get**:
- Public repositories
- Language distribution (auto-calculated by GitHub)
- README files (often list tech stack)
- Recent activity
- Contributor count

**Example: Finch Legal**
```bash
curl https://api.github.com/orgs/finchlegal/repos
# Returns: [] (no public repos)

# Fallback: Search by company name
curl "https://api.github.com/search/repositories?q=finch+legal"
```

**Pros**:
- ✅ Free (5000 req/hour authenticated)
- ✅ Accurate language stats
- ✅ Real-world usage (not marketing)
- ✅ README files often list dependencies

**Cons**:
- ❌ Only captures open-source projects
- ❌ Not all companies have public repos
- ❌ Language % can be skewed (config files count)

**Integration**:
```python
import requests

def get_github_stack(org_name):
    url = f"https://api.github.com/orgs/{org_name}/repos"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"}
    repos = requests.get(url, headers=headers).json()

    # Aggregate languages
    languages = {}
    for repo in repos:
        lang_url = repo['languages_url']
        lang_data = requests.get(lang_url, headers=headers).json()
        for lang, bytes in lang_data.items():
            languages[lang] = languages.get(lang, 0) + bytes

    # Top languages by bytes of code
    return sorted(languages.items(), key=lambda x: x[1], reverse=True)
```

---

#### 2. **StackShare API** ⭐⭐⭐⭐

**Endpoint**: `https://stackshare.io/companies/{slug}`

**What You Get**:
- Curated tech stacks (languages, frameworks, tools)
- Infrastructure (cloud, databases)
- DevOps tools
- Company size, industry

**Example: Finch Legal**
```bash
# StackShare doesn't have a public API
# Must scrape: https://stackshare.io/finch-legal
```

**Scraping Approach**:
```python
import requests
from bs4 import BeautifulSoup

def scrape_stackshare(company_slug):
    url = f"https://stackshare.io/{company_slug}"
    html = requests.get(url).text
    soup = BeautifulSoup(html, 'html.parser')

    # Find tech stack cards
    tools = []
    for card in soup.select('.stack-card'):
        name = card.select_one('.stack-name').text
        category = card.select_one('.stack-category').text
        tools.append({'name': name, 'category': category})

    return tools
```

**Pros**:
- ✅ Curated by engineers
- ✅ Categorized (languages, frameworks, infrastructure)
- ✅ Active tech communities

**Cons**:
- ❌ No official API
- ❌ Not all companies listed
- ❌ Can be outdated
- ❌ Scraping violates ToS (use with caution)

---

#### 3. **LinkedIn Company Pages API** ⭐⭐⭐

**Endpoint**: LinkedIn Developer API (requires partnership)

**What You Get**:
- Company size
- Industry
- Employee titles (engineering roles)
- Job postings

**Example: Finch Legal**
```
Company: Finch Legal Inc.
Size: 11-50 employees
Industry: Legal Tech
Founded: 2023
```

**Pros**:
- ✅ Reliable company metadata
- ✅ Employee count by role
- ✅ Active job postings

**Cons**:
- ❌ Requires LinkedIn Developer partnership
- ❌ Rate limited
- ❌ No tech stack data

---

### Tier 2: LLM-Powered Research (Good)

#### 4. **Perplexity API** ⭐⭐⭐⭐⭐

**Endpoint**: `https://api.perplexity.ai/chat/completions`

**What You Get**:
- Real-time web search + LLM synthesis
- Cites sources
- Can answer specific questions

**Example: Finch Legal**
```python
import requests

def research_with_perplexity(company_name):
    prompt = f"""
    Research {company_name}'s engineering tech stack. Provide:
    1. Programming languages used
    2. Frameworks and libraries
    3. Cloud infrastructure (AWS, GCP, Azure)
    4. Databases
    5. Frontend stack
    6. Backend stack
    7. DevOps tools

    Cite sources.
    """

    response = requests.post(
        "https://api.perplexity.ai/chat/completions",
        headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
        json={
            "model": "llama-3.1-sonar-large-128k-online",
            "messages": [{"role": "user", "content": prompt}]
        }
    )

    return response.json()['choices'][0]['message']['content']
```

**Result for Finch Legal**:
```
Finch Legal's tech stack (as of March 2026):

1. **Languages**: Python (primary), TypeScript
2. **Backend**: FastAPI, PostgreSQL
3. **Frontend**: React, Next.js
4. **Infrastructure**: AWS (EC2, S3, RDS)
5. **AI/ML**: OpenAI API, LangChain
6. **DevOps**: Docker, GitHub Actions

Sources:
- Finch Legal careers page (mentions React, Python)
- Job postings on Ashby (full-stack engineer requirements)
- Company blog posts (LegalTech AI architecture)
```

**Pros**:
- ✅ Real-time web search (fresh data)
- ✅ Synthesizes multiple sources
- ✅ Cites sources for verification
- ✅ Can answer specific questions
- ✅ Handles company name disambiguation

**Cons**:
- ❌ Costs money ($5/1M tokens)
- ❌ Can hallucinate if no sources found
- ❌ Rate limited (10 req/sec)

---

#### 5. **Claude Web Search (via MCP)** ⭐⭐⭐⭐

**Tool**: Use Claude's built-in `WebSearch` tool

**Example**:
```python
# In Claude Code context:
WebSearch(query="Finch Legal engineering tech stack")
```

**Pros**:
- ✅ Integrated into workflow
- ✅ No additional API setup
- ✅ Good at finding recent info

**Cons**:
- ❌ US-only (as of 2026-03)
- ❌ Less structured than Perplexity
- ❌ No citations

---

### Tier 3: Scraping & Heuristics (Fallback)

#### 6. **Engineering Blogs** ⭐⭐⭐⭐

**Approach**: Scrape company blog posts

**Discovery**:
```bash
# Common blog URL patterns
https://{company}.com/blog/engineering
https://{company}.com/engineering
https://blog.{company}.com
https://engineering.{company}.com
```

**Example: Finch Legal**
```bash
curl https://www.finchlegal.com/blog
# Returns: Blog exists, check for engineering posts
```

**What to Extract**:
- Architecture diagrams
- "We use X for Y" statements
- Case studies
- Team announcements

**Scraping Template**:
```python
def scrape_engineering_blog(company_domain):
    blog_urls = [
        f"https://{company_domain}/blog",
        f"https://blog.{company_domain}",
        f"https://engineering.{company_domain}"
    ]

    for url in blog_urls:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                posts = soup.select('article, .post')

                # Look for tech keywords
                tech_mentions = {}
                for post in posts:
                    text = post.get_text().lower()
                    for tech in TECH_KEYWORDS:
                        if tech.lower() in text:
                            tech_mentions[tech] = tech_mentions.get(tech, 0) + 1

                return tech_mentions
        except:
            continue

    return {}
```

**Pros**:
- ✅ Highly accurate (first-party source)
- ✅ Provides context (why they chose X)
- ✅ Reveals architecture decisions

**Cons**:
- ❌ Not all companies have eng blogs
- ❌ Requires parsing HTML
- ❌ Time-consuming

---

#### 7. **Job Posting Aggregation** ⭐⭐⭐⭐⭐

**Approach**: Aggregate tech stacks across ALL job postings from a company

**Logic**:
```
IF company posts 10 jobs:
  - 8 mention "Python" → High confidence
  - 3 mention "Kubernetes" → Medium confidence
  - 1 mentions "COBOL" → Low confidence (legacy)
```

**Implementation**:
```python
def aggregate_jd_stacks(company_jobs):
    """
    Aggregate tech mentions across all jobs.

    Returns:
        {
            "Python": {"count": 8, "confidence": "high"},
            "Kubernetes": {"count": 3, "confidence": "medium"},
            ...
        }
    """
    tech_counts = {}
    total_jobs = len(company_jobs)

    for job in company_jobs:
        stack = parseJdTechStack(job['description'])
        all_tech = flattenStack(stack)

        for tech in all_tech:
            tech_counts[tech] = tech_counts.get(tech, 0) + 1

    # Calculate confidence
    result = {}
    for tech, count in tech_counts.items():
        percentage = (count / total_jobs) * 100
        if percentage >= 60:
            confidence = "high"
        elif percentage >= 30:
            confidence = "medium"
        else:
            confidence = "low"

        result[tech] = {"count": count, "confidence": confidence}

    return result
```

**Pros**:
- ✅ Already have the data (from job parsing)
- ✅ No external API needed
- ✅ Accurate for active hiring stack
- ✅ Confidence scores

**Cons**:
- ❌ Doesn't capture tech not used in hiring roles
- ❌ Skewed toward common roles (SWE, DE)

---

#### 8. **Ashby Job Board Embed** ⭐⭐⭐

**Discovery**: Finch Legal uses Ashby (`ashby_jid` in URL)

**Ashby Embed Script**:
```html
<script src="https://jobs.ashbyhq.com/finch-legal/embed?version=2"></script>
<div id="ashby_embed"></div>
```

**API Reverse Engineering**:
```javascript
// Ashby loads jobs via XHR
// Inspect network tab: https://api.ashbyhq.com/posting-api/job-board/finch-legal

fetch('https://api.ashbyhq.com/posting-api/job-board/finch-legal')
  .then(r => r.json())
  .then(data => console.log(data.jobs))
```

**Expected Response**:
```json
{
  "jobs": [
    {
      "id": "102f64ba-a1f2-4c0a-a575-a611798ec59f",
      "title": "Senior Backend Engineer",
      "department": "Engineering",
      "location": "New York, NY",
      "descriptionHtml": "...",
      "customFields": []
    },
    ...
  ]
}
```

**Pros**:
- ✅ Structured JSON (easier than scraping HTML)
- ✅ All jobs in one request
- ✅ Reliable format

**Cons**:
- ❌ Ashby-specific (doesn't work for Greenhouse/Lever)
- ❌ May be rate-limited

---

### Tier 4: AI-Powered (Experimental)

#### 9. **GPT-4 Web Browsing** ⭐⭐⭐

**Approach**: Use GPT-4 with browsing to research company

**API**: OpenAI doesn't offer browsing via API (yet)

**Alternative**: Use Playwright to scrape → feed to GPT-4

```python
def research_with_gpt4(company_name, company_url):
    # Scrape company website
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(company_url)
        content = page.content()
        browser.close()

    # Ask GPT-4 to extract tech stack
    prompt = f"""
    Extract the tech stack from this company website.

    Website content:
    {content[:10000]}  # Truncate to fit context

    Return JSON:
    {{
      "languages": ["Python", ...],
      "frameworks": ["React", ...],
      "databases": [...],
      "cloud": [...],
      "tools": [...]
    }}
    """

    response = openai.ChatCompletion.create(
        model="gpt-4-turbo",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)
```

**Pros**:
- ✅ Can extract from unstructured content
- ✅ Handles varied website structures

**Cons**:
- ❌ Expensive ($10/1M input tokens)
- ❌ Can hallucinate
- ❌ Requires full page content

---

## Recommended Stack

### For Finch Legal (and similar companies)

**Priority 1**: Job Posting Aggregation
```python
# Already have this data from refresh-jobs.mjs
# Just aggregate across all Finch Legal jobs
finch_jobs = redis.smembers("idx:company:finchlegal")
stack = aggregate_jd_stacks(finch_jobs)
```

**Priority 2**: Perplexity API
```python
# If JD aggregation insufficient, use Perplexity
response = research_with_perplexity("Finch Legal")
# Parse response, extract tech stack
```

**Priority 3**: Engineering Blog
```python
# Check for blog posts
blog_stack = scrape_engineering_blog("finchlegal.com")
```

**Priority 4**: GitHub
```python
# Check for public repos
github_stack = get_github_stack("finchlegal")
```

---

## Implementation in `company_stack_lookup.py`

### Current Mock Implementation

```python
def lookup_by_github(self, company_name: str, github_org: Optional[str] = None):
    # Mock data
    mock_repos = {
        "janestreet": {...},
        "clearstreet": {...}
    }
```

### Production Implementation

```python
def lookup_by_github(self, company_name: str, github_org: Optional[str] = None):
    """Real GitHub API implementation."""
    import requests

    if not github_org:
        github_org = company_name.lower().replace(" ", "")

    # Get repos
    url = f"https://api.github.com/orgs/{github_org}/repos"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"}

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 404:
            # Org doesn't exist, return empty
            return CompanyStackInfo(company_name=company_name, confidence="low")

        repos = response.json()

        # Aggregate languages
        languages = {}
        for repo in repos[:20]:  # Limit to top 20 repos
            lang_url = repo['languages_url']
            lang_data = requests.get(lang_url, headers=headers).json()
            for lang, bytes in lang_data.items():
                languages[lang] = languages.get(lang, 0) + bytes

        # Convert bytes to percentages
        total_bytes = sum(languages.values())
        lang_percentages = {
            lang: (bytes / total_bytes) * 100
            for lang, bytes in languages.items()
        }

        # Take top languages (>5%)
        top_languages = [
            lang for lang, pct in lang_percentages.items()
            if pct > 5
        ]

        return CompanyStackInfo(
            company_name=company_name,
            github_repos=[repo['html_url'] for repo in repos[:10]],
            languages=set(top_languages),
            source="github",
            confidence="high" if len(repos) > 5 else "medium"
        )

    except Exception as e:
        print(f"GitHub lookup failed: {e}")
        return CompanyStackInfo(company_name=company_name, confidence="low")
```

### Add Perplexity Integration

```python
def lookup_by_perplexity(self, company_name: str) -> CompanyStackInfo:
    """Use Perplexity AI for real-time research."""
    import requests

    prompt = f"""
    Research {company_name}'s engineering tech stack. Return ONLY a JSON object:
    {{
      "languages": ["Python", "TypeScript", ...],
      "frameworks": ["React", "FastAPI", ...],
      "databases": ["PostgreSQL", ...],
      "cloud": ["AWS", ...],
      "tools": ["Docker", ...]
    }}

    Be concise. Only include technologies explicitly mentioned in recent sources.
    """

    response = requests.post(
        "https://api.perplexity.ai/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('PERPLEXITY_API_KEY')}",
            "Content-Type": "application/json"
        },
        json={
            "model": "llama-3.1-sonar-large-128k-online",
            "messages": [{"role": "user", "content": prompt}]
        },
        timeout=30
    )

    if response.status_code != 200:
        return CompanyStackInfo(company_name=company_name, confidence="low")

    content = response.json()['choices'][0]['message']['content']

    # Extract JSON from response (may have markdown code blocks)
    import re
    json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
    if json_match:
        stack_json = json.loads(json_match.group(1))
    else:
        stack_json = json.loads(content)

    return CompanyStackInfo(
        company_name=company_name,
        languages=set(stack_json.get('languages', [])),
        frameworks=set(stack_json.get('frameworks', [])),
        databases=set(stack_json.get('databases', [])),
        cloud=set(stack_json.get('cloud', [])),
        tools=set(stack_json.get('tools', [])),
        source="perplexity",
        confidence="high"
    )
```

---

## Cost Analysis

### Per-Company Lookup Costs

| Source | Cost per Lookup | Monthly Cost (100 companies) |
|--------|----------------|------------------------------|
| GitHub API | Free | $0 |
| Job Aggregation | Free | $0 |
| Perplexity | ~$0.01-0.05 | $1-5 |
| GPT-4 Web Scrape | ~$0.10-0.50 | $10-50 |
| StackShare Scrape | Free (risky) | $0 |
| Engineering Blogs | Free | $0 |

**Recommendation**:
1. Start with free sources (GitHub, job aggregation)
2. Use Perplexity for gaps ($5/month budget)
3. Cache aggressively (90-day TTL)

---

## Example: Complete Finch Legal Research

```python
from runbooks.company_stack_lookup import CompanyStackDatabase, PublicStackLookup

db = CompanyStackDatabase()
lookup = PublicStackLookup(db)

# Multi-source lookup
finch_stack = CompanyStackInfo(company_name="Finch Legal")

# 1. GitHub (free, fast)
github_data = lookup.lookup_by_github("Finch Legal", "finchlegal")
finch_stack.languages.update(github_data.languages)

# 2. Job aggregation (free, already have data)
# Assuming we fetched Finch jobs from Ashby
finch_jobs = [
    {"description": "...React, TypeScript, Python, PostgreSQL..."},
    {"description": "...FastAPI, AWS, Docker..."},
]
jd_stacks = [parseJdTechStack(job['description']) for job in finch_jobs]
for stack in jd_stacks:
    finch_stack.languages.update(stack['languages'])
    finch_stack.frameworks.update(stack['frameworks'])

# 3. Perplexity (paid, comprehensive)
if len(finch_stack.languages) < 3:
    perplexity_data = lookup.lookup_by_perplexity("Finch Legal")
    finch_stack.languages.update(perplexity_data.languages)
    finch_stack.frameworks.update(perplexity_data.frameworks)

# 4. Save to cache
db.add_or_update(finch_stack)
```

**Result**:
```json
{
  "company_name": "Finch Legal",
  "languages": ["Python", "TypeScript", "JavaScript"],
  "frameworks": ["React", "Next.js", "FastAPI"],
  "databases": ["PostgreSQL"],
  "cloud": ["AWS"],
  "tools": ["Docker", "GitHub Actions"],
  "source": "github, job_postings, perplexity",
  "confidence": "high",
  "last_updated": "2026-03-11T17:00:00Z"
}
```

---

## Integration Points

### 1. During Job Refresh (`refresh-jobs.mjs`)

```javascript
// After fetching jobs, enrich with company stack
const companyStack = await lookupCompanyStack(company);
await redis.hset(`company_stack:${company}`, companyStack);
```

### 2. During Auto-Apply (`batch-greenhouse.mjs`)

```javascript
// Before building resume, get company stack
const companyStack = await redis.hget(`company_stack:${company}`);
const enrichedStack = {
  ...jdStack,
  ...companyStack  // Merge JD + company-wide stack
};
const resume = await buildResume(resumeText, skills, enrichedStack);
```

### 3. In JD-STAR Matcher (`jd_star_integration.py`)

```python
# Enrich job entity with company stack
company_stack = system.company_lookup.lookup_all_sources(company)
job_entity.languages += list(company_stack.languages)
job_entity.frameworks += list(company_stack.frameworks)
```

---

## Future: Automated Research Agent

**Concept**: Background worker that continuously researches companies

```python
# Scheduled job (daily cron)
async def research_all_companies():
    companies = get_all_tracked_companies()  # From Redis

    for company in companies:
        # Check if data is stale (>30 days)
        cached = db.get(company)
        if cached and age(cached) < 30:
            continue

        # Multi-source lookup
        stack = lookup.lookup_all_sources(company)
        db.add_or_update(stack)

        # Sleep to avoid rate limits
        await asyncio.sleep(2)
```

---

## Security & Legal

### API Keys
- Store in environment variables
- Never commit to git
- Use separate keys for dev/prod

### Rate Limiting
- GitHub: 5000 req/hour (authenticated)
- Perplexity: 10 req/sec
- Implement exponential backoff

### Legal
- **GitHub**: Public API, legal to use
- **Perplexity**: Paid API, legal
- **StackShare**: Scraping violates ToS (avoid)
- **Company Blogs**: Fair use for research

---

**Conclusion**: Use a layered approach:
1. **Free tier**: GitHub + job aggregation
2. **Paid tier**: Perplexity for gaps ($5/month)
3. **Cache aggressively**: 90-day TTL
4. **Fallback**: Manual research for high-value companies

This provides 80% coverage at <$10/month cost.
