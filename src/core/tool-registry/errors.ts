export class ToolAccessDeniedError extends Error {
  constructor(toolName: string, role: string) {
    super(`Access denied: role "${role}" cannot execute tool "${toolName}"`);
    this.name = "ToolAccessDeniedError";
  }
}

export class UnknownToolError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: "${toolName}"`);
    this.name = "UnknownToolError";
  }
}
