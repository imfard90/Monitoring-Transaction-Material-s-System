---
name: codebase-design
description: Deep module design discipline: lot of behaviour behind small interface, placed at clean seam, testable through interface. Use when designing new modules, refactoring across boundaries, or evaluating architecture decisions.
---

# Codebase Design

## Vocabulary

| Term | Meaning |
|------|---------|
| **Module** | Unit of compilation with private internals and public interface |
| **Interface** | Public API: functions, types, constants exported from module |
| **Implementation** | Private code behind the interface; can change without breaking callers |
| **Seam** | Boundary where two modules meet; testable without implementation details |
| **Locality** | How much context you need to understand a change; high locality = less context needed |

## Core Principles

### 1. Lot of behaviour behind small interface
- Export minimal surface: only what callers need
- Hide: helpers, constants, internal types, implementation classes
- **Test:** Can you describe the module's purpose in one sentence without mentioning internals?

### 2. Clean seam
- Seams are explicit: function signatures, interface types, event contracts
- No implicit coupling: global state, singletons, module-level side effects
- **Test:** Can you swap implementation behind interface without touching callers?

### 3. Testable through interface
- All behavior reachable via public API
- No "test-only" exports or internal access in tests
- **Test:** Integration tests use only public interfaces

### 4. Deletion test
- If you deleted this module, what breaks?
- Good module: breaks exactly one coherent feature
- Bad module: breaks scattered things (low cohesion) or nothing (dead code)

### 5. ONE adapter rule
- One module adapts external system (DB, API, FS) to internal interface
- All other modules depend on internal interface, never external directly
- **Test:** Zero imports of `pg`, `googleapis`, `fs` outside adapter modules

### 6. Deepening cluster
- Related modules form cluster with shared internal protocol
- External callers see single facade module
- Internal modules can refactor freely within cluster

### 7. Design it twice
- First design: make it work (throwaway prototype OK)
- Second design: make it right (apply principles above)
- **Never ship first design**

## Design Review Checklist

Before committing a new module or seam change:

- [ ] Interface fits on one screen (<50 lines exports)
- [ ] Zero implementation types leaked in interface
- [ ] Single adapter for each external system
- [ ] Cluster has facade; internals not imported outside
- [ ] Integration tests use only public API
- [ ] Deletion breaks exactly one feature
- [ ] ADR written if: hard reverse, surprising, real trade-off

## MTMS Application

| Layer | Module Pattern |
|-------|----------------|
| **Server Actions** | `*-queries.ts` (read) + `*-commands.ts` (write) + barrel re-export |
| **Repository** | `createXRepository(db)` factory → interface with `findAll`, `findById`, `create`, `update`, `delete` |
| **External API** | `*-api.service.ts` (adapter) → internal types only in callers |
| **Database** | SP in `inventory` schema → repository calls SP, never raw SQL |
| **UI Components** | Primitives in `src/components/ui/` (generic) → feature components compose them |

## Red Flags

- Interface exports implementation classes
- Tests import private helpers
- Multiple modules import same external library directly
- Change requires touching >3 files across layers
- No facade for cluster of related modules

## When to Use This Skill

- Creating new feature module
- Refactoring across module boundaries
- Reviewing PR that changes interfaces
- Writing ADR for architectural decision