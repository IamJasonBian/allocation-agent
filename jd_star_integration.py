"""
Complete JD-to-STAR Integration System

Combines:
1. Webpage indexer (stores visited JDs)
2. Company stack lookup (enriches with public data)
3. STAR matcher (maps to relevant experience)
4. Entity storage (efficient representation for Claude skill)

Usage:
    from jd_star_integration import JDStarSystem

    system = JDStarSystem()
    result = system.process_job_description(jd_data)
    print(result.why_work_here)
"""

import json
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

from webpage_indexer import WebpageStorage
from company_stack_lookup import CompanyStackDatabase, PublicStackLookup, CompanyStackInfo
from star_matcher import STARMatcher, JobEntity, MatchResult


@dataclass
class ProcessedJob:
    """Complete processed job with all enrichments."""
    # Core job data
    job_id: str
    company: str
    title: str
    url: str

    # Extracted entities
    job_entity: Dict  # JobEntity as dict
    company_stack: Dict  # CompanyStackInfo as dict

    # Matching results
    top_star_examples: List[Dict]  # List of (STAR title, score)
    tech_overlap: List[str]
    domain_overlap: List[str]
    why_work_here: str

    # Metadata
    processed_at: str
    indexed_words: int

    def to_dict(self):
        return asdict(self)


class EntityStore:
    """
    Efficient entity storage for Claude skill integration.

    Stores:
    - Candidate attributes (resume, STAR examples, skills)
    - Job entities (company, role, tech stack, keywords)
    - Matched entities (overlap, relevance scores)
    """

    def __init__(self, storage_file: str = "entity_store.json"):
        self.storage_file = storage_file
        self.candidate = {}
        self.jobs = {}  # job_id -> ProcessedJob
        self._load()

    def _load(self):
        """Load from JSON."""
        try:
            with open(self.storage_file, 'r') as f:
                data = json.load(f)
                self.candidate = data.get('candidate', {})
                self.jobs = data.get('jobs', {})
            print(f"Loaded entity store: {len(self.jobs)} jobs")
        except FileNotFoundError:
            print("No existing entity store, starting fresh")

    def save(self):
        """Save to JSON."""
        data = {
            'candidate': self.candidate,
            'jobs': self.jobs,
            'last_updated': datetime.now().isoformat()
        }
        with open(self.storage_file, 'w') as f:
            json.dump(data, f, indent=2)

    def set_candidate(self, resume_text: str, skills: List[str], star_examples: List[Dict]):
        """Set candidate information."""
        self.candidate = {
            'resume_text': resume_text,
            'skills': skills,
            'star_examples': star_examples,
            'updated_at': datetime.now().isoformat()
        }
        self.save()

    def add_job(self, processed_job: ProcessedJob):
        """Add processed job."""
        self.jobs[processed_job.job_id] = processed_job.to_dict()
        self.save()

    def get_job(self, job_id: str) -> Optional[Dict]:
        """Get processed job."""
        return self.jobs.get(job_id)

    def search_jobs(self, tech_keyword: Optional[str] = None,
                   company_keyword: Optional[str] = None) -> List[Dict]:
        """Search processed jobs."""
        results = []
        for job_id, job_data in self.jobs.items():
            match = True
            if tech_keyword:
                tech_list = job_data.get('tech_overlap', [])
                if not any(tech_keyword.lower() in t.lower() for t in tech_list):
                    match = False
            if company_keyword:
                company = job_data.get('company', '')
                if company_keyword.lower() not in company.lower():
                    match = False
            if match:
                results.append(job_data)
        return results

    def get_claude_skill_context(self, job_id: str) -> str:
        """
        Generate efficient context for Claude skill.

        Returns compact representation focusing on:
        - Matched STAR examples
        - Tech/domain overlap
        - Key entities
        """
        job = self.get_job(job_id)
        if not job:
            return ""

        context_parts = []

        # Job info
        context_parts.append(f"JOB: {job['title']} at {job['company']}")
        context_parts.append(f"URL: {job['url']}")

        # Tech overlap
        if job['tech_overlap']:
            context_parts.append(f"TECH OVERLAP: {', '.join(job['tech_overlap'][:10])}")

        # Domain overlap
        if job['domain_overlap']:
            context_parts.append(f"DOMAIN OVERLAP: {', '.join(job['domain_overlap'][:10])}")

        # Top STAR matches
        context_parts.append("\nTOP MATCHED EXPERIENCES:")
        for star in job['top_star_examples'][:3]:
            context_parts.append(f"  - [{star['score']:.1f}] {star['title']}")

        # Why work here
        context_parts.append(f"\nWHY WORK HERE:\n{job['why_work_here']}")

        return "\n".join(context_parts)


class JDStarSystem:
    """
    Complete JD-to-STAR processing system.

    Workflow:
    1. Index JD in webpage storage (for word search)
    2. Extract entities from JD (tech stack, role, domain)
    3. Lookup company stack from public sources
    4. Match to STAR examples
    5. Generate "why work here" statement
    6. Store all entities for Claude skill
    """

    def __init__(self):
        self.webpage_indexer = WebpageStorage()
        self.company_db = CompanyStackDatabase()
        self.company_lookup = PublicStackLookup(self.company_db)
        self.star_matcher = STARMatcher()
        self.entity_store = EntityStore()

    def set_candidate_data(self, resume_text: str, skills: List[str]):
        """Set candidate resume and skills."""
        # Convert STAR examples to dict format
        star_examples = []
        for star in self.star_matcher.star_library.get_all_stars():
            star_examples.append({
                'title': star.title,
                'situation': star.situation,
                'task': star.task,
                'action': star.action,
                'result': star.result,
                'tech_stack': star.tech_stack,
                'domain_keywords': star.domain_keywords,
                'role_types': star.role_types,
                'company_types': star.company_types
            })

        self.entity_store.set_candidate(resume_text, skills, star_examples)

    def process_job_description(self, job_data: Dict, jd_tech_stack: Dict,
                                lookup_company: bool = True) -> ProcessedJob:
        """
        Process a job description through the complete pipeline.

        Args:
            job_data: {job_id, company, title, url, description}
            jd_tech_stack: Parsed tech stack from jd-parser.mjs
            lookup_company: Whether to do public company stack lookup

        Returns:
            ProcessedJob with all enrichments
        """
        job_id = job_data['job_id']
        company = job_data['company']
        title = job_data['title']
        url = job_data['url']
        description = job_data['description']

        # Step 1: Index in webpage storage
        print(f"[1/5] Indexing webpage for {company}...")
        self.webpage_indexer.add_page(
            url=url,
            title=title,
            content=description,
            page_type="job_posting",
            metadata={
                'company': company,
                'job_id': job_id,
                'tech_stack': jd_tech_stack
            }
        )

        # Step 2: Extract job entities
        print(f"[2/5] Extracting entities...")
        job_entity = self.star_matcher.extractor.extract(job_data, jd_tech_stack)

        # Step 3: Lookup company stack (optional)
        company_stack = None
        if lookup_company:
            print(f"[3/5] Looking up {company} tech stack from public sources...")
            company_stack = self.company_lookup.lookup_all_sources(company)

            # Enrich job entity with company-wide stack
            if company_stack:
                job_entity.languages = list(set(job_entity.languages + list(company_stack.languages)))
                job_entity.frameworks = list(set(job_entity.frameworks + list(company_stack.frameworks)))
                job_entity.databases = list(set(job_entity.databases + list(company_stack.databases)))
                job_entity.cloud = list(set(job_entity.cloud + list(company_stack.cloud)))
                job_entity.tools = list(set(job_entity.tools + list(company_stack.tools)))
                job_entity.niche_tech = list(set(job_entity.niche_tech + list(company_stack.niche_tech)))
        else:
            print(f"[3/5] Skipping public company lookup")

        # Step 4: Match to STAR examples
        print(f"[4/5] Matching to STAR examples...")
        match_result = self.star_matcher.match(job_entity, top_n=3)

        # Step 5: Store entities
        print(f"[5/5] Storing entities...")
        processed_job = ProcessedJob(
            job_id=job_id,
            company=company,
            title=title,
            url=url,
            job_entity={
                'role_type': job_entity.role_type,
                'company_stage': job_entity.company_stage,
                'languages': job_entity.languages,
                'frameworks': job_entity.frameworks,
                'databases': job_entity.databases,
                'cloud': job_entity.cloud,
                'tools': job_entity.tools,
                'niche_tech': job_entity.niche_tech,
                'domain_keywords': job_entity.domain_keywords
            },
            company_stack=company_stack.to_dict() if company_stack else {},
            top_star_examples=[
                {'title': star.title, 'score': score}
                for star, score in match_result.matched_stars
            ],
            tech_overlap=match_result.tech_overlap,
            domain_overlap=match_result.domain_overlap,
            why_work_here=match_result.why_work_here,
            processed_at=datetime.now().isoformat(),
            indexed_words=len(self.webpage_indexer._extract_words(title, description))
        )

        self.entity_store.add_job(processed_job)

        print(f"✓ Completed processing for {company}\n")
        return processed_job


# Example usage
if __name__ == '__main__':
    print("=== JD-to-STAR Integration System ===\n")

    # Initialize system
    system = JDStarSystem()

    # Set candidate data (from candidate-data.mjs)
    resume_text = """JASON BIAN
Data Engineer II at Amazon with experience in ML infrastructure, forecasting pipelines,
and supply chain optimization. Built RL agents, scaled APIs, and supported production DL models."""

    skills = [
        "python", "java", "sql", "spark", "scala", "typescript",
        "airflow", "pytorch", "django", "pandas", "aws-cdk",
        "redshift", "postgres", "kubernetes", "machine learning"
    ]

    system.set_candidate_data(resume_text, skills)

    # Process example JD
    job_data = {
        'job_id': 'jane-street-mle-001',
        'company': 'Jane Street',
        'title': 'Machine Learning Engineer',
        'url': 'https://jobs.lever.co/janestreet/ml-engineer',
        'description': '''
        Jane Street is looking for a Machine Learning Engineer to build production ML systems
        for trading. You'll work on real-time model inference, feature engineering, and
        low-latency systems using Python, OCaml, and our proprietary stack.

        Requirements:
        - Experience with Python, PyTorch, and production ML systems
        - Understanding of low-latency distributed systems
        - Background in building APIs and microservices
        - Experience with reinforcement learning is a plus

        You'll work on:
        - Real-time model inference for trading signals
        - Feature engineering pipelines at scale
        - ML infrastructure and tooling
        '''
    }

    jd_stack = {
        'languages': ['Python', 'OCaml'],
        'frameworks': ['PyTorch'],
        'databases': [],
        'cloud': [],
        'tools': ['Docker', 'Kubernetes'],
        'niche': ['Low-Latency Systems', 'FIX Protocol']
    }

    # Process the JD
    result = system.process_job_description(job_data, jd_stack, lookup_company=True)

    # Display results
    print("="*70)
    print(f"\nProcessed Job: {result.title} at {result.company}")
    print(f"Role Type: {result.job_entity['role_type']}")
    print(f"Company Stage: {result.job_entity['company_stage']}")
    print(f"\nTech Stack (JD + Company Lookup):")
    print(f"  Languages: {', '.join(result.job_entity['languages'][:5])}")
    print(f"  Frameworks: {', '.join(result.job_entity['frameworks'][:5])}")
    print(f"  Niche Tech: {', '.join(result.job_entity['niche_tech'][:5])}")
    print(f"\nTop 3 Matched STAR Examples:")
    for i, star in enumerate(result.top_star_examples, 1):
        print(f"  {i}. [{star['score']:.1f}] {star['title']}")
    print(f"\nTech Overlap: {', '.join(result.tech_overlap)}")
    print(f"Domain Overlap: {', '.join(result.domain_overlap)}")
    print(f"\n'Why I Want to Work Here':")
    print(f"{result.why_work_here}")

    # Show Claude skill context
    print(f"\n{'='*70}")
    print("\nClaude Skill Context (Efficient Representation):")
    print("="*70)
    context = system.entity_store.get_claude_skill_context(result.job_id)
    print(context)

    print(f"\n{'='*70}")
    print("\n✓ Integration Complete")
    print(f"  - Webpage indexed: {result.indexed_words} unique words")
    print(f"  - Company stack cached: {len(result.company_stack) > 0}")
    print(f"  - Entities stored for Claude skill")
