import type { ToolDescriptor } from "@/core/tool-registry/ToolDescriptor";
import { GenerateAudioCommand } from "./UiTools";

export const generateAudioTool: ToolDescriptor = {
  name: "generate_audio",
  schema: {
    description: "Generate in-chat audio player.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        title: { type: "string" },
      },
      required: ["text", "title"],
    },
  },
  command: new GenerateAudioCommand(),
  roles: ["AUTHENTICATED", "STAFF", "ADMIN"],
  category: "ui",
};
