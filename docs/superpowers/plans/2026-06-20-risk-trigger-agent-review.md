# 风控触发即时复核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 drift-check 中的止盈/止损触发只针对可行动仓位，并在存在可行动风险项时立即触发投资助理复核。

**Architecture:** 新增统一的仓位可行动性判断模块，由风险触发收集函数、risk signal、risk cycle draft 和 drift-check 共用。drift-check 继续保持当前 cron 节奏，风险触发后调用现有 `runAutopilotLoop` 做 event-driven 审核，并把审核结果写入接口返回。

**Tech Stack:** TypeScript、Next.js route handler、Vitest、现有 DAA workbench/autopilot 模块。

---

### Task 1: 仓位可行动性入口

**Files:**
- Create: `src/daa/modules/portfolio-state/positionMateriality.ts`
- Modify: `src/daa/modules/portfolio-state/positionPnl.ts`
- Test: `src/daa/modules/portfolio-state/positionPnl.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that prove low notional and tiny quantity positions are excluded when materiality config is passed, while normal risk positions still trigger.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/daa/modules/portfolio-state/positionPnl.test.ts`

Expected: FAIL because `collectRiskTriggerAssets` does not accept/apply materiality yet.

- [ ] **Step 3: Write minimal implementation**

Create `evaluatePositionMateriality` and let `collectRiskTriggerAssets` apply it only when `materiality` is provided, preserving old callers by default.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/daa/modules/portfolio-state/positionPnl.test.ts`

Expected: PASS.

### Task 2: drift-check 风控复核

**Files:**
- Modify: `app/api/daa/cron/drift-check/route.ts`
- Modify: `src/daa/agent/autopilotOrchestrator.ts`
- Test: `src/daa/__tests__/cronRemainingRoutes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that prove drift-check ignores dust risk rows in notifications and invokes `runAutopilotLoop` with actionable symbols when risk rows remain.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/daa/__tests__/cronRemainingRoutes.test.ts`

Expected: FAIL because drift-check does not call `runAutopilotLoop` and does not report ignored dust rows.

- [ ] **Step 3: Write minimal implementation**

Import `runAutopilotLoop`, add `cron_drift_check` event source, pass materiality config from `strategy.constraints.minNotional`, and record `riskAgentReview` in the route result.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/daa/__tests__/cronRemainingRoutes.test.ts`

Expected: PASS.

### Task 3: 共用链路收口

**Files:**
- Modify: `src/daa/modules/signals/riskSignalService.ts`
- Modify: `src/daa/modules/workbench/workbenchModeling.ts`
- Test: `src/daa/modules/workbench/workbenchRiskCycleDraft.test.ts`

- [ ] **Step 1: Apply the same materiality config**

Pass `strategy.constraints.minNotional` into risk signal collection and `bootstrap.execution.minNotional` into risk cycle draft.

- [ ] **Step 2: Run focused verification**

Run: `pnpm vitest run src/daa/modules/portfolio-state/positionPnl.test.ts src/daa/modules/workbench/workbenchRiskCycleDraft.test.ts src/daa/__tests__/cronRemainingRoutes.test.ts`

Expected: PASS.
