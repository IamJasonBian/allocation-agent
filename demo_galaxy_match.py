#!/usr/bin/env python3
"""Demo: Match Galaxy Digital job to STAR examples"""

from star_matcher import STARMatcher, JobEntity

# Create job entity for Galaxy Digital
galaxy_job = JobEntity(
    job_id="5812855004",
    company="Galaxy Digital",
    title="Infrastructure Engineer (AI Platforms)",
    url="https://job-boards.greenhouse.io/galaxydigitalservices/jobs/5812855004",
    languages=["Python", "Go", "Java"],
    frameworks=["Kubernetes"],
    databases=[],
    cloud=["AWS", "GCP", "Azure"],
    tools=["Docker", "CI/CD"],
    niche_tech=[],
    domain_keywords=["AI", "ML", "MLOps", "infrastructure", "DevOps", "platform"],
    raw_description="Infrastructure Engineer AI platforms MLOps Kubernetes"
)

# Initialize matcher and run
matcher = STARMatcher()
result = matcher.match(galaxy_job, top_n=5)

# Display results
print("="*100)
print("GALAXY DIGITAL - INFRASTRUCTURE ENGINEER (AI PLATFORMS)")
print("="*100)
print()

print(f"✅ Matched {len(result.matched_stars)} STAR examples\n")

print("TOP 5 MATCHES:")
print("-"*100)

for i, (star, score) in enumerate(result.matched_stars, 1):
    print(f"\n{i}. {star.title}")
    print(f"   Score: {score}/100")
    print(f"   Situation: {star.situation}")
    print(f"   Result: {star.result}")

print("\n" + "="*100)
print("WHY GALAXY DIGITAL?")
print("="*100)
print(result.why_work_here)
print()
