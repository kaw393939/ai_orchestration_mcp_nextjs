# Language as Executable Architecture

This repository is a working companion to a book on professional software engineering in the AI era.

Most CS programs teach you how to make things work. This book teaches the layer they skip: how to make things *keep working* — under change, under team growth, and under operational pressure. That layer is what separates engineers who remain valuable as AI automates the mechanical work from engineers whose skills have been absorbed into a prompt.

## Intro

The junior engineering role is shrinking. The work AI cannot replace requires design judgment, operational discipline, and architectural thinking. These skills were always the difference between code that survives and code that collapses — they just matter more now, sooner in a career.

This book teaches those skills through the stories of the people who built the frameworks, and through a real working codebase that applies every principle with verifiable evidence:

- **GoF design patterns** — who built them, what was breaking, and how they apply to AI-native systems
- **SOLID principles** — the field notes of a developer who spent decades cleaning up code that was unmaintainable by design
- **12-Factor operational discipline** — what Heroku learned from thousands of production failures, applied to LLM-backed applications
- **MCP + Next.js** — the architecture pairing that gives AI systems deterministic, inspectable tool execution
- **Prompt orchestration as engineering** — how to move beyond ad hoc prompting into repeatable, auditable execution loops

The chapters are written to be both conceptual and executable in this codebase.

## Setup

Use these steps to run the companion project while reading:

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (recommended in shell):

```bash
export ANTHROPIC_API_KEY="your-api-key"
export ANTHROPIC_MODEL="claude-haiku-4-5"
```

3. Start development server:

```bash
npm run dev
```

4. Run quality gates used throughout the book:

```bash
npm test
npm run lint
npm run build
```

5. Optional parity run (production-like profile):

```bash
docker compose up --build
```

## Table of Contents

0. [Chapter 0 - The People Behind the Principles](docs/book/chapters/ch00-the-people-behind-the-principles.md)  
	Abstract: Explains why the professional craft layer of software engineering is rarely taught, why AI makes that gap critical, and tells the human stories behind GoF, SOLID, 12-Factor, TDD, and MCP — who these people were, what frustrated them, and what they built.

1. [Chapter 1 - Why This Moment Matters](docs/book/chapters/ch01-why-this-moment-matters.md)  
	Abstract: Defines why LLM systems change engineering practice, and introduces the central claim that words now function as programmable intent.

2. [Chapter 2 - A Brief History of Control Surfaces](docs/book/chapters/ch02-history-of-control-surfaces.md)  
	Abstract: Traces the path from machine code to high-level languages to natural-language orchestration, showing continuity rather than replacement.

3. [Chapter 3 - Prompt Orchestration Primitives](docs/book/chapters/ch03-prompt-orchestration-primitives.md)  
	Abstract: Introduces constraints, role framing, named frameworks, acceptance criteria, and verification loops as first-class orchestration primitives.

4. [Chapter 4 - Named Frameworks as Compressed Programs](docs/book/chapters/ch04-named-frameworks-as-compressed-programs.md)  
	Abstract: Explains how names like 12-Factor, GoF, and Uncle Bob encode reusable design intent and accelerate alignment between humans and models.

5. [Chapter 5 - The Audit-to-Sprint Execution Loop](docs/book/chapters/ch05-audit-to-sprint-loop.md)  
	Abstract: Shows how to convert high-level audits into concrete, testable sprint execution that survives context shifts and scale.

6. [Chapter 6 - 12-Factor in the LLM Era](docs/book/chapters/ch06-12-factor-in-the-llm-era.md)  
	Abstract: Reinterprets each 12-Factor principle for modern AI-backed applications, including config, disposability, observability, and parity.

7. [Chapter 7 - GoF Patterns for AI-Native Systems](docs/book/chapters/ch07-gof-for-ai-native-systems.md)  
	Abstract: Applies Observer, Decorator, Chain of Responsibility, Template Method, and Facade patterns to real LLM route and provider architecture.

8. [Chapter 8 - Observability, Feedback, and Evals](docs/book/chapters/ch08-observability-feedback-and-evals.md)  
	Abstract: Covers how to instrument systems for trustworthy iteration, including request IDs, structured events, error taxonomy, and evaluation loops.

9. [Chapter 9 - Risk, Safety, and Operational Governance](docs/book/chapters/ch09-risk-safety-and-governance.md)  
	Abstract: Establishes practical guardrails for secrets, failure handling, model drift, and deployment discipline without slowing execution.

10. [Chapter 10 - Case Study: IS601 Demo](docs/book/chapters/ch10-case-study-is601-demo.md)  
	 Abstract: Walks through this repository’s evolution from baseline app to production-grade architecture using iterative audits and refactors.

11. [Chapter 11 - Team Operating Model](docs/book/chapters/ch11-team-operating-model.md)  
	 Abstract: Defines roles, rituals, and handoff patterns for teams that treat language orchestration as a core engineering capability.

12. [Chapter 12 - Future Directions](docs/book/chapters/ch12-future-directions.md)  
	 Abstract: Explores where this practice is heading: language-native tooling, continuous verification, and new hybrids of software and organizational design.

13. [Chapter 13 - MCP + Next.js: Architecture and Capability Roadmap](docs/book/chapters/ch13-mcp-nextjs-architecture-and-capability-roadmap.md)  
	 Abstract: Explains MCP, shows how this project uses MCP with Next.js, and provides a practical roadmap for high-value capability expansion.

## Companion Materials

- Book QA report: `docs/book/BOOK-QA.md`
- Audience value audit: `docs/book/BOOK-AUDIENCE-AUDIT.md`
- Operations docs: `docs/operations/`
- Sprint archive: `sprints/completed/`
- Runtime scripts: `scripts/`

