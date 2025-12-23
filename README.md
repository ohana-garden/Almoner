# Almoner

A graph-native platform facilitating the flow of resources—grants, scholarships—to those who can use them, with impact made visible through contribution patterns.

## First Principles

These are inviolable. Every implementation decision must honor them.

1. **Graph is source of truth.** All entities exist as nodes. All relationships are edges. Nothing exists outside the graph.

2. **Kala is contribution pattern, not currency.** Non-transferable. 50 per hour regardless of role. Records activity, not value judgments.

3. **Ripples, not receipts.** Impact is traced through the graph—upstream attribution, downstream effects. Not isolated metrics.

4. **Agents come later.** Build infrastructure first. Agents without graph are just chatbots.

5. **Offline-first.** Lower Puna has crappy connectivity. Everything must work disconnected and sync when able.

6. **Capture is ritual.** Volunteers actively claim their contribution (tap + photo/video). Not surveillance.

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:
- `FALKORDB_HOST` - FalkorDB server host
- `FALKORDB_PORT` - FalkorDB server port
- `FALKORDB_GRAPH` - Name of the graph database
- `GRAPHITI_ENDPOINT` - Graphiti API endpoint
- `GRAPHITI_API_KEY` - Graphiti API key

## Usage

```typescript
import { initAlmoner } from 'almoner';

async function main() {
  const almoner = await initAlmoner();

  // Create an organization
  const org = await almoner.nodes.orgs.create({
    name: 'Ohana Garden',
    mission: 'Community food security through shared gardens',
    focusAreas: ['food security', 'community development'],
    geoFocus: ['Hawaii', 'Lower Puna'],
    verified: true,
  });

  // Create a person
  const person = await almoner.nodes.persons.create({
    name: 'Alice',
    location: 'Pahoa, HI',
    interests: ['gardening', 'food security'],
    affiliations: [org.id],
  });

  // Record a contribution (generates Kala)
  const contribution = await almoner.kalaEngine.recordContribution(
    person.id,
    120, // 2 hours = 100 Kala
    { projectId: 'some-project-id' }
  );

  console.log(`Alice earned ${contribution.kalaGenerated} Kala`);

  // Find matching grants
  const matches = await almoner.matchingEngine.matchGrantsForOrg(org.id);
  console.log(`Found ${matches.length} matching grants`);

  // Trace impact ripples
  const ripples = await almoner.rippleEngine.traceRipples(org.id, 'Org');
  console.log(`Impact reaches ${ripples.summary.nodesReached} nodes`);
}
```

## Architecture

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
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
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

## Modules

| Module | Purpose |
|--------|---------|
| **Graph Core** | FalkorDB connection, schema enforcement, CRUD |
| **Entity Resolution** | Deduplicate funders/orgs, extract entities from text |
| **Data Ingestion** | Pull from IRS 990s, Grants.gov, foundation websites |
| **Kala Engine** | Calculate and record contribution patterns |
| **Ripple Engine** | Trace impact through graph relationships |
| **Matching Engine** | Match orgs/people to grants/scholarships |
| **Capture** | Offline-first contribution recording |
| **MCP Service** | Expose capabilities to agents via MCP protocol |

## Graph Schema

### Node Types

- `Funder` - Foundations, corporations, government, DAFs, individuals
- `Grant` - Funding opportunities for organizations
- `Scholarship` - Funding opportunities for individuals
- `Org` - Non-profit organizations
- `Person` - Volunteers, applicants, beneficiaries
- `Site` - Physical locations (gardens, distribution sites, etc.)
- `Project` - Initiatives run by organizations
- `Contribution` - Volunteer contribution records (generates Kala)
- `Activity` - Actions enabled by funding
- `Output` - Tangible results of activities
- `FocusArea` - Domains of work (food security, education, etc.)

### Key Relationships

```cypher
(:Funder)-[:OFFERS]->(:Grant)
(:Funder)-[:FUNDED {amount, date}]->(:Org)
(:Org)-[:APPLIED_TO {status}]->(:Grant)
(:Person)-[:CONTRIBUTED]->(:Contribution)
(:Contribution)-[:AT]->(:Site)
(:Grant)-[:ENABLED]->(:Activity)
(:Activity)-[:PRODUCED]->(:Output)
(:Output)-[:DISTRIBUTED_TO]->(:Person)
(:Person)-[:INSPIRED]->(:Contribution)
```

## Kala

Kala is the contribution pattern metric. It is:

- **Non-transferable** - You cannot send Kala to another person
- **Non-tradeable** - You cannot exchange Kala for anything
- **Calculated uniformly** - 50 Kala per hour, regardless of role
- **A record, not a reward** - It shows contribution patterns over time

```typescript
// Kala is ALWAYS calculated this way. No exceptions.
function calculateKala(durationMinutes: number): number {
  return (durationMinutes / 60) * 50;
}
```

## Development

```bash
# Build
npm run build

# Development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Documentation

- [Full Specification](docs/SPEC.md)
- [First Principles](docs/FIRST_PRINCIPLES.md)
- [Violations Guide](docs/VIOLATIONS.md)

## This Is Not

- **Not a CRM.** Graph relationships, not contact management.
- **Not a time tracker.** Kala measures contribution patterns, not productivity.
- **Not a currency.** Kala is non-transferable, non-tradeable.
- **Not a surveillance tool.** Capture is active, intentional, volunteer-controlled.
- **Not an agent platform yet.** Infrastructure first.

## License

MIT
