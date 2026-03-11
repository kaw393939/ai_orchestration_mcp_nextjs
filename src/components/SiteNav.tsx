"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";
import { useTheme } from "./ThemeProvider";
import type { User as SessionUser } from "@/core/entities/user";

const NAV_ITEMS = [
  { href: "/books", label: "Library" },
  { href: "/training", label: "Training" },
  { href: "/studio", label: "Studio" },
  { href: "/sandbox", label: "Sandbox" },
];

interface SiteNavProps {
  user: SessionUser;
}

export function SiteNav({ user }: SiteNavProps) {
  const pathname = usePathname();
  const { 
    gridEnabled, 
  } = useTheme();

  const isAuth = user.roles.some((r) => r !== "ANONYMOUS");

  // Simple Breadcrumb logic
  const segments = pathname.split("/").filter(Boolean);
  const isBookPage = segments[0] === "books";

  return (
    <nav
      className="h-[56px] border-b border-[var(--border-color)] bg-[var(--background)] sticky top-0 z-[50] backdrop-blur-md"
      aria-label="Primary"
    >
      <div className="h-full mx-auto flex max-w-[var(--container-width)] items-center justify-between px-[var(--container-padding)]">
        {/* Left: Brand & Main Nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-base tracking-tighter shrink-0"
          >
            <div className="w-6 h-6 accent-fill rounded-sm flex items-center justify-center text-[10px]">
              O
            </div>
            <span>Studio Ordo</span>
          </Link>

          {/* Breadcrumbs / Section Label */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest opacity-30">
            <span className="mx-1">/</span>
            {segments.length > 0 ? (
              segments.map((s, i) => (
                <React.Fragment key={s}>
                  <span className="hover:opacity-100 transition-opacity cursor-default">{s}</span>
                  {i < segments.length - 1 && <span className="mx-1">/</span>}
                </React.Fragment>
              ))
            ) : (
              <span>Dashboard</span>
            )}
          </div>
        </div>

        {/* Center: AI Status (The "Unified" part) */}
          <div className="hidden xl:flex items-center gap-4 px-6 py-1.5 rounded-full bg-[var(--surface-muted)] border-theme">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full accent-fill flex items-center justify-center text-[8px] font-bold">
              A
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold">PD Advisor</span>
              <span className="text-[8px] opacity-50 uppercase tracking-tighter font-semibold">Intelligent Orchestrator</span>
            </div>
          </div>
          <div className="w-px h-4 bg-[var(--border-color)]" />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)] animate-pulse" />
            <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest">System Ready</span>
          </div>
        </div>

        {/* Right: Account & Command Center */}
        <div className="flex items-center gap-2">
          <AccountMenu user={user} />
        </div>
      </div>
    </nav>
  );
}
