# Almoner - Claude Code Instructions

## Project Overview

Almoner is a graph-native platform facilitating the flow of resources—grants, scholarships—to those who can use them, with impact made visible through contribution patterns (Kala).

## First Principles (Inviolable)

1. **Graph is source of truth.** All entities exist as nodes. All relationships are edges. Nothing exists outside the graph.
2. **Kala is contribution pattern, not currency.** Non-transferable. 50 per hour regardless of role.
3. **Ripples, not receipts.** Impact traced through graph relationships, not isolated metrics.
4. **Agents come later.** Build infrastructure first.
5. **Offline-first.** Lower Puna has crappy connectivity.
6. **Capture is ritual.** Volunteers actively claim contributions. Not surveillance.

## Current Phase: Phase 1 - Foundation

### Objectives
1. ✅ Graph Core (FalkorDB connection, schema)
2. ✅ Basic entity types (Funder, Grant, Org, Person)
3. 🔄 Manual data entry for testing

### FalkorDB Connection
```
URL: redis://crossover.proxy.rlwy.net:25504
Graph: almoner
```

## Project Structure

```
/home/user/Almoner/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/               # Configuration
│   ├── types/                # TypeScript types (nodes, edges)
│   ├── utils/                # Shared utilities
│   └── modules/
│       ├── graph-core/       # Module 1: FalkorDB connection, schema, CRUD
│       ├── entity-resolution/ # Module 2: Graphiti integration
│       ├── data-ingestion/   # Module 3: IRS 990, Grants.gov
│       ├── kala-engine/      # Module 4: Contribution patterns
│       ├── ripple-engine/    # Module 5: Impact tracing
│       ├── matching-engine/  # Module 6: Grant matching
│       ├── capture/          # Module 7: Offline-first capture
│       └── mcp-service/      # Module 8: MCP protocol
├── scripts/
│   └── test-connection.ts    # Connection test script
├── docs/
│   ├── SPEC.md               # Full specification
│   ├── FIRST_PRINCIPLES.md   # Inviolable principles
│   └── VIOLATIONS.md         # Anti-patterns to avoid
└── .env                      # Environment configuration
```

## Commands

```bash
# Install dependencies
npm install

# Test FalkorDB connection
npm run test:connection

# Build
npm run build

# Type check
npm run typecheck
```

## Module Boundaries

Each module has strict boundaries. Check before implementing:

| Module | Knows NOTHING About |
|--------|---------------------|
| Graph Core | Kala, matching, ripples, funders, grants |
| Entity Resolution | Kala, matching, UI, volunteers |
| Data Ingestion | Kala, volunteers, UI, matching logic |
| Kala Engine | Grants, matching, funders, ripples |
| Ripple Engine | Ingestion, matching, capture UI |
| Matching Engine | Capture, ripples, ingestion |
| Capture | Grants, matching, funders |
| MCP Service | UI, capture client internals |

## Pre-Implementation Checklist

Before implementing anything:
1. Which module does this belong to?
2. What are the module's dependencies?
3. Does it honor the First Principles?
4. Am I introducing any Violations?
5. Am I staying within module boundaries?

## Violations (STOP if you're doing these)

- ❌ Storing entity data outside FalkorDB
- ❌ Creating parallel "memory" systems
- ❌ Kala as transferable or tradeable
- ❌ Requiring connectivity for capture
- ❌ Passive location tracking
- ❌ Building agents before infrastructure
- ❌ Impact metrics outside graph relationships
