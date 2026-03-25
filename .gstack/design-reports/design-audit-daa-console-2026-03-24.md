# Design Audit: DAA Console Frontend
**Date:** 2026-03-24
**Branch:** claude/elastic-hellman
**Type:** Source-code design review (no live server)
**Classifier:** APP UI (dashboard/workbench — data-dense, task-focused)

---

## First Impression (from code analysis)

**The site communicates** a professional, data-dense financial dashboard. The dark theme with cyan accent creates a "Bloomberg terminal meets modern SaaS" feel.

**I notice** a well-defined component library (DaaSurfaceUI) with consistent tone system (cyan/amber/green/red/indigo/slate), glassmorphism effects, and systematic CSS variable usage. The Chinese copy is natural and domain-appropriate.

**The first 3 things a user's eye would go to are:** (1) Summary metric cards (equity/cash), (2) Signal/cockpit section, (3) Tab navigation grid.

**If I had to describe this in one word:** *Structured*.

---

## Inferred Design System

### Fonts
- `--font-body`: Body text
- `--font-mono`: Monospace (data, codes)
- `--font-display`: Headings (display weight)
- ✅ Uses CSS variables, not hardcoded font stacks

### Color System
- **Primary:** Cyan `#38BDF8` (`var(--primary)`)
- **Amber:** Warning tone
- **Green:** Success (`var(--success)`)
- **Red:** Danger (`var(--danger)`)
- **Indigo:** Info (`var(--indigo)`) — `#818CF8`
- **Slate:** Muted/disabled
- ✅ 6-tone semantic system, consistent throughout
- ⚠️ Logo gradient uses `#38BDF8 → #818CF8` (cyan to indigo) — verges on the blue-to-purple gradient AI slop pattern

### Spacing & Radius
- Radius values: 10px, 12px, 14px, 16px, 18px, 20px — ⚠️ No systematic scale (not 4px-based multiples)
- Padding: mix of `px-3`, `px-3.5`, `px-4`, `py-2`, `py-2.5`, `py-3` — roughly on Tailwind 4px grid
- ✅ Spacing generally follows Tailwind's built-in scale

### Shadows
- Inner light line: `inset_0_1px_0_rgba(255,255,255,0.02)` — consistent signature
- Dialog shadow: `0_28px_72px_rgba(0,0,0,0.48)` — dramatic depth
- ✅ Systematic shadow language

---

## Design Score: B
## AI Slop Score: B+

---

## Category Grades

| Category | Grade | Key Findings |
|----------|-------|-------------|
| Visual Hierarchy | B+ | Clear focal points, summary header → cockpit → tabs flow. Squint test passes. |
| Typography | B | CSS variable fonts, scale present. Line-height/measure not explicitly enforced. |
| Color & Contrast | B | 6-tone system, semantic colors correct. Logo gradient slightly AI-slopy. |
| Spacing & Layout | B- | Non-systematic radius values (10/12/14/16/18/20px). Grid generally consistent. |
| Interaction States | B | Hover/focus states on buttons. Missing confirmation on some destructive actions. |
| Responsive | B+ | Mobile nav, sidebar collapse, responsive grid. sr-only skip link present. |
| Content & Microcopy | A- | Chinese copy is natural. Empty states have action buttons. Error messages specific. |
| AI Slop | B+ | Mostly clean. Logo gradient and some centered layouts are minor flags. |
| Motion | C+ | `transition-all` used in several places. No `prefers-reduced-motion` check found. |
| Performance Feel | B | Code splitting for rebalance section. Memoization present. No skeleton shimmer. |

---

## Findings (by impact)

### HIGH IMPACT

#### FINDING-001: Missing confirmation for destructive actions
**Category:** Interaction States
**What:** Cycle cancellation, position calibration, and watchlist removal execute immediately on click without confirmation dialog. A cycle cancellation is irreversible and could discard generated proposals.
**Where:** `useWorkbenchRebalanceFlow.ts`, `useWorkbenchAssetActions.ts`
**Fix:** Add `DaaSurfaceDialogShell` confirmation modal before destructive mutations (cancel cycle, remove from watchlist). Pattern: "确定要取消此周期吗？已生成的调仓建议将被清除。" with 确认/取消 buttons.

#### FINDING-002: ErrorBoundary uses light-mode hardcoded colors
**Category:** Color & Contrast
**What:** `WorkbenchErrorBoundary` uses `bg-red-50`, `text-red-800`, `text-red-600` — Tailwind light-mode colors. In this dark-theme app, the error boundary will render as a jarring white/light-red box.
**Where:** `WorkbenchPageClient.tsx:38-48`
**Fix:** Replace with `DaaSurfaceNoticeBox tone="red"` + action button, matching the dark theme. Or use `bg-red-900/20 text-red-300 border-red-800`.

#### FINDING-003: No `prefers-reduced-motion` support
**Category:** Motion
**What:** No CSS or JS check for `prefers-reduced-motion: reduce`. Sidebar collapse animation (300ms), button hover transitions, and any scroll animations will play regardless of user accessibility settings.
**Where:** `DashboardShell.tsx:71` (`transition-[width] duration-300`), `DaaSurfaceUI.tsx` (multiple `transition-all`)
**Fix:** Add `motion-safe:` prefix to Tailwind transitions, or add global CSS: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`

#### FINDING-004: `transition: all` used extensively
**Category:** Motion
**What:** `transition-all` appears in 12+ component class strings. This animates ALL properties (including layout properties like width/height/padding), which causes layout thrashing and can trigger jank.
**Where:** `DaaSurfaceUI.tsx` (field classes, buttons, pills), `DashboardShell.tsx`
**Fix:** Replace `transition-all` with specific property transitions: `transition-colors` for color-only changes, `transition-[border-color,box-shadow]` for focus rings, `transition-[width]` for sidebar.

### MEDIUM IMPACT

#### FINDING-005: Non-systematic border-radius values
**Category:** Spacing & Layout
**What:** Border radius uses 6 different values (10px, 12px, 14px, 16px, 18px, 20px) with no clear hierarchy or design token system. Fields use 14px, tables use 18px, panels use 16px, search uses 12px, dialogs appear custom.
**Where:** `DaaSurfaceUI.tsx` (all `rounded-[Npx]` declarations)
**Fix:** Define 3-4 radius tokens: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 20px`. Map: inputs → md, cards/panels → lg, dialogs/tables → xl.

#### FINDING-006: No loading skeleton shimmer
**Category:** Performance Feel
**What:** Loading states use spinners/empty text ("—") but no skeleton content that matches actual layout shapes. This creates a layout shift when data loads.
**Where:** `WorkbenchSummaryHeader.tsx:65` (`loading ? "—" : formatCurrency(...)`)
**Fix:** Add skeleton placeholder components matching metric card shapes. Use `animate-pulse bg-[var(--border)]` rectangles sized to match real content dimensions.

#### FINDING-007: Hardcoded rgba values in tone system
**Category:** Color & Contrast
**What:** `TONE_STYLE` in DaaSurfaceUI uses hardcoded rgba values (`rgba(56,189,248,0.28)`, `rgba(246,173,85,0.28)`, etc.) instead of deriving from CSS variables. If theme colors change, these won't update.
**Where:** `DaaSurfaceUI.tsx:16-47`
**Fix:** Use CSS `color-mix()` or `oklch()` with opacity, or define additional CSS variables: `--primary-border`, `--primary-bg`, etc.

#### FINDING-008: Tables load all data without pagination
**Category:** Performance Feel
**What:** Asset universe table and trade order list load all records. With 78+ featured assets and potentially hundreds of trade orders, this could cause slow renders at scale.
**Where:** `AssetUniverseTable.tsx`, `TradesSections.tsx` (order list limited to 300)
**Fix:** Add virtual scrolling (react-window or tanstack-virtual) for tables with 50+ rows, or implement cursor pagination with "Load more" button.

#### FINDING-009: Settings form has no progress indicator
**Category:** Content & Microcopy
**What:** Settings page has 6 sections in a long scrollable form. No indication of save progress or which sections have been modified.
**Where:** `settings/page.tsx`
**Fix:** Add sticky section nav with dirty-state indicators (colored dot next to modified section names). Show "X 项未保存" count in the save bar.

#### FINDING-010: No undo for quick actions
**Category:** Interaction States
**What:** Toast notifications for actions like "已加入观察列表", "已移出观察列表" show success but offer no undo mechanism. Accidental clicks require navigating back to reverse.
**Where:** `useWorkbenchAssetActions.ts:176, 215`
**Fix:** Add undo action to toast: `toast.success("已移出观察列表", { action: { label: "撤销", onClick: () => reAddToWatchlist(row) } })`

### POLISH

#### FINDING-011: Inconsistent icon sizing
**Category:** Visual Hierarchy
**What:** Icons use `h-4 w-4` (16px) for notices and `h-3.5 w-3.5` (14px) for sidebar buttons. No systematic icon size scale.
**Fix:** Standardize: inline icons 14px, section icons 16px, hero icons 20px.

#### FINDING-012: Logo gradient is slightly AI-slopy
**Category:** AI Slop
**What:** Brand logo uses `linear-gradient(135deg, #38BDF8, #818CF8)` (cyan to indigo/violet). This is a common AI-generated SaaS pattern.
**Where:** `DashboardShell.tsx:83`
**Fix:** Consider a single solid brand color or a more distinctive gradient direction/palette.

#### FINDING-013: `text-wrap: balance` not used on headings
**Category:** Typography
**What:** `DaaSurfacePageHeader` h1 headings don't use `text-wrap: balance` or `text-pretty`, which would improve heading line-break quality on narrow screens.
**Where:** `DaaSurfaceUI.tsx:105`
**Fix:** Add `text-balance` (Tailwind v4) or `style={{ textWrap: "balance" }}` to headings.

#### FINDING-014: No `font-variant-numeric: tabular-nums` on financial figures
**Category:** Typography
**What:** Financial metrics (equity, cash values) display currency amounts that would benefit from tabular numeral alignment for consistent column widths.
**Where:** `WorkbenchSummaryHeader.tsx`, `daaFormatters.ts`
**Fix:** Add `tabular-nums` to metric card number elements.

---

## Quick Wins (highest-impact, lowest-effort)

1. **Fix ErrorBoundary dark mode** (FINDING-002) — 5 min, swap Tailwind classes
2. **Replace `transition-all`** (FINDING-004) — 15 min, find-replace across DaaSurfaceUI
3. **Add `prefers-reduced-motion`** (FINDING-003) — 5 min, add global CSS rule
4. **Add tabular-nums to financial figures** (FINDING-014) — 5 min, one class addition
5. **Add `text-wrap: balance` to headings** (FINDING-013) — 2 min, one class addition

---

## UX Interaction Logic Assessment

### Strengths
1. **Clear state machine for execution flow:** Generate proposals → Review → Select → Preview → Confirm → Execute. Well-modeled in hooks.
2. **Comprehensive error feedback:** Every API call has toast success/error. Error messages are specific and in Chinese.
3. **URL-driven tab state:** Browser back/forward works. Deep links work. Tab state persists.
4. **Progressive disclosure:** Cockpit section shows top 6 signals with links to detail views. Rebalance section has checklist gates before execution.
5. **Market data health awareness:** Banner stack warns users when data is stale/degraded before they make decisions.
6. **Accessibility baseline:** Skip-to-content link, ARIA roles, semantic HTML, focus-visible rings.

### Areas for Improvement
1. **Destructive action safety:** No confirmation modals for cycle cancellation, watchlist removal, or position calibration. Risk: accidental clicks lose generated proposals.
2. **Form validation timing:** Settings use inline validation but no debounce. Rapid typing triggers multiple re-renders.
3. **No optimistic updates:** All mutations wait for server response before updating UI. Could feel sluggish on slow connections.
4. **No offline/error recovery:** If API fails mid-execution, no retry queue. User must manually retry.
5. **Assistant chat UX:** Chat panel is embedded in workbench cockpit. No message streaming indicator, no typing animation, no message grouping by time.

---

## Architecture Quality Notes

| Aspect | Assessment |
|--------|-----------|
| Component granularity | ✅ Well-decomposed. Each section is its own component. |
| Hook composition | ✅ Clean separation: data (useWorkbenchModel) → actions (useWorkbenchAssetActions) → flow (useWorkbenchRebalanceFlow) |
| State management | ✅ No Redux/Zustand needed. URL params + hooks + API is appropriate for this scale. |
| Code splitting | ⚠️ Only rebalance section is dynamically imported. Settings and trades pages could benefit too. |
| Error boundaries | ⚠️ Only one boundary at workbench level. Trades and settings pages have none. |
| TypeScript safety | ✅ Props types defined for all components. No `any` in UI layer. |

---

**STATUS: DONE**
**Design Score: B** (solid fundamentals, minor inconsistencies)
**AI Slop Score: B+** (mostly clean, minor flags)
**Findings: 14 total** (4 high, 6 medium, 4 polish)
