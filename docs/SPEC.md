# Almoner Specification

A graph-native platform facilitating the flow of resources—grants, scholarships—to those who can use them, with impact made visible through contribution patterns.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   PWA       │  │  Native App │  │  Agent Consumers    │  │
│  │  (entry)    │  │  (full)     │  │  (future)           │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Interface                           │
│         (queries, mutations, sync endpoint)                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Matching  │  │    Kala     │  │   Ripple            │  │
│  │   Engine    │  │   Engine    │  │   Engine            │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Graph Layer (Graphiti)                    │
│         (entity resolution, knowledge extraction)            │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage (FalkorDB)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Graph Schema

### Node Types

| Node | Purpose | Key Properties |
|------|---------|----------------|
| `Funder` | Foundations, corporations, etc. that provide funding | name, type, focusAreas, totalGiving |
| `Grant` | Funding opportunity for organizations | title, amount, deadline, eligibility |
| `Scholarship` | Funding opportunity for individuals | title, amount, deadline, eligibility |
| `Org` | Non-profit organizations | name, ein, mission, focusAreas |
| `Person` | Volunteers, applicants, beneficiaries | name, location, interests |
| `Site` | Physical locations for contributions | name, location, nfcTagId |
| `Project` | Initiatives run by organizations | name, description, focusAreas |
| `Contribution` | Volunteer contribution records | timestamp, duration, kalaGenerated |
| `Activity` | Actions enabled by funding | type, description, timestamp |
| `Output` | Tangible results of activities | type, quantity, unit |
| `FocusArea` | Domains of work | name, description |

### Edge Types

#### Funding Flow
- `(:Funder)-[:OFFERS]->(:Grant)`
- `(:Funder)-[:OFFERS]->(:Scholarship)`
- `(:Funder)-[:FUNDED {amount, date}]->(:Org)`
- `(:Funder)-[:FUNDED {amount, date}]->(:Person)`
- `(:Funder)-[:FOCUSES_ON]->(:FocusArea)`

#### Applications
- `(:Org)-[:APPLIED_TO {status, date}]->(:Grant)`
- `(:Person)-[:APPLIED_TO {status, date}]->(:Scholarship)`

#### Organizational
- `(:Org)-[:RUNS]->(:Project)`
- `(:Project)-[:LOCATED_AT]->(:Site)`
- `(:Org)-[:SPONSORED_BY]->(:Org)`

#### People
- `(:Person)-[:MEMBER_OF]->(:Org)`
- `(:Person)-[:CONTRIBUTED]->(:Contribution)`
- `(:Contribution)-[:AT]->(:Site)`
- `(:Contribution)-[:FOR]->(:Project)`

#### Impact Ripples
- `(:Grant)-[:ENABLED]->(:Activity)`
- `(:Activity)-[:CONTRIBUTED_BY]->(:Person)`
- `(:Activity)-[:PRODUCED]->(:Output)`
- `(:Output)-[:DISTRIBUTED_TO]->(:Person)`
- `(:Person)-[:INSPIRED]->(:Contribution)`

---

## Modules

### Module 1: Graph Core
**Purpose:** FalkorDB connection, schema enforcement, basic CRUD
**Dependencies:** FalkorDB
**Knows nothing about:** Kala, matching, ripples, funders, grants

### Module 2: Entity Resolution (Graphiti Integration)
**Purpose:** Deduplicate funders/orgs from multiple sources, extract entities from text
**Dependencies:** Graphiti, Graph Core
**Knows nothing about:** Kala, matching, UI, volunteers

### Module 3: Data Ingestion
**Purpose:** Pull from grant sources, 990s, etc., feed to Entity Resolution
**Dependencies:** Entity Resolution, Graph Core
**Sources:** IRS 990 bulk data, Grants.gov API, Foundation websites
**Knows nothing about:** Kala, volunteers, UI, matching logic

### Module 4: Kala Engine
**Purpose:** Calculate and record Kala from contributions
**Dependencies:** Graph Core
**Rules:** Kala = (duration / 60) * 50, always. Never transfer, never trade.
**Knows nothing about:** Grants, matching, funders, ripples

### Module 5: Ripple Engine
**Purpose:** Trace impact through graph, generate ripple visualizations
**Dependencies:** Graph Core
**Knows nothing about:** Ingestion, matching, capture UI

### Module 6: Matching Engine
**Purpose:** Match orgs/people to grants/scholarships
**Dependencies:** Graph Core
**Knows nothing about:** Capture, ripples, ingestion

### Module 7: Capture (Offline-First)
**Purpose:** Record contributions from volunteers
**Dependencies:** Graph Core (for sync), Kala Engine
**Offline behavior:** All data stored locally, Kala calculated locally, sync when able
**Knows nothing about:** Grants, matching, funders

### Module 8: MCP Service
**Purpose:** Expose Almoner capabilities to agents and external consumers
**Dependencies:** All engines
**Knows nothing about:** UI, capture client internals

---

## Build Order

### Phase 1: Foundation
1. Graph Core (FalkorDB connection, schema)
2. Basic entity types (Funder, Grant, Org, Person)
3. Manual data entry for testing

### Phase 2: Data Flow
4. Entity Resolution (Graphiti integration)
5. Data Ingestion (990s first, then Grants.gov)
6. Scheduled updates

### Phase 3: Matching
7. Matching Engine
8. Basic query interface (CLI or simple API)

### Phase 4: Contribution Tracking
9. Kala Engine
10. Capture (PWA first)
11. Contribution → Kala flow working

### Phase 5: Impact
12. Ripple Engine
13. Visualization (ripple graphs)
14. Funder-facing reports

### Phase 6: Native + Polish
15. Native app (Expo/React Native)
16. NFC integration
17. Push notifications

### Phase 7: MCP + Agents
18. MCP Service
19. Agent integration (Agent Zero)
20. Agent-per-user model

---

## Technology Choices

- **Graph DB:** FalkorDB (Redis-compatible, Cypher queries)
- **Entity Resolution:** Graphiti
- **Backend Runtime:** Node.js / TypeScript
- **PWA:** React + Service Worker + IndexedDB
- **Native:** Expo / React Native
- **MCP:** Standard MCP protocol

---

## Kala Rules

```typescript
// Kala is ALWAYS calculated this way. No exceptions.
function calculateKala(durationMinutes: number): number {
  return (durationMinutes / 60) * 50;
}

// Kala is queryable but never transferable
// "How much Kala has this person generated?" = valid
// "Transfer 50 Kala to another person" = INVALID, not possible
```

---

## This Is Not

- **Not a CRM.** Graph relationships, not contact management.
- **Not a time tracker.** Kala measures contribution patterns, not productivity.
- **Not a currency.** Kala is non-transferable, non-tradeable.
- **Not a surveillance tool.** Capture is active, intentional, volunteer-controlled.
- **Not an agent platform yet.** Infrastructure first.
