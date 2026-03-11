"use client";

import type { RoleName } from "@/core/entities/user";

export function useMockAuth() {
  const switchRole = async (targetRole: RoleName) => {
    try {
      await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      window.location.reload();
    } catch (err) {
      console.error("Error switching role:", err);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.reload();
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  return { switchRole, logout };
}
