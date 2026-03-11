# Implementation Plan — Tool Architecture Refactoring

> **Status:** Ready for implementation
> **Source:** `docs/specs/tool-architecture-spec.md` (v1.0)
> **Test runner:** Vitest — 182 tests across 40 suites (baseline)
> **Convention:** Each task = one commit. Run `npm run build && npm test` between commits.

## Sprint Files

| Sprint | File | Tasks | Description |
| --- | --- | --- | --- |
| **0** | [sprint-0-core-types-registry.md](sprint-0-core-types-registry.md) | 3 | Core types, ToolRegistry, ToolMiddleware |
| **1** | [sprint-1-tool-descriptors.md](sprint-1-tool-descriptors.md) | 3 | 11 tool descriptors + ToolCommand `any` fix |
| **2** | [sprint-2-composition-wiring.md](sprint-2-composition-wiring.md) | 3 | Composition root, route wiring, old code cleanup |
| **3** | [sprint-3-performance-formatting.md](sprint-3-performance-formatting.md) | 2 | CachedBookRepository + SearchBooks RBAC extraction |
| **4** | [sprint-4-qa-hardening.md](sprint-4-qa-hardening.md) | 3 | Integration tests, security verification, architecture checks |

## Dependency Graph

```text
Sprint 0 (core types & registry)
  └──→ Sprint 1 (tool descriptors)
         └──→ Sprint 2 (composition & wiring)
                └──→ Sprint 3 (performance & formatting)
                       └──→ Sprint 4 (QA & hardening)
```

Each sprint is independently deployable. After Sprint 2, the old code path is
fully replaced. Sprints 3–4 are optimizations that can be deferred.

## Summary

| Sprint | Tasks | New Files | Modified Files | New Tests |
| --- | --- | --- | --- | --- |
| **0 — Core Types & Registry** | 3 | 8 | 0 | ~12 (registry + middleware) |
| **1 — Tool Descriptors** | 3 | 11 | 4 | 0 (build verified) |
| **2 — Composition & Wiring** | 3 | 1 | 6 | ~3 (updated policy tests) |
| **3 — Performance & Formatting** | 2 | 2 | 4 | ~7 (cache + formatter) |
| **4 — QA & Hardening** | 3 | 1 | 0 | ~8 (integration + security) |
| **Total** | **14** | **23** | **14** | **~30** |

## Quick Reference — Requirement → Task Mapping

| Requirement Group | Tasks |
| --- | --- |
| TOOL-REG-1 through TOOL-REG-5 | 0.2, 1.1, 1.2, 2.1 |
| TOOL-SEC-1 through TOOL-SEC-3 | 0.2, 0.3, 2.2, 4.2 |
| TOOL-PERF-1, TOOL-PERF-2 | 3.1 |
| TOOL-OBS-1, TOOL-OBS-2 | 0.3 |
| TOOL-SRP-1, TOOL-SRP-2 | 1.1, 1.2, 3.2 |
| TOOL-TYPE-1, TOOL-TYPE-2 | 0.1, 1.3 |
| NEG-TOOL-1 through NEG-TOOL-5 | 2.3, 4.3 |
