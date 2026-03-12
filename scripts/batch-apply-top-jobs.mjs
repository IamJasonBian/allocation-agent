#!/usr/bin/env node

/**
 * Batch Apply to Top Priority Jobs
 *
 * Uses research and tailored cover letters for:
 * 1. Galaxy Digital - Infrastructure Engineer (AI Platforms)
 * 2. Anthropic - Data Engineer II
 * 3. Finch Legal - ML/Backend Engineer
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const RESUME_PDF_PATH = process.env.RESUME_PATH || resolve(process.cwd(), "blob/resume_tmp.pdf");

// Candidate data
const candidate = {
  firstName: "Jason",
  lastName: "Bian",
  email: "jason.bian64@gmail.com",
  phone: "+1-734-730-6569",
  linkedin: "https://www.linkedin.com/in/jason-bian-7b9027a5/",
  github: "https://github.com/IamJasonBian",
  location: "New York, NY",
  currentCompany: "Amazon",
  currentTitle: "Data Engineer II",
  yearsExperience: "5+",
  authorizedToWork: true,
  requiresSponsorship: false,
};

// Top priority jobs with tailored content
const topJobs = [
  {
    company: "Galaxy Digital",
    title: "Infrastructure Engineer (AI Platforms)",
    url: "https://job-boards.greenhouse.io/galaxydigitalservices/jobs/5812855004",
    platform: "greenhouse",
    salary: "$220,000 - $250,000 USD",
    priority: 1,
    coverLetter: `Dear Galaxy Digital Hiring Team,

I'm drawn to your Infrastructure Engineer (AI Platforms) role because it sits exactly where I've built my career: at the intersection of ML and infrastructure engineering.

At Amazon, I architected the ML platform infrastructure that supported RL-driven inventory purchasing for 5% of US retail. This required:
- Deploying containerized models on EKS (Kubernetes) with Python inference pipelines
- Building MLOps workflows for 1,102+ weekly model runs
- Establishing DevOps best practices across data, ML, and application layers

Your requirements for "Kubernetes-based platforms for scalable AI workloads" and "MLOps pipeline operations" directly match this experience.

What excites me about Galaxy is the intersection of Web3 and AI infrastructure—building platforms that must be both cutting-edge and enterprise-reliable for finance. The crypto space has unique latency, security, and compliance requirements that make AI infrastructure more challenging than typical SaaS platforms.

I'd love to discuss how my background in production ML systems (Python/Go/Java), Kubernetes orchestration, and DevOps automation can accelerate Galaxy's AI platform development.

Best regards,
Jason Bian`,
    whyInterested: `I'm excited about Galaxy's position at the intersection of Web3 and AI infrastructure. My experience building production ML platforms at Amazon—specifically architecting RL agent infrastructure on Kubernetes—directly aligns with your need for scalable, enterprise-grade AI systems. The challenge of combining cutting-edge AI with finance-grade reliability is exactly the type of problem I thrive on.`,
    customAnswers: {
      "Why are you interested in Galaxy Digital?": `I'm excited about Galaxy's position at the intersection of Web3 and AI infrastructure. My experience building production ML platforms at Amazon—specifically architecting RL agent infrastructure on Kubernetes—directly aligns with your need for scalable, enterprise-grade AI systems.`,
      "How did you hear about this role?": "LinkedIn",
      "Are you legally authorized to work in the location of this job?": "Yes",
      "Will you require future sponsorship?": "No",
      "When is the earliest you would want to start working with us?": "2 weeks notice",
    }
  },
  {
    company: "Anthropic",
    title: "Data Engineer II",
    url: "https://job-boards.greenhouse.io/anthropic/jobs/4956672008",
    platform: "greenhouse",
    priority: 2,
    coverLetter: `Dear Anthropic Hiring Team,

I'm drawn to Anthropic because you're building AI differently—with safety and constitutional principles at the core.

At Amazon, I built production ML data pipelines processing billions of rows daily. My experience with:
- FastAPI + PostgreSQL + AWS (similar to your stack)
- ML pipeline orchestration and monitoring (1,102+ weekly model runs)
- Data model design for RL agents (supporting inventory purchasing at scale)

...positions me to support Anthropic's research infrastructure while maintaining the reliability needed for high-stakes AI development.

The data challenges at Anthropic are unique—training datasets for frontier models require extraordinary data quality, versioning, and reproducibility. My experience maintaining 99.9% uptime for production ML systems and optimizing Spark pipelines (6.4x speedup) demonstrates the rigor needed for this role.

I'd love to discuss how my background in data engineering and ML infrastructure can contribute to Anthropic's mission of building safe, beneficial AI.

Best regards,
Jason Bian`,
    whyInterested: `I'm drawn to Anthropic's mission of building AI systems with safety and constitutional principles at the core. As someone who has built production ML infrastructure at Amazon, I understand the critical importance of reliable data pipelines for training and deploying AI responsibly.`,
    customAnswers: {
      "Why Anthropic?": `I'm drawn to Anthropic's mission of building AI systems with safety and constitutional principles at the core. Your work on Claude and constitutional AI represents the thoughtful, research-driven approach to AI development that I want to be part of. My experience building production ML data pipelines at Amazon (processing billions of rows daily with 99.9% uptime) aligns with the rigor needed to support frontier AI research.`,
      "Which company do you work at currently?": "Amazon",
      "How did you hear about this role?": "LinkedIn",
      "Are you legally authorized to work in the location of this job?": "Yes",
      "Will you require future sponsorship?": "No",
      "Describe a complex data model you've built.": `At Amazon, I built the data model for RL-driven inventory purchasing that served 5% of US retail. The model required:

1. Multi-level aggregations: SKU, merchant, marketplace, zip-code hierarchies
2. Temporal features: 30/60/90-day trailing signals for demand forecasting
3. Graph relationships: Vendor-product networks for supply chain modeling
4. Real-time updates: DynamoDB feature stores syncing with batch Spark jobs

The complexity was balancing:
- Batch processing (PySpark on EMR for historical features)
- Real-time serving (Java API with DynamoDB lookups, <100ms p99 latency)
- Data versioning (S3 partitioned by date for reproducibility)

The model supported 1,102+ weekly production runs and enabled one-step reinforcement learning for inventory decisions.`,
      "Tell us more about your approach to testing, documentation, and the materialization strategy for the model mentioned above, and any challenges.": `Testing:
- Unit tests for feature transformations (PySpark DataFrames → expected outputs)
- Integration tests for end-to-end pipelines (S3 → Spark → DynamoDB → API)
- Backtesting: Ran historical simulations to validate RL agent decisions
- A/B testing: Gradual rollout (1% → 5% → 25% of inventory)

Documentation:
- Data dictionary: All features with business definitions, data types, update frequency
- Architecture diagrams: Data flow from source systems to model serving
- Runbooks: On-call procedures for pipeline failures, drift detection

Materialization Strategy:
- Batch: Nightly Spark jobs materialize aggregates to S3 (Parquet)
- Incremental: Only recompute changed partitions (date-based)
- Sync: Daily sync from S3 to DynamoDB for low-latency API serving
- Caching: Redis for hot features (<1 hour TTL)

Challenges:
- Cold start: New SKUs had no historical data → Used hierarchical priors (category-level features)
- Schema evolution: Adding new features required backward-compatible pipeline changes
- Latency: Batch recomputation took 48h initially → Optimized to 5h (6.4x speedup)`,
      "What is the address from which you plan on working? If you would need to relocate, please type \"relocating\".": "New York, NY (open to relocation for the right opportunity)",
    }
  },
  {
    company: "Finch Legal",
    title: "ML/Backend Engineer",
    url: "https://www.finchlegal.com/careers?ashby_jid=102f64ba-a1f2-4c0a-a575-a611798ec59f&utm_source=G0pQr4gQY6",
    platform: "ashby",
    priority: 3,
    coverLetter: `Dear Finch Legal Hiring Team,

Finch sits at a unique intersection: AI-native infrastructure built specifically for personal injury law. This resonates deeply with my experience at Amazon, where I built ML systems that automated operational workflows.

At Amazon, I architected RL-driven inventory purchasing that eliminated manual buying decisions for 5% of US retail—directly parallel to your mission of eliminating admin work for PI firms through AI workflow automation.

What excites me about Finch:

1. Modern Stack: FastAPI + React + AWS + LangChain (exactly what I'd choose for an AI platform)
2. Vertical Focus: Deep expertise in one domain (PI law) vs horizontal "AI for everything"
3. Series A Speed: High-impact engineering where every decision matters
4. Market Timing: The $200B personal injury industry is ripe for AI transformation

Your tech stack (Python, FastAPI, PostgreSQL, Redis, OpenAI/LangChain) matches my production experience perfectly. I've built similar systems at Amazon—Python microservices backed by PostgreSQL/Redis, orchestrating complex workflows at scale.

I see Finch becoming the operating system for PI firms—not just a document generator, but full workflow orchestration powered by LLMs. I'd love to discuss how my background in ML infrastructure and backend systems can accelerate this vision.

Best regards,
Jason Bian`,
    whyInterested: `Finch is building AI-native infrastructure from day one for personal injury law—eliminating the admin work that slows down PI firms. This vertical-focused approach resonates with my Amazon experience automating inventory workflows with RL. Your Series A stage means high-impact engineering where I can contribute from architecture to deployment.`,
    customAnswers: {
      "Why are you interested in this role?": `Finch is building AI-native infrastructure from day one for personal injury law—eliminating the admin work that slows down PI firms. This vertical-focused approach resonates with my Amazon experience automating inventory workflows with RL agents. Your modern tech stack (FastAPI, LangChain, PostgreSQL) and Series A stage mean high-impact engineering where I can contribute from architecture to deployment. The $200B PI industry is ripe for AI transformation, and Finch's full-stack platform approach (not just point solutions) is the right strategy.`,
    }
  }
];

console.log("="  .repeat(80));
console.log("BATCH APPLY TO TOP PRIORITY JOBS");
console.log("="  .repeat(80));
console.log();

console.log("Jobs to apply:");
topJobs.forEach((job, i) => {
  console.log(`  ${i + 1}. [Priority ${job.priority}] ${job.company} - ${job.title}`);
  console.log(`     Platform: ${job.platform}`);
  console.log(`     URL: ${job.url}`);
  if (job.salary) {
    console.log(`     Salary: ${job.salary}`);
  }
  console.log();
});

console.log("="  .repeat(80));
console.log("APPLICATION MATERIALS PREPARED");
console.log("="  .repeat(80));
console.log();

console.log("✅ Resume: " + RESUME_PDF_PATH);
console.log("✅ Tailored cover letters for each role");
console.log("✅ Custom answers for common questions");
console.log("✅ STAR examples matched to requirements");
console.log();

console.log("="  .repeat(80));
console.log("NEXT STEPS");
console.log("="  .repeat(80));
console.log();

console.log("AUTOMATIC SUBMISSION NOT IMPLEMENTED (requires browser automation)");
console.log();
console.log("To apply, please:");
console.log();

topJobs.forEach((job, i) => {
  console.log(`${i + 1}. ${job.company} - ${job.title}`);
  console.log(`   a. Open: ${job.url}`);
  console.log(`   b. Upload resume: ${RESUME_PDF_PATH}`);
  console.log(`   c. Personal info:`);
  console.log(`      - Name: ${candidate.firstName} ${candidate.lastName}`);
  console.log(`      - Email: ${candidate.email}`);
  console.log(`      - Phone: ${candidate.phone}`);
  console.log(`      - LinkedIn: ${candidate.linkedin}`);
  console.log(`      - GitHub: ${candidate.github}`);
  console.log(`      - Location: ${candidate.location}`);
  console.log(`   d. Copy-paste cover letter:`);
  console.log();
  console.log(job.coverLetter.split('\n').map(line => '      ' + line).join('\n'));
  console.log();
  console.log(`   e. Custom question answers:`);
  Object.entries(job.customAnswers).forEach(([q, a]) => {
    console.log(`      Q: ${q}`);
    console.log(`      A: ${a}`);
    console.log();
  });
  console.log("   " + "-".repeat(76));
  console.log();
});

console.log("="  .repeat(80));
console.log("INTERVIEW PREP MATERIALS");
console.log("="  .repeat(80));
console.log();

console.log("Review these files before interviews:");
console.log("  - APPLICATION_SUMMARY.md (job analysis + STAR matches)");
console.log("  - clair_financial_data_response.md (if asked about financial ML)");
console.log("  - temporal_multisource_solutions.md (deep technical dive)");
console.log();

console.log("Good luck! 🚀");
