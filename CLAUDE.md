# Allocation Agent

## Overview
Multi-domain entity extraction service covering various domains (I.E. financial research, job boards, and travel planning such as trip/ski resorts/passes etc)

## Architecture - Agent Extraction Skill

### Domain Model
- **Domains** have **required fields** (manually defined) and **optional fields** (LLM/agent-managed)
- Domains: financial research, job boards, trip/travel/ski
- Sub-domains can define additional optional entities

### Processing Pipeline
1. **Extract** — grab entities from source data
2. **Rule Engine Match** — match extracted entities against domain-required fields
3. **DQ Surface** — missing required fields become manual workflow items for resolution
4. **Scored Coverage** — union on scored entities; data inside expected bounds or flagged as DQ event

### Entity Types
1. **Defined Domain Entities** — required ingestion with matched coverage (e.g., CRWN timestamps matched against options chain data, earnings, news)
2. **Found Entities** — scored at x% coverage, reviewed, reusable across verticals in future scrapes

### Coding Patterns
- Functional chains using defined domain models
- Surface data quality (DQ) issues explicitly
- Task workflow triggers with support for loops and ad-hoc test runs
- Once a source/entity is defined, future scrapes across other verticals should yield x% match — track defined vs found entity coverage separately

### Key Concepts
- Unions on scored entities: entity/chain data should fall inside expected range or trigger DQ event
- Required fields per domain are manually defined; LLMs/agent runs manage optional types and class structures
- Two coverage tiers: (1) defined domains with required ingestion + matched coverage, (2) found entities with scored + reviewed coverage for later use

## Architecture - Agent Submission Skill

* Email Reconciliation and verification codes
* Auto-fill, etc

[In-Progress]

## Architecture - Agent Permissions

[In-Progress]

## Usage

* Other services can call this service and skills via workflow runners
* These skills and services can also be ran ad-hoc




