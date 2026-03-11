# Quick Start Guide

## 30-Second Overview

This system matches job descriptions to your STAR interview examples and generates "why I want to work here" statements.

## Installation

```bash
cd /Users/jasonzb/Desktop/apollo/allocation-agent
# No dependencies needed - pure Python 3!
```

## Run Examples

```bash
# Test individual components
python3 webpage_indexer.py          # Word indexing
python3 star_matcher.py             # STAR matching
python3 company_stack_lookup.py     # Company lookup
python3 jd_star_integration.py      # Full integration

# Complete workflow example
python3 example_integration.py
```

## Basic Usage (Copy-Paste)

```python
from jd_star_integration import JDStarSystem

# 1. Initialize
system = JDStarSystem()

# 2. Set your info (once)
resume_text = "Your resume here..."
skills = ["python", "java", "spark", ...]
system.set_candidate_data(resume_text, skills)

# 3. Process a job
job_data = {
    'job_id': 'unique-id',
    'company': 'Jane Street',
    'title': 'ML Engineer',
    'url': 'https://...',
    'description': 'Full JD text...'
}

jd_stack = {  # From jd-parser.mjs
    'languages': ['Python', 'OCaml'],
    'frameworks': ['PyTorch'],
    'databases': [],
    'cloud': [],
    'tools': ['Docker'],
    'niche': []
}

result = system.process_job_description(job_data, jd_stack)

# 4. Use results
print(result.why_work_here)
print(result.top_star_examples)
print(result.tech_overlap)
```

## Output Example

```
Top Matched STAR:
  [67.5 pts] RL Agent for Inventory Purchasing (5% US Retail)

Tech Overlap: python, pytorch, kubernetes

Why I Want to Work Here:
I'm excited about Jane Street's focus on low-latency systems
and real-time decision-making in financial markets. My experience
with RL Agent for Inventory Purchasing directly aligns with
building production ML systems using Python, PyTorch, and
low-latency infrastructure.
```

## What Gets Stored

Three JSON files in your project directory:

1. **webpage_index.json** - All visited job pages (word searchable)
2. **company_stacks.json** - Cached tech stacks from GitHub/StackShare
3. **entity_store.json** - Processed jobs with matched STARs

## Search Examples

```python
# Search for specific keywords
pages = system.webpage_indexer.search("machine learning")

# Boolean AND
pages = system.webpage_indexer.search("python ml infrastructure", match_all=True)

# Find processed jobs
jobs = system.entity_store.search_jobs(tech_keyword="pytorch")
```

## Integration with Your Scripts

### Option 1: Direct Python Import

```javascript
// In your .mjs file
import { execSync } from 'child_process';

const result = JSON.parse(execSync(
  `python3 -c "
from jd_star_integration import JDStarSystem
import json
system = JDStarSystem()
result = system.process_job_description(...)
print(json.dumps(result.to_dict()))
  "`,
  { encoding: 'utf8' }
));
```

### Option 2: Separate Script

```javascript
// In batch-greenhouse.mjs
for (const job of jobs) {
  const jdStack = parseJdTechStack(job.content);

  // Save to temp file
  fs.writeFileSync('temp_jd.json', JSON.stringify({
    job_data: job,
    jd_stack: jdStack
  }));

  // Process via Python
  execSync('python3 process_jd.py temp_jd.json');

  // Read result
  const result = JSON.parse(fs.readFileSync('jd_result.json'));
  console.log(result.why_work_here);
}
```

## Your 10 STAR Examples

Quick reference of what's in the library:

1. **RL Agent for Inventory** - MLE, DE, SDE - Python, PyTorch, EKS
2. **6.4x Latency Reduction** - DE, SDE - Java, Spark, EMR
3. **Sev-2 DL Support** - DE, MLE - CloudWatch, Airflow
4. **API Scaling (4.2x)** - SDE, DE - Java, DynamoDB
5. **20+ Team Alignment** - PM, TPM - Stakeholder mgmt
6. **Green Shipping** - DS, DE - Python, Scala, A/B testing
7. **Carbon Data Lake (15.3B)** - DE, SDE - Python, Scala, Spark
8. **Hiring LP Solver** - DS, Analyst - Python, Linear Programming
9. **Azure Capacity ($5M)** - PM, TPM - Azure, SQL
10. **Consulting Startup** - Founder - Azure, Databricks

## Troubleshooting

### "No module named 'jd_star_integration'"
```bash
# Make sure you're in the right directory
cd /Users/jasonzb/Desktop/apollo/allocation-agent
python3 jd_star_integration.py
```

### "File not found: entity_store.json"
```python
# Run this first to initialize:
python3 jd_star_integration.py
```

### Clear cache
```bash
rm company_stacks.json entity_store.json webpage_index.json
```

## Next Steps

1. ✅ Run `python3 example_integration.py` to see it work
2. ✅ Process your first real JD
3. ✅ Check `entity_store.json` for results
4. ✅ Integrate into batch-greenhouse.mjs
5. ✅ Use for interview prep

## Files You'll Use Most

- **jd_star_integration.py** - Main interface
- **entity_store.json** - View processed jobs
- **example_integration.py** - Copy-paste template

## Get Help

Read the full docs:
- `JD_STAR_README.md` - Complete documentation
- `SYSTEM_SUMMARY.md` - Architecture overview
- This file - Quick start

---

**Ready to go!** Run `python3 example_integration.py` to see the full workflow.
