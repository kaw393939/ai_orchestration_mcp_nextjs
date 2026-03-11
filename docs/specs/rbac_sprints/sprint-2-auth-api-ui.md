# Sprint 2 — Auth API & UI

> **Goal:** Users can register, log in, log out via browser. Middleware protects routes.  
> **Spec ref:** §3.3, §3.6, §5, §8 Phase 1 steps 9–12  
> **Prerequisite:** Sprint 1 complete

---

## Task 2.1 — Edge middleware

**What:** Create `src/middleware.ts` — cookie presence check only, no DB.

| Item | Detail |
|------|--------|
| **Create** | `src/middleware.ts` — route matcher config from §3.3; check `lms_session_token` cookie; 401 for protected routes without cookie; pass everything else |
| **Spec** | §3.3, §5, MW-1–6, NEG-ARCH-3, NEG-ARCH-4 |
| **Tests (new)** | Middleware unit tests: cookie absent + protected route → 401; cookie present → passes; public routes → passes; page routes → passes |
| **Verify** | `npm run build` succeeds (Edge Runtime compatible — no `better-sqlite3` import) |

---

## Task 2.2 — Auth API routes

**What:** Create the 4 auth route handlers.

| Item | Detail |
|------|--------|
| **Create** | `src/app/api/auth/register/route.ts` — POST, delegates to `register()` |
| **Create** | `src/app/api/auth/login/route.ts` — POST, delegates to `login()` |
| **Create** | `src/app/api/auth/logout/route.ts` — POST, delegates to `logout()` |
| **Create** | `src/app/api/auth/me/route.ts` — GET, delegates to `validateSession()` |
| **Spec** | §12 API Reference (Auth section), REG-1–9, AUTH-1–7 |
| **Tests (new)** | Integration: `POST /register` → `POST /login` → `GET /me` → `POST /logout` → `GET /me` (401) |

---

## Task 2.3 — Login & Register pages

**What:** Create the two auth UI pages.

| Item | Detail |
|------|--------|
| **Create** | `src/app/login/page.tsx` — email + password form, inline errors, redirect to `/` on success |
| **Create** | `src/app/register/page.tsx` — email + password + name form, inline field validation, redirect to `/` on success |
| **Spec** | §3.6, UI-4, UI-5, TEST-PAGE-03–06 |
| **Key details** | Login: retain email on failure, clear password (TEST-PAGE-03). Register: inline errors per field (TEST-PAGE-04). Both redirect to `/` on success. |
| **Tests** | Manual verification + build passes |

---

## Task 2.4 — Nav auth state (AccountMenu + SiteNav)

**What:** Update navigation to reflect auth state.

| Item | Detail |
|------|--------|
| **Modify** | `src/components/AccountMenu.tsx` — unauthenticated: "Sign In" / "Register" links; authenticated: user info + conversation history; ADMIN: + simulation panel |
| **Modify** | `src/components/SiteNav.tsx` — login/register CTA for anonymous users |
| **Modify** | `src/app/layout.tsx` — pass user to ChatProvider for context |
| **Modify** | `src/hooks/useMockAuth.ts` — remove exported `ROLE_CONFIG` (move to AccountMenu local const); simplify to admin-only role switch |
| **Dev-mode guard** | In `AccountMenu.tsx`, show the role switcher panel when `user.roles.includes('ADMIN') \|\| process.env.NODE_ENV === 'development'`. Same guard applies in `POST /api/auth/switch` (Sprint 3 Task 3.5). This lets any authenticated dev test all roles without an ADMIN account. |
| **Spec** | §3.6, UI-1–3, SWITCH-1, TEST-PAGE-01–02 |
| **Tests** | Build passes; manual verification of both auth states; verify switcher visible for non-ADMIN in dev mode |
