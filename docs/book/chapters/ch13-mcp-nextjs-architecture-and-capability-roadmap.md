# Chapter 13 - MCP + Next.js: Architecture and Capability Roadmap

## Abstract
This chapter explains what MCP is, how it works in this project, why pairing MCP with Next.js creates high leverage, and which capabilities should be added next for maximum audience and product value.

## From Talkers to Doers

Jack Clark, co-founder of Anthropic and author of the *Import AI* newsletter, described the current moment with unusual precision: *"The AI applications of 2023 and 2024 were talkers. Some were very sophisticated conversationalists, but their impact was limited. The AI applications of 2026 and 2027 will be doers. They're agents plural. They can work together. They can oversee each other."*

This project sits at that transition. The chat interface and MCP calculator in this repository are not just a demo — they are the minimal architecture that makes the shift from talking to doing legible. The model reasons. The MCP tool executes. The Next.js layer orchestrates. Understanding that three-way separation is the prerequisite for building reliable agentic systems.

Clark also named the failure mode that trips people when they first try to get a model to do real work: treating it as a knowledgeable colleague rather than an extremely literal executor that takes instructions for a long time without checking back. *"The message better be extremely detailed and really capture what you're trying to do. It's making sure that you've set it up so it's like a message in a bottle that you can chuck into the thing and it'll go away and do a lot of work."* MCP tool schemas are that message. They are not boilerplate. They are the typed contract that makes a model's instructions precise enough to execute reliably — the difference between a tool that works and a tool that works *predictably*.

## What MCP Is
Model Context Protocol (MCP) is a standard interface for exposing tools and resources to models.  
At a practical level, MCP gives you a contract so model-driven tool use is explicit, typed, and interoperable.

MCP helps answer a core reliability question: when a model needs to act, how do we make that action deterministic, inspectable, and extensible?

> For the background on Anthropic, the people who built MCP, and why the protocol was designed the way it was, see [Chapter 0](ch00-the-people-behind-the-principles.md).

## What This Project Is Doing with MCP
In this repository, MCP is used to expose a calculator capability as a tool process (`mcp/calculator-server.ts`) while Next.js handles user-facing app and API orchestration.

Current architecture split:

- **Next.js layer** (`src/app`, `src/lib/chat`): UI, API routes, orchestration policy, provider wiring, validation.
- **MCP tool layer** (`mcp/`): deterministic executable tools with explicit schemas.
- **Operations layer** (`scripts/`, `docs/operations/`): validation, release controls, health/admin workflows.

This separation keeps conversational reasoning in one domain and deterministic execution in another.

## What the Tool Definition Looks Like

Architecture explanations become concrete with code. Here is a simplified version of the calculator tool server from this repository:

```typescript
// mcp/calculator-server.ts (simplified)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "calculator", version: "1.0.0" });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "calculator") {
    const { operation, a, b } = args as { operation: string; a: number; b: number };
    const result = compute(operation, a, b); // pure function — no model involved
    return { content: [{ type: "text", text: String(result) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});
```

Three things to notice:

1. **The schema is explicit.** The tool has a name, typed arguments (`operation`, `a`, `b`), and a defined return shape. The model cannot send malformed inputs without the handler rejecting them.
2. **The execution is deterministic.** Once the model decides to call the tool, the computation is a pure function. No further model reasoning is involved in producing the result.
3. **The boundary is enforced by the protocol.** The Next.js layer decides *when* a tool call is appropriate (policy). The MCP layer decides *how* to execute it (implementation). These two concerns are never mixed in the same module.

This is the architectural value of the MCP + Next.js pairing: the model interacts with capabilities through a typed contract, and that contract is owned by the tool layer — not by the conversation layer.

> **A note from the model:**
> That code separates two things: the moment I decide a tool call is appropriate, and the moment the tool executes. The first is me. The second is not. The MCP boundary is the line where my reasoning ends and deterministic computation begins. This distinction matters in both directions. I should not be computing arithmetic — I will occasionally be wrong on edge cases, and that wrongness is not detectable without re-running the computation. The tool should not be doing policy reasoning — it has no model of context or intent. Keeping each property in its correct domain is what makes the system inspectable and trustworthy. When something goes wrong, you know exactly which domain failed. That clarity is worth more than convenience.

## Why MCP + Next.js Is a Great Combo

1. **Clear boundary between interaction and execution**  
   Next.js manages HTTP/UI/runtime concerns; MCP manages tool contracts.

2. **Fast product iteration with controlled capability growth**  
   You can add or revise tools without redesigning the app shell.

3. **Stronger safety posture**  
   Tool input schemas and explicit invocation paths reduce ad hoc execution risk.

4. **Better interoperability**  
   MCP-aligned tools are easier to reuse across clients and orchestrators.

5. **Teachable architecture**  
   This split is easy to explain: app routes coordinate, tools execute, ops validates.

## End-to-End Flow in This Repo
1. User sends request through Next.js UI.
2. API route decides whether tool usage is required (e.g., math policy).
3. Provider/orchestrator loops until model output or tool-result completion.
4. Tool computation is executed deterministically through calculator logic.
5. Responses carry observability metadata (`requestId`, `errorCode`) and structured events.
6. Quality/ops scripts provide deployment and runtime guarantees.

## Capability Roadmap (High-Value Additions)

### Tier 1 - Immediate Audience Value
- **MCP capability explorer page** in the app (discover tools, schemas, examples).
- **Tool invocation trace view** for teaching and debugging.
- **Failure-mode demos** (validation errors, retries, fallback behavior).

### Tier 2 - Production Readiness
- **Tool-level auth and policy enforcement**.
- **Rate and budget controls per capability**.
- **Evaluation harness for tool-selection accuracy and latency**.

### Tier 3 - Platform Evolution
- **Multi-tool registry** (calculator + retrieval + transform + policy checker).
- **Human approval checkpoints for high-risk actions**.
- **Cross-session memory and retrieval with strict scope controls**.

## Practical Build Plan
If you are teaching or productizing this stack, sequence work in this order:

1. Capability visibility (what tools exist and when they run).
2. Capability reliability (validation, retries, deterministic errors).
3. Capability governance (permissions, auditability, eval loops).
4. Capability scale (multi-tool registry and policy orchestration).

## Exercise
Design your next three MCP tools and define for each:

- schema,
- permission model,
- success metric,
- failure modes,
- observability signal requirements.

Then implement one tool end-to-end and validate with test/lint/build plus one runtime trace.

## Chapter Checklist
- Can a new reader explain MCP after reading this chapter?
- Is the architecture split between Next.js and MCP clear?
- Are roadmap items prioritized by audience and product value?
- Is there a practical next step that can be implemented this week?

## Diagram Prompt
Create a layered architecture diagram with Next.js application layer, MCP tool layer, and operations layer; then overlay a roadmap ribbon showing Tier 1/2/3 capability additions.

When those checks pass, this project becomes both a system and a curriculum.
