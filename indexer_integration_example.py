"""
Integration example: How to use WebpageIndexer with allocation-agent

This shows how to integrate the indexer into your existing automation scripts.
"""

from webpage_indexer import WebpageStorage
import json


class AllocationAgentIndexer:
    """Wrapper for integrating indexer into allocation-agent workflows."""

    def __init__(self, storage_file: str = "webpage_index.json"):
        self.indexer = WebpageStorage()
        self.storage_file = storage_file
        self._load_if_exists()

    def _load_if_exists(self):
        """Load existing index if file exists."""
        try:
            self.indexer.load_json(self.storage_file)
        except FileNotFoundError:
            print(f"Starting new index (no existing {self.storage_file} found)")

    def save(self):
        """Save index to disk."""
        self.indexer.export_json(self.storage_file)

    # --- Integration methods for different platforms ---

    def index_greenhouse_job(self, job_data: dict, board_token: str):
        """
        Index a Greenhouse job posting.

        Args:
            job_data: Job data from Greenhouse API (includes id, title, content, etc.)
            board_token: Company's Greenhouse board token
        """
        url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_data['id']}"

        self.indexer.add_page(
            url=url,
            title=job_data.get('title', 'Untitled Job'),
            content=job_data.get('content', ''),
            page_type="job_posting",
            metadata={
                'company': board_token,
                'job_id': job_data['id'],
                'platform': 'greenhouse',
                'departments': job_data.get('departments', []),
                'location': job_data.get('location', {}).get('name', '')
            }
        )
        self.save()

    def index_greenhouse_embed(self, html_content: str, board_token: str, job_id: str):
        """
        Index Greenhouse embed page (the application form page).

        Args:
            html_content: Raw HTML from embed page
            board_token: Company's board token
            job_id: Job ID
        """
        url = f"https://boards.greenhouse.io/embed/job_app?for={board_token}&token={job_id}"

        # Extract title from HTML (simple regex)
        import re
        title_match = re.search(r'<title>(.*?)</title>', html_content, re.IGNORECASE)
        title = title_match.group(1) if title_match else f"Application Form - {board_token}"

        # Strip HTML tags for content indexing
        text_content = re.sub(r'<[^>]+>', ' ', html_content)

        self.indexer.add_page(
            url=url,
            title=title,
            content=text_content,
            page_type="application_form",
            metadata={
                'company': board_token,
                'job_id': job_id,
                'platform': 'greenhouse',
                'form_type': 'embed'
            }
        )
        self.save()

    def index_lever_job(self, job_data: dict, company: str):
        """
        Index a Lever job posting.

        Args:
            job_data: Job data from Lever API
            company: Company slug
        """
        url = f"https://jobs.lever.co/{company}/{job_data['id']}"

        self.indexer.add_page(
            url=url,
            title=job_data.get('text', 'Untitled Job'),
            content=job_data.get('description', '') + ' ' + job_data.get('descriptionPlain', ''),
            page_type="job_posting",
            metadata={
                'company': company,
                'job_id': job_data['id'],
                'platform': 'lever',
                'categories': job_data.get('categories', {}),
                'location': job_data.get('categories', {}).get('location', '')
            }
        )
        self.save()

    def index_dover_job(self, job_data: dict, slug: str):
        """
        Index a Dover job posting.

        Args:
            job_data: Job data from Dover API/scrape
            slug: Company slug
        """
        job_id = job_data.get('jobId', job_data.get('id', ''))
        url = f"https://app.dover.com/apply/{slug}/{job_id}"

        self.indexer.add_page(
            url=url,
            title=job_data.get('title', 'Untitled Job'),
            content=job_data.get('description', ''),
            page_type="job_posting",
            metadata={
                'company': slug,
                'job_id': job_id,
                'platform': 'dover',
                'location': job_data.get('location', '')
            }
        )
        self.save()

    def index_puppeteer_page(self, url: str, title: str, text_content: str,
                            platform: str, metadata: dict = None):
        """
        Index a page visited via Puppeteer.

        Args:
            url: Page URL
            title: Page title (from page.title())
            text_content: Text content extracted from page
            platform: Platform name (greenhouse, lever, dover)
            metadata: Additional metadata
        """
        self.indexer.add_page(
            url=url,
            title=title,
            content=text_content,
            page_type="browser_visited",
            metadata={
                'platform': platform,
                **(metadata or {})
            }
        )
        self.save()

    def index_gmail_message(self, email_subject: str, email_body: str, message_id: str):
        """
        Index a Gmail message (e.g., security codes).

        Args:
            email_subject: Email subject line
            email_body: Email body text
            message_id: Gmail message ID
        """
        url = f"gmail://message/{message_id}"

        self.indexer.add_page(
            url=url,
            title=email_subject,
            content=email_body,
            page_type="email",
            metadata={
                'platform': 'gmail',
                'message_id': message_id
            }
        )
        self.save()

    # --- Query methods ---

    def search_jobs(self, keywords: str, match_all: bool = False):
        """Search job postings by keywords."""
        return self.indexer.search(keywords, match_all=match_all, page_type="job_posting")

    def find_company_jobs(self, company_name: str):
        """Find all jobs for a specific company."""
        all_jobs = self.indexer.get_all_pages(page_type="job_posting")
        return [j for j in all_jobs if company_name.lower() in j['metadata'].get('company', '').lower()]

    def get_visited_urls(self):
        """Get list of all visited URLs."""
        return [p['url'] for p in self.indexer.pages]

    def get_platform_stats(self):
        """Get stats by platform."""
        platform_counts = {}
        for page in self.indexer.pages:
            platform = page['metadata'].get('platform', 'unknown')
            platform_counts[platform] = platform_counts.get(platform, 0) + 1
        return platform_counts


# Example usage in allocation-agent scripts
if __name__ == '__main__':
    print("=== Allocation Agent Indexer Integration Example ===\n")

    # Initialize indexer
    agent_indexer = AllocationAgentIndexer()

    # Example 1: Index Greenhouse jobs (from API response)
    print("1. Indexing Greenhouse jobs...")
    greenhouse_jobs = [
        {
            'id': '12345',
            'title': 'Backend Engineer',
            'content': 'Build scalable APIs with Python and PostgreSQL',
            'departments': [{'name': 'Engineering'}],
            'location': {'name': 'Remote'}
        },
        {
            'id': '67890',
            'title': 'ML Engineer',
            'content': 'Train and deploy machine learning models at scale',
            'departments': [{'name': 'AI/ML'}],
            'location': {'name': 'San Francisco'}
        }
    ]
    for job in greenhouse_jobs:
        agent_indexer.index_greenhouse_job(job, board_token='techcorp')

    # Example 2: Index Dover job
    print("2. Indexing Dover job...")
    dover_job = {
        'jobId': '550e8400-e29b-41d4-a716-446655440000',
        'title': 'Full Stack Developer',
        'description': 'Build our next-gen SaaS platform with React and Node.js',
        'location': 'NYC'
    }
    agent_indexer.index_dover_job(dover_job, slug='startup-xyz')

    # Example 3: Index page visited via Puppeteer
    print("3. Indexing browser-visited page...")
    agent_indexer.index_puppeteer_page(
        url='https://boards.greenhouse.io/embed/job_app?for=techcorp&token=12345',
        title='Application: Backend Engineer - TechCorp',
        text_content='Application form for Backend Engineer position...',
        platform='greenhouse',
        metadata={'job_id': '12345', 'company': 'techcorp'}
    )

    print()

    # Query examples
    print("4. Search for 'python' jobs:")
    results = agent_indexer.search_jobs("python")
    for r in results:
        print(f"   - {r['title']} ({r['metadata'].get('company')})")
    print()

    print("5. Search for 'machine learning' AND 'scale':")
    results = agent_indexer.search_jobs("machine learning scale", match_all=True)
    for r in results:
        print(f"   - {r['title']}")
    print()

    print("6. Find TechCorp jobs:")
    techcorp_jobs = agent_indexer.find_company_jobs("techcorp")
    print(f"   Found {len(techcorp_jobs)} jobs at TechCorp")
    print()

    print("7. Platform statistics:")
    stats = agent_indexer.get_platform_stats()
    for platform, count in stats.items():
        print(f"   {platform}: {count} page(s)")
    print()

    print("8. Overall stats:")
    overall = agent_indexer.indexer.get_stats()
    print(f"   Total pages indexed: {overall['total_pages']}")
    print(f"   Unique words: {overall['total_unique_words']}")
    print()

    print("=== Integration Complete ===")
    print("\nTo use in your scripts:")
    print("  from indexer_integration_example import AllocationAgentIndexer")
    print("  indexer = AllocationAgentIndexer()")
    print("  indexer.index_greenhouse_job(job_data, 'company-token')")
    print("  results = indexer.search_jobs('python backend')")
