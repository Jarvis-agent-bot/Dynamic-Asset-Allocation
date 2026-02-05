/**
 * Core domain models (minimal v0)
 * Keep this layer UI-agnostic and testable.
 */

/** @typedef {{ date: string, close: number }} PriceBar */

/**
 * @typedef {Object} Strategy
 * @property {string} id
 * @property {string} name
 * @property {(series: PriceBar[]) => number[]} weights
 *   Returns target weight per bar (0..1 for single-asset). Same length as series.
 */

/**
 * @typedef {Object} BacktestResult
 * @property {string} strategyId
 * @property {string} strategyName
 * @property {number[]} equity
 * @property {number[]} dailyReturns
 * @property {{ totalReturn: number, maxDrawdown: number, sharpe: number, winRate: number }} metrics
 */

export {}; 
