import type Anthropic from "@anthropic-ai/sdk";
import { 
  SearchBooksCommand, 
  GetChapterCommand, 
  GetChecklistCommand, 
  ListPractitionersCommand, 
  GetBookSummaryCommand 
} from "@/core/use-cases/tools/BookTools";
import { 
  SetThemeCommand, 
  AdjustUICommand,
  NavigateCommand, 
  GenerateChartCommand, 
  GenerateAudioCommand 
} from "@/core/use-cases/tools/UiTools";
import { CalculatorCommand } from "@/core/use-cases/tools/CalculatorTool";
import { getBookRepository } from "@/adapters/RepositoryFactory";

// ---- Tool Definitions (Anthropic SDK Schema) ----

export const CALCULATOR_TOOL: Anthropic.Tool = {
  name: "calculator",
  description: "Performs arithmetic. Mandatory for every math calculation.",
  input_schema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["operation", "a", "b"],
  },
};

export const SEARCH_BOOKS_TOOL: Anthropic.Tool = {
  name: "search_books",
  description: "Search across all 10 books (104 chapters) in the Product Development Library.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query (concept, person, topic)." },
      max_results: { type: "number", description: "Max results (1-15)." },
    },
    required: ["query"],
  },
};

export const GET_CHAPTER_TOOL: Anthropic.Tool = {
  name: "get_chapter",
  description: "Retrieve full content of a specific chapter.",
  input_schema: {
    type: "object",
    properties: {
      book_slug: { type: "string" },
      chapter_slug: { type: "string" },
    },
    required: ["book_slug", "chapter_slug"],
  },
};

export const GET_CHECKLIST_TOOL: Anthropic.Tool = {
  name: "get_checklist",
  description: "Get chapter checklists.",
  input_schema: {
    type: "object",
    properties: {
      book_slug: { type: "string", description: "Optional specific book." },
    },
  },
};

export const LIST_PRACTITIONERS_TOOL: Anthropic.Tool = {
  name: "list_practitioners",
  description: "List key practitioners referenced in the series.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional name filter." },
    },
  },
};

export const GET_BOOK_SUMMARY_TOOL: Anthropic.Tool = {
  name: "get_book_summary",
  description: "Get an overview of all 10 books and their chapters.",
  input_schema: {
    type: "object",
    properties: {},
  },
};

export const GENERATE_CHART_TOOL: Anthropic.Tool = {
  name: "generate_chart",
  description: "Generate a visual Mermaid.js chart.",
  input_schema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Mermaid code." },
      caption: { type: "string" },
    },
    required: ["code"],
  },
};

export const GENERATE_AUDIO_TOOL: Anthropic.Tool = {
  name: "generate_audio",
  description: "Generate in-chat audio player.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      title: { type: "string" },
    },
    required: ["text", "title"],
  },
};

export const SET_THEME_TOOL: Anthropic.Tool = {
  name: "set_theme",
  description: "Change site aesthetic era.",
  input_schema: {
    type: "object",
    properties: {
      theme: { type: "string", enum: ["bauhaus", "swiss", "postmodern", "skeuomorphic", "fluid"] },
    },
    required: ["theme"],
  },
};

export const NAVIGATE_TOOL: Anthropic.Tool = {
  name: "navigate",
  description: "Navigate to a different page.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  },
};

export const ADJUST_UI_TOOL: Anthropic.Tool = {
  name: "adjust_ui",
  description: "Adjust the UI appearance for accessibility, comfort, or user preference. Use when users say things like 'make text bigger', 'I'm old', 'too bright', 'I'm color blind', 'compact mode', or 'hard to read'. You can apply a named preset OR set individual properties. Presets: 'elderly' (large text, relaxed spacing), 'compact' (dense info), 'high-contrast' (dark + large), 'color-blind-deuteranopia', 'color-blind-protanopia', 'color-blind-tritanopia', 'default' (reset all).",
  input_schema: {
    type: "object",
    properties: {
      preset: { type: "string", enum: ["default", "elderly", "compact", "high-contrast", "color-blind-deuteranopia", "color-blind-protanopia", "color-blind-tritanopia"], description: "Apply a curated preset. Overrides individual settings." },
      fontSize: { type: "string", enum: ["xs", "sm", "md", "lg", "xl"], description: "Base font size." },
      lineHeight: { type: "string", enum: ["tight", "normal", "relaxed"], description: "Line spacing." },
      letterSpacing: { type: "string", enum: ["tight", "normal", "relaxed"], description: "Letter spacing." },
      density: { type: "string", enum: ["compact", "normal", "relaxed"], description: "UI density — affects padding and gaps." },
      dark: { type: "boolean", description: "Enable or disable dark mode." },
      theme: { type: "string", enum: ["bauhaus", "swiss", "postmodern", "skeuomorphic", "fluid"], description: "Visual theme era." },
      colorBlindMode: { type: "string", enum: ["none", "deuteranopia", "protanopia", "tritanopia"], description: "Color-blind safe palette." },
    },
  },
};

export const ALL_TOOLS: Anthropic.Tool[] = [
  CALCULATOR_TOOL,
  SEARCH_BOOKS_TOOL,
  GET_CHAPTER_TOOL,
  GET_CHECKLIST_TOOL,
  LIST_PRACTITIONERS_TOOL,
  GET_BOOK_SUMMARY_TOOL,
  GENERATE_CHART_TOOL,
  GENERATE_AUDIO_TOOL,
  SET_THEME_TOOL,
  NAVIGATE_TOOL,
  ADJUST_UI_TOOL,
];

// ---- Command Registry ----
const bookRepo = getBookRepository();
const commands = {
  calculator: new CalculatorCommand(),
  search_books: new SearchBooksCommand(bookRepo),
  get_chapter: new GetChapterCommand(bookRepo),
  get_checklist: new GetChecklistCommand(bookRepo),
  list_practitioners: new ListPractitionersCommand(bookRepo),
  get_book_summary: new GetBookSummaryCommand(bookRepo),
  set_theme: new SetThemeCommand(),
  adjust_ui: new AdjustUICommand(),
  navigate: new NavigateCommand(),
  generate_chart: new GenerateChartCommand(),
  generate_audio: new GenerateAudioCommand(),
};

export async function createToolResults(toolUses: Anthropic.Messages.ToolUseBlock[]) {
  return Promise.all(
    toolUses.map(
      async (toolUse): Promise<Anthropic.Messages.ToolResultBlockParam> => {
        try {
          const command = (commands as any)[toolUse.name];
          if (!command) throw new Error(`Unknown tool: ${toolUse.name}`);

          const result = await command.execute(toolUse.input);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (error) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: error instanceof Error ? error.message : "Tool execution failed.",
            is_error: true,
          };
        }
      },
    ),
  );
}
