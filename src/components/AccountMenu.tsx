"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme, AccessibilitySettings, FontSize, SpacingLevel } from "./ThemeProvider";
import { useMockAuth } from "@/hooks/useMockAuth";
import type { User as SessionUser, RoleName } from "@/core/entities/user";

interface AccountMenuProps {
  user: SessionUser;
}

const ROLE_CONFIG: Record<
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

const SettingBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2">
    <div className="text-[9px] font-bold uppercase tracking-widest opacity-60 ml-1">
      {label}
    </div>
    <div className="flex p-1 bg-[var(--surface-muted)] rounded-xl gap-1 border-theme">
      {children}
    </div>
  </div>
);

const ControlButton = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
      active
        ? "bg-[var(--surface)] text-[var(--accent-color)] shadow-sm scale-[1.02]"
        : "opacity-40 hover:opacity-100"
    }`}
  >
    {label}
  </button>
);

export function AccountMenu({ user }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { switchRole, logout } = useMockAuth();
  const { 
    gridEnabled, 
    setGridEnabled, 
    isDark, 
    setIsDark, 
    accessibility, 
    setAccessibility 
  } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAccessibility(false);
        setShowSimulation(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const isAuth = user.roles.some((r) => r !== "ANONYMOUS");
  const isDevMode = process.env.NODE_ENV === "development";
  const canSimulate = user.roles.includes("ADMIN") || isDevMode;

  const updateAcc = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K],
  ) => {
    setAccessibility({ ...accessibility, [key]: value });
  };

  const FONT_SIZES: { value: FontSize; label: string }[] = [
    { value: "xs", label: "XS" },
    { value: "sm", label: "S" },
    { value: "md", label: "M" },
    { value: "lg", label: "L" },
    { value: "xl", label: "XL" },
  ];

  const SPACING: { value: SpacingLevel; label: string }[] = [
    { value: "tight", label: "Tight" },
    { value: "normal", label: "Normal" },
    { value: "relaxed", label: "Relaxed" },
  ];

  // Unauthenticated: show sign in / register links instead of menu
  if (!isAuth) {
    return (
      <div className="flex items-center gap-3 ml-4">
        <Link
          href="/login"
          className="text-[11px] font-bold opacity-60 hover:opacity-100 transition-opacity"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="px-4 py-1.5 rounded-full text-[11px] font-bold bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity"
        >
          Register
        </Link>
      </div>
    );
  }

  const menuTrigger = (
    <button
      onClick={() => setOpen(!open)}
      className="flex items-center gap-2 group p-1 rounded-full hover-surface transition-all"
    >
      <div className="flex flex-col items-end mr-1 hidden md:flex">
        <span className="text-[11px] font-bold leading-none">{user.name}</span>
        <span className="text-[9px] opacity-60 uppercase tracking-tighter">
          {user.roles[0]}
        </span>
      </div>
      <div className="w-8 h-8 rounded-full border-theme bg-[var(--surface-muted)] flex items-center justify-center text-[10px] font-bold group-hover:bg-[var(--surface-hover)] transition-colors shadow-sm">
        {initials}
      </div>
    </button>
  );

  return (
    <div ref={ref} className="relative ml-4">
      {menuTrigger}

      {open && (
        <div className="absolute right-0 top-12 z-[100] w-72 rounded-[24px] border-theme bg-[var(--background)] shadow-[0_20px_50px_rgba(0,0,0,0.2)] p-2.5 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-4 duration-500 spring-bounce shadow-bloom">
          
          {/* Header: Identity & Quick Toggles */}
          <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border-color)] mb-1 bg-[var(--surface-muted)] rounded-t-2xl">
            <div className="min-w-0">
              <p className="text-xs font-black truncate tracking-tight">{user.name}</p>
              <p className="text-[10px] opacity-60 truncate font-medium">{user.email}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--background)] p-1 rounded-xl border-theme shadow-inner">
              <button
                onClick={() => setGridEnabled(!gridEnabled)}
                className={`p-1.5 rounded-lg transition-all ${gridEnabled ? "accent-fill" : "opacity-40 hover:opacity-100"}`}
                title="Toggle Grid"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
              </button>
              <button
                onClick={() => setIsDark(!isDark)}
                className={`p-1.5 rounded-lg transition-all ${isDark ? "accent-fill" : "opacity-40 hover:opacity-100"}`}
                title="Toggle Dark Mode"
              >
                {isDark ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="1" y1="12" x2="3" y2="12" /></svg>}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 px-0.5">
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all haptic-press hover-surface ${pathname === "/dashboard" ? "bg-[var(--accent-color)]/10 text-[var(--accent-color)]" : ""}`}
            >
              Dashboard
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all haptic-press hover-surface"
            >
              Profile Settings
            </Link>
          </div>

          <div className="h-px bg-[var(--border-color)] mx-2 my-1" />

          {/* System Legibility Accordion */}
          <div className="flex flex-col">
            <button
              onClick={() => setShowAccessibility(!showAccessibility)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold transition-all hover-surface ${showAccessibility ? "bg-[var(--surface-muted)]" : ""}`}
            >
              System Legibility
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`transition-transform duration-300 ${showAccessibility ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {showAccessibility && (
              <div className="px-3 py-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <SettingBlock label="Type Scale">
                  {FONT_SIZES.map((fs) => (
                    <ControlButton key={fs.value} label={fs.label} active={accessibility.fontSize === fs.value} onClick={() => updateAcc("fontSize", fs.value)} />
                  ))}
                </SettingBlock>
                <SettingBlock label="Line Height">
                  {SPACING.map((s) => (
                    <ControlButton key={s.value} label={s.label} active={accessibility.lineHeight === s.value} onClick={() => updateAcc("lineHeight", s.value)} />
                  ))}
                </SettingBlock>
                <SettingBlock label="Tracking">
                  {SPACING.map((s) => (
                    <ControlButton key={s.value} label={s.label} active={accessibility.letterSpacing === s.value} onClick={() => updateAcc("letterSpacing", s.value)} />
                  ))}
                </SettingBlock>
              </div>
            )}
          </div>

          {/* Simulation Mode Accordion — ADMIN or dev mode only */}
          {canSimulate && (
          <div className="flex flex-col">
            <button
              onClick={() => setShowSimulation(!showSimulation)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold transition-all hover-surface ${showSimulation ? "bg-[var(--surface-muted)]" : ""}`}
            >
              Simulation Mode
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`transition-transform duration-300 ${showSimulation ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {showSimulation && (
              <div className="px-2 py-2 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2">
                {(Object.entries(ROLE_CONFIG) as [RoleName, typeof ROLE_CONFIG[RoleName]][]).map(([role, config]) => (
                  <button
                    key={role}
                    onClick={() => switchRole(role)}
                    className={`w-full flex items-start gap-3 px-3 py-2 rounded-xl text-left transition-all haptic-press hover-surface ${user.roles.includes(role) ? "bg-[var(--surface-muted)] ring-1 ring-[var(--border-color)]" : ""}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${config.dot} mt-1.5 shrink-0`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold leading-tight">{config.label}</p>
                      <p className="text-[9px] opacity-60 truncate">{config.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="h-px bg-[var(--border-color)] mx-2 my-1" />

          <button
            onClick={logout}
            className="w-full text-center py-2 text-label font-black opacity-60 hover:opacity-100 transition-opacity"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
