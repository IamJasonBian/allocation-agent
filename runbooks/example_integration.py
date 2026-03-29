"""
Example: Integrating JD-STAR system with allocation-agent workflow

This shows how to use the JD-STAR matcher in your existing
Greenhouse/Lever/Dover automation scripts.
"""

from jd_star_integration import JDStarSystem
import json


def process_greenhouse_job(job_data: dict, system: JDStarSystem):
    """
    Process a Greenhouse job posting.

    Args:
        job_data: From Greenhouse API {id, title, content, location, ...}
        system: JDStarSystem instance
    """
    # Parse tech stack (you already have this from jd-parser.mjs)
    # For demo, using mock data
    jd_stack = {
        'languages': ['Python', 'Java'],
        'frameworks': ['Spark', 'PyTorch'],
        'databases': ['Redshift', 'DynamoDB'],
        'cloud': ['AWS', 'EMR', 'S3'],
        'tools': ['Airflow', 'Docker'],
        'niche': []
    }

    job_input = {
        'job_id': f"greenhouse-{job_data['id']}",
        'company': job_data.get('company', 'Unknown'),
        'title': job_data.get('title', ''),
        'url': f"https://boards.greenhouse.io/{job_data.get('board_token')}/jobs/{job_data['id']}",
        'description': job_data.get('content', '')
    }

    result = system.process_job_description(job_input, jd_stack, lookup_company=True)
    return result


def process_dover_job(job_data: dict, system: JDStarSystem):
    """
    Process a Dover job posting.

    Args:
        job_data: From Dover API/scrape {jobId, title, description, ...}
        system: JDStarSystem instance
    """
    jd_stack = {
        'languages': ['TypeScript', 'Python'],
        'frameworks': ['React', 'Node.js'],
        'databases': ['PostgreSQL'],
        'cloud': ['AWS'],
        'tools': ['Docker', 'Kubernetes'],
        'niche': []
    }

    job_input = {
        'job_id': f"dover-{job_data['jobId']}",
        'company': job_data.get('company', 'Unknown'),
        'title': job_data.get('title', ''),
        'url': f"https://app.dover.com/apply/{job_data.get('slug')}/{job_data['jobId']}",
        'description': job_data.get('description', '')
    }

    result = system.process_job_description(job_input, jd_stack, lookup_company=True)
    return result


def batch_process_jobs(jobs: list, system: JDStarSystem):
    """
    Batch process multiple jobs.

    Returns:
        List of ProcessedJob results sorted by match score
    """
    results = []

    for job in jobs:
        platform = job.get('platform', 'greenhouse')

        if platform == 'greenhouse':
            result = process_greenhouse_job(job, system)
        elif platform == 'dover':
            result = process_dover_job(job, system)
        else:
            continue

        results.append(result)

    # Sort by top STAR match score
    results.sort(key=lambda r: r.top_star_examples[0]['score'] if r.top_star_examples else 0, reverse=True)

    return results


def generate_cover_letter_snippet(result):
    """
    Generate cover letter snippet using matched STAR examples.

    Returns:
        str: Cover letter paragraph
    """
    top_star = result.top_star_examples[0] if result.top_star_examples else None

    if not top_star:
        return result.why_work_here

    # More detailed version referencing specific STAR
    star_title = top_star['title']
    tech_list = ', '.join(result.tech_overlap[:5])

    snippet = f"{result.why_work_here}\n\n"
    snippet += f"In my current role at Amazon, I {star_title.lower()}, "
    snippet += f"which directly translates to the challenges at {result.company}. "
    snippet += f"My hands-on experience with {tech_list} positions me well to contribute immediately."

    return snippet


def main():
    print("=== Example: JD-STAR Integration Workflow ===\n")

    # Initialize system
    system = JDStarSystem()

    # Set candidate data
    resume_text = """JASON BIAN
Data Engineer II at Amazon (2021-Present)
- Built RL agents for inventory purchasing (5% US retail)
- Reduced pipeline latency by 6.4x across 4 DL forecasting models
- Maintained Sev-2 support for production ML systems (1102+ weekly runs)
- Scaled forecast APIs from 150 to 630 daily calls
- Designed carbon data lake processing 15.3B daily rows"""

    skills = [
        "python", "java", "sql", "spark", "scala", "pytorch",
        "airflow", "redshift", "kubernetes", "aws", "machine learning"
    ]

    system.set_candidate_data(resume_text, skills)

    # Mock job data (simulating Greenhouse/Dover API responses)
    jobs = [
        {
            'platform': 'greenhouse',
            'id': '12345',
            'board_token': 'clearstreet',
            'company': 'Clear Street',
            'title': 'Data Engineer - Trading Infrastructure',
            'content': '''
            Clear Street is building next-gen trading infrastructure. We need a Data Engineer
            to work on real-time data pipelines, stream processing, and low-latency systems.
            You'll work with Python, Java, Spark, Kafka, and AWS.
            '''
        },
        {
            'platform': 'dover',
            'jobId': '550e8400-e29b-41d4-a716-446655440000',
            'slug': 'techstartup',
            'company': 'TechStartup',
            'title': 'Full Stack Engineer',
            'description': '''
            Early-stage startup building AI tools. Looking for full-stack engineer
            with TypeScript, React, Node.js, and PostgreSQL experience.
            '''
        },
        {
            'platform': 'greenhouse',
            'id': '67890',
            'board_token': 'databricks',
            'company': 'Databricks',
            'title': 'ML Platform Engineer',
            'content': '''
            Build MLOps infrastructure at Databricks. Work on model serving, feature stores,
            and production ML systems using Spark, MLflow, Kubernetes, and cloud infrastructure.
            '''
        }
    ]

    # Batch process
    print("Processing jobs...\n")
    results = batch_process_jobs(jobs, system)

    # Display results ranked by match score
    print("="*70)
    print("\nRANKED RESULTS (by STAR match score):\n")

    for i, result in enumerate(results, 1):
        top_score = result.top_star_examples[0]['score'] if result.top_star_examples else 0

        print(f"{i}. [{top_score:.1f} pts] {result.title} at {result.company}")
        print(f"   Role: {result.job_entity['role_type']} | Stage: {result.job_entity['company_stage']}")
        print(f"   Tech Overlap: {', '.join(result.tech_overlap[:5])}")
        print(f"   Top STAR: {result.top_star_examples[0]['title'] if result.top_star_examples else 'None'}")
        print()

    # Generate cover letter for top match
    print("="*70)
    print("\nCOVER LETTER SNIPPET (Top Match):\n")
    print(generate_cover_letter_snippet(results[0]))

    # Show entity store stats
    print("="*70)
    print("\nENTITY STORE STATS:")
    print(f"  Jobs processed: {len(results)}")
    print(f"  Companies cached: {len(system.company_db.companies)}")
    print(f"  Webpages indexed: {len(system.webpage_indexer.pages)}")
    print(f"  Unique words: {len(system.webpage_indexer.word_index)}")

    # Search examples
    print("\n" + "="*70)
    print("\nSEARCH EXAMPLES:")

    print("\n1. Find all jobs mentioning 'machine learning':")
    ml_jobs = system.entity_store.search_jobs(tech_keyword='machine learning')
    for job in ml_jobs[:3]:
        print(f"   - {job['title']} at {job['company']}")

    print("\n2. Find jobs at 'Databricks':")
    db_jobs = system.entity_store.search_jobs(company_keyword='databricks')
    for job in db_jobs:
        print(f"   - {job['title']}")

    print("\n3. Search webpage index for 'real-time pipeline':")
    pages = system.webpage_indexer.search("real-time pipeline", match_all=True)
    for page in pages[:3]:
        print(f"   - {page['title']} ({page['url'][:50]}...)")

    print("\n" + "="*70)
    print("\n✓ Example workflow complete!")
    print("\nNext steps:")
    print("  1. Integrate into batch-greenhouse.mjs")
    print("  2. Add to dover-apply.mjs")
    print("  3. Use results for cover letter generation")
    print("  4. Build Claude skill for interview prep")


if __name__ == '__main__':
    main()
