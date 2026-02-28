# Dynamic Asset Allocation (DAA)

这是一个以 **Dynamic Asset Allocation（DAA）** 为核心的产品化系统（Next.js App Router + 可测试的 core 算法层 + 可选的 Python 在线引擎）。

- 线上入口（VPS）：https://exwxyzi.cn/daa/
- 当前产品入口：统一控制台（Unified Core）。

> 说明：本仓库为 `Jarvis-agent-bot/Dynamic-Asset-Allocation`，持续维护中。

## Product 结构（前端优先）

- `/daa/dashboard?tab=unified-core`：DAA 统一运营台（核心入口）
- `/daa/dashboard?tab=settings`：账号、会话、权限配置页
- `/daa`：入口重定向到 Unified Core

## 🧠 DAA 核心（算法层）

算法/回测相关代码位于 `src/core/`（尽量保持 UI 无关、可测试）：

- 基础工程文档：[`docs/DAA_FOUNDATION.md`](./docs/DAA_FOUNDATION.md)（模块边界 + 核心数据模型）
- 信号规格（v0）：[`docs/DAA_SIGNAL_SPEC_V0.md`](./docs/DAA_SIGNAL_SPEC_V0.md)
- 全局架构指引（v1）：[`docs/DAA_GLOBAL_ARCHITECTURE_GUIDE.md`](./docs/DAA_GLOBAL_ARCHITECTURE_GUIDE.md)（再平衡 + 人因 + 风控一体化）

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

> 路线（按顺序推进）：回测算法组合 → 市场信息（Twitter+yfinance/雪球）→ 资金管理 → 统一再平衡推荐 → AI 分析 → 人因模型 → Tag 体系

## Python 在线引擎（可选）

- Python 引擎对外通过 Nginx 前缀：`/daa-api/`
- 典型健康检查：`https://exwxyzi.cn/daa-api/health`
- Next.js 同域 API（供前端调用）：`/api/daa/*`（例如 `POST /api/daa/rebalance/unified`）

部署相关：见 `deploy/README.md`。

## ✨ 当前已交付（v1）

- Unified Core 控制台（算法层 + 人因层 + 风控层一体化）
- 统一输入模型（`daa.unified.input.v1`）+ 旧 key 自动清理机制
- 最小 contracts/providers + 测试闭环（pnpm test/typecheck/build）
- 统一再平衡 API：`POST /api/daa/rebalance/unified`

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

### 本地登录与数据库说明

- DAA 鉴权默认使用 Postgres（环境变量 `DAA_DB_URL` 或 `DATABASE_URL`）。
- 若本地未配置数据库连接，开发模式会自动启用内置 `pg-mem`（免配置即可用账号密码登录）。
- 开发默认账号：`admin / admin123`（仅非生产环境自动初始化）。
- 统一输入模型主存储：`daa.unified.input.v1`（已直接作为唯一写入通道）。

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
