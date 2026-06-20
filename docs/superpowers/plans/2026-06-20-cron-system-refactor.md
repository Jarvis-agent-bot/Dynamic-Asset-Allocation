# Cron System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低线上 cron 重叠、日志噪声和重复 AI 审核风险，并把重任务从高频行情刷新中拆出去。

**Architecture:** 先在系统调度层做小步重构：Docker cron 负责错峰和日志摘要，业务 route 只返回结构化结果；价格刷新只做价格/快照/报警，股息归到专用 dividend-refresh；风险触发复核通过独立 automation 模块做日级幂等。

**Tech Stack:** TypeScript、Next.js route handlers、Vitest、Docker Compose、PostgreSQL runtime migrations。

---

### Task 1: 价格刷新瘦身

**Files:**
- Modify: `app/api/daa/cron/price-refresh/route.ts`
- Test: `src/daa/__tests__/cronMarketCacheRoutes.test.ts`

- [ ] **Step 1: Write failing test**: assert `price-refresh` does not call `extractDividendsFromRawPayloads` and no longer returns `dividendExtracted`.
- [ ] **Step 2: Run focused test**: `pnpm vitest run src/daa/__tests__/cronMarketCacheRoutes.test.ts`.
- [ ] **Step 3: Remove dividend extraction from price refresh**.
- [ ] **Step 4: Re-run focused test**.

### Task 2: 风险复核幂等模块

**Files:**
- Create: `src/daa/automation/riskAutopilotTrigger.ts`
- Modify: `app/api/daa/cron/drift-check/route.ts`
- Test: `src/daa/__tests__/riskAutopilotTrigger.test.ts`
- Test: `src/daa/__tests__/cronRemainingRoutes.test.ts`

- [ ] **Step 1: Write failing tests**: stable daily key by timezone + risk triggers, and drift-check calls `runRiskAutopilotDaily`.
- [ ] **Step 2: Run focused tests**.
- [ ] **Step 3: Implement module and route integration**.
- [ ] **Step 4: Re-run focused tests**.

### Task 3: Docker cron 错峰与日志摘要

**Files:**
- Modify: `docker-compose.yml`
- Add: `.dockerignore`
- Test: `src/daa/__tests__/dockerComposeCron.test.ts`

- [ ] **Step 1: Write failing tests**: cron entries use `daa-cron-curl`, heavy jobs avoid minute 0/30 collisions, `.dockerignore` excludes build/cache/env artifacts.
- [ ] **Step 2: Run test**.
- [ ] **Step 3: Add cron wrapper and stagger schedules**.
- [ ] **Step 4: Re-run test**.

### Task 4: Raw payload scan index

**Files:**
- Modify: `src/daa/store/runtimeMigrations.ts`
- Test: `src/daa/__tests__/runtimeMigrations.test.ts`

- [ ] **Step 1: Write failing test**: migration includes `(provider, resource, fetched_at DESC)` index.
- [ ] **Step 2: Add runtime migration**.
- [ ] **Step 3: Re-run migration test and focused cron tests**.
