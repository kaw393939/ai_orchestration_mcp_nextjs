# Language as Executable Architecture

<div align="center">

![Book Cover — Language as Executable Architecture](docs/book/cover-language-as-architecture.png)

**A book on professional software engineering in the AI era — with a working codebase that proves every claim.**

[Read the Chapters](#book-i--ai-orchestration-engineering) · [Try the Prompts](#-prompt-companions) · [Run the Code](#getting-started) · [Read the Model's Preface](docs/book/PREFACE-FROM-THE-MODEL.md)

</div>

---

## The Thesis

There is a layer of software engineering that separates engineers who write code from engineers who build systems that last. It is not about syntax or algorithms. It is about design discipline, operational thinking, and architectural judgment — the craft that determines whether a system stays maintainable under change, team growth, and production pressure.

AI makes this layer more visible and more urgent. Engineers who have developed craft use AI as a force multiplier. Engineers who haven't generate code faster without being able to tell whether it will survive contact with reality.

This repository is both the book and the proof: a **production-grade Next.js + MCP application** built and refactored using every principle described in the text, with 23 sprint archives, 14 prompt companion documents containing 71 prompt pairs, and a composite quality gate you can run yourself.

## Quality Baseline

These are not aspirational targets. They are the current state, enforced on every commit by `npm run quality` ([Chapter 9](docs/book/chapters/ch09-risk-safety-and-governance.md)).

| Gate | Command | Result |
|---|---|---|
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

```
├── docs/book/
│   ├── PREFACE-FROM-THE-MODEL.md     ← The AI breaks the fourth wall
│   ├── chapters/                      ← 14 engineering + 7 design history chapters
│   ├── prompts/                       ← 14 prompt companions (71 prompt pairs)
│   ├── editorial/                     ← 15 editorial review documents
│   ├── design-editorial/             ← 7 design chapter editorial reviews
│   └── research/                      ← Design history reference images
├── src/                               ← Next.js application (Claude chat + MCP tools)
├── mcp/                               ← MCP tool servers (calculator, typed schemas)
├── scripts/                           ← 10 operational scripts (health, secrets, release)
├── sprints/completed/                 ← 23 archived sprint artifacts with evidence
├── tests/                             ← 67 tests across unit, integration, policy
└── docs/operations/                   ← Runbooks, environment matrix, process model
```

---

## Book I — AI Orchestration Engineering

Fourteen chapters developing engineering judgment through the human stories behind six decades of foundational frameworks, applied to this codebase with verifiable evidence.

> **How to read:** Each chapter links to its text and its prompt companion. Read the chapter for the principle, then use the prompt companion to practice it — each contains good/bad prompt pairs with candid "behind the curtain" commentary from the model explaining what it actually does with each prompt.

| # | Chapter | Prompt Companion |
|---|---------|-----------------|
| 0 | [The People Behind the Principles](docs/book/chapters/ch00-the-people-behind-the-principles.md) | [5 prompts](docs/book/prompts/ch00-prompts-the-people-behind-the-principles.md) |
|   | *Hoare, Dijkstra, Knuth, Brooks, Liskov, Berners-Lee, Van Rossum, Cunningham, the GoF, Lerdorf, Beck, Fowler, Thomas & Hunt, Fielding, Martin, Wiggins, Hejlsberg, Zakas, Dahl, Walke, Rauch, Torvalds, Clark, and the Anthropic team.* | |
| 1 | [Why This Moment Matters](docs/book/chapters/ch01-why-this-moment-matters.md) | [4 prompts](docs/book/prompts/ch01-prompts-why-this-moment-matters.md) |
|   | *AI does not eliminate the craft layer — it makes the gap wider, faster.* | |
| 2 | [A Brief History of Control Surfaces](docs/book/chapters/ch02-history-of-control-surfaces.md) | [4 prompts](docs/book/prompts/ch02-prompts-history-of-control-surfaces.md) |
|   | *Machine code → assembly → high-level languages → natural-language orchestration. Same failure modes, higher abstraction.* | |
| 3 | [Prompt Orchestration Primitives](docs/book/chapters/ch03-prompt-orchestration-primitives.md) | [7 prompts](docs/book/prompts/ch03-prompts-orchestration-primitives.md) |
|   | *Role framing, scope, invariants, acceptance criteria, sequencing, verification, artifact discipline.* | |
| 4 | [Named Frameworks as Compressed Programs](docs/book/chapters/ch04-named-frameworks-as-compressed-programs.md) | [5 prompts](docs/book/prompts/ch04-prompts-named-frameworks-as-compressed-programs.md) |
|   | *When you say "12-Factor" or "SOLID" to a model, you are loading a compressed program built by practitioners over decades.* | |
| 5 | [The Audit-to-Sprint Execution Loop](docs/book/chapters/ch05-audit-to-sprint-loop.md) | [7 prompts](docs/book/prompts/ch05-prompts-audit-to-sprint-loop.md) |
|   | *Phase Zero inquiry → audit → plan → execute → verify → archive. The method behind this entire project.* | |
| 6 | [12-Factor in the LLM Era](docs/book/chapters/ch06-12-factor-in-the-llm-era.md) | [5 prompts](docs/book/prompts/ch06-prompts-12-factor-in-the-llm-era.md) |
|   | *Wiggins's twelve factors reinterpreted for LLM-backed applications: config, disposability, parity, and beyond.* | |
| 7 | [GoF Patterns for AI-Native Systems](docs/book/chapters/ch07-gof-for-ai-native-systems.md) | [5 prompts](docs/book/prompts/ch07-prompts-gof-for-ai-native-systems.md) |
|   | *Observer, Decorator, Chain of Responsibility, Template Method, Facade — applied to the actual code in this repository.* | |
| 8 | [Observability, Feedback, and Evals](docs/book/chapters/ch08-observability-feedback-and-evals.md) | [5 prompts](docs/book/prompts/ch08-prompts-observability-feedback-evals.md) |
|   | *Request IDs, structured events, error taxonomy, and evaluation loops as engineering primitives.* | |
| 9 | [Risk, Safety, and Operational Governance](docs/book/chapters/ch09-risk-safety-and-governance.md) | [5 prompts](docs/book/prompts/ch09-prompts-risk-safety-governance.md) |
|   | *TypeScript strict + ESLint zero-warnings + Lighthouse thresholds = the composite quality gate for AI-generated code velocity.* | |
| 10 | [Case Study: IS601 Demo](docs/book/chapters/ch10-case-study-is601-demo.md) | [5 prompts](docs/book/prompts/ch10-prompts-case-study-is601-demo.md) |
|   | *This repository's full arc: scaffold → production-grade architecture. Every decision preserved and traceable.* | |
| 11 | [Team Operating Model](docs/book/chapters/ch11-team-operating-model.md) | [5 prompts](docs/book/prompts/ch11-prompts-team-operating-model.md) |
|   | *Role separation, handoff contracts, and the CEO operating model — build expert-grade systems in domains you don't personally master.* | |
| 12 | [Future Directions](docs/book/chapters/ch12-future-directions.md) | [4 prompts](docs/book/prompts/ch12-prompts-future-directions.md) |
|   | *Language-native tooling, continuous verification loops, and what the field looks like when AI writes the majority of code.* | |
| 13 | [MCP + Next.js: Architecture and Capability Roadmap](docs/book/chapters/ch13-mcp-nextjs-architecture-and-capability-roadmap.md) | [5 prompts](docs/book/prompts/ch13-prompts-mcp-nextjs-architecture.md) |
|   | *The protocol that makes AI systems doers rather than talkers. Typed schemas, deterministic execution, capability tiers.* | |

---

## Book II — Design History as Engineering Lineage

Seven chapters tracing the visual design decisions that shaped modern interfaces — from De Stijl's mathematical grids to fluid CSS calculus. Understanding why screens look the way they do prevents building interfaces that fight their own medium.

| # | Chapter |
|---|---------|
| 0 | [Before the Bauhaus: The People Who Mathematized Art](docs/book/chapters/ch00-before-the-bauhaus.md) |
|   | *De Stijl, Constructivism, and the invisible foundation of computational design.* |
| 1 | [The Bauhaus Experiment: Typography as Infrastructure](docs/book/chapters/ch01-bauhaus-and-the-machine.md) |
|   | *Gropius, Bayer, and how stripping typographic ornamentation created universal standards.* |
| 2 | [The Swiss Grid: Spatial Rhythm and Mathematics](docs/book/chapters/ch02-the-swiss-grid.md) |
|   | *Müller-Brockmann turned layout into pure mathematical rhythm — the logical foundation of responsive web design.* |
| 3 | [Postmodernism and Rebellion: Why We Break the Grid](docs/book/chapters/ch03-postmodernism-and-rebellion.md) |
|   | *Carson, Scher, and the proof that rules must be understood before they can be effectively broken.* |
| 4 | [The Digital Transition: Translating Physics to Pixels](docs/book/chapters/ch04-the-digital-transition.md) |
|   | *Susan Kare's 16×16 pixel icons established the rules of visual affordance and digital wayfinding.* |
| 5 | [Skeuomorphism to Flat Design: Reducing the Noise](docs/book/chapters/ch05-skeuomorphism-to-flat-design.md) |
|   | *Why photorealistic UI died, how flat design replaced it, and Material Design's z-axis physics engine.* |
| 6 | [The Motion and Fluid Web Era: Design as a Calculus](docs/book/chapters/ch06-the-motion-and-fluid-era.md) |
|   | *`clamp()`, finite state machines, fluid scaling — modern design is a live equation solving for infinite viewports.* |

---

## 📋 Prompt Companions

**71 prompt pairs across 14 companion documents.** Each pair shows a bad prompt and a good prompt for the same task, with candid "Behind the Curtain" commentary where the model explains — in its own voice — what it actually does when it receives each one.

> *"When your context window contains vague intent, broad scope, and no acceptance criteria, the most probable output is generic, plausible, and often subtly wrong. When it contains a named framework, explicit scope boundaries, clear invariants, and testable acceptance criteria, the probability distribution narrows dramatically. The difference is not magic. It is math."*
>
> — [Preface from the Model](docs/book/PREFACE-FROM-THE-MODEL.md)

Start with any chapter's companion that matches your current work:

| If you are... | Start here |
|---|---|
| Writing your first structured prompt | [Ch 3 — Primitives](docs/book/prompts/ch03-prompts-orchestration-primitives.md) |
| Running an audit or sprint | [Ch 5 — Audit-to-Sprint Loop](docs/book/prompts/ch05-prompts-audit-to-sprint-loop.md) |
| Hardening a deployment | [Ch 6 — 12-Factor](docs/book/prompts/ch06-prompts-12-factor-in-the-llm-era.md) |
| Refactoring architecture | [Ch 7 — GoF Patterns](docs/book/prompts/ch07-prompts-gof-for-ai-native-systems.md) |
| Setting up quality gates | [Ch 9 — Governance](docs/book/prompts/ch09-prompts-risk-safety-governance.md) |
| Working solo or in an unfamiliar domain | [Ch 11 — CEO Operating Model](docs/book/prompts/ch11-prompts-team-operating-model.md) |
| Designing MCP tools | [Ch 13 — MCP Architecture](docs/book/prompts/ch13-prompts-mcp-nextjs-architecture.md) |

---

## Architecture

![MCP Architecture — Three-Layer Split](docs/book/mcp-architecture-diagram.png)

The architectural principle from [Chapter 13](docs/book/chapters/ch13-mcp-nextjs-architecture-and-capability-roadmap.md):

| Layer | Responsibility | Location |
|---|---|---|
| **Next.js** | UI, API routes, orchestration policy, provider wiring | `src/` |
| **MCP Protocol** | Typed tool schemas, deterministic execution contracts | `mcp/` |
| **Operations** | Health, secrets, release integrity, admin workflows | `scripts/` |

The model reasons. The MCP tool executes. The Next.js layer orchestrates. This separation makes every action inspectable and every failure attributable to a specific domain.

---

## Sprint Archive

This project's evolution is fully documented across **23 sprint artifacts** in [`sprints/completed/`](sprints/completed/). The four-phase sequence from [Chapter 10](docs/book/chapters/ch10-case-study-is601-demo.md):

| Phase | Sprints | What was built |
|---|---|---|
| **Feature Delivery** | 00–03 | Testing foundation, secret safety, chat policy, calculator tool |
| **Structural Cleanup** | 04–07 | SRP refactor, streaming hardening, UI hook separation, type safety |
| **12-Factor Hardening** | 12f-01–09 | Config/secrets, backing services, build/release/run, disposability, parity, logs, admin |
| **GoF Extensibility** | gof-01–02 | Observer + Decorator + Chain of Responsibility, Template Method + Facade |

Each sprint artifact contains: scope, invariants, acceptance criteria, validation commands, and execution evidence.

---

## Operational Scripts

| Script | Command | Purpose |
|---|---|---|
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
|---|---|
| Model preface (fourth wall) | [`PREFACE-FROM-THE-MODEL.md`](docs/book/PREFACE-FROM-THE-MODEL.md) |
| Book QA report | [`BOOK-QA.md`](docs/book/BOOK-QA.md) |
| Audience value audit | [`BOOK-AUDIENCE-AUDIT.md`](docs/book/BOOK-AUDIENCE-AUDIT.md) |
| Editorial reviews (14 chapters) | [`docs/book/editorial/`](docs/book/editorial/) |
| Design editorial reviews (7 chapters) | [`docs/book/design-editorial/`](docs/book/design-editorial/) |
| Design research images | [`docs/book/research/`](docs/book/research/) |
| Operations runbooks | [`docs/operations/`](docs/operations/) |
| Sprint archive (23 sprints) | [`sprints/completed/`](sprints/completed/) |
| Runtime scripts (10) | [`scripts/`](scripts/) |

