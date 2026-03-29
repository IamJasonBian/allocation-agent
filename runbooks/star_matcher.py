"""
STAR Interview Matcher for Allocation Agent

Maps job descriptions to candidate's STAR examples based on:
- Tech stack alignment
- Domain/industry keywords
- Role type (SDE, DE, ML, PM, Data Science, etc.)
- Company stage (startup, fintech, large-scale systems)

Generates tailored "why I want to work here" statements.
"""

import re
from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass, field
from collections import defaultdict


@dataclass
class STARExample:
    """Structured STAR interview story."""
    title: str
    situation: str
    task: str
    action: str
    result: str
    tech_stack: List[str] = field(default_factory=list)
    domain_keywords: List[str] = field(default_factory=list)
    role_types: List[str] = field(default_factory=list)  # e.g., ["DE", "ML", "SDE"]
    company_types: List[str] = field(default_factory=list)  # e.g., ["Large Scale", "Startup"]


@dataclass
class JobEntity:
    """Extracted entities from a job description."""
    job_id: str
    company: str
    title: str
    url: str

    # Tech stack (from jd-parser.mjs)
    languages: List[str] = field(default_factory=list)
    frameworks: List[str] = field(default_factory=list)
    databases: List[str] = field(default_factory=list)
    cloud: List[str] = field(default_factory=list)
    tools: List[str] = field(default_factory=list)
    niche_tech: List[str] = field(default_factory=list)

    # Extracted keywords
    role_type: Optional[str] = None  # "SDE", "DE", "MLE", "DS", "PM", etc.
    company_stage: Optional[str] = None  # "Startup", "Large Scale", "Fintech", etc.
    domain_keywords: List[str] = field(default_factory=list)

    # Raw content for word indexing
    raw_description: str = ""


@dataclass
class MatchResult:
    """Result of matching a JD to STAR examples."""
    job_entity: JobEntity
    matched_stars: List[Tuple[STARExample, float]]  # (star, score)
    tech_overlap: List[str]
    domain_overlap: List[str]
    why_work_here: str


class STARLibrary:
    """Library of STAR examples from candidate's experience."""

    def __init__(self):
        self.stars: List[STARExample] = []
        self._build_library()

    def _build_library(self):
        """Build STAR library based on Jason's resume and breakdown."""

        # STAR 1: RL-based inventory purchasing
        self.stars.append(STARExample(
            title="RL Agent for Inventory Purchasing (5% US Retail)",
            situation="Amazon needed to optimize inventory purchasing decisions across US retail using reinforcement learning instead of traditional batch forecasting",
            task="Develop and deploy RL agent infrastructure to enable real-time buying actions for 5% of US retail inventory",
            action="Built inference pipelines for RL agents using Python/PySpark, containerized models on EKS with Java solvers, integrated with DynamoDB feature stores, created Java API vending services for audit/rollback",
            result="Successfully launched RL-driven buying actions on 5% of US retail, enabling one-step reinforcement learning for inventory and vendor modeling",
            tech_stack=["Python", "PySpark", "PyTorch", "Java", "EKS", "Kubernetes", "DynamoDB", "S3", "EMR", "Spark"],
            domain_keywords=["reinforcement learning", "RL", "inventory", "purchasing", "real-time", "agents", "optimization", "supply chain", "forecasting", "ML"],
            role_types=["MLE", "DE", "SDE"],
            company_types=["Large Scale", "ML-Operations", "Data Platform"]
        ))

        # STAR 2: Latency reduction for forecasting pipeline
        self.stars.append(STARExample(
            title="6.4x Pipeline Latency Reduction (~550 Signals)",
            situation="Four deep learning forecasting models had unacceptable end-to-end runtime due to slow ingestion of ~550 input signals",
            task="Reduce pipeline latency to enable faster forecasting turnaround for business decisions",
            action="Optimized data ingestion streams, parallelized signal processing in Spark, refactored Java/Scala batch jobs on EMR, improved S3 parquet vending layer",
            result="Shortened end-to-end pipeline runtime by 64% (6.4x speedup), reduced backtesting from 48 hours to 5 hours, scaled API calls from 150 to 630 daily",
            tech_stack=["Java", "Python", "Spark", "Scala", "EMR", "S3", "Parquet", "Redshift"],
            domain_keywords=["latency", "optimization", "pipeline", "streaming", "batch", "forecasting", "data engineering", "performance"],
            role_types=["DE", "SDE", "Data Platform"],
            company_types=["Large Scale", "Infra Teams"]
        ))

        # STAR 3: Sev-2 support for deep learning models
        self.stars.append(STARExample(
            title="Sev-2 Support for 6 DL Forecasting Models (1102+ Weekly Runs)",
            situation="Production deep learning models required real-time support across stream, batch, and concurrent executions",
            task="Provide Sev-2 support for 6 core forecasting models running 1102+ times weekly across all hierarchies",
            action="Built monitoring/alerting with CloudWatch, created runbooks for incident response, collaborated with 20+ partner teams on SLA requirements, implemented rollback mechanisms via Java APIs",
            result="Maintained 99.9% uptime for production ML models serving all of Amazon retail (zip, merchant, ASIN, marketplace hierarchies)",
            tech_stack=["CloudWatch", "SNS", "Lambda", "Java", "Python", "Airflow"],
            domain_keywords=["support", "on-call", "SLA", "production", "monitoring", "incident response", "deep learning", "forecasting", "ops"],
            role_types=["DE", "MLE", "ML-Operations"],
            company_types=["Large Scale", "ML-Operations", "Data Platform"]
        ))

        # STAR 4: Forecast vending API scaling
        self.stars.append(STARExample(
            title="Forecast API Scaling (150→630 Daily Calls, 48h→5h Audit)",
            situation="Forecast vending/extraction APIs couldn't keep up with demand from downstream teams",
            task="Scale API throughput and reduce audit turnaround time for forecasting models",
            action="Refactored Java and Python packages, optimized database queries (DynamoDB, Redshift), implemented caching strategies, parallelized extraction jobs on raw S3 layer",
            result="Scaled from 150 to 630 daily API calls (4.2x), reduced backtesting audits from 48 hours to 5 hours",
            tech_stack=["Java", "Python", "DynamoDB", "Redshift", "S3", "Parquet", "API"],
            domain_keywords=["API", "scaling", "throughput", "backend", "microservices", "forecasting", "vending", "audit"],
            role_types=["SDE", "DE", "Backend"],
            company_types=["Large Scale", "Infra Teams"]
        ))

        # STAR 5: Cross-team requirements definition
        self.stars.append(STARExample(
            title="Requirements Definition with 20+ Partner Teams",
            situation="Forecasting platform needed to align with diverse customer needs across science and engineering teams",
            task="Define requirements, support patterns, and long-term roadmap for 20+ partner teams",
            action="Led customer discovery sessions, documented API contracts, created onboarding guides, established communication channels, drove alignment meetings",
            result="Enabled seamless integration for 20+ teams, improved customer satisfaction, reduced time-to-onboard for new data science models",
            tech_stack=["Documentation", "API Design", "Communication"],
            domain_keywords=["PM", "requirements", "stakeholder management", "alignment", "customer acquisition", "communication", "product"],
            role_types=["PM", "TPM", "SDE", "DE"],
            company_types=["Large Scale", "ML-Operations", "Data Platform"]
        ))

        # STAR 6: Supply chain carbon optimization
        self.stars.append(STARExample(
            title="Green Shipping: 1.5% of US Emissions Optimization",
            situation="Amazon needed to reduce carbon footprint while maintaining delivery speed and cost efficiency",
            task="Support supply chain transfer decisions targeting ~1.5% of total US emissions via green shipping",
            action="Built A/B testing framework for emission-efficient routing, developed carbon data lake with Python/Scala, created optimization models balancing speed/cost/carbon tradeoffs",
            result="Achieved $4K above average $19/hour sustained quarterly abatement in 2023, supported 27→55 teams with carbon consulting",
            tech_stack=["Python", "Scala", "Spark", "S3", "Redshift", "A/B Testing", "Optimization"],
            domain_keywords=["supply chain", "optimization", "carbon", "sustainability", "A/B testing", "experimentation", "data science"],
            role_types=["DS", "DE", "Analyst"],
            company_types=["Large Scale", "Data Science", "Science"]
        ))

        # STAR 7: Python/Scala data ingestion at scale
        self.stars.append(STARExample(
            title="Carbon Data Lake Ingestion (15.3B Daily Rows)",
            situation="Needed to ingest carbon emissions data from external vendors and serve it to internal teams at Amazon scale",
            task="Design and build scalable data ingestion pipelines for package-level carbon tracking",
            action="Developed Python and Scala applications for ETL, implemented CI/CD with GitHub Actions, built integration tests, extended alpha/beta environments, managed dimensional tables",
            result="Increased fuel tracking availability 63%→77%, improved test coverage 33%→90%, supported 15.3 billion daily read/writes",
            tech_stack=["Python", "Scala", "Spark", "S3", "Parquet", "Redshift", "CI/CD", "GitHub Actions"],
            domain_keywords=["data engineering", "ETL", "ingestion", "pipeline", "dimensional modeling", "testing", "CI/CD", "ops"],
            role_types=["DE", "SDE", "Data Platform"],
            company_types=["Large Scale", "Data Platform", "Infra Teams"]
        ))

        # STAR 8: Linear programming solver for hiring
        self.stars.append(STARExample(
            title="Delivery Associate Hiring LP Solver (10% Error Reduction)",
            situation="Amazon logistics needed accurate weekly hiring targets for 500+ delivery stations",
            task="Maintain upstream load pipelines for weekly hiring target Linear Programming solves",
            action="Built parameter tuning systems for attrition models, implemented Python heuristics for scenario analysis, automated weekly solver execution",
            result="Reduced forecast error by 10% across all 500+ delivery stations, automated 450 hours of manual work per month, reduced publishing from weekly to hourly",
            tech_stack=["Python", "Linear Programming", "Optimization", "Redshift", "SQL"],
            domain_keywords=["optimization", "linear programming", "forecasting", "capacity planning", "automation", "operations research"],
            role_types=["DS", "Analyst", "DE"],
            company_types=["Large Scale", "Data Science", "Operations"]
        ))

        # STAR 9: Azure capacity management
        self.stars.append(STARExample(
            title="Azure Capacity Management ($5M Monthly Capex)",
            situation="Microsoft Azure needed better capacity planning to avoid service outages and overspending",
            task="Manage buying inputs into ~$5M monthly infrastructure capex",
            action="Developed end-to-end capacity management programs with sprint planning, built CVP-level analytics, scaled offer restriction planning from 30%→65% coverage",
            result="Improved capacity utilization, prevented service outages, enabled data-driven infrastructure decisions at CVP level",
            tech_stack=["Azure", "SQL", "Python", "Analytics"],
            domain_keywords=["PM", "capacity planning", "capex", "infrastructure", "operations", "analytics", "planning"],
            role_types=["PM", "TPM", "Analyst"],
            company_types=["Large Scale", "Operations", "Infra Teams"]
        ))

        # STAR 10: Consulting startup (Optimason)
        self.stars.append(STARExample(
            title="Consulting Startup: Azure Migrations ($4K YTD Revenue)",
            situation="Founded consulting shop for Azure cloud migrations and data estate development",
            task="Build and sell deployable Azure/Databricks templates to acquire customers",
            action="Developed reusable migration frameworks, created proof-of-concepts, performed customer discovery, built end-to-end solutions",
            result="Acquired $4K YTD revenue, saved clients 1800+ hours across projects, delivered custom local-to-cloud migration frameworks",
            tech_stack=["Azure", "Databricks", "CloudFormation", "Python", "Consulting"],
            domain_keywords=["startup", "founder", "consulting", "sales", "customer discovery", "0-to-1", "cloud migration"],
            role_types=["Founder", "Consultant", "DE"],
            company_types=["Startup", "Consulting"]
        ))

    def get_all_stars(self) -> List[STARExample]:
        """Get all STAR examples."""
        return self.stars

    def filter_by_role(self, role_type: str) -> List[STARExample]:
        """Filter STAR examples by role type."""
        return [s for s in self.stars if role_type in s.role_types]

    def filter_by_company_type(self, company_type: str) -> List[STARExample]:
        """Filter STAR examples by company type."""
        return [s for s in self.stars if company_type in s.company_types]


class JobEntityExtractor:
    """Extract entities from job descriptions."""

    ROLE_PATTERNS = {
        "SDE": r"\b(?:software\s+(?:development\s+)?engineer|SDE|backend\s+engineer|full[\s-]?stack\s+engineer)\b",
        "MLE": r"\b(?:machine\s+learning\s+engineer|ML\s+engineer|MLE|AI\s+engineer)\b",
        "DE": r"\b(?:data\s+engineer|DE|data\s+platform|data\s+infrastructure)\b",
        "DS": r"\b(?:data\s+scientist|DS|research\s+scientist|applied\s+scientist)\b",
        "PM": r"\b(?:product\s+manager|PM|program\s+manager|TPM|technical\s+program\s+manager)\b",
        "QRE": r"\b(?:quantitative\s+researcher|quant|QRE|quantitative\s+analyst)\b",
        "SRE": r"\b(?:site\s+reliability\s+engineer|SRE|DevOps\s+engineer)\b",
    }

    COMPANY_STAGE_PATTERNS = {
        "Startup": r"\b(?:startup|early[\s-]?stage|seed|series\s+[A-C]|0[\s-]?to[\s-]?1|fast[\s-]?paced)\b",
        "Fintech": r"\b(?:fintech|trading|finance|hedge\s+fund|quant|market\s+maker|financial\s+services|banking)\b",
        "Large Scale": r"\b(?:large[\s-]?scale|distributed\s+systems|billions?\s+of|petabyte|hyperscale|FAANG|MANGA)\b",
        "Science": r"\b(?:research|science|academic|experimentation|PhD|publication)\b",
        "ML-Operations": r"\b(?:ML[\s-]?ops|MLOps|model\s+(?:deployment|serving|inference)|feature\s+store)\b",
    }

    DOMAIN_KEYWORDS = [
        "forecasting", "supply chain", "inventory", "capacity planning", "optimization",
        "reinforcement learning", "RL", "deep learning", "machine learning", "ML", "AI",
        "real-time", "streaming", "batch", "pipeline", "ETL", "data lake",
        "low-latency", "high-throughput", "distributed systems", "microservices",
        "API", "backend", "infrastructure", "platform", "agents",
        "experimentation", "A/B testing", "metrics", "analytics",
        "carbon", "sustainability", "emissions", "green tech",
    ]

    def extract(self, job_data: Dict, jd_stack: Dict) -> JobEntity:
        """
        Extract entities from job description.

        Args:
            job_data: {job_id, company, title, url, description}
            jd_stack: Output from jd-parser.mjs {languages, frameworks, databases, cloud, tools, niche}

        Returns:
            JobEntity with extracted information
        """
        description = job_data.get('description', '')

        entity = JobEntity(
            job_id=job_data['job_id'],
            company=job_data['company'],
            title=job_data['title'],
            url=job_data['url'],
            languages=jd_stack.get('languages', []),
            frameworks=jd_stack.get('frameworks', []),
            databases=jd_stack.get('databases', []),
            cloud=jd_stack.get('cloud', []),
            tools=jd_stack.get('tools', []),
            niche_tech=jd_stack.get('niche', []),
            raw_description=description
        )

        # Extract role type
        for role, pattern in self.ROLE_PATTERNS.items():
            if re.search(pattern, description, re.IGNORECASE):
                entity.role_type = role
                break

        # Extract company stage
        for stage, pattern in self.COMPANY_STAGE_PATTERNS.items():
            if re.search(pattern, description, re.IGNORECASE):
                entity.company_stage = stage
                break

        # Extract domain keywords
        desc_lower = description.lower()
        for keyword in self.DOMAIN_KEYWORDS:
            if keyword.lower() in desc_lower:
                entity.domain_keywords.append(keyword)

        return entity


class STARMatcher:
    """Match job descriptions to STAR examples."""

    def __init__(self):
        self.star_library = STARLibrary()
        self.extractor = JobEntityExtractor()

    def match(self, job_entity: JobEntity, top_n: int = 3) -> MatchResult:
        """
        Match a job to top N STAR examples.

        Scoring:
        - Tech stack overlap: 0-40 points
        - Domain keyword overlap: 0-30 points
        - Role type match: 0-20 points
        - Company type match: 0-10 points
        """
        scored_stars = []

        # Flatten JD tech stack
        jd_tech = set([
            t.lower() for t in
            job_entity.languages + job_entity.frameworks +
            job_entity.databases + job_entity.cloud +
            job_entity.tools + job_entity.niche_tech
        ])

        jd_domains = set([k.lower() for k in job_entity.domain_keywords])

        for star in self.star_library.get_all_stars():
            score = 0.0

            # Tech stack overlap (0-40 points)
            star_tech = set([t.lower() for t in star.tech_stack])
            tech_overlap = jd_tech.intersection(star_tech)
            if jd_tech:
                tech_score = (len(tech_overlap) / len(jd_tech)) * 40
                score += min(tech_score, 40)

            # Domain keyword overlap (0-30 points)
            star_domains = set([k.lower() for k in star.domain_keywords])
            domain_overlap = jd_domains.intersection(star_domains)
            if jd_domains:
                domain_score = (len(domain_overlap) / len(jd_domains)) * 30
                score += min(domain_score, 30)

            # Role type match (0-20 points)
            if job_entity.role_type and job_entity.role_type in star.role_types:
                score += 20

            # Company type match (0-10 points)
            if job_entity.company_stage and job_entity.company_stage in star.company_types:
                score += 10

            scored_stars.append((star, score))

        # Sort by score and take top N
        scored_stars.sort(key=lambda x: x[1], reverse=True)
        top_stars = scored_stars[:top_n]

        # Calculate overall tech and domain overlap
        all_tech_overlap = set()
        all_domain_overlap = set()
        for star, _ in top_stars:
            star_tech = set([t.lower() for t in star.tech_stack])
            all_tech_overlap.update(jd_tech.intersection(star_tech))

            star_domains = set([k.lower() for k in star.domain_keywords])
            all_domain_overlap.update(jd_domains.intersection(star_domains))

        # Generate "why I want to work here" statement
        why_statement = self._generate_why_statement(job_entity, top_stars)

        return MatchResult(
            job_entity=job_entity,
            matched_stars=top_stars,
            tech_overlap=sorted(list(all_tech_overlap)),
            domain_overlap=sorted(list(all_domain_overlap)),
            why_work_here=why_statement
        )

    def _generate_why_statement(self, job_entity: JobEntity,
                                top_stars: List[Tuple[STARExample, float]]) -> str:
        """Generate tailored 'why I want to work here' statement."""

        company = job_entity.company
        role = job_entity.title

        # Tech highlights
        tech_highlights = []
        if job_entity.languages:
            tech_highlights.append(f"{', '.join(job_entity.languages[:3])}")
        if job_entity.frameworks:
            tech_highlights.append(f"{', '.join(job_entity.frameworks[:3])}")
        if job_entity.niche_tech:
            tech_highlights.append(f"{', '.join(job_entity.niche_tech[:2])}")

        tech_str = ", ".join(tech_highlights) if tech_highlights else "modern technologies"

        # Experience highlights from top STAR
        if top_stars:
            top_star, score = top_stars[0]
            relevant_exp = top_star.title
        else:
            relevant_exp = "data engineering and ML infrastructure"

        # Company-specific angle
        if job_entity.company_stage == "Fintech":
            angle = "low-latency systems and real-time decision-making in financial markets"
        elif job_entity.company_stage == "Startup":
            angle = "fast-paced environment and opportunity to drive 0-to-1 product development"
        elif job_entity.company_stage == "Large Scale":
            angle = "distributed systems at scale and complex infrastructure challenges"
        elif job_entity.company_stage == "Science":
            angle = "cutting-edge research and bringing ML models to production"
        else:
            angle = "technical excellence and impactful engineering"

        # Role-specific motivation
        if job_entity.role_type in ["MLE", "ML-Operations"]:
            motivation = f"I'm excited about {company}'s focus on {angle}. My experience with {relevant_exp} directly aligns with building production ML systems using {tech_str}."
        elif job_entity.role_type == "DE":
            motivation = f"I'm drawn to {company}'s {angle}. Having built data pipelines processing billions of events using {tech_str}, I'm eager to tackle similar challenges with {relevant_exp}."
        elif job_entity.role_type == "SDE":
            motivation = f"{company}'s commitment to {angle} resonates with my experience in {relevant_exp}. I'm excited to leverage my expertise in {tech_str} to drive engineering excellence."
        elif job_entity.role_type == "DS":
            motivation = f"I'm passionate about {company}'s approach to {angle}. My background in {relevant_exp} and quantitative modeling aligns well with driving data-driven decisions."
        else:
            motivation = f"I'm excited about {company}'s work in {angle} and see strong alignment with my experience in {relevant_exp} using {tech_str}."

        return motivation


# Example usage
if __name__ == '__main__':
    print("=== STAR Interview Matcher ===\n")

    # Initialize matcher
    matcher = STARMatcher()

    # Example JD 1: MLE at fintech
    job1 = {
        'job_id': '123',
        'company': 'Jane Street',
        'title': 'Machine Learning Engineer',
        'url': 'https://jobs.lever.co/janestreet/ml-engineer',
        'description': '''
        Jane Street is looking for a Machine Learning Engineer to build production ML systems
        for trading. You'll work on real-time model inference, feature engineering, and
        low-latency systems using Python, OCaml, and our proprietary stack.

        Requirements:
        - Experience with Python, PyTorch, and production ML
        - Understanding of low-latency systems
        - Background in distributed systems and APIs
        '''
    }

    jd1_stack = {
        'languages': ['Python', 'OCaml'],
        'frameworks': ['PyTorch'],
        'databases': [],
        'cloud': [],
        'tools': ['Docker', 'Kubernetes'],
        'niche': ['Low-Latency Systems', 'FIX Protocol']
    }

    entity1 = matcher.extractor.extract(job1, jd1_stack)
    result1 = matcher.match(entity1, top_n=3)

    print(f"Job: {entity1.title} at {entity1.company}")
    print(f"Role Type: {entity1.role_type}")
    print(f"Company Stage: {entity1.company_stage}")
    print(f"Tech Stack: {', '.join(entity1.languages + entity1.frameworks + entity1.niche_tech)}")
    print(f"\nTop 3 Matched STAR Examples:")
    for i, (star, score) in enumerate(result1.matched_stars, 1):
        print(f"  {i}. [{score:.1f} pts] {star.title}")
    print(f"\nTech Overlap: {', '.join(result1.tech_overlap)}")
    print(f"Domain Overlap: {', '.join(result1.domain_overlap)}")
    print(f"\n'Why I Want to Work Here':\n{result1.why_work_here}")

    print("\n" + "="*70 + "\n")

    # Example JD 2: DE at startup
    job2 = {
        'job_id': '456',
        'company': 'TechStartup',
        'title': 'Data Engineer',
        'url': 'https://app.dover.com/apply/techstartup/de-role',
        'description': '''
        Early-stage startup building AI-powered forecasting tools. Looking for a Data Engineer
        to build scalable data pipelines, ETL systems, and data infrastructure.

        Tech stack: Python, Spark, Airflow, AWS (S3, Redshift, EMR), Kubernetes

        You'll work on:
        - Building real-time streaming pipelines
        - Optimizing batch processing jobs
        - Supporting ML model training and inference
        '''
    }

    jd2_stack = {
        'languages': ['Python'],
        'frameworks': ['Spark', 'Airflow'],
        'databases': ['Redshift'],
        'cloud': ['AWS', 'S3', 'EMR'],
        'tools': ['Kubernetes', 'Docker'],
        'niche': []
    }

    entity2 = matcher.extractor.extract(job2, jd2_stack)
    result2 = matcher.match(entity2, top_n=3)

    print(f"Job: {entity2.title} at {entity2.company}")
    print(f"Role Type: {entity2.role_type}")
    print(f"Company Stage: {entity2.company_stage}")
    print(f"Tech Stack: {', '.join(entity2.languages + entity2.frameworks + entity2.databases + entity2.cloud)}")
    print(f"\nTop 3 Matched STAR Examples:")
    for i, (star, score) in enumerate(result2.matched_stars, 1):
        print(f"  {i}. [{score:.1f} pts] {star.title}")
    print(f"\nTech Overlap: {', '.join(result2.tech_overlap)}")
    print(f"Domain Overlap: {', '.join(result2.domain_overlap)}")
    print(f"\n'Why I Want to Work Here':\n{result2.why_work_here}")
