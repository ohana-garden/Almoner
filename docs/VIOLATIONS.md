# Almoner Violations

If you find yourself doing any of these, **stop and reconsider**.

---

## Graph Violations

### ❌ Storing entity data outside FalkorDB
**WRONG.** All entities must be nodes in the graph.

Examples of violations:
- Keeping a separate SQLite database for "fast lookups"
- Storing user preferences in localStorage instead of Person nodes
- Caching entity data in Redis outside the graph

**Correct approach:** Use FalkorDB indexes for fast lookups. Everything in the graph.

---

### ❌ Creating a separate "memory" system parallel to the graph
**WRONG.** The graph IS the memory.

Examples of violations:
- Building a vector database for "agent memory"
- Using a document store for "conversation history"
- Creating a separate knowledge base

**Correct approach:** Agent context should reference graph nodes and relationships.

---

### ❌ Impact metrics that don't trace through graph relationships
**WRONG.** Impact is ripples through the graph.

Examples of violations:
- "This grant resulted in 50 volunteer hours" (standalone metric)
- Counting outputs without tracing to the enabling Grant
- Reporting impact without showing the path

**Correct approach:** Use `RippleEngine` to trace paths. Show the chain.

---

## Kala Violations

### ❌ Kala as transferable or tradeable
**WRONG.** Kala is non-transferable.

Examples of violations:
- "Transfer 50 Kala from Alice to Bob"
- "Exchange Kala for rewards"
- "Pool Kala between team members"

**Correct approach:** Kala is calculated from Contributions. Query it, don't move it.

---

### ❌ Variable Kala rates
**WRONG.** 50 per hour, regardless of role.

Examples of violations:
- "Managers earn 75 Kala per hour"
- "Skilled volunteers earn more Kala"
- "Bonus Kala for difficult tasks"

**Correct approach:** Everyone earns exactly `(duration / 60) * 50`.

---

## Capture Violations

### ❌ Requiring connectivity for contribution capture
**WRONG.** Capture must work offline.

Examples of violations:
- Showing "No internet connection" error when capturing
- Requiring server validation before recording
- Losing contributions when offline

**Correct approach:** Store locally, sync later. Never block on network.

---

### ❌ Passive location tracking without explicit volunteer action
**WRONG.** Capture is ritual, not surveillance.

Examples of violations:
- Background GPS tracking
- Automatic check-in when entering a geofence
- Continuous location monitoring

**Correct approach:** Explicit NFC tap or manual session start. No passive tracking.

---

### ❌ Automatic time tracking
**WRONG.** Volunteers claim their contributions.

Examples of violations:
- Starting a timer automatically when phone detects a site
- Calculating time from location data
- "We noticed you were at the garden for 3 hours"

**Correct approach:** Volunteer starts and ends session explicitly.

---

## Architecture Violations

### ❌ Building agent features before graph infrastructure exists
**WRONG.** Infrastructure first.

Examples of violations:
- Adding chat features before Matching Engine works
- Building "AI recommendations" before Ripple Engine
- Creating agent personas before MCP Service

**Correct approach:** Follow the build order. Phases 1-5 before Phase 7.

---

### ❌ Module boundary violations
**WRONG.** Modules have defined boundaries.

Examples of violations:
- `KalaEngine` querying for Grants (knows nothing about grants)
- `DataIngestion` calculating Kala (knows nothing about Kala)
- `Capture` accessing matching results (knows nothing about matching)

**Correct approach:** Check the module's "knows nothing about" list.

---

## Quick Reference: Module Boundaries

| Module | Knows Nothing About |
|--------|-------------------|
| Graph Core | Kala, matching, ripples, funders, grants |
| Entity Resolution | Kala, matching, UI, volunteers |
| Data Ingestion | Kala, volunteers, UI, matching logic |
| Kala Engine | Grants, matching, funders, ripples |
| Ripple Engine | Ingestion, matching, capture UI |
| Matching Engine | Capture, ripples, ingestion |
| Capture | Grants, matching, funders |
| MCP Service | UI, capture client internals |

---

## When in Doubt

Ask yourself:

1. Does this store data outside the graph? → **Violation**
2. Does this transfer or trade Kala? → **Violation**
3. Does this require connectivity for capture? → **Violation**
4. Does this track without explicit action? → **Violation**
5. Does this build agents before infrastructure? → **Violation**
6. Does this cross module boundaries? → **Violation**
