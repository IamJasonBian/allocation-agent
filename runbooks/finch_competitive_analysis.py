"""
Competitive Analysis: Finch Legal vs Legal Tech Competitors

Researches competitors in the legal tech space and compares:
- Tech stacks (languages, frameworks, cloud infrastructure)
- Product focus (case management, billing, AI automation)
- Company stage and funding
- AI/ML integration approaches
"""

from company_stack_lookup import PublicStackLookup, CompanyStackDatabase
from typing import Dict, List, Set
import json

class CompetitiveAnalysis:
    def __init__(self):
        db = CompanyStackDatabase()
        self.company_lookup = PublicStackLookup(db)

    def analyze_finch_vs_competitors(self):
        """
        Research Finch Legal and major legal tech competitors
        """

        # Define companies to research
        companies = {
            'Finch Legal': {
                'website': 'finchlegal.com',
                'github_org': None,  # Unknown, will search
                'category': 'AI-Powered Personal Injury',
                'founded': 2023,
                'stage': 'Series A',
                'product_focus': ['Case Management', 'Document Automation', 'Workflow Orchestration', 'AI Legal Reasoning'],
                'known_stack': {
                    'languages': ['Python', 'TypeScript'],
                    'frameworks': ['FastAPI', 'React', 'Next.js', 'LangChain'],
                    'databases': ['PostgreSQL', 'Redis'],
                    'cloud': ['AWS'],
                    'ai_ml': ['OpenAI API', 'LangChain', 'Document Processing']
                }
            },
            'Clio': {
                'website': 'clio.com',
                'github_org': 'clio',
                'category': 'General Practice Management',
                'founded': 2008,
                'stage': 'Series D / Unicorn ($1.6B valuation)',
                'product_focus': ['Practice Management', 'Billing', 'Client Intake', 'Document Management'],
                'known_stack': None  # Will lookup
            },
            'MyCase': {
                'website': 'mycase.com',
                'github_org': None,
                'category': 'General Practice Management',
                'founded': 2008,
                'stage': 'Acquired by AffiniPay (2012)',
                'product_focus': ['Case Management', 'Billing', 'Client Portal', 'Document Management'],
                'known_stack': None
            },
            'CASEpeer': {
                'website': 'casepeer.com',
                'github_org': None,
                'category': 'Personal Injury Focus',
                'founded': 2015,
                'stage': 'Private (Growing)',
                'product_focus': ['Personal Injury Case Management', 'Medical Records', 'Settlement Tracking'],
                'known_stack': None
            },
            'Litify': {
                'website': 'litify.com',
                'github_org': 'litify',
                'category': 'Enterprise Legal Operations',
                'founded': 2016,
                'stage': 'Series C ($50M)',
                'product_focus': ['Intake Management', 'Case Management', 'Salesforce-Based Platform'],
                'known_stack': None
            },
            'CASEpeer': {
                'website': 'casepeer.com',
                'github_org': None,
                'category': 'Personal Injury Specific',
                'founded': 2015,
                'stage': 'Bootstrapped',
                'product_focus': ['PI Case Management', 'Medical Chronologies', 'Demand Letters'],
                'known_stack': None
            },
            'Harvey': {
                'website': 'harvey.ai',
                'github_org': None,
                'category': 'AI Legal Assistant',
                'founded': 2022,
                'stage': 'Series C ($100M, OpenAI partnership)',
                'product_focus': ['Legal Research', 'Document Drafting', 'AI Chat Assistant', 'Enterprise Legal'],
                'known_stack': {
                    'languages': ['Python', 'TypeScript'],
                    'frameworks': ['React', 'LangChain'],
                    'ai_ml': ['Custom LLM (fine-tuned GPT-4)', 'RAG', 'Legal Document Embeddings'],
                    'cloud': ['AWS', 'Azure'],
                    'databases': ['Vector DB (Pinecone/Weaviate)']
                }
            },
            'EvenUp': {
                'website': 'evenuplaw.com',
                'github_org': None,
                'category': 'AI Personal Injury Demands',
                'founded': 2019,
                'stage': 'Series C ($50M)',
                'product_focus': ['AI Demand Letter Generation', 'Medical Record Review', 'Settlement Valuation'],
                'known_stack': {
                    'languages': ['Python'],
                    'frameworks': ['PyTorch', 'Transformers'],
                    'ai_ml': ['Custom NLP Models', 'Document OCR', 'Medical Entity Extraction'],
                    'cloud': ['AWS'],
                    'databases': ['PostgreSQL', 'Elasticsearch']
                }
            }
        }

        print("="*100)
        print("FINCH LEGAL COMPETITIVE ANALYSIS")
        print("="*100 + "\n")

        # Lookup tech stacks for companies without known stack
        print("STEP 1: RESEARCHING TECH STACKS")
        print("="*100 + "\n")

        for company_name, info in companies.items():
            if info['known_stack'] is None:
                print(f"Looking up {company_name}...")
                stack = self.company_lookup.lookup_all_sources(
                    company_name=company_name,
                    github_org=info.get('github_org')
                )
                # Convert CompanyStackInfo to dict for consistent access
                info['known_stack'] = stack.to_dict() if hasattr(stack, 'to_dict') else stack
                print(f"  Found: {len(info['known_stack'].get('languages', []))} languages, "
                      f"{len(info['known_stack'].get('frameworks', []))} frameworks\n")

        # Analyze market positioning
        print("\n" + "="*100)
        print("STEP 2: MARKET POSITIONING ANALYSIS")
        print("="*100 + "\n")

        self._analyze_market_positioning(companies)

        # Tech stack comparison
        print("\n" + "="*100)
        print("STEP 3: TECH STACK COMPARISON")
        print("="*100 + "\n")

        self._compare_tech_stacks(companies)

        # AI/ML integration comparison
        print("\n" + "="*100)
        print("STEP 4: AI/ML INTEGRATION COMPARISON")
        print("="*100 + "\n")

        self._compare_ai_approaches(companies)

        # Finch differentiation analysis
        print("\n" + "="*100)
        print("STEP 5: FINCH LEGAL DIFFERENTIATION")
        print("="*100 + "\n")

        self._analyze_finch_differentiation(companies)

        # Strategic recommendations
        print("\n" + "="*100)
        print("STEP 6: STRATEGIC TALKING POINTS")
        print("="*100 + "\n")

        self._generate_talking_points(companies)

        return companies

    def _analyze_market_positioning(self, companies: Dict):
        """Analyze how each company positions itself in the market"""

        categories = {}
        for name, info in companies.items():
            cat = info['category']
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(name)

        print("Market Segmentation:\n")
        for category, company_list in categories.items():
            print(f"  {category}:")
            for company in company_list:
                stage = companies[company]['stage']
                print(f"    - {company} ({stage})")

        print("\n" + "-"*100)
        print("\nFunding/Stage Breakdown:\n")

        stages = {
            'Early Stage (Seed/Series A)': [],
            'Growth Stage (Series B/C)': [],
            'Late Stage (Series D+/Unicorn)': [],
            'Acquired/Bootstrapped': []
        }

        for name, info in companies.items():
            stage = info['stage']
            if 'Series A' in stage or 'Seed' in stage:
                stages['Early Stage (Seed/Series A)'].append(f"{name} ({stage})")
            elif 'Series B' in stage or 'Series C' in stage:
                stages['Growth Stage (Series B/C)'].append(f"{name} ({stage})")
            elif 'Series D' in stage or 'Unicorn' in stage:
                stages['Late Stage (Series D+/Unicorn)'].append(f"{name} ({stage})")
            else:
                stages['Acquired/Bootstrapped'].append(f"{name} ({stage})")

        for stage_name, company_list in stages.items():
            if company_list:
                print(f"  {stage_name}:")
                for company in company_list:
                    print(f"    - {company}")

    def _compare_tech_stacks(self, companies: Dict):
        """Compare technology stacks across companies"""

        print("Backend Languages:\n")
        for name, info in companies.items():
            languages = info['known_stack'].get('languages', [])
            print(f"  {name:20} {', '.join(languages) if languages else 'Unknown'}")

        print("\n" + "-"*100)
        print("\nFrontend Frameworks:\n")
        for name, info in companies.items():
            frameworks = info['known_stack'].get('frameworks', [])
            frontend = [f for f in frameworks if f in ['React', 'Vue', 'Angular', 'Next.js', 'Svelte']]
            print(f"  {name:20} {', '.join(frontend) if frontend else 'Unknown'}")

        print("\n" + "-"*100)
        print("\nCloud Infrastructure:\n")
        for name, info in companies.items():
            cloud = info['known_stack'].get('cloud', [])
            print(f"  {name:20} {', '.join(cloud) if cloud else 'Unknown'}")

        print("\n" + "-"*100)
        print("\nDatabases:\n")
        for name, info in companies.items():
            databases = info['known_stack'].get('databases', [])
            print(f"  {name:20} {', '.join(databases) if databases else 'Unknown'}")

    def _compare_ai_approaches(self, companies: Dict):
        """Compare AI/ML integration approaches"""

        print("AI/ML Maturity Level:\n")

        ai_leaders = []
        ai_emerging = []
        ai_minimal = []

        for name, info in companies.items():
            ai_ml = info['known_stack'].get('ai_ml', [])

            if len(ai_ml) >= 3:  # Significant AI investment
                ai_leaders.append(name)
            elif len(ai_ml) >= 1:  # Some AI features
                ai_emerging.append(name)
            else:
                ai_minimal.append(name)

        print("  AI Leaders (Deep Integration):")
        for name in ai_leaders:
            ai_tech = companies[name]['known_stack'].get('ai_ml', [])
            print(f"    - {name}: {', '.join(ai_tech)}")

        print("\n  AI Emerging (Basic Integration):")
        for name in ai_emerging:
            ai_tech = companies[name]['known_stack'].get('ai_ml', [])
            print(f"    - {name}: {', '.join(ai_tech) if ai_tech else 'Basic AI features'}")

        print("\n  Traditional Software (Minimal AI):")
        for name in ai_minimal:
            print(f"    - {name}: Legacy case management, no AI focus")

        print("\n" + "-"*100)
        print("\nAI Use Case Comparison:\n")

        use_cases = {
            'Document Automation': ['Finch Legal', 'EvenUp', 'Harvey'],
            'Legal Research': ['Harvey'],
            'Medical Record Review': ['EvenUp'],
            'Settlement Valuation': ['EvenUp'],
            'Workflow Orchestration': ['Finch Legal'],
            'Natural Language Chat': ['Harvey'],
            'Demand Letter Generation': ['EvenUp', 'Finch Legal']
        }

        for use_case, company_list in use_cases.items():
            print(f"  {use_case}:")
            for company in company_list:
                print(f"    - {company}")

    def _analyze_finch_differentiation(self, companies: Dict):
        """Analyze how Finch Legal differentiates from competitors"""

        finch = companies['Finch Legal']

        print("FINCH LEGAL'S UNIQUE POSITIONING:\n")

        print("1. VERTICAL FOCUS (Personal Injury)")
        print("   - Direct Competitors: CASEpeer, EvenUp")
        print("   - Differentiation from CASEpeer:")
        print("     * CASEpeer: Traditional case management with PI-specific features")
        print("     * Finch: AI-first platform with workflow automation")
        print("   - Differentiation from EvenUp:")
        print("     * EvenUp: Narrow focus on demand letter generation")
        print("     * Finch: Full operating system for PI firms (broader scope)")

        print("\n2. TECHNOLOGY APPROACH")
        print("   - Modern Stack: Python/FastAPI + React/Next.js")
        print("   - AI Integration: LangChain + OpenAI API (accessible, not custom models)")
        print("   - Cloud-Native: AWS infrastructure")
        print("   - Contrast to Harvey:")
        print("     * Harvey: Custom fine-tuned LLMs ($100M funding for model training)")
        print("     * Finch: Leverages off-the-shelf models (faster iteration, lower cost)")

        print("\n3. PRODUCT SCOPE")
        print("   - Full Practice Management: Case intake → Settlement")
        print("   - Workflow Automation: Not just document generation")
        print("   - Contrast to Clio/MyCase:")
        print("     * Clio/MyCase: General practice management (15+ years old, legacy code)")
        print("     * Finch: Built from scratch for AI era (no legacy tech debt)")

        print("\n4. COMPANY STAGE & SPEED")
        print("   - Series A (2023 founding) → Fast-moving startup")
        print("   - Small team (11-50) → Every engineer has high impact")
        print("   - Contrast to Litify:")
        print("     * Litify: Salesforce-based (heavy platform, slower iteration)")
        print("     * Finch: Greenfield codebase (move fast, break things)")

        print("\n" + "-"*100)
        print("\nKEY GAPS FINCH COULD EXPLOIT:\n")

        print("1. Legacy competitors (Clio, MyCase) are slow to integrate AI")
        print("   → Opportunity: Be the AI-native alternative")

        print("\n2. Harvey focuses on enterprise/big law, not personal injury")
        print("   → Opportunity: Own the PI vertical with specialized workflows")

        print("\n3. EvenUp is point solution (demand letters only)")
        print("   → Opportunity: Offer full-stack solution (intake, case mgmt, demands)")

        print("\n4. CASEpeer lacks deep AI integration")
        print("   → Opportunity: Automate administrative work AI-first")

    def _generate_talking_points(self, companies: Dict):
        """Generate strategic talking points for Finch Legal interview"""

        print("FOR FINCH LEGAL INTERVIEW:\n")

        print("1. WHY FINCH VS ESTABLISHED PLAYERS (Clio, MyCase)?")
        print("   'I'm excited about Finch because you're building AI-native infrastructure from day one,")
        print("   while legacy players like Clio are bolting AI onto 15-year-old codebases. At Amazon,")
        print("   I've seen how technical debt slows innovation—Finch's greenfield advantage means we")
        print("   can iterate 10x faster on AI features.'\n")

        print("2. WHY FINCH VS AI-FIRST COMPETITORS (Harvey, EvenUp)?")
        print("   'Harvey is optimizing for enterprise legal with custom LLMs, which requires massive")
        print("   capital and slow iteration. Finch's approach—leveraging OpenAI/LangChain for a specific")
        print("   vertical—is smarter. You can move faster, and PI firms don't need Harvey's complexity.")
        print("   EvenUp is a point solution; Finch is building the full operating system.'\n")

        print("3. WHY FINCH VS PI-SPECIFIC COMPETITORS (CASEpeer)?")
        print("   'CASEpeer understands the PI workflow but lacks deep AI capabilities. I see Finch as")
        print("   the AI-powered evolution of what CASEpeer started. My experience building production")
        print("   ML systems at Amazon—especially workflow orchestration for RL agents—directly maps")
        print("   to automating legal workflows with AI.'\n")

        print("4. WHAT EXCITES YOU ABOUT FINCH'S TECH STACK?")
        print("   'The FastAPI + React + AWS stack is exactly what I'd choose for a modern AI platform.")
        print("   FastAPI's async capabilities are perfect for orchestrating LLM calls, and LangChain")
        print("   gives you composability without reinventing the wheel. I've built similar systems at")
        print("   Amazon—Python microservices backed by PostgreSQL/Redis—so I can contribute from day one.'\n")

        print("5. HOW WOULD YOU APPROACH BUILDING FINCH'S AI FEATURES?")
        print("   'I'd prioritize high-impact, low-complexity wins first: document classification, data")
        print("   extraction from medical records, template-based generation. Then layer in more complex")
        print("   reasoning (settlement valuation, case strategy). At Amazon, I learned to balance research")
        print("   velocity with production reliability—ship incremental AI improvements weekly, not quarterly.'\n")

        print("6. WHAT RISKS DO YOU SEE FOR FINCH?")
        print("   'The biggest risk is trying to compete with Harvey on enterprise legal or Clio on")
        print("   general practice management. Finch's strength is vertical depth in PI. I'd double down")
        print("   on owning that niche—build the best PI intake, case management, and demand generation")
        print("   platform, then expand adjacently (e.g., medical malpractice).'\n")

        print("-"*100)
        print("\nQUESTIONS TO ASK FINCH:\n")

        print("1. 'How do you think about Finch's positioning vs Harvey (custom LLMs) and EvenUp (point solution)?'")
        print("2. 'Are you building proprietary models or staying API-first with OpenAI/Anthropic?'")
        print("3. 'What's the most painful workflow for PI firms that you're automating first?'")
        print("4. 'How do you handle data privacy/security with sensitive medical and legal data?'")
        print("5. 'What does your deployment cadence look like? (Weekly releases, feature flags, etc.)'")
        print("6. 'How are you thinking about the CASEpeer customer base—convert them or greenfield?'")
        print("7. 'What's the biggest technical challenge right now—scale, AI reliability, or product-market fit?'")
        print("8. 'How do you see the competitive landscape evolving in 2-3 years?'")

        print("\n" + "-"*100)
        print("\nCOVER LETTER ANGLE:\n")

        print("'Dear Finch Legal Hiring Team,")
        print()
        print("I'm drawn to Finch Legal because you're solving a problem I've seen firsthand: legacy")
        print("software companies are too slow to integrate AI, while AI-first startups often lack domain")
        print("expertise. Finch sits at the intersection—AI-native infrastructure built specifically for")
        print("personal injury law.")
        print()
        print("At Amazon, I built production ML systems that processed billions of rows daily and supported")
        print("1,102+ weekly model runs. I understand the engineering discipline required to make AI reliable")
        print("in high-stakes environments. Personal injury cases involve people's livelihoods—Finch's AI")
        print("needs to be accurate, explainable, and trustworthy. My experience with FastAPI, PostgreSQL,")
        print("AWS, and ML pipeline orchestration positions me to help Finch scale from Series A to becoming")
        print("the operating system for PI firms.")
        print()
        print("The $200B personal injury industry is ripe for transformation, and I want to be part of the")
        print("team that modernizes it.")
        print()
        print("Looking forward to discussing how my backend and ML platform experience can accelerate")
        print("Finch's mission.")
        print()
        print("Best regards,")
        print("Jason Bian'")


if __name__ == "__main__":
    analyzer = CompetitiveAnalysis()
    results = analyzer.analyze_finch_vs_competitors()

    print("\n" + "="*100)
    print("ANALYSIS COMPLETE")
    print("="*100)
    print("\nCompetitor data cached in company_stacks.json")
    print("Use this research for interview prep and cover letter refinement.")
