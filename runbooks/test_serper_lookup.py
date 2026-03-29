"""
Test Serper.dev integration for company tech stack lookup

Usage:
    export SERPER_API_KEY="your-api-key-here"
    python3 test_serper_lookup.py

Cost: $50 for 5000 searches = $0.01 per search
      This test uses 4 queries per company = $0.04 per company

Get API key: https://serper.dev/
"""

from runbooks.company_stack_lookup import PublicStackLookup, CompanyStackDatabase
import os
import sys

def test_serper_lookup():
    """Test Serper.dev API integration"""

    # Check if API key is set
    api_key = os.environ.get('SERPER_API_KEY')
    if not api_key:
        print("❌ SERPER_API_KEY not set in environment")
        print("\nTo use Serper.dev:")
        print("  1. Sign up at https://serper.dev/")
        print("  2. Get your API key from the dashboard")
        print("  3. Export it: export SERPER_API_KEY='your-key-here'")
        print("  4. Run this script again\n")
        print("Cost: $50 for 5000 searches ($0.01 per search)")
        print("This test uses 4 queries per company = $0.04 per company\n")
        return

    print("✅ SERPER_API_KEY found in environment\n")
    print("="*80)
    print("TESTING SERPER.DEV INTEGRATION")
    print("="*80 + "\n")

    # Initialize
    db = CompanyStackDatabase()
    lookup = PublicStackLookup(db)

    # Test companies
    test_companies = [
        {
            'name': 'Finch Legal',
            'github_org': None
        },
        {
            'name': 'Clio',
            'github_org': 'clio'
        },
        {
            'name': 'Harvey',
            'github_org': None
        }
    ]

    for company in test_companies:
        print(f"\n{'='*80}")
        print(f"RESEARCHING: {company['name']}")
        print(f"{'='*80}\n")

        # Lookup with Serper enabled
        result = lookup.lookup_all_sources(
            company_name=company['name'],
            github_org=company['github_org'],
            use_serper=True
        )

        # Display results
        print(f"\n📊 RESULTS FOR {company['name']}:")
        print(f"   Source: {result.source}")
        print(f"   Confidence: {result.confidence}")

        if result.languages:
            print(f"\n   Languages: {', '.join(sorted(result.languages))}")
        else:
            print(f"\n   Languages: None found")

        if result.frameworks:
            print(f"   Frameworks: {', '.join(sorted(result.frameworks))}")
        else:
            print(f"   Frameworks: None found")

        if result.databases:
            print(f"   Databases: {', '.join(sorted(result.databases))}")
        else:
            print(f"   Databases: None found")

        if result.cloud:
            print(f"   Cloud: {', '.join(sorted(result.cloud))}")
        else:
            print(f"   Cloud: None found")

        if result.tools:
            print(f"   Tools: {', '.join(sorted(result.tools))}")
        else:
            print(f"   Tools: None found")

        print()

    print("="*80)
    print("TEST COMPLETE")
    print("="*80)
    print(f"\nData cached in company_stacks.json")
    print(f"Cache TTL: 24 hours")


if __name__ == "__main__":
    try:
        # Check if requests is installed
        import requests
        test_serper_lookup()
    except ImportError:
        print("❌ 'requests' library not installed")
        print("\nInstall it with:")
        print("  pip3 install requests")
        sys.exit(1)
