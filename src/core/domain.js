/**
 * DAA core domain types (JSdoc typedefs).
 *
 * Purpose:
 * - Keep the algorithm layer UI-agnostic and testable.
 * - Provide a shared vocabulary across backtest / allocation / market-info modules.
 *
 * Note: This file intentionally exports nothing; it is consumed via IDE/TS tooling.
 */

/**
 * @typedef {Object} Asset
 * @property {string} id - Stable internal id (e.g. "spy")
 * @property {string} symbol - Trading symbol / ticker (e.g. "SPY")
 * @property {string} [name]
 * @property {"equity"|"bond"|"cash"|"commodity"|"crypto"|"fund"|"other"} [assetClass]
 * @property {string} [currency]
 */

/**
 * @typedef {Object} PriceBar
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {number} close
 */

/**
 * @typedef {Object} Position
 * @property {string} assetId
 * @property {number} weight - 0..1 fraction of portfolio NAV
 */

/**
 * @typedef {Object} Portfolio
 * @property {string} id
 * @property {string} name
 * @property {Position[]} positions
 */

/**
 * Strategy interface.
 *
 * For now we keep strategies as pure functions over a single asset series.
 * Later we can extend to multi-asset (seriesByAssetId) without breaking callers.
 *
 * @typedef {Object} Strategy
 * @property {string} id
 * @property {string} name
 * @property {(series: PriceBar[]) => number[]} weights
 *   Returns target weight per bar (0..1 for single-asset). Same length as series.
 */

/**
 * @typedef {Object} Metrics
 * @property {number} totalReturn
 * @property {number} maxDrawdown
 * @property {number} sharpe
 * @property {number} winRate
 */

/**
 * @typedef {Object} BacktestResult
 * @property {string} strategyId
 * @property {string} strategyName
 * @property {number[]} equity
 * @property {number[]} dailyReturns
 * @property {Metrics} metrics
 */

/**
 * Structured market-information item used by the "market info" module.
 *
 * @typedef {Object} MarketEvent
 * @property {string} id
 * @property {"twitter"|"yfinance"|"xueqiu"|"other"} source
 * @property {string} ts - ISO timestamp
 * @property {string} title
 * @property {string} [summary]
 * @property {string[]} [symbols]
 * @property {"bullish"|"bearish"|"neutral"|"unknown"} [sentiment]
 * @property {number} [confidence] - 0..1
 */

export {};
