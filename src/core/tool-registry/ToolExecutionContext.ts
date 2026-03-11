import type { RoleName } from "@/core/entities/user";

export interface ToolExecutionContext {
  role: RoleName;
  userId: string;
  conversationId?: string;
}
