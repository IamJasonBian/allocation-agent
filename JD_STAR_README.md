# JD-to-STAR Matching System

Automatically matches job descriptions to your STAR interview examples and generates tailored "why I want to work here" statements.

## System Overview

```
Job Description
      ↓
[1] Webpage Indexer ────→ Word-based search index
      ↓
[2] Entity Extractor ───→ Tech stack, role, domain keywords
      ↓
[3] Company Lookup ─────→ Public tech stack (GitHub, StackShare)
      ↓
[4] STAR Matcher ───────→ Score relevance to STAR examples
      ↓
[5] Entity Store ───────→ Efficient storage for Claude skill
      ↓
"Why Work Here" Statement
```

## Components

### 1. **webpage_indexer.py**
- Inverted word index for fast search
- Stores all visited webpages (job postings, API responses, emails)
- Supports AND/OR queries across webpage content

### 2. **star_matcher.py**
- Library of 10 STAR examples from your Amazon/Microsoft experience
- Scoring algorithm: tech (40 pts) + domain (30 pts) + role (20 pts) + company stage (10 pts)
- Generates tailored "why work here" statements

### 3. **company_stack_lookup.py**
- Public lookups: GitHub repos, StackShare, job posting aggregation
- Caches results for 24 hours
- Enriches JD tech stack with company-wide technologies

### 4. **jd_star_integration.py**
- **Main interface**: ties everything together
- Processes JD → indexed webpage + matched STARs + "why work here"
- Stores entities in efficient format for Claude skill

### 5. **entity_store.json**
- Persistent storage for processed jobs
- Candidate data (resume, skills, STAR examples)
- Efficient context generation for Claude

## Installation

No external dependencies required (pure Python 3):
```bash
cd /Users/jasonzb/Desktop/apollo/allocation-agent
python3 jd_star_integration.py  # Run example
```

## Usage

### Basic Usage

```python
from jd_star_integration import JDStarSystem

# Initialize
system = JDStarSystem()

# Set your resume data (once)
system.set_candidate_data(resume_text, skills)

# Process a job description
job_data = {
    'job_id': 'unique-id',
    'company': 'Jane Street',
    'title': 'Machine Learning Engineer',
    'url': 'https://...',
    'description': 'Full JD text...'
}

jd_stack = {  # From jd-parser.mjs
    'languages': ['Python', 'OCaml'],
    'frameworks': ['PyTorch'],
    'databases': [],
    'cloud': [],
    'tools': ['Docker'],
    'niche': ['Low-Latency Systems']
}

result = system.process_job_description(job_data, jd_stack)

print(result.why_work_here)
# "I'm excited about Jane Street's focus on low-latency systems..."
```

### Integration with Allocation-Agent Scripts

```python
# In your batch-greenhouse.mjs or batch-dover.mjs:

from jd_star_integration import JDStarSystem
import json

system = JDStarSystem()

# For each job posting you fetch:
for job in greenhouse_jobs:
    jd_stack = parseJdTechStack(job.content)  # From jd-parser.mjs

    result = system.process_job_description({
        'job_id': job.id,
        'company': job.company,
        'title': job.title,
        'url': job.url,
        'description': job.content
    }, jd_stack)

    # Use result.why_work_here in cover letter
    # Use result.top_star_examples for interview prep
```

### Search Indexed Webpages

```python
from webpage_indexer import WebpageStorage

indexer = WebpageStorage()

# Search for pages mentioning "reinforcement learning"
results = indexer.search("reinforcement learning")

# Match ALL words (AND query)
results = indexer.search("python kubernetes ml", match_all=True)

# Filter by page type
job_postings = indexer.get_all_pages(page_type="job_posting")
```

### Query Entity Store

```python
from jd_star_integration import EntityStore

store = EntityStore()

# Get processed job
job = store.get_job('jane-street-mle-001')

# Search by tech
python_jobs = store.search_jobs(tech_keyword='python')

# Get Claude skill context (compact representation)
context = store.get_claude_skill_context('job-id')
```

## STAR Examples Library

Your 10 STAR examples cover:

1. **RL Agent for Inventory** (MLE, DE, SDE)
   - Tech: Python, PySpark, PyTorch, Java, EKS, DynamoDB
   - Domain: RL, real-time, agents, ML

2. **6.4x Pipeline Latency Reduction** (DE, SDE)
   - Tech: Java, Spark, Scala, EMR, S3
   - Domain: optimization, streaming, batch

3. **Sev-2 Support for DL Models** (DE, MLE, ML-Ops)
   - Tech: CloudWatch, Lambda, Java, Airflow
   - Domain: production ML, monitoring, ops

4. **Forecast API Scaling** (SDE, DE, Backend)
   - Tech: Java, Python, DynamoDB, Redshift
   - Domain: API, microservices, scaling

5. **Requirements with 20+ Teams** (PM, TPM, SDE, DE)
   - Domain: stakeholder management, alignment

6. **Green Shipping Optimization** (DS, DE, Analyst)
   - Tech: Python, Scala, Spark, A/B Testing
   - Domain: supply chain, experimentation

7. **Carbon Data Lake (15.3B Rows)** (DE, SDE, Data Platform)
   - Tech: Python, Scala, Spark, CI/CD
   - Domain: ETL, ingestion, dimensional modeling

8. **Hiring LP Solver** (DS, Analyst, DE)
   - Tech: Python, Linear Programming
   - Domain: optimization, forecasting, capacity

9. **Azure Capacity Management** (PM, TPM, Analyst)
   - Tech: Azure, SQL, Python
   - Domain: capacity planning, infrastructure

10. **Consulting Startup** (Founder, Consultant, DE)
    - Tech: Azure, Databricks
    - Domain: 0-to-1, customer discovery, startups

## Scoring Algorithm

Matches are scored on a 100-point scale:

- **Tech Stack Overlap (0-40 pts)**: % of JD tech you have experience with
- **Domain Keywords (0-30 pts)**: % of domain keywords matched (ML, forecasting, etc.)
- **Role Type Match (0-20 pts)**: MLE, DE, SDE, DS, PM alignment
- **Company Stage (0-10 pts)**: Startup, Fintech, Large Scale, Science alignment

Example:
```
Jane Street MLE:
  Tech: 7/15 JD techs matched → 18.7 pts
  Domain: 5/8 keywords matched → 18.8 pts
  Role: MLE match → 20 pts
  Company: Fintech match → 10 pts
  Total: 67.5 pts → Maps to "RL Agent" STAR
```

## Files Generated

- `webpage_index.json` - Indexed webpages with word search
- `company_stacks.json` - Cached company tech stacks
- `entity_store.json` - Processed jobs + candidate data

## Future: Claude Skill Integration

This system is designed to be converted into a Claude skill. The entity store provides efficient context:

```
# Future Claude skill usage:
Claude: "Help me prep for the Jane Street ML Engineer interview"

→ Loads entity_store.json
→ Retrieves top 3 matched STAR examples
→ Provides tailored interview responses based on:
  - Tech overlap (Python, PyTorch, Kubernetes)
  - Domain overlap (ML, real-time, RL)
  - Relevant STAR: "RL Agent for Inventory Purchasing"
```

## Architecture Decisions

### Why Inverted Index?
- Fast word lookup (O(1) for exact match)
- Supports boolean queries (AND/OR)
- Compact storage for large corpora

### Why Separate Entity Store?
- Decouples raw webpage content from processed entities
- Efficient for Claude skill (only loads relevant context)
- Preserves full webpage content for future re-processing

### Why Local Storage?
- No external dependencies
- Fast access (no network calls)
- Privacy (sensitive job data stays local)
- Easy to version control and backup

## Example Output

```
Job: Machine Learning Engineer at Jane Street
Role: MLE | Stage: Fintech

Top Matched STAR Examples:
  1. [67.5] RL Agent for Inventory Purchasing (5% US Retail)
  2. [45.2] Sev-2 Support for 6 DL Forecasting Models
  3. [32.1] Forecast API Scaling (150→630 Daily Calls)

Tech Overlap: Python, PyTorch, Kubernetes
Domain Overlap: ML, real-time, reinforcement learning, API

Why I Want to Work Here:
I'm excited about Jane Street's focus on low-latency systems and
real-time decision-making in financial markets. My experience with
RL Agent for Inventory Purchasing (5% US Retail) directly aligns
with building production ML systems using Python, PyTorch, and
low-latency infrastructure.
```

## Testing

Run all components:
```bash
python3 webpage_indexer.py          # Test indexer
python3 star_matcher.py             # Test STAR matching
python3 company_stack_lookup.py     # Test company lookup
python3 jd_star_integration.py      # Test full integration
```

## Next Steps

1. **Integrate with existing scripts**: Add to `batch-greenhouse.mjs`, `dover-apply.mjs`
2. **Expand company database**: Add more companies to `company_stack_lookup.py`
3. **Refine STAR examples**: Add more specific metrics and outcomes
4. **Build Claude skill**: Convert to interactive Claude skill for interview prep
5. **Add resume builder integration**: Use matched STARs to reorder resume sections

---

**Author**: Jason Bian
**Date**: 2026-03-11
**Purpose**: Automate STAR example matching for job applications and interview prep
