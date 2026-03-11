import { ToolCommand } from "../ToolCommand";
import type { ToolExecutionContext } from "@/core/tool-registry/ToolExecutionContext";

export class SetThemeCommand implements ToolCommand<{ theme: string }, string> {
  async execute({ theme }: { theme: string }, _context?: ToolExecutionContext) {
    if (!theme) throw new Error("Theme must be provided.");
    return `Success. The theme has been changed to ${theme}.`;
  }
}

export class AdjustUICommand implements ToolCommand<Record<string, unknown>, string> {
  async execute(args: Record<string, unknown>, _context?: ToolExecutionContext) {
    const applied: string[] = [];
    if (args.preset) applied.push(`preset=${args.preset}`);
    if (args.fontSize) applied.push(`fontSize=${args.fontSize}`);
    if (args.lineHeight) applied.push(`lineHeight=${args.lineHeight}`);
    if (args.letterSpacing) applied.push(`letterSpacing=${args.letterSpacing}`);
    if (args.density) applied.push(`density=${args.density}`);
    if (args.dark !== undefined) applied.push(`dark=${args.dark}`);
    if (args.theme) applied.push(`theme=${args.theme}`);
    if (args.colorBlindMode) applied.push(`colorBlindMode=${args.colorBlindMode}`);
    return `Success. UI adjusted: ${applied.join(", ")}.`;
  }
}

export class NavigateCommand implements ToolCommand<{ path: string }, string> {
  async execute({ path }: { path: string }, _context?: ToolExecutionContext) {
    if (!path) throw new Error("Path must be provided.");
    return `Success. Navigated to ${path}.`;
  }
}

export class GenerateChartCommand implements ToolCommand<{ code: string }, string> {
  async execute(_input: { code: string }, _context?: ToolExecutionContext) {
    return `Success. Chart generated and rendered silently on the client.`;
  }
}

export class GenerateAudioCommand implements ToolCommand<{ text: string; title: string }, string> {
  async execute(_input: { text: string; title: string }, _context?: ToolExecutionContext) {
    return `Success. Audio player UI component appended to the chat stream.`;
  }
}
