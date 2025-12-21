# Almoner First Principles

These are inviolable. Every implementation decision must honor them.

---

## 1. Graph is source of truth

All entities exist as nodes. All relationships are edges. **Nothing exists outside the graph.**

### What this means:
- Every Funder, Grant, Org, Person, Project, Site, Contribution, etc. is a node in FalkorDB
- Every relationship (OFFERS, FUNDED, CONTRIBUTED, etc.) is an edge
- No parallel data stores, no "memory" systems outside the graph
- If it's not in the graph, it doesn't exist

### Implementation:
- All CRUD operations go through `GraphConnection`
- Entity Resolution ensures deduplication before insertion
- Schema enforcement validates node and edge types

---

## 2. Kala is contribution pattern, not currency

Non-transferable. 50 per hour regardless of role. Records activity, not value judgments.

### What this means:
- Kala measures the *pattern* of someone's contributions over time
- Everyone earns Kala at the same rate: 50 per hour
- There is no way to transfer Kala from one person to another
- There is no way to trade or exchange Kala
- Kala is not a reward—it's a record

### Implementation:
```typescript
function calculateKala(durationMinutes: number): number {
  return (durationMinutes / 60) * 50;
}
```

- The `KalaEngine` never has any "transfer" functions
- Kala is always derived from Contribution nodes, never set directly
- Leaderboards are for visibility, not competition

---

## 3. Ripples, not receipts

Impact is traced through the graph—upstream attribution, downstream effects. Not isolated metrics.

### What this means:
- When a Funder gives a Grant, we trace what that Grant enabled
- Activities lead to Outputs which reach People who may be inspired to Contribute
- Impact is visible as paths through the graph, not standalone numbers
- A Funder can see the full ripple of their giving

### Implementation:
- `RippleEngine` traverses the graph to trace impact paths
- Upstream attribution: Grant ← Funder
- Downstream effects: Grant → Activity → Output → Person → Contribution

---

## 4. Agents come later

Build infrastructure first. Agents without graph are just chatbots.

### What this means:
- The graph infrastructure must be solid before adding agent capabilities
- MCP Service exposes capabilities, but the core is graph-native
- Don't build agent features until Phases 1-5 are complete
- Agent integration is Phase 7

### Implementation:
- Build order is strictly followed
- MCP Service is Module 8 (last)
- Focus on Graph Core, Engines, and Capture first

---

## 5. Offline-first

Lower Puna has crappy connectivity. Everything must work disconnected and sync when able.

### What this means:
- The Capture module works entirely offline
- Kala is calculated locally, no server required
- Data syncs when connectivity is available
- Users never lose their contribution data

### Implementation:
- `CaptureManager` stores everything in IndexedDB
- `SyncService` handles background sync when online
- Contribution nodes have a `synced` flag
- UI never blocks on network requests for capture

---

## 6. Capture is ritual

Volunteers actively claim their contribution (tap + photo/video). Not surveillance.

### What this means:
- Contributions are only recorded when volunteers explicitly act
- NFC tap is an intentional gesture
- Photo/video is optional evidence, not surveillance
- No passive location tracking
- No automatic time tracking

### Implementation:
- `CaptureManager.startSession()` requires explicit action
- `handleNfcTap()` is triggered by deliberate tap
- Media is optional and volunteer-controlled
- No background location tracking

---

## Pre-Task Checklist

Before implementing anything, answer:

1. **Which module does this belong to?**
2. **What are that module's dependencies (interfaces only)?**
3. **Does this implementation honor the First Principles?**
4. **Am I introducing any Violations?**
5. **Am I staying within this module's "knows nothing about" boundaries?**
