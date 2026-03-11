"""
Process Dandy ML Platform Engineer job through JD-to-STAR system
"""

from jd_star_integration import JDStarSystem

# Initialize system
system = JDStarSystem()

# Set candidate data (Jason's resume)
resume_text = """JASON BIAN
Data Engineer II at Amazon (2021-Present)
- Built RL agents for inventory purchasing (5% US retail)
- Reduced pipeline latency by 6.4x across 4 DL forecasting models
- Maintained Sev-2 support for production ML systems (1102+ weekly runs)
- Scaled forecast APIs from 150 to 630 daily calls
- Designed carbon data lake processing 15.3B daily rows"""

skills = [
    "python", "java", "sql", "spark", "scala", "pytorch",
    "airflow", "redshift", "kubernetes", "aws", "machine learning",
    "deep learning", "forecasting", "data pipeline", "etl"
]

system.set_candidate_data(resume_text, skills)

# Job data from Dandy posting
job_data = {
    'job_id': 'dandy-ml-platform-nyc',
    'company': 'Dandy',
    'title': 'Senior Software Engineer I - ML Platform (NYC)',
    'url': 'https://jobs.ashbyhq.com/dandy/45353d14-4103-4542-891f-d7443c42aabb',
    'description': '''
Dandy is transforming the massive and antiquated dental industry—an industry worth over $200B.
Backed by some of the world's leading venture capital firms, we're on an ambitious mission to
simplify and modernize every function of the dental practice through technology.

About the Role

In the past 3 years, Dandy has built the leading digital-first custom dental appliance manufacturer.
As we move to the next level of scale, we are looking for a Senior Software Engineer to build the
foundation of our ML Platform. You will be the bridge between SoTA Computer Vision research and
production-grade reliability. You will design and scale the infrastructure that handles massive 3D
datasets, orchestrates complex training pipelines, and ensures our generative models are deployed
with high reliability.

WHAT YOU'LL DO

- Collaborate with Machine Learning Engineers to build the ML training pipelines that process
  massive 3D datasets, orchestrate model training, and enable continuous model improvements.

- Streamline the ML lifecycle, from data labeling and experimentation to deployment, by optimizing
  internal ML components and reducing technical debt.

- Develop and maintain cloud-native systems and tooling (GCP/Kubernetes) that support Dandy's 3D
  dental products in a secure, well-tested, and high-performing manner.

- Write clean, maintainable code and tests that set the standard for our internal best practices.

- Partner with stakeholders across the Engineering organization to influence long-term architectural
  goals and maintain a high-quality bar.

WHAT WE'RE LOOKING FOR

- 5+ years of experience as a Machine Learning Engineer or Software Engineer, ideally within a
  high-growth startup environment.

- Deep proficiency in building and operating ML platform components, including feature stores, model
  registries, distributed training infrastructure, and experiment tracking.

- Experience designing and running ML systems on cloud infrastructure, including containerization
  and orchestration technologies such as Docker and Kubernetes, and public cloud platforms
  (AWS or GCP or Azure).

- Expertise in large-scale data processing, with proven experience building reliable ML data
  pipelines to support complex model training and evaluation.

- Experience creating and maintaining automated build, test, and deployment workflows across
  multiple environments (e.g., Buildkite, CI/CD pipelines).

- Strong background in observability, including implementing metrics, logging, and tracing for
  complex, distributed production systems.

- Ability to communicate clearly and concisely about complex architectural problems and propose
  iterative, pragmatic solutions.

- Experience with Python-based ML frameworks (e.g., PyTorch, TensorFlow); experience with 3D
  geometric computer vision is a plus

Salary: $181,000 - $213,000
Location: NYC (Remote/Hybrid)
'''
}

# Tech stack parsed from JD
jd_stack = {
    'languages': ['Python'],
    'frameworks': ['PyTorch', 'TensorFlow', 'Kubernetes'],
    'databases': [],
    'cloud': ['GCP', 'AWS', 'Azure'],
    'tools': ['Docker', 'Kubernetes', 'Buildkite'],
    'niche': ['Computer Vision', 'Feature Stores', 'Model Registry', 'Experiment Tracking', '3D']
}

print("="*80)
print("PROCESSING DANDY ML PLATFORM ENGINEER JOB")
print("="*80 + "\n")

# Process the job
result = system.process_job_description(job_data, jd_stack, lookup_company=True)

print("\n" + "="*80)
print("RESULTS")
print("="*80 + "\n")

print(f"Job: {result.title}")
print(f"Company: {result.company}")
print(f"Salary: $181,000 - $213,000")
print(f"Location: NYC (Remote/Hybrid)")
print(f"\nRole Type: {result.job_entity['role_type']}")
print(f"Company Stage: {result.job_entity['company_stage']}")

print(f"\n{'='*80}")
print("TECH STACK ANALYSIS")
print("="*80)

print(f"\nFrom JD:")
print(f"  Languages: {', '.join(result.job_entity['languages'])}")
print(f"  Frameworks: {', '.join(result.job_entity['frameworks'])}")
print(f"  Cloud: {', '.join(result.job_entity['cloud'])}")
print(f"  Tools: {', '.join(result.job_entity['tools'])}")
print(f"  Niche/ML Platform: {', '.join(result.job_entity['niche_tech'])}")

print(f"\nYour Tech Overlap: {', '.join(result.tech_overlap)}")
print(f"Domain Overlap: {', '.join(result.domain_overlap)}")

print(f"\n{'='*80}")
print("TOP 3 MATCHED STAR EXAMPLES")
print("="*80 + "\n")

for i, star in enumerate(result.top_star_examples, 1):
    print(f"{i}. [{star['score']:.1f} points] {star['title']}")

print(f"\n{'='*80}")
print("WHY I WANT TO WORK AT DANDY")
print("="*80 + "\n")

print(result.why_work_here)

print(f"\n{'='*80}")
print("DETAILED STAR ALIGNMENT")
print("="*80 + "\n")

# Get the full STAR details for top match
top_star_title = result.top_star_examples[0]['title']
for star in system.star_matcher.star_library.get_all_stars():
    if star.title == top_star_title:
        print(f"Most Relevant STAR: {star.title}\n")
        print(f"SITUATION: {star.situation}\n")
        print(f"TASK: {star.task}\n")
        print(f"ACTION: {star.action}\n")
        print(f"RESULT: {star.result}\n")
        print(f"Tech Alignment: {', '.join(set(star.tech_stack) & set(result.job_entity['languages'] + result.job_entity['frameworks'] + result.job_entity['cloud'] + result.job_entity['tools']))}")
        break

print(f"\n{'='*80}")
print("COVER LETTER SNIPPET")
print("="*80 + "\n")

cover_letter = f"""Dear Dandy Hiring Manager,

{result.why_work_here}

At Amazon, I {top_star_title.lower()}, which directly aligns with Dandy's need to build
production-grade ML infrastructure at scale. My hands-on experience with {', '.join(result.tech_overlap[:5])}
positions me to immediately contribute to:

• Building ML training pipelines that process massive datasets (I've handled 15.3B daily rows)
• Orchestrating model training and deployment (I've supported 1102+ weekly model runs)
• Ensuring high reliability and observability (Sev-2 support for production DL systems)
• Streamlining the ML lifecycle from experimentation to deployment

The opportunity to bridge cutting-edge Computer Vision research with production systems in
the dental industry is compelling. I'm excited to bring my ML platform expertise to help
Dandy scale its 3D generative models.

Looking forward to discussing how my experience can help Dandy transform the dental industry.

Best regards,
Jason Bian
"""

print(cover_letter)

print(f"\n{'='*80}")
print("KEY TALKING POINTS FOR INTERVIEW")
print("="*80 + "\n")

print("1. ML PLATFORM INFRASTRUCTURE")
print("   - Built RL agent inference pipelines (EKS, Kubernetes, DynamoDB)")
print("   - Orchestrated training for 4 DL forecasting models")
print("   - Experience with feature stores and model vending APIs\n")

print("2. LARGE-SCALE DATA PROCESSING")
print("   - Processed 15.3B daily rows in carbon data lake")
print("   - Reduced pipeline latency by 6.4x (~550 signals)")
print("   - Built reliable ETL with Python, Scala, Spark, Parquet\n")

print("3. PRODUCTION ML OPERATIONS")
print("   - Sev-2 support for 1102+ weekly model runs")
print("   - CloudWatch monitoring, alerting, rollback mechanisms")
print("   - Cross-team collaboration (20+ partner teams)\n")

print("4. CLOUD-NATIVE SYSTEMS")
print("   - AWS: EMR, EKS, S3, Lambda, SageMaker, Glue")
print("   - Containerization: Docker, Kubernetes")
print("   - CI/CD: GitHub Actions, automated testing\n")

print("5. STARTUP ALIGNMENT")
print("   - Founded Optimason (Azure/Databricks consulting)")
print("   - Experience in fast-paced, high-growth environments")
print("   - 0-to-1 building and rapid iteration\n")

print(f"{'='*80}")
print("QUESTIONS TO ASK DANDY")
print("="*80 + "\n")

print("1. What's your current ML platform stack? (Feature store, experiment tracking, model registry)")
print("2. How do you handle 3D dataset versioning and storage?")
print("3. What's the scale of your training pipelines? (# models, training frequency, data volume)")
print("4. How do you balance research velocity with production reliability?")
print("5. What's the team structure? (MLE vs ML Platform Engineer split)")
print("6. What Computer Vision models are you currently running? (Detection, segmentation, generative)")
print("7. How do you approach model monitoring and observability for CV models?")
print("8. What's the biggest technical challenge in scaling your ML platform right now?")

print(f"\n{'='*80}")
print("ENTITY STORED - READY FOR CLAUDE SKILL")
print("="*80)

context = system.entity_store.get_claude_skill_context(result.job_id)
print(context)
