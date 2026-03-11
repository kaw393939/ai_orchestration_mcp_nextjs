"use client";

import type { RoleName } from "@/core/entities/user";

export const ROLE_CONFIG: Record<
  RoleName,
  { label: string; dot: string; description: string }
> = {
  ANONYMOUS: {
    label: "Anonymous",
    dot: "bg-zinc-400",
    description: "Public visitor — sales agent mode",
  },
  AUTHENTICATED: {
    label: "Authenticated",
    dot: "bg-[var(--status-success)]",
    description: "Signed-in user — full library access",
  },
  STAFF: {
    label: "Staff",
    dot: "bg-blue-500",
    description: "Staff analyst — user insights & KPIs",
  },
  ADMIN: {
    label: "Admin",
    dot: "bg-purple-500",
    description: "Admin — global configuration access",
  },
};

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

  return {
    switchRole,
    ROLE_CONFIG,
  };
}
