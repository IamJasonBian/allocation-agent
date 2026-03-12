#!/usr/bin/env python3
"""
Quick analysis of Galaxy Digital Infrastructure Engineer role
"""

from star_matcher import STARMatcher, JobEntity

# Initialize matcher
matcher = STARMatcher()

# Create job entity for Galaxy Digital role
galaxy_job = JobEntity(
    job_id="galaxy_infra",
    company="Galaxy Digital",
    title="Infrastructure Engineer (AI Platforms)",
    description="""
We are building a large-scale, enterprise-grade AI platform that supports advanced
machine learning systems end-to-end—from model development and training to secure,
reliable, production deployment.

What you'll do:
- Architect and own the core infrastructure for AI and ML workloads
- Design and operate Kubernetes-based platforms for scalable AI workloads
- Build and evolve MLOps pipelines: model training, versioning, deployment, monitoring
- Establish best practices for DevOps and CI/CD across data, ML, and application layers
- Lead security and compliance for AI systems

What we're looking for:
- 10+ years of experience in infrastructure, platform, or systems engineering
- Deep, hands-on experience with Kubernetes in production
- Strong background in MLOps and ML platform operations
- Experience across DevOps, CI/CD, and cloud infrastructure (AWS, GCP, or Azure)
- Proficiency in Go, Python, Java, or similar
    """,
    languages=["Python", "Go", "Java"],
    frameworks=["Kubernetes", "Docker"],
    databases=[],
    cloud=["AWS", "GCP", "Azure"],
    tools=["CI/CD", "MLOps"],
    niche_tech=[],
    domain_keywords=["AI", "ML", "machine learning", "infrastructure", "MLOps", "DevOps"],
    role_keywords=["infrastructure", "platform", "backend", "systems"],
    company_type=["fintech", "crypto", "blockchain"]
)

# Match to STAR examples
print("="*100)
print("GALAXY DIGITAL - INFRASTRUCTURE ENGINEER (AI PLATFORMS)")
print("="*100)
print()

match_result = matcher.match(galaxy_job, top_n=5)

print(f"✅ Matched {len(match_result['matched_stars'])} STAR examples")
print()

print("TOP 5 RELEVANT STAR EXAMPLES:")
print("-"*100)

for i, star_match in enumerate(match_result['matched_stars'], 1):
    star = star_match['star']
    score = star_match['total_score']
    breakdown = star_match['score_breakdown']

    print(f"\n{i}. {star.title} (Score: {score}/100)")
    print(f"   Tech Match: {breakdown['tech_match']}/40 | "
          f"Domain Match: {breakdown['domain_match']}/30 | "
          f"Role Match: {breakdown['role_match']}/20 | "
          f"Company Match: {breakdown['company_match']}/10")
    print()
    print(f"   Situation: {star.situation}")
    print(f"   Task: {star.task}")
    print(f"   Action: {star.action[:200]}...")
    print(f"   Result: {star.result}")
    print()

print("\n" + "="*100)
print("WHY GALAXY DIGITAL?")
print("="*100)
print()
print(match_result['why_work_here'])
print()

print("="*100)
print("INTERVIEW TALKING POINTS")
print("="*100)
print()

print("1. MLOps Platform Experience at Amazon:")
print("   'At Amazon, I built the ML platform infrastructure that processed billions of rows")
print("   daily and supported 1,102+ weekly model runs. Your requirement for Kubernetes-based")
print("   platforms for AI workloads directly aligns with my experience deploying containerized")
print("   ML services at scale.'")
print()

print("2. Infrastructure + ML Intersection:")
print("   'This role is perfect because it sits at the intersection of infrastructure and ML—")
print("   exactly where I've spent my career. I've designed data pipelines for RL agents,")
print("   automated model deployments, and built monitoring systems for production ML. Galaxy's")
print("   focus on enterprise-grade AI platforms resonates with my experience.'")
print()

print("3. Why Crypto/Finance AI Platform:")
print("   'The crypto and finance space has unique latency, security, and compliance requirements")
print("   that make AI infrastructure more challenging. I'm excited about Galaxy's position at the")
print("   intersection of Web3 and AI—building platforms that need to be both cutting-edge and")
print("   enterprise-reliable.'")
print()

print("4. Technical Leadership:")
print("   'I see this role requires setting technical direction and mentoring engineers. At Amazon,")
print("   I led the design for our ML pipeline architecture and established best practices for")
print("   production ML systems. I've mentored junior engineers on Kubernetes deployments, Python")
print("   microservices, and DevOps workflows.'")
print()

print("="*100)
print("QUESTIONS TO ASK GALAXY:")
print("="*100)
print()

print("1. 'What's the current state of your ML platform? Are you building from scratch or evolving")
print("   existing infrastructure?'")
print("2. 'How do you balance research velocity vs production reliability for AI features?'")
print("3. 'What GPU infrastructure are you using (on-prem vs cloud)?'")
print("4. 'How do you handle model governance and auditability for regulated finance use cases?'")
print("5. 'What's your deployment cadence for ML models? Daily, weekly, on-demand?'")
print("6. 'How big is the ML/AI team I'd be supporting?'")
print("7. 'What's the most painful bottleneck in your current ML infrastructure?'")
print()
