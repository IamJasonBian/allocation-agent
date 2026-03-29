"""
Webpage Indexer for Allocation Agent
Tracks webpages visited during job application automation with inverted index for word search.
"""

import re
import json
from datetime import datetime
from typing import List, Dict, Optional, Set


class WebpageStorage:
    """Storage for webpages with inverted word index."""

    def __init__(self):
        self.pages = []  # List of webpage records
        self.word_index = {}  # word -> list of page IDs
        self.url_map = {}  # URL -> page ID for fast lookup

    def add_page(self, url: str, title: str, content: str,
                 page_type: str = "job_posting", metadata: Optional[Dict] = None) -> int:
        """
        Add a webpage to storage and build inverted index.

        Args:
            url: Page URL
            title: Page title
            content: Page content/text
            page_type: Type of page (job_posting, api_response, email, etc.)
            metadata: Additional metadata (company, board_token, job_id, etc.)

        Returns:
            page_id: ID of the stored page
        """
        # Check if URL already exists
        if url in self.url_map:
            print(f"URL already indexed: {url}")
            return self.url_map[url]

        page_id = len(self.pages)
        page_record = {
            'id': page_id,
            'url': url,
            'title': title,
            'content': content,
            'page_type': page_type,
            'metadata': metadata or {},
            'timestamp': datetime.now().isoformat(),
            'word_count': 0
        }

        self.pages.append(page_record)
        self.url_map[url] = page_id

        # Build inverted index
        words = self._extract_words(title, content)
        page_record['word_count'] = len(words)
        self._index_words(page_id, words)

        return page_id

    def _extract_words(self, title: str, content: str) -> Set[str]:
        """Extract unique words from title and content."""
        text = f"{title} {content}"
        # Tokenize: lowercase, alphanumeric + hyphen (for tech terms like "full-stack")
        words = re.findall(r'\b[a-z0-9][\w-]*[a-z0-9]\b|\b[a-z0-9]\b', text.lower())
        return set(words)

    def _index_words(self, page_id: int, words: Set[str]):
        """Add words to inverted index."""
        for word in words:
            if word not in self.word_index:
                self.word_index[word] = []
            self.word_index[word].append(page_id)

    def search(self, query: str, match_all: bool = False,
               page_type: Optional[str] = None) -> List[Dict]:
        """
        Search for pages containing words.

        Args:
            query: Space-separated search terms
            match_all: If True, match ALL words (AND). If False, match ANY word (OR)
            page_type: Filter by page type (optional)

        Returns:
            List of matching page records
        """
        words = query.lower().split()
        if not words:
            return []

        # Get page IDs for each word
        page_id_sets = []
        for word in words:
            if word in self.word_index:
                page_id_sets.append(set(self.word_index[word]))
            else:
                page_id_sets.append(set())

        # Combine results based on match_all
        if match_all:
            # AND: intersection
            if not page_id_sets:
                matching_ids = set()
            else:
                matching_ids = set.intersection(*page_id_sets) if page_id_sets else set()
        else:
            # OR: union
            matching_ids = set.union(*page_id_sets) if page_id_sets else set()

        # Get page records
        results = [self.pages[pid] for pid in sorted(matching_ids)]

        # Filter by page type if specified
        if page_type:
            results = [p for p in results if p['page_type'] == page_type]

        return results

    def get_by_url(self, url: str) -> Optional[Dict]:
        """Get page by exact URL."""
        page_id = self.url_map.get(url)
        return self.pages[page_id] if page_id is not None else None

    def get_all_pages(self, page_type: Optional[str] = None) -> List[Dict]:
        """Get all pages, optionally filtered by type."""
        if page_type:
            return [p for p in self.pages if p['page_type'] == page_type]
        return self.pages.copy()

    def get_stats(self) -> Dict:
        """Get indexer statistics."""
        return {
            'total_pages': len(self.pages),
            'total_unique_words': len(self.word_index),
            'total_urls': len(self.url_map),
            'page_types': self._count_by_type()
        }

    def _count_by_type(self) -> Dict[str, int]:
        """Count pages by type."""
        counts = {}
        for page in self.pages:
            page_type = page['page_type']
            counts[page_type] = counts.get(page_type, 0) + 1
        return counts

    def get_word_stats(self, top_n: int = 20) -> List[tuple]:
        """Get most common words across all pages."""
        word_freq = {word: len(page_ids) for word, page_ids in self.word_index.items()}
        return sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:top_n]

    def export_json(self, filepath: str):
        """Export storage to JSON file."""
        data = {
            'pages': self.pages,
            'word_index': self.word_index,
            'url_map': self.url_map,
            'exported_at': datetime.now().isoformat()
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Exported to {filepath}")

    def load_json(self, filepath: str):
        """Load storage from JSON file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.pages = data['pages']
        self.word_index = data['word_index']
        self.url_map = data['url_map']
        print(f"Loaded {len(self.pages)} pages from {filepath}")


# Example usage for allocation-agent
if __name__ == '__main__':
    print("=== Allocation Agent Webpage Indexer ===\n")

    indexer = WebpageStorage()

    # Example 1: Index Greenhouse job posting
    print("1. Indexing Greenhouse job posting...")
    indexer.add_page(
        url="https://boards.greenhouse.io/embed/job_app?for=clearstreet&token=12345",
        title="Software Engineer - Trading Systems",
        content="""
        Clear Street is hiring a Software Engineer to work on low-latency trading systems.
        Requirements: Python, C++, distributed systems experience.
        We build high-performance systems for financial markets.
        """,
        page_type="job_posting",
        metadata={
            'company': 'Clear Street',
            'board_token': 'clearstreet',
            'job_id': '12345',
            'platform': 'greenhouse'
        }
    )

    # Example 2: Index API response
    print("2. Indexing API response...")
    indexer.add_page(
        url="https://boards-api.greenhouse.io/v1/boards/imc/jobs/67890?questions=true",
        title="IMC Trading - Quantitative Researcher",
        content="""
        {"id": 67890, "title": "Quantitative Researcher",
         "departments": [{"name": "Quantitative Research"}],
         "content": "We seek a researcher with strong math and programming skills.
         Experience with Python, statistics, machine learning required."}
        """,
        page_type="api_response",
        metadata={
            'company': 'IMC Trading',
            'board_token': 'imc',
            'job_id': '67890',
            'platform': 'greenhouse',
            'endpoint': 'jobs_api'
        }
    )

    # Example 3: Index Dover job
    print("3. Indexing Dover job...")
    indexer.add_page(
        url="https://app.dover.com/apply/techstartup/550e8400-e29b-41d4-a716-446655440000",
        title="Full Stack Engineer - Early Stage Startup",
        content="""
        Join our early-stage startup building AI-powered tools.
        Tech stack: TypeScript, React, Node.js, PostgreSQL.
        We're looking for generalist engineers who love building products.
        """,
        page_type="job_posting",
        metadata={
            'company': 'Tech Startup',
            'job_id': '550e8400-e29b-41d4-a716-446655440000',
            'platform': 'dover'
        }
    )

    # Example 4: Index Lever job
    print("4. Indexing Lever job...")
    indexer.add_page(
        url="https://jobs.lever.co/janestreet/abc123/apply",
        title="Jane Street - Software Developer",
        content="""
        Jane Street seeks software developers with strong functional programming skills.
        OCaml experience preferred but not required. We value problem-solving ability.
        Work on systems that trade billions daily in global markets.
        """,
        page_type="job_posting",
        metadata={
            'company': 'Jane Street',
            'posting_id': 'abc123',
            'platform': 'lever'
        }
    )

    print(f"\nIndexed {len(indexer.pages)} pages\n")

    # Show stats
    print("5. Storage Statistics:")
    stats = indexer.get_stats()
    print(f"   Total pages: {stats['total_pages']}")
    print(f"   Unique words: {stats['total_unique_words']}")
    print(f"   Page types: {stats['page_types']}\n")

    # Search examples
    print("6. Search for 'python':")
    results = indexer.search("python")
    for r in results:
        print(f"   - {r['title']} [{r['page_type']}]")
    print()

    print("7. Search for 'python AND systems' (match all):")
    results = indexer.search("python systems", match_all=True)
    for r in results:
        print(f"   - {r['title']}")
        print(f"     Company: {r['metadata'].get('company', 'N/A')}")
    print()

    print("8. Search for 'typescript OR react' (match any):")
    results = indexer.search("typescript react", match_all=False)
    for r in results:
        print(f"   - {r['title']} ({r['url'][:60]}...)")
    print()

    print("9. Filter job postings only:")
    job_postings = indexer.get_all_pages(page_type="job_posting")
    print(f"   Found {len(job_postings)} job postings:")
    for jp in job_postings:
        print(f"   - {jp['metadata'].get('company')} via {jp['metadata'].get('platform')}")
    print()

    print("10. Top 15 most common words:")
    top_words = indexer.get_word_stats(top_n=15)
    for word, count in top_words:
        print(f"   '{word}': {count} page(s)")
    print()

    # Export/load demo
    print("11. Exporting to JSON...")
    indexer.export_json("webpage_index.json")
    print()

    print("=== Indexer Ready for Integration ===")
    print("To integrate with allocation-agent:")
    print("  - Import WebpageStorage in your scripts")
    print("  - Call add_page() after fetching each webpage")
    print("  - Use search() to find relevant pages later")
    print("  - Export/load JSON for persistent storage")
