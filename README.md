# AI Orchestration Product Library

<!-- portfolio-curation -->
## Portfolio Overview
Product development library and reference project for spec-driven AI orchestration work.

## What This Demonstrates
- Product systems
- AI orchestration
- specification-driven delivery

## Stack
TypeScript, Next.js

## Portfolio Status
This repository is part of Keith Williams' curated public portfolio. The README has been updated to explain the project purpose, technical focus, and why the work is worth reviewing.
<!-- /portfolio-curation -->

---

## Original Notes

# The Product Development Library

<div align="center">

![Book Cover — Language as Executable Architecture](docs/software-engineering-book/cover-language-as-architecture.png)

**A 10-book series on professional product development in the AI era — with a working codebase that proves every claim.**

[Browse the Books](#the-series) · [Try the Prompts](#-prompt-companions) · [Run the Code](#getting-started) · [Read the Model's Preface](docs/software-engineering-book/PREFACE-FROM-THE-MODEL.md)

</div>

---

## The Thesis

Intelligence is concentrated energy. When you give an AI vague direction, you get vague output. When you give it precise constraints — named frameworks, explicit scope, testable acceptance criteria — the probability distribution narrows and the output sharpens. The same principle applies to human teams: shared vocabulary, documented principles, and proven patterns amplify capability.

This series applies that thesis across the full product development lifecycle: from software engineering through design, UX, product management, accessibility, entrepreneurship, marketing, content strategy, and data analytics. Each book grounds its principles in practitioner stories—the people who built the vocabulary we use today.

This repository is both the library and the proof: a **production-grade Next.js + MCP application** built using the principles described in the texts.

## Quality Baseline

These are not aspirational targets. They are the current state, enforced on every commit by `npm run quality` ([Chapter 9](docs/software-engineering-book/chapters/ch09-risk-safety-and-governance.md)).

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript strict | `npm run typecheck` | 0 errors |
| ESLint zero-warnings | `npm run lint:strict` | 0 warnings |
| Test suite | `npm test` | 67/67 passing |
| Lighthouse Performance | `npm run lhci:dev` | 98 / 100 |
| Lighthouse Accessibility | | 100 / 100 |
| Lighthouse Best Practices | | 100 / 100 |
| Lighthouse SEO | | 100 / 100 |

---

## Getting Started

```bash
# 1. Install
npm install

# 2. Configure
export ANTHROPIC_API_KEY="your-key"
export ANTHROPIC_MODEL="claude-haiku-4-5"

# 3. Run
npm run dev

# 4. Verify — the same composite gate used throughout the book
npm run quality          # typecheck + lint:strict + test
npm run lhci:dev         # Lighthouse against localhost

# 5. Production parity (optional)
docker compose up --build
```

---

## What's in This Repository

```text
├── docs/
│   ├── software-engineering-book/   ← Book I: 14 chapters + 14 prompt companions + editorial
│   ├── design-book/                 ← Book II: 10 chapters on design history
│   ├── ui-design-book/              ← Book III: 10 chapters on UI engineering
│   ├── ux-design-book/              ← Book IV: 10 chapters on UX design
│   ├── product-management-book/     ← Book V: 10 chapters on product management
│   ├── accessibility-book/          ← Book VI: 10 chapters on accessibility
│   ├── entrepreneurship-book/       ← Book VII: 10 chapters on entrepreneurship
│   ├── marketing-branding-book/     ← Book VIII: 10 chapters on marketing & branding
│   ├── content-strategy-book/       ← Book IX: 10 chapters on content strategy
│   ├── data-analytics-book/         ← Book X: 10 chapters on data & analytics
│   ├── operations/                  ← Runbooks, environment matrix, process model
│   └── _planning/                   ← Series architecture & book plans (internal)
├── src/                             ← Next.js application (Claude chat + MCP tools)
├── mcp/                             ← MCP tool servers (calculator, typed schemas)
├── scripts/                         ← 10 operational scripts (health, secrets, release)
├── sprints/completed/               ← 23 archived sprint artifacts with evidence
└── tests/                           ← 67 tests across unit, integration, policy
```

---

## The Series

Ten books covering the full product development lifecycle. Each chapter follows the same convention: **Practitioner Story → Principle → Engineering Connection → Repository Example → Checklist.** Every Book's Chapter 9 connects its discipline to AI and the intelligence concentration thesis.

### Book I — Software Engineering

Fourteen chapters developing engineering judgment through the human stories behind six decades of foundational frameworks, applied to this codebase with verifiable evidence.

> **How to read:** Each chapter links to its text and its prompt companion. Read the chapter for the principle, then use the prompt companion to practice it — each contains good/bad prompt pairs with candid "behind the curtain" commentary from the model.

| # | Chapter | Prompt Companion |
| --- | --------- | ----------------- |
| 0 | [The People Behind the Principles](docs/software-engineering-book/chapters/ch00-the-people-behind-the-principles.md) | [5 prompts](docs/software-engineering-book/prompts/ch00-prompts-the-people-behind-the-principles.md) |
| | *Hoare, Dijkstra, Knuth, Brooks, Liskov, Berners-Lee, and more.* | |
| 1 | [Why This Moment Matters](docs/software-engineering-book/chapters/ch01-why-this-moment-matters.md) | [4 prompts](docs/software-engineering-book/prompts/ch01-prompts-why-this-moment-matters.md) |
| 2 | [A Brief History of Control Surfaces](docs/software-engineering-book/chapters/ch02-history-of-control-surfaces.md) | [4 prompts](docs/software-engineering-book/prompts/ch02-prompts-history-of-control-surfaces.md) |
| 3 | [Prompt Orchestration Primitives](docs/software-engineering-book/chapters/ch03-prompt-orchestration-primitives.md) | [7 prompts](docs/software-engineering-book/prompts/ch03-prompts-orchestration-primitives.md) |
| 4 | [Named Frameworks as Compressed Programs](docs/software-engineering-book/chapters/ch04-named-frameworks-as-compressed-programs.md) | [5 prompts](docs/software-engineering-book/prompts/ch04-prompts-named-frameworks-as-compressed-programs.md) |
| 5 | [The Audit-to-Sprint Execution Loop](docs/software-engineering-book/chapters/ch05-audit-to-sprint-loop.md) | [7 prompts](docs/software-engineering-book/prompts/ch05-prompts-audit-to-sprint-loop.md) |
| 6 | [12-Factor in the LLM Era](docs/software-engineering-book/chapters/ch06-12-factor-in-the-llm-era.md) | [5 prompts](docs/software-engineering-book/prompts/ch06-prompts-12-factor-in-the-llm-era.md) |
| 7 | [GoF Patterns for AI-Native Systems](docs/software-engineering-book/chapters/ch07-gof-for-ai-native-systems.md) | [5 prompts](docs/software-engineering-book/prompts/ch07-prompts-gof-for-ai-native-systems.md) |
| 8 | [Observability, Feedback, and Evals](docs/software-engineering-book/chapters/ch08-observability-feedback-and-evals.md) | [5 prompts](docs/software-engineering-book/prompts/ch08-prompts-observability-feedback-evals.md) |
| 9 | [Risk, Safety, and Operational Governance](docs/software-engineering-book/chapters/ch09-risk-safety-and-governance.md) | [5 prompts](docs/software-engineering-book/prompts/ch09-prompts-risk-safety-governance.md) |
| 10 | [Case Study: IS601 Demo](docs/software-engineering-book/chapters/ch10-case-study-is601-demo.md) | [5 prompts](docs/software-engineering-book/prompts/ch10-prompts-case-study-is601-demo.md) |
| 11 | [Team Operating Model](docs/software-engineering-book/chapters/ch11-team-operating-model.md) | [5 prompts](docs/software-engineering-book/prompts/ch11-prompts-team-operating-model.md) |
| 12 | [Future Directions](docs/software-engineering-book/chapters/ch12-future-directions.md) | [4 prompts](docs/software-engineering-book/prompts/ch12-prompts-future-directions.md) |
| 13 | [MCP + Next.js: Architecture and Capability Roadmap](docs/software-engineering-book/chapters/ch13-mcp-nextjs-architecture-and-capability-roadmap.md) | [5 prompts](docs/software-engineering-book/prompts/ch13-prompts-mcp-nextjs-architecture.md) |

---

### Book II — Design History

Ten chapters tracing the visual design decisions that shaped modern interfaces — from De Stijl's mathematical grids to fluid CSS calculus.

| # | Chapter |
| --- | --------- |
| 0 | [Before the Bauhaus — The People Who Mathematized Art](docs/design-book/chapters/ch00-before-the-bauhaus.md) |
| 1 | [The Bauhaus Experiment — Typography as Infrastructure](docs/design-book/chapters/ch01-bauhaus-and-the-machine.md) |
| 2 | [The Swiss Grid — Spatial Rhythm and Mathematics](docs/design-book/chapters/ch02-the-swiss-grid.md) |
| 3 | [Postmodernism and Rebellion — Why We Break the Grid](docs/design-book/chapters/ch03-postmodernism-and-rebellion.md) |
| 4 | [The Digital Transition — Translating Physics to Pixels](docs/design-book/chapters/ch04-the-digital-transition.md) |
| 5 | [Skeuomorphism to Flat Design — Reducing the Noise](docs/design-book/chapters/ch05-skeuomorphism-to-flat-design.md) |
| 6 | [The Motion and Fluid Web Era — Design as a Calculus](docs/design-book/chapters/ch06-the-motion-and-fluid-era.md) |
| 7 | [Color Theory — From Newton to OKLCH](docs/design-book/chapters/ch07-color-theory.md) |
| 8 | [Typography — From Gutenberg to Variable Fonts](docs/design-book/chapters/ch08-typography.md) |
| 9 | [Industrial Design — From Loewy to Rams](docs/design-book/chapters/ch09-industrial-design.md) |

---

### Books III–X

| Book | Topic | Chapters | Key Practitioners |
| ------ | ------- | :--------: | ------------------- |
| **III** | [UI Design](docs/ui-design-book/chapters/) | 10 | Engelbart, Raskin, Tesler, Shneiderman, Tufte, Frost, Norman, Krug |
| **IV** | [UX Design](docs/ux-design-book/chapters/) | 10 | Nielsen, Hall, Miller, Kahneman, Cooper, Christensen, Torres |
| **V** | [Product Management](docs/product-management-book/chapters/) | 10 | Cagan, Porter, Dunford, Ries, Doerr, Ramanujam, Bush |
| **VI** | [Accessibility](docs/accessibility-book/chapters/) | 10 | Ed Roberts, Kat Holmes, Léonie Watson |
| **VII** | [Entrepreneurship](docs/entrepreneurship-book/chapters/) | 10 | Graham, Thiel, Blank, Fitzpatrick, Osterwalder |
| **VIII** | [Marketing & Branding](docs/marketing-branding-book/chapters/) | 10 | Ries & Trout, Pulizzi, Miller (StoryBrand) |
| **IX** | [Content Strategy](docs/content-strategy-book/chapters/) | 10 | Halvorson, Mailchimp Style Guide |
| **X** | [Data & Analytics](docs/data-analytics-book/chapters/) | 10 | Kaushik, Tufte |

---

## 📋 Prompt Companions

**71 prompt pairs across 14 companion documents.** Each pair shows a bad prompt and a good prompt for the same task, with candid "Behind the Curtain" commentary where the model explains — in its own voice — what it actually does when it receives each one.

> *"When your context window contains vague intent, broad scope, and no acceptance criteria, the most probable output is generic, plausible, and often subtly wrong. When it contains a named framework, explicit scope boundaries, clear invariants, and testable acceptance criteria, the probability distribution narrows dramatically. The difference is not magic. It is math."*
>
> — [Preface from the Model](docs/software-engineering-book/PREFACE-FROM-THE-MODEL.md)

| If you are... | Start here |
| --- | --- |
| Writing your first structured prompt | [Ch 3 — Primitives](docs/software-engineering-book/prompts/ch03-prompts-orchestration-primitives.md) |
| Running an audit or sprint | [Ch 5 — Audit-to-Sprint Loop](docs/software-engineering-book/prompts/ch05-prompts-audit-to-sprint-loop.md) |
| Hardening a deployment | [Ch 6 — 12-Factor](docs/software-engineering-book/prompts/ch06-prompts-12-factor-in-the-llm-era.md) |
| Refactoring architecture | [Ch 7 — GoF Patterns](docs/software-engineering-book/prompts/ch07-prompts-gof-for-ai-native-systems.md) |
| Setting up quality gates | [Ch 9 — Governance](docs/software-engineering-book/prompts/ch09-prompts-risk-safety-governance.md) |
| Working solo or in an unfamiliar domain | [Ch 11 — CEO Operating Model](docs/software-engineering-book/prompts/ch11-prompts-team-operating-model.md) |
| Designing MCP tools | [Ch 13 — MCP Architecture](docs/software-engineering-book/prompts/ch13-prompts-mcp-nextjs-architecture.md) |

---

## Architecture

![MCP Architecture — Three-Layer Split](docs/software-engineering-book/mcp-architecture-diagram.png)

| Layer | Responsibility | Location |
| --- | --- | --- |
| **Next.js** | UI, API routes, orchestration policy, provider wiring | `src/` |
| **MCP Protocol** | Typed tool schemas, deterministic execution contracts | `mcp/` |
| **Operations** | Health, secrets, release integrity, admin workflows | `scripts/` |

---

## Sprint Archive

This project's evolution is fully documented across **23 sprint artifacts** in [`sprints/completed/`](sprints/completed/). The four-phase sequence from [Chapter 10](docs/software-engineering-book/chapters/ch10-case-study-is601-demo.md):

| Phase | Sprints | What was built |
| --- | --- | --- |
| **Feature Delivery** | 00–03 | Testing foundation, secret safety, chat policy, calculator tool |
| **Structural Cleanup** | 04–07 | SRP refactor, streaming hardening, UI hook separation, type safety |
| **12-Factor Hardening** | 12f-01–09 | Config/secrets, backing services, build/release/run, disposability, parity, logs, admin |
| **GoF Extensibility** | gof-01–02 | Observer + Decorator + Chain of Responsibility, Template Method + Facade |

---

## Operational Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| Environment validation | `npm run admin:validate-env` | Startup config check |
| Secret scanning | `npm run scan:secrets` | CI-ready secret detection |
| Stateless runtime assertion | `npm run check:stateless` | Verify no local state leaks |
| Environment parity | `npm run parity:env` | Dev/staging/prod config alignment |
| Health sweep | `npm run admin:health` | Readiness + liveness endpoints |
| Diagnostics | `npm run admin:diagnostics` | Full system diagnostic |
| Release manifest | `npm run release:prepare` | Build + generate manifest |
| Release verify | `npm run release:verify` | Validate manifest before deploy |

See [`docs/operations/`](docs/operations/) for runbooks, environment matrix, and process model.

---

## Reference Materials

| Resource | Location |
| --- | --- |
| Model preface (fourth wall) | [`PREFACE-FROM-THE-MODEL.md`](docs/software-engineering-book/PREFACE-FROM-THE-MODEL.md) |
| Book QA report | [`BOOK-QA.md`](docs/software-engineering-book/BOOK-QA.md) |
| Audience value audit | [`BOOK-AUDIENCE-AUDIT.md`](docs/software-engineering-book/BOOK-AUDIENCE-AUDIT.md) |
| Editorial — Book I (14 chapters) | [`docs/software-engineering-book/editorial/`](docs/software-engineering-book/editorial/) |
| Editorial — Book II (10 chapters) | [`docs/design-book/editorial/`](docs/design-book/editorial/) |
| Design research images | [`docs/design-book/research/`](docs/design-book/research/) |
| Series architecture & plans | [`docs/_planning/`](docs/_planning/) |
| Operations runbooks | [`docs/operations/`](docs/operations/) |
| Sprint archive (23 sprints) | [`sprints/completed/`](sprints/completed/) |
| Runtime scripts (10) | [`scripts/`](scripts/) |

