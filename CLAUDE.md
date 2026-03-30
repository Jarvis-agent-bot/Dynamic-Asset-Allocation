# DAA Console — Dynamic Asset Allocation

## Project Overview

DAA Console 是面向个人投资者的单组合动态资产配置工作台。
核心流程：**资产发现 → 洞察分析 → 再平衡 → 执行 → 复盘**

当前为模拟执行模式，不对接真实券商。

## Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: Tailwind CSS, shadcn/ui, Framer Motion
- **Database**: PostgreSQL
- **Auth**: Supabase Auth (email-based)
- **LLM**: DeepSeek (primary), OpenAI-compatible fallback
- **Charts**: Recharts
- **Package Manager**: pnpm 10
- **Test**: Vitest (unit), Playwright (e2e)

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (requires PostgreSQL + .env.local)
pnpm test             # Run unit tests (vitest)
pnpm typecheck        # TypeScript type check
pnpm gates            # Full gate: test + typecheck + build
pnpm build            # Production build
```

## Project Structure

```
app/
├── api/daa/                    # Backend API routes
│   ├── workbench/              # Asset discovery, insights, rebalancing, execution
│   ├── market/                 # Market data proxies (yahoo, xueqiu, danjuan, twitter)
│   ├── store/                  # Data persistence (config, secrets, ledger, snapshots)
│   ├── read/                   # Read aggregates (workbench, trades)
│   ├── cron/                   # Scheduled jobs (price, fx, news, drift, analysis)
│   ├── hf/                     # Hedge fund manager holdings tracking
│   └── auth/                   # Authentication
├── daa/dashboard/              # Frontend pages
│   ├── workbench/              # Asset pool, insights, rebalancing UI
│   ├── trades/                 # Trade records
│   └── settings/               # Config, credentials, notifications

src/
├── core/                       # Pure algorithm layer (no side effects, fully testable)
│   ├── ensemble/               # Multi-strategy weighting & combination
│   ├── backtest/               # Attribution analysis
│   ├── rebalanceCore.ts        # Core rebalancing math (orders, drift, constraints)
│   ├── config.ts               # Ensemble strategy weighting config
│   └── domain.ts               # Core types (PriceBar, Strategy, Signal)
├── daa/                        # Business logic & orchestration
│   ├── modules/
│   │   ├── workbench/          # Asset universe, decision fusion, execution
│   │   ├── portfolio/          # Position tracking
│   │   ├── trade/              # Trade ticket lifecycle
│   │   ├── marketContext/      # Market regime detection (risk_off/risk_on)
│   │   ├── decision/           # Proposal decision context
│   │   └── dividend/           # Dividend tracking
│   ├── signals/                # Three-dimensional signal fusion
│   │   ├── technicalSignal.ts  # SMA, momentum, trend
│   │   ├── valuationSignal.ts  # PE, dividend yield, relative value
│   │   ├── newsSignal.ts       # Sentiment analysis
│   │   └── fusion.ts           # Multi-signal fusion engine
│   ├── store/                  # PostgreSQL persistence layer
│   ├── pg/                     # Connection pooling, schema migration
│   ├── config/                 # System config, secrets, currency
│   └── llm/                    # LLM integration (analysis, decisions)
├── market/                     # Market data clients
│   ├── yfinance.ts             # Yahoo Finance adapter
│   ├── yahooRssFetch.ts        # News RSS fetching
│   ├── marketDataClient.ts     # Unified market data API client
│   └── constants.ts            # Shared constants (User-Agent etc.)
```

## Asset Classes & Coverage

### Supported Asset Classes (AssetClass type)
`EQUITY` | `ETF` | `BOND` | `COMMODITY` | `CASH` | `CRYPTO` | `FUND` | `INDEX` | `CURRENCY` | `OTHER`

### Supported Regions (Region type)
`US` | `HK` | `CN` | `EU` | `JP` | `GLOBAL` | `OTHER`

### Featured Assets Catalog (87 items)

| Category | Count | Examples |
|----------|-------|---------|
| US Equities | 8 | AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, BRK-B |
| HK Equities | 8 | 0700.HK (腾讯), 9988.HK (阿里), 3690.HK (美团) |
| CN A-shares | 8 | 600519.SS (茅台), 300750.SZ (宁德), 601318.SS (平安) |
| US/Global ETFs | 13 | SPY, QQQ, VTI, IWM, EFA, EEM, INDA, EWJ, VNQ |
| HK ETFs | 2 | 2800.HK (盈富), 2823.HK (A50) |
| CN ETFs | 2 | 510300.SS (沪深300), 159915.SZ (创业板) |
| Commodities | 7 | GLD, IAU (黄金), SLV (白银), USO, BNO (原油), DBC, DBA |
| US Bonds | 6 | BND, TLT, IEF, LQD, TIP, SGOV |
| CN Bonds | 2 | 511010.SS (国债), 511260.SS (十年国债) |
| HK Bonds | 2 | 3141.HK (亚洲高息), 2819.HK (美元债) |
| Crypto | 3 | BTC-USD, ETH-USD, SOL-USD |
| Currency | 8 | UUP (美元多头), UDN (美元空头), FXE (欧元), FXY (日元), FXB (英镑), FXA (澳元), CYB (人民币), CEW (新兴货币) |

## Key Architecture Concepts

### Asset Key Format
`{MARKET}:{SYMBOL}` — e.g., `US:AAPL`, `HK:0700.HK`, `CRYPTO:BTC-USD`
See `src/daa/assetKey.ts` for parsing/normalization utilities.

### Signal Fusion (Three Dimensions + Human)
Default weights: Human 35% + Technical 25% + News 20% + Valuation 20%

### Market Indicators (7 dimensions)
- `vix` — S&P 500 volatility
- `qqqSpyRatio` — Growth vs Value
- `fxiVolatility` — Foreign market exposure
- `kwebFxiRatio` — Tech vs China
- `btcEthRatio` — Crypto market stage
- `btcVolatility` — Crypto volatility
- `goldSilverRatio` — Risk-off/on signal

### Rebalancing Strategies
- Calendar-based (monthly / quarterly / semi-annual / annual)
- Drift-based (threshold-triggered, configurable)
- Risk-aware order generation with pre-trade checks

### Ensemble Backtest Strategies
`momentum` | `riskParity` | `minVariance` | `equalWeight` | `baseline`

## Database

Schema managed via runtime migrations in `src/daa/store/runtimeMigrations.ts`.

Core tables: `daa_account_state_v2`, `daa_asset_master`, `daa_portfolio_positions`,
`daa_target_allocations`, `daa_market_price_snapshots`, `daa_watchlist_entries`,
`daa_strategy_lab_run_snapshots`, `daa_job_execution_logs`

## Key Files

| Purpose | Path |
|---------|------|
| Asset taxonomy & types | `src/daa/modules/workbench/assetTaxonomy.ts` |
| Featured asset catalog | `src/daa/modules/workbench/featuredAssetsCatalog.ts` |
| Rebalancing engine | `src/core/rebalanceCore.ts` |
| Signal fusion | `src/daa/signals/fusion.ts` |
| System config model | `src/daa/config/systemConfig.ts` |
| Market data client | `src/market/marketDataClient.ts` |
| DB schema migrations | `src/daa/store/runtimeMigrations.ts` |
| Workbench types | `src/daa/modules/workbench/workbenchTypes.ts` |
| Ensemble strategy | `src/core/ensemble/strategy.ts` |
| Core domain types | `src/core/domain.ts` |
| Asset key utilities | `src/daa/assetKey.ts` |
| API rate limiting | `src/daa/api/rateLimit.ts` |
| Market data constants | `src/market/constants.ts` |

## Development Conventions

- **Language**: All source code in TypeScript; comments and UI copy in Chinese (简体)
- **Pure vs Side-effect**: `src/core/` is pure algorithm code (no DB, no network); `src/daa/` handles orchestration and side effects
- **API routes**: Next.js App Router convention under `app/api/daa/`
- **Testing**: Vitest for unit tests; test files colocated or in `__tests__/` directories
- **Gate check**: Always run `pnpm gates` (test + typecheck + build) before considering a change complete
- **Database**: Requires real PostgreSQL (DAA_DB_URL in .env.local). Integration tests (12 files) skip automatically when no DB is configured.

## Cron Jobs (Scheduled Tasks)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Price refresh | Every 15 min | Update market prices |
| FX refresh | Daily 5am UTC | Currency exchange rates |
| News refresh | Every 30 min | RSS/Twitter sentiment |
| Market indicators | Every 30 min | VIX, ratios, volatility |
| Daily analysis | Hourly | LLM market environment |
| Drift check | 1am & 9am UTC | Rebalance trigger detection |
| Fund manager holdings | 8am UTC | Hedge fund tracking |
| Dividend refresh | 1:30am UTC | Dividend data |
| Cache cleanup | 8:20pm UTC | Stale data removal |

## Notifications

Supported channels: Email (Resend), Telegram Bot, Feishu (Lark) Webhook.
Configured via Settings page or `daa_system_config_v2` in database.

## Not Yet Implemented

- Real broker integration / live execution
- Multiple portfolio management
- Options / derivatives support
- FX hedging strategies
- Real-time streaming prices (currently batch)
