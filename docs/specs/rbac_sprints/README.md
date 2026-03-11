# Implementation Plan — Multi-User Auth, RBAC & Chat History

> **Source:** `docs/specs/multi-user-rbac-spec.md` (v2.3)  
> **Test runner:** Vitest (25 existing test files)  
> **Convention:** Each task = one commit. Run `npm run build && npm test` between commits.

## Sprint Files

| Sprint | File | Tasks | Description |
|--------|------|-------|-------------|
| **0** | [sprint-0-dependency-fixes.md](sprint-0-dependency-fixes.md) | 4 | Dependency violation fixes (clean architecture) |
| **1** | [sprint-1-auth-core.md](sprint-1-auth-core.md) | 8 | Auth core: entities, ports, use cases, adapters |
| **2** | [sprint-2-auth-api-ui.md](sprint-2-auth-api-ui.md) | 4 | Auth API + UI: middleware, routes, pages, nav |
| **3** | [sprint-3-role-aware-llm.md](sprint-3-role-aware-llm.md) | 5 | Role-aware LLM: policy, tools, TTS, switcher |
| **4** | [sprint-4-chat-persistence.md](sprint-4-chat-persistence.md) | 8 | Chat persistence: schema, CRUD, streaming, UI |
| **5** | [sprint-5-polish.md](sprint-5-polish.md) | 5 | Polish: cleanup, errors, loading, observability |

## Dependency Graph

```
Sprint 0 (violations)
  └──→ Sprint 1 (auth core)
         └──→ Sprint 2 (auth API + UI)
                └──→ Sprint 3 (role-aware LLM)
                       └──→ Sprint 4 (chat persistence)
                              └──→ Sprint 5 (polish)
```

Each sprint is independently deployable (the app works after each sprint, just with fewer features).

## Summary

| Sprint | Tasks | New Files | Modified Files | New Tests |
|--------|-------|-----------|----------------|-----------|
| **0 — Violations** | 4 | 1 | 10 | 0 (existing pass) |
| **1 — Auth Core** | 8 | 9 | 3 | ~15 unit + integration |
| **2 — Auth API & UI** | 4 | 7 | 5 | ~8 integration + middleware |
| **3 — Role-Aware LLM** | 5 | 2 | 6 | ~10 unit + integration |
| **4 — Chat Persistence** | 8 | 6 | 3 | ~12 unit + integration |
| **5 — Polish** | 5 | 0 | ~6 | ~3 |
| **Total** | **34** | **25** | **28** | **~48** |

## Quick Reference — Requirement → Task Mapping

| Requirement Group | Tasks |
|-------------------|-------|
| REG-1 through REG-9 | 1.3, 1.4, 1.5, 1.7, 1.8, 2.2, 2.3 |
| AUTH-1 through AUTH-7 | 1.3, 1.6, 1.8, 2.2, 5.1 |
| SESS-1 through SESS-3 | 1.3, 1.6, 1.8, 2.1 |
| MW-1 through MW-6 | 2.1, 3.3 |
| RBAC-1 through RBAC-7 | 3.1, 3.2, 3.3, 3.4 |
| SWITCH-1 through SWITCH-3 | 3.5 |
| CHAT-1 through CHAT-10 | 4.1–4.8, 5.2 |
| UI-1 through UI-7 | 2.3, 2.4, 4.7, 4.8 |
| NEG-SEC-1 through NEG-SEC-8 | 1.3, 1.4, 1.7, 2.1, 4.3, 4.5 |
| NEG-ARCH-1 through NEG-ARCH-6 | 0.1–0.4, 1.7, 2.1, 3.1 |
| NEG-ROLE-1 through NEG-ROLE-4 | 3.3, 3.4, 3.5 |
| NEG-DATA-1 through NEG-DATA-4 | 4.3, 4.6 |
