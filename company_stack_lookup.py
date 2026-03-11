"""
Company Tech Stack Lookup

Performs public lookups on company codebases and tech stacks using:
1. GitHub repository search
2. StackShare API / web scraping
3. Company engineering blogs
4. Job posting aggregation

Stores results in entity database for future use.
"""

import re
import json
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class CompanyStackInfo:
    """Company technology stack information."""
    company_name: str
    github_repos: List[str] = None  # List of public GitHub repo URLs
    languages: Set[str] = None
    frameworks: Set[str] = None
    databases: Set[str] = None
    cloud: Set[str] = None
    tools: Set[str] = None
    niche_tech: Set[str] = None
    source: str = ""  # "github", "stackshare", "job_postings", "engineering_blog"
    confidence: str = "low"  # "low", "medium", "high"
    last_updated: str = ""

    def __post_init__(self):
        # Initialize sets if None
        if self.github_repos is None:
            self.github_repos = []
        if self.languages is None:
            self.languages = set()
        if self.frameworks is None:
            self.frameworks = set()
        if self.databases is None:
            self.databases = set()
        if self.cloud is None:
            self.cloud = set()
        if self.tools is None:
            self.tools = set()
        if self.niche_tech is None:
            self.niche_tech = set()
        if not self.last_updated:
            self.last_updated = datetime.now().isoformat()

    def to_dict(self):
        """Convert to JSON-serializable dict."""
        return {
            'company_name': self.company_name,
            'github_repos': self.github_repos,
            'languages': sorted(list(self.languages)),
            'frameworks': sorted(list(self.frameworks)),
            'databases': sorted(list(self.databases)),
            'cloud': sorted(list(self.cloud)),
            'tools': sorted(list(self.tools)),
            'niche_tech': sorted(list(self.niche_tech)),
            'source': self.source,
            'confidence': self.confidence,
            'last_updated': self.last_updated
        }

    @classmethod
    def from_dict(cls, data: Dict):
        """Create from JSON dict."""
        return cls(
            company_name=data['company_name'],
            github_repos=data.get('github_repos', []),
            languages=set(data.get('languages', [])),
            frameworks=set(data.get('frameworks', [])),
            databases=set(data.get('databases', [])),
            cloud=set(data.get('cloud', [])),
            tools=set(data.get('tools', [])),
            niche_tech=set(data.get('niche_tech', [])),
            source=data.get('source', ''),
            confidence=data.get('confidence', 'low'),
            last_updated=data.get('last_updated', datetime.now().isoformat())
        )


class CompanyStackDatabase:
    """Database for storing company tech stack information."""

    def __init__(self, storage_file: str = "company_stacks.json"):
        self.storage_file = storage_file
        self.companies: Dict[str, CompanyStackInfo] = {}
        self._load()

    def _load(self):
        """Load from JSON file."""
        try:
            with open(self.storage_file, 'r') as f:
                data = json.load(f)
                for company_name, company_data in data.items():
                    self.companies[company_name.lower()] = CompanyStackInfo.from_dict(company_data)
            print(f"Loaded {len(self.companies)} companies from {self.storage_file}")
        except FileNotFoundError:
            print(f"No existing {self.storage_file}, starting fresh")

    def save(self):
        """Save to JSON file."""
        data = {name: info.to_dict() for name, info in self.companies.items()}
        with open(self.storage_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved {len(self.companies)} companies to {self.storage_file}")

    def add_or_update(self, company_info: CompanyStackInfo):
        """Add or update company stack info."""
        key = company_info.company_name.lower()
        if key in self.companies:
            # Merge with existing
            existing = self.companies[key]
            existing.languages.update(company_info.languages)
            existing.frameworks.update(company_info.frameworks)
            existing.databases.update(company_info.databases)
            existing.cloud.update(company_info.cloud)
            existing.tools.update(company_info.tools)
            existing.niche_tech.update(company_info.niche_tech)
            existing.github_repos = list(set(existing.github_repos + company_info.github_repos))
            existing.source = f"{existing.source}, {company_info.source}".strip(", ")
            existing.last_updated = datetime.now().isoformat()
        else:
            self.companies[key] = company_info
        self.save()

    def get(self, company_name: str) -> Optional[CompanyStackInfo]:
        """Get company stack info."""
        return self.companies.get(company_name.lower())

    def search(self, query: str) -> List[CompanyStackInfo]:
        """Search companies by name."""
        query_lower = query.lower()
        results = []
        for name, info in self.companies.items():
            if query_lower in name:
                results.append(info)
        return results


class PublicStackLookup:
    """
    Public tech stack lookup system.

    NOTE: This is a mock/template implementation. In production, you would:
    1. Use GitHub API to search for company repos
    2. Scrape StackShare or use their API
    3. Parse company engineering blogs
    4. Aggregate from multiple job postings
    """

    def __init__(self, db: CompanyStackDatabase):
        self.db = db

    def lookup_by_github(self, company_name: str, github_org: Optional[str] = None) -> CompanyStackInfo:
        """
        Look up tech stack from GitHub organization.

        In production, this would:
        1. Use GitHub API to list repos
        2. Analyze repo languages (GitHub API provides this)
        3. Parse README files for framework mentions
        4. Check for specific config files (package.json, requirements.txt, etc.)
        """
        if not github_org:
            github_org = company_name.lower().replace(" ", "")

        # Mock data for demonstration
        # In real implementation: requests.get(f"https://api.github.com/orgs/{github_org}/repos")
        mock_repos = {
            "janestreet": {
                "repos": [f"https://github.com/janestreet/core", f"https://github.com/janestreet/async"],
                "languages": {"OCaml", "Python", "C++"},
                "tools": {"Docker", "Kubernetes"}
            },
            "clearstreet": {
                "repos": [f"https://github.com/clearstreet/infra"],
                "languages": {"Python", "Go", "Java"},
                "frameworks": {"Django", "FastAPI"},
                "cloud": {"AWS", "Kubernetes"}
            },
            "databricks": {
                "repos": [f"https://github.com/databricks/koalas"],
                "languages": {"Scala", "Python", "Java"},
                "frameworks": {"Spark"},
                "databases": {"Delta Lake"},
                "cloud": {"AWS", "Azure", "GCP"}
            }
        }

        info = CompanyStackInfo(
            company_name=company_name,
            source="github",
            confidence="high"
        )

        org_key = github_org.lower()
        if org_key in mock_repos:
            data = mock_repos[org_key]
            info.github_repos = data.get("repos", [])
            info.languages = set(data.get("languages", []))
            info.frameworks = set(data.get("frameworks", []))
            info.databases = set(data.get("databases", []))
            info.cloud = set(data.get("cloud", []))
            info.tools = set(data.get("tools", []))
        else:
            # Fallback: assume some common patterns
            info.github_repos = [f"https://github.com/{github_org}"]
            info.confidence = "low"

        return info

    def lookup_by_stackshare(self, company_name: str) -> CompanyStackInfo:
        """
        Look up tech stack from StackShare.

        In production: scrape https://stackshare.io/companies/{company-slug}
        or use StackShare API if available.
        """
        # Mock data
        mock_stacks = {
            "jane street": {
                "languages": {"OCaml", "Python", "C++"},
                "frameworks": {"React"},
                "databases": {"PostgreSQL"},
                "tools": {"Docker"},
                "niche_tech": {"FIX Protocol", "Low-Latency Systems"}
            },
            "databricks": {
                "languages": {"Scala", "Python", "Java"},
                "frameworks": {"Spark", "MLflow"},
                "databases": {"Delta Lake", "Parquet"},
                "cloud": {"AWS", "Azure", "GCP"}
            }
        }

        info = CompanyStackInfo(
            company_name=company_name,
            source="stackshare",
            confidence="medium"
        )

        key = company_name.lower()
        if key in mock_stacks:
            data = mock_stacks[key]
            info.languages = set(data.get("languages", []))
            info.frameworks = set(data.get("frameworks", []))
            info.databases = set(data.get("databases", []))
            info.cloud = set(data.get("cloud", []))
            info.tools = set(data.get("tools", []))
            info.niche_tech = set(data.get("niche_tech", []))

        return info

    def lookup_from_job_postings(self, company_name: str, job_postings: List[Dict]) -> CompanyStackInfo:
        """
        Aggregate tech stack from multiple job postings for a company.

        Args:
            company_name: Company name
            job_postings: List of job posting dicts with parsed tech stacks
        """
        info = CompanyStackInfo(
            company_name=company_name,
            source="job_postings",
            confidence="high"
        )

        for job in job_postings:
            if 'stack' in job:
                stack = job['stack']
                info.languages.update(stack.get('languages', []))
                info.frameworks.update(stack.get('frameworks', []))
                info.databases.update(stack.get('databases', []))
                info.cloud.update(stack.get('cloud', []))
                info.tools.update(stack.get('tools', []))
                info.niche_tech.update(stack.get('niche', []))

        return info

    def lookup_all_sources(self, company_name: str, github_org: Optional[str] = None) -> CompanyStackInfo:
        """
        Aggregate from all available sources.
        """
        # Check cache first
        cached = self.db.get(company_name)
        if cached:
            age_hours = (datetime.now() - datetime.fromisoformat(cached.last_updated)).total_seconds() / 3600
            if age_hours < 24:  # Cache for 24 hours
                print(f"Using cached data for {company_name}")
                return cached

        # Aggregate from multiple sources
        github_info = self.lookup_by_github(company_name, github_org)
        stackshare_info = self.lookup_by_stackshare(company_name)

        # Merge
        merged = CompanyStackInfo(
            company_name=company_name,
            source="github, stackshare",
            confidence="high"
        )

        merged.github_repos = github_info.github_repos
        merged.languages = github_info.languages.union(stackshare_info.languages)
        merged.frameworks = github_info.frameworks.union(stackshare_info.frameworks)
        merged.databases = github_info.databases.union(stackshare_info.databases)
        merged.cloud = github_info.cloud.union(stackshare_info.cloud)
        merged.tools = github_info.tools.union(stackshare_info.tools)
        merged.niche_tech = github_info.niche_tech.union(stackshare_info.niche_tech)

        # Save to cache
        self.db.add_or_update(merged)

        return merged


# Example usage
if __name__ == '__main__':
    print("=== Company Tech Stack Lookup ===\n")

    # Initialize
    db = CompanyStackDatabase()
    lookup = PublicStackLookup(db)

    # Example 1: Lookup Jane Street
    print("1. Looking up Jane Street...")
    jane_street = lookup.lookup_all_sources("Jane Street", github_org="janestreet")
    print(f"   Languages: {', '.join(jane_street.languages)}")
    print(f"   Frameworks: {', '.join(jane_street.frameworks)}")
    print(f"   Niche Tech: {', '.join(jane_street.niche_tech)}")
    print(f"   GitHub Repos: {len(jane_street.github_repos)}")
    print(f"   Source: {jane_street.source}")
    print(f"   Confidence: {jane_street.confidence}\n")

    # Example 2: Lookup Databricks
    print("2. Looking up Databricks...")
    databricks = lookup.lookup_all_sources("Databricks", github_org="databricks")
    print(f"   Languages: {', '.join(databricks.languages)}")
    print(f"   Frameworks: {', '.join(databricks.frameworks)}")
    print(f"   Databases: {', '.join(databricks.databases)}")
    print(f"   Cloud: {', '.join(databricks.cloud)}")
    print(f"   Source: {databricks.source}\n")

    # Example 3: Lookup from job postings
    print("3. Aggregating from job postings...")
    job_postings = [
        {
            'title': 'Data Engineer',
            'stack': {
                'languages': ['Python', 'Scala'],
                'frameworks': ['Spark', 'Airflow'],
                'cloud': ['AWS', 'EMR']
            }
        },
        {
            'title': 'ML Engineer',
            'stack': {
                'languages': ['Python'],
                'frameworks': ['PyTorch', 'MLflow'],
                'cloud': ['AWS', 'SageMaker']
            }
        }
    ]
    from_jobs = lookup.lookup_from_job_postings("TechStartup", job_postings)
    print(f"   Aggregated Languages: {', '.join(from_jobs.languages)}")
    print(f"   Aggregated Frameworks: {', '.join(from_jobs.frameworks)}")
    print(f"   Aggregated Cloud: {', '.join(from_jobs.cloud)}\n")

    # Example 4: Search database
    print("4. Searching database for 'data'...")
    results = db.search("data")
    for r in results:
        print(f"   - {r.company_name}: {', '.join(list(r.languages)[:3])}")

    print("\n=== Lookup Complete ===")
    print(f"Database now contains {len(db.companies)} companies")
