# UI/UX Audit Findings — Mindspark LMS

**Date:** 31 July 2026 (re-audit)  
**Prior audit:** 31 July 2026 (morning) — F01–F21 addressed in code  
**Scope:** Tenant frontend (auth/landing, layouts, role dashboards, class hub, AI surfaces, chat/live, quiz flows); light pass on platform admin shell  
**Auditor stance:** Senior UI/UX Engineer Agent (`.cursor/skills/senior-uiux-engineer`)  
**Codebase:** `frontend/` (React + Tailwind)

---

## Executive summary

The product baseline is **materially stronger** than the prior audit. P0 trust and task risks (demo credentials, inaccessible live/chat modals, mobile chat stacking, grouped tenant nav, quiz leave warning, class price noise, duplicate class section links, broken Class Details breadcrumb) are fixed in code. Remaining friction is mostly **incomplete quiz history blocking**, **teacher dashboard density and silent errors**, **stacked class-section chrome**, and **residual violet/AI SaaS styling**. Closing those will matter more than new features for perceived quality.

---

## Scorecard

| Theme | Verdict |
|-------|---------|
| Information architecture | Tenant sidebar grouped (Learn / Teach / Communicate / Account); class hub is a launcher, not a working surface for students |
| Hierarchy / density | Admin dash improved; teacher dash still a 6-KPI wall; class sections still stack badge + tab title |
| Consistency | Shared `Modal` / `EmptyState` / `ErrorBanner` / `Spinner` in `ui.tsx`; AI & Interventions still diverge visually |
| Accessibility | Dialogs much better; drawer Escape/`aria-modal` and video focus-trap incomplete; heading order uneven |
| Responsive / mobile | Chat master–detail fixed; quiz sticky offset fragile with SupportBanner |
| Empty / loading / error | Admin stats have ErrorBanner + skeleton; teacher/student/class detail still weak |
| Brand coherence | Solid `.brand-chip`; Interventions / student AI CTAs / landing accents still lean indigo–violet |

---

## Closed since prior audit (do not re-open without regression)

| Prior ID | Topic | Status |
|----------|--------|--------|
| F01 | Quiz leave warning (`beforeunload` + link capture) | Fixed (partial — see new F01) |
| F02 | Demo credentials DEV-only | Fixed |
| F03 | Grouped tenant sidebar | Fixed |
| F04 | Chat mobile master–detail | Fixed |
| F05 | Admin dash KPIs + ErrorBanner/skeleton | Fixed |
| F06–F07 | Class hero only on dashboard; no duplicate “All areas” | Fixed |
| F08 | Shared accessible `Modal` (Live, Chat, roster, teachers, etc.) | Fixed |
| F09 | Solid `.brand-chip` | Fixed |
| F10–F11 | Landing Sign in / mobile nav / Register BrandMark | Fixed |
| F12 | Gradient badges | Fixed |
| F13 | Canonical quiz path deep-link (partial — entries remain) | Improved |
| F14–F15 | AI name greeting + Icon tools | Fixed |
| F16 / F19 | Materials `aria-label` + dark inputs | Fixed |
| F17 | Quiz sticky `top-16` | Improved (see new F06) |
| F18 | Empty/Error/Spinner in `ui.tsx` | Fixed |
| F20 | Layout greeting demoted from H1 | Fixed |
| F21 | Landing section order ≈ nav | Fixed |
| — | Class fee hidden on list/detail/dashboard cards | Fixed |
| — | Breadcrumb `:classId` substitution + section label | Fixed |

---

## Findings (open)

### F01 — Quiz leave still misses browser History / router leave

- **Severity:** High  
- **Area:** [`frontend/src/pages/QuizRunner.tsx`](../frontend/src/pages/QuizRunner.tsx)  
- **Issue:** Students can still lose in-progress answers via browser Back/Forward and some SPA navigations that are not `<a href>` clicks.  
- **Evidence:** `beforeunload` + capturing click on `a[href]` + `safeGoBack` confirm; no `useBlocker` / `popstate` handler; no draft autosave.  
- **Recommendation:** Add React Router `useBlocker` when answers are dirty; keep `beforeunload`; ideally PATCH draft answers to the attempt API.

### F02 — Teacher dashboard dense + silent on stats failure

- **Severity:** High  
- **Area:** [`frontend/src/pages/Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx) (teacher branch)  
- **Issue:** Six peer KPI cards plus Live strip, At-risk, and a “Needs attention” panel that re-counts the same signals. Failed `statsQuery` shows `"—"` with no error banner (unlike admin).  
- **Evidence:** `xl:grid-cols-6` StatCards; `ErrorBanner` only in `if (isAdmin)` branch.  
- **Recommendation:** Lead with 3–4 action metrics + one attention panel; reuse admin ErrorBanner/skeleton pattern; drop duplicate at-risk count.

### F03 — Class section chrome still stacked

- **Severity:** High  
- **Area:** [`ClassDetail.tsx`](../frontend/src/pages/ClassDetail.tsx), [`ClassSection.tsx`](../frontend/src/pages/class/ClassSection.tsx), [`MaterialsTab.tsx`](../frontend/src/components/class/MaterialsTab.tsx)  
- **Issue:** On a section route users still see breadcrumbs → `Class / {title}` → section Badge → tab title card repeating the same label (e.g. Materials).  
- **Evidence:** Slim header H1 in ClassDetail; Badge-only row in ClassSection; MaterialsTab `h3` “Materials” in a rounded header card. QuizzesTab is leaner.  
- **Recommendation:** One sticky section bar (title + primary action). Remove Badge-only row; fold Materials header into that bar.

### F04 — Class hub is still a launcher (especially for students)

- **Severity:** Medium  
- **Area:** [`frontend/src/pages/class/ClassDashboard.tsx`](../frontend/src/pages/class/ClassDashboard.tsx)  
- **Issue:** Horizontal section links + staff-only “What’s next”; students get navigation only—no due work, next live, or recent material.  
- **Evidence:** `visibleSections` strip; `NEXT_ACTIONS` gated by `canManage`.  
- **Recommendation:** Surface 1–2 real next jobs above the section nav for all roles with access.

### F05 — Heading hierarchy gaps

- **Severity:** Medium  
- **Area:** [`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx), [`AiStudentArea.tsx`](../frontend/src/pages/AiStudentArea.tsx)  
- **Issue:** Role dashboards lack a page `<h1>` (bands use `<h2>`). AI Student Area has competing H1s / a visually larger greeting H2.  
- **Evidence:** Dashboard role branches; AiStudentArea page title + hero “Hello, {firstName}” as `h2`.  
- **Recommendation:** One H1 per view (“Dashboard”, “AI study”); greeting as `<p>`; section titles as H2.

### F06 — Quiz sticky offset fragile vs shell chrome

- **Severity:** Medium  
- **Area:** [`QuizRunner.tsx`](../frontend/src/pages/QuizRunner.tsx), [`TenantLayout.tsx`](../frontend/src/components/TenantLayout.tsx), [`SupportBanner.tsx`](../frontend/src/components/SupportBanner.tsx)  
- **Issue:** Timer uses fixed `sticky top-16`; SupportBanner is `sticky top-0 z-50` and can cover it; header height is not measured.  
- **Evidence:** QuizRunner comment + `top-16`; SupportBanner higher z-index.  
- **Recommendation:** Focused quiz layout (hide breadcrumbs / optional shell) or a CSS var for combined sticky chrome height.

### F07 — Violet / multi-stop “AI SaaS” look still dilutes tenant brand

- **Severity:** Medium  
- **Area:** [`InterventionTimeline.tsx`](../frontend/src/pages/InterventionTimeline.tsx), student CTAs in [`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx), [`QuizzesTab.tsx`](../frontend/src/components/class/QuizzesTab.tsx), landing accents  
- **Issue:** `.brand-chip` is solid brand-600, but Interventions hero is indigo→cyan, and several AI CTAs stay violet-primary.  
- **Evidence:** `from-indigo-600 via-blue-600 to-cyan-600`; violet buttons/panels on Interventions and quiz AI chrome.  
- **Recommendation:** Primary chrome on `brand-600` / existing brand gradient; violet only as a sparse AI accent.

### F08 — Multiple AI quiz-generation entry points

- **Severity:** Medium  
- **Area:** Dashboard shortcuts, ClassDashboard “What’s next”, QuizzesTab AI generate, AiTeacherCopilot  
- **Issue:** Same capability advertised four ways with different chrome—canonical deep-link exists but IA still feels fragmented.  
- **Evidence:** `?ai=1` hrefs + Copilot `quiz-gen` + violet QuizzesTab embed.  
- **Recommendation:** Canonical = class Quizzes; Copilot/dashboard only deep-link; one visual pattern.

### F09 — Admin platform nav flat; crumbs say “Class Details”

- **Severity:** Medium  
- **Area:** [`AdminLayout.tsx`](../frontend/src/components/AdminLayout.tsx), [`Breadcrumbs.tsx`](../frontend/src/components/Breadcrumbs.tsx)  
- **Issue:** Platform admin sidebar is still a flat peer list. Tenant class crumbs use generic “Class Details” instead of the class title (path params are fixed).  
- **Evidence:** Admin `links[]`; `tenantTrails` label `Class Details`.  
- **Recommendation:** Light Admin groups; resolve class title for the crumb (cached query or route data).

### F10 — Student dashboard & class detail weak error states

- **Severity:** Medium  
- **Area:** [`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx) (student), [`ClassDetail.tsx`](../frontend/src/pages/ClassDetail.tsx)  
- **Issue:** Student branch lacks `ErrorBanner` for failed todo/classes queries. Class detail collapses all failures to “Class not found.”  
- **Evidence:** No student `isError` banner; `if (!detailQuery.data) return <p>Class not found.</p>`.  
- **Recommendation:** Shared ErrorBanner + retry; distinguish 404 vs network error.

### F11 — Mobile drawer & video player a11y leftovers

- **Severity:** Low  
- **Area:** [`TenantLayout.tsx`](../frontend/src/components/TenantLayout.tsx), [`AdminLayout.tsx`](../frontend/src/components/AdminLayout.tsx), [`VideoPlayerModal.tsx`](../frontend/src/components/VideoPlayerModal.tsx)  
- **Issue:** Drawer scrim is click-only (no Escape / `aria-modal` on aside). Video player has dialog + Escape but not the shared Modal focus trap.  
- **Evidence:** Overlay `onClick` only; VideoPlayerModal custom overlay.  
- **Recommendation:** Escape closes drawer; optional `aria-modal`; reuse Modal focus helpers for video.

### F12 — AI Student token pill still emoji-led

- **Severity:** Low  
- **Area:** [`AiStudentArea.tsx`](../frontend/src/pages/AiStudentArea.tsx) (`TokenPill`)  
- **Issue:** `⚡` as the token affordance while the rest of the product uses `Icon`.  
- **Evidence:** `<span aria-hidden>⚡</span>` in TokenPill.  
- **Recommendation:** Use `Icon name="spark"` (or similar).

---

## Prioritized roadmap

### P0 — Task completion / trust

1. Quiz `useBlocker` (+ optional draft autosave) — **F01**

### P1 — Clarity & density

2. Teacher dashboard: fewer KPIs + ErrorBanner/skeleton — **F02**  
3. Collapse class section chrome to one title bar — **F03**  
4. Quiz focused layout / sticky offset — **F06**

### P2 — Brand & polish

5. Class hub real “what’s next” for students — **F04**  
6. Brand/violet cleanup + quiz-gen IA — **F07**, **F08**  
7. Headings, crumbs, errors, drawer/video a11y, token icon — **F05**, **F09–F12**

---

## Strengths to preserve

- Grouped tenant IA and demoted layout greeting  
- Shared accessible `Modal` + Empty/Error/Spinner primitives  
- Chat mobile master–detail; Live invite/end on Modal  
- Class hero only on dashboard; price off class browsing cards  
- Breadcrumb param fill + real section labels  
- Tenant `BrandMark` on landing/register/shell  
- Role-distinct dashboards with deep-links into live/AI/chat  

---

## Out of scope / notes

- Parent Trust public report and full platform-admin product UX not deep-reviewed this pass  
- No visual regression screenshots—findings are code-structure based  
- LiveClassRoom full-screen `fixed inset-0` is intentional (End uses Modal)  

---

## How to re-run this audit

Invoke **Senior UI/UX Engineer** (`.cursor/skills/senior-uiux-engineer/SKILL.md`) against specified routes or a PR diff. Update this file in place with a new **Date** and extend the “Closed since prior audit” table.
