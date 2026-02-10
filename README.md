# Dynamic Asset Allocation (DAA)

这是一个以 **Dynamic Asset Allocation（DAA）** 为核心的产品化系统（Next.js App Router + 可测试的 core 算法层 + 可选的 Python 在线引擎）。

- 线上入口（VPS）：https://exwxyzi.cn/daa/
- 目标交付方式：按 Step 页面逐步交付，从“可运行闭环”开始，再逐步增强策略/数据/资金管理/推荐/解释。

> 说明：本仓库为 `Jarvis-agent-bot/Dynamic-Asset-Allocation`，持续维护中。

## Product 结构（前端优先）

- `/daa/step/*`：引导式工作流页面（产品主线）
- `/daa/market/funds/`：legacy「基金估值/重仓」模块（保留 + 归位为 DAA 子模块，不再作为项目对外主定位）

## 🧠 DAA 核心（算法层）

算法/回测相关代码位于 `src/core/`（尽量保持 UI 无关、可测试）：

- 基础工程文档：[`docs/DAA_FOUNDATION.md`](./docs/DAA_FOUNDATION.md)（模块边界 + 核心数据模型）
- 信号规格（v0）：[`docs/DAA_SIGNAL_SPEC_V0.md`](./docs/DAA_SIGNAL_SPEC_V0.md)

- `src/core/domain.ts`：核心数据模型（Asset/Portfolio/Strategy/BacktestResult/MarketEvent 等）
- `src/core/strategies.ts`：策略接口实现（如 Buy&Hold、SMA crossover、策略组合 ensemble）
- `src/core/signals.ts`：fixed-weight ensemble → BUY/SELL/HOLD 信号输出（v0）
- `src/core/backtest.ts`：最小回测闭环（单资产、日频、无手续费 v0）
- `src/core/metrics.ts`：收益/回撤/夏普/胜率等指标 + 评分
- `src/core/providers/priceSeriesProvider.ts`：framework v0 provider contract（价格序列提供方 + 合同校验 + 包装错误类型）

### Framework v0 快速上手（Contracts + Provider + E2E）

框架 v0 的目标是：用一套最小但严格的 contracts，把「数据提供（provider）」与「回测/信号核心」隔离开，便于后续接入真实数据源与 UI。

- Provider 只需要实现 `PriceSeriesProvider#getPriceSeries()`
- 调用侧用 `fetchValidatedPriceSeries()`（或 `fetchValidatedPriceSeriesEnforcingRange()`）获取并校验数据
- E2E 样例测试位于：`src/core/__tests__/frameworkV0.e2e.test.ts`

```ts
import type { PriceSeriesProvider } from "./src/core/providers";
import { fetchValidatedPriceSeries } from "./src/core/providers";

const provider: PriceSeriesProvider = {
  name: "example",
  async getPriceSeries({ symbol }) {
    // return [{ date: "2026-01-01", close: 100 }, ...]
    throw new Error(`not implemented: ${symbol}`);
  },
};

await fetchValidatedPriceSeries(provider, {
  symbol: "SPY",
  start: "2026-01-01",
  end: "2026-02-01",
});
```

> 路线（按顺序推进）：回测算法组合 → 市场信息（Twitter+yfinance/雪球）→ 资金管理 → 基准买卖推荐 → AI 分析 → 人因模型 → Tag 体系

## Python 在线引擎（可选）

- Python 引擎对外通过 Nginx 前缀：`/daa-api/`
- 典型健康检查：`https://exwxyzi.cn/daa-api/health`
- Next.js 同域 API（供前端调用）：`/api/daa/*`（例如 Step4/Step5 调用的 `POST /api/daa/rebalance/simulate`）

部署相关：见 `deploy/README.md`。

## ✨ 当前已交付（v0）

- Step 页面产品化骨架（/daa/step/*）
- 最小 contracts/providers + 测试闭环（pnpm test/typecheck/build）
- v0 再平衡建议：Step4/Step5 通过 `POST /api/daa/rebalance/simulate` 生成建议，并在 UI 展示“建议 + 解释 + 可复制 JSON”

## 🛠 技术栈

- 前端：Next.js（App Router）+ TypeScript（strict）
- 算法：TypeScript core（可测试）
- 引擎：FastAPI（可选在线 API）
- 部署：VPS（Docker + Nginx）

## 🚀 快速开始

### 本地开发

```bash
git clone git@github.com:Jarvis-agent-bot/Dynamic-Asset-Allocation.git
cd Dynamic-Asset-Allocation
pnpm install
pnpm dev
```

打开 http://localhost:3000/daa/

### 构建与测试

```bash
pnpm test
pnpm run typecheck
pnpm build
```

## 📄 License

本项目采用 **[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)**（AGPL-3.0）。

---
Maintained by [Jarvis-agent-bot](https://github.com/Jarvis-agent-bot)
