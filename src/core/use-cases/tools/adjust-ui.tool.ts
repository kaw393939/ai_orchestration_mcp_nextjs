import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { AdjustUICommand } from "./UiTools";

export const adjustUiTool: ToolDescriptor = {
  name: "adjust_ui",
  schema: {
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
  },
  command: new AdjustUICommand(),
  roles: "ALL",
  category: "ui",
};
