import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { SetThemeCommand } from "./UiTools";

export const setThemeTool: ToolDescriptor = {
  name: "set_theme",
  schema: {
    description: "Change site aesthetic era.",
    input_schema: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["bauhaus", "swiss", "postmodern", "skeuomorphic", "fluid"] },
      },
      required: ["theme"],
    },
  },
  command: new SetThemeCommand(),
  roles: "ALL",
  category: "ui",
};
