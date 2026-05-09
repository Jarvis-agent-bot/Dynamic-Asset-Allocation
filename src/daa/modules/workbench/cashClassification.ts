/**
 * cashClassification.ts
 *
 * 将账户现金分为三层（Tiered Cash Framework），与行业主流做法对齐：
 *
 * Tier 1 - 运营储备（Operational Reserve）
 *   用户配置的最小现金比例，永远不动，用于应急/即将发生的支出。
 *
 * Tier 2 - 策略性现金（Strategic Cash）
 *   放在货币基金/短债类持仓中的资金，拥有 targetWeightPct，
 *   视为一类资产参与正常的偏移再平衡计算，而非"闲置"。
 *
 * Tier 3 - 可投闲置现金（Investable Idle Cash）
 *   真正未配置的现金。产生"现金拖累（cash drag）"。
 *   超过阈值且冷静期结束后，触发"配置闲置资金"建议（cash_idle trigger）。
 *   注意：该建议是 BUY-only 的轻量操作，独立于完整再平衡流程。
 */

type CashClassification = {
  // ── Tier 1 ──────────────────────────────────────────────────────
  /** 运营储备金额（基准货币）*/
  operationalReserve: number;
  /** 运营储备占总权益比 */
  operationalReservePct: number;

  // ── Tier 2 ──────────────────────────────────────────────────────
  /** 策略性现金（货基等持仓）的当前市值（基准货币）*/
  strategicCash: number;
  /** 策略性现金占总权益比 */
  strategicCashPct: number;
  /**
   * 策略性现金相对目标权重的漂移
   * 正数 = 超配，负数 = 低配，参与正常再平衡计算
   */
  strategicCashDriftPct: number;

  // ── Tier 3 ──────────────────────────────────────────────────────
  /** 可投闲置现金金额（基准货币）= 流动现金 - 运营储备 */
  investableIdle: number;
  /** 可投闲置现金占总权益比 */
  investableIdlePct: number;

  // ── 状态判断 ─────────────────────────────────────────────────────
  /** 当前闲置现金连续闲置的天数 */
  cashIdleDays: number;
  /** 近期有新入金，仍在冷静期内，不推送配置建议 */
  recentDepositCooldownActive: boolean;
  /** 是否触发闲置现金警告（超阈值 + 冷静期结束 + 确实有闲置）*/
  cashIdleWarning: boolean;
  /** 现金配置建议 */
  cashDeployAdvice: "hold" | "deploy_to_underweight" | "monitor";

  // ── 原始数据 ─────────────────────────────────────────────────────
  totalCash: number;
  frozenCash: number;
  totalEquity: number;
};

type CashClassificationConfig = {
  /**
   * 运营储备占总权益的比例（0-1），用户在系统配置中设定。
   * 默认 0（不强制保留储备）。
   */
  operationalReservePct: number;
  /**
   * 闲置现金阈值比例（0-1）：investableIdlePct 超过此值时触发警告。
   * 默认 0.10（10%）。
   */
  idleThresholdPct: number;
  /**
   * 新入金后的冷静期（天数）：冷静期内不推送配置建议，让用户有时间决策。
   * 默认 7 天。
   */
  idleCooldownDays: number;
};

type CashClassificationInput = {
  /** 账户总现金余额（基准货币）*/
  totalCash: number;
  /** 冻结现金（挂单中等）*/
  frozenCash: number;
  /** 总权益（含持仓 + 现金，基准货币）*/
  totalEquity: number;
  /** 资产宇宙（用于识别货基类持仓）*/
  assetUniverse: Array<{
    holdingQty: number;
    valuationBase: number | null;
    targetWeightPct: number;
    holdingTags: string[];
  }>;
  /** 配置参数 */
  config: CashClassificationConfig;
  /**
   * 最近一次入金时间（ISO 字符串），用于判断冷静期。
   * 若无记录，视为资金已沉淀较久。
   */
  lastDepositAt: string | null;
};

import { toFinite } from "@/src/daa/utils/normalize";

// 视为"策略性现金（货基/短债）"的持仓标签关键词
const STRATEGIC_CASH_TAGS = [
  "money_market",
  "cash_equivalent",
  "货基",
  "货币基金",
  "short_duration",
  "mma",
  "mmf",
];

function isStrategicCashAsset(tags: string[]): boolean {
  const normalized = tags.map((t) => String(t).toLowerCase().trim());
  return STRATEGIC_CASH_TAGS.some((tag) => normalized.includes(tag));
}

/**
 * 分类账户现金为三层，返回分析结果。
 * 这个函数是纯计算，无副作用，可在任何地方安全调用。
 */
export function classifyCash(input: CashClassificationInput): CashClassification {
  const totalCash = Math.max(0, toFinite(input.totalCash, 0));
  const frozenCash = Math.max(0, toFinite(input.frozenCash, 0));
  // 避免除零
  const totalEquity = Math.max(1, toFinite(input.totalEquity, 1));

  // ── Tier 1: 运营储备 ─────────────────────────────────────────────
  const reservePct = Math.max(0, Math.min(1, toFinite(input.config.operationalReservePct, 0)));
  const operationalReserve = Math.min(totalCash, reservePct * totalEquity);
  const operationalReservePct = operationalReserve / totalEquity;

  // ── Tier 2: 策略性现金（货基类持仓）───────────────────────────────
  let strategicCash = 0;
  let strategicCashTarget = 0;
  for (const asset of input.assetUniverse) {
    if (!isStrategicCashAsset(asset.holdingTags)) continue;
    if (!(asset.holdingQty > 0)) continue;
    const val = Math.max(0, toFinite(asset.valuationBase, 0));
    strategicCash += val;
    strategicCashTarget += (toFinite(asset.targetWeightPct, 0) / 100) * totalEquity;
  }
  const strategicCashPct = strategicCash / totalEquity;
  const strategicCashDriftPct = strategicCashPct - strategicCashTarget / totalEquity;

  // ── Tier 3: 可投闲置现金 ─────────────────────────────────────────
  // 策略性现金已计入持仓市值，不在 totalCash 里，所以直接从 liquidCash 减储备
  const liquidCash = Math.max(0, totalCash - frozenCash);
  const investableIdle = Math.max(0, liquidCash - operationalReserve);
  const investableIdlePct = investableIdle / totalEquity;

  // ── 闲置天数 ─────────────────────────────────────────────────────
  let cashIdleDays = 0;
  if (input.lastDepositAt) {
    const depositMs = Date.parse(input.lastDepositAt);
    if (Number.isFinite(depositMs)) {
      cashIdleDays = Math.max(0, Math.floor((Date.now() - depositMs) / (24 * 60 * 60 * 1000)));
    }
  } else if (investableIdle > 0) {
    // 无入金记录但有闲置资金 → 保守地认为已闲置很久
    cashIdleDays = 999;
  }

  const idleCooldownDays = Math.max(0, toFinite(input.config.idleCooldownDays, 7));
  // 冷静期：有入金记录（含当日入金，cashIdleDays=0）AND 还没过冷静期天数
  // 修正：cashIdleDays > 0 会导致当日入金被跳过，改用 input.lastDepositAt 判断是否有记录
  const recentDepositCooldownActive =
    input.lastDepositAt !== null &&
    Number.isFinite(Date.parse(input.lastDepositAt)) &&
    cashIdleDays < idleCooldownDays;

  const idleThresholdPct = Math.max(0, toFinite(input.config.idleThresholdPct, 0.1));
  const cashIdleWarning =
    investableIdle > 0 &&
    investableIdlePct > idleThresholdPct &&
    !recentDepositCooldownActive;

  // ── 建议 ─────────────────────────────────────────────────────────
  let cashDeployAdvice: CashClassification["cashDeployAdvice"];
  if (recentDepositCooldownActive) {
    // 刚入金，给用户决策时间
    cashDeployAdvice = "monitor";
  } else if (cashIdleWarning && cashIdleDays > idleCooldownDays) {
    cashDeployAdvice = "deploy_to_underweight";
  } else {
    cashDeployAdvice = "hold";
  }

  return {
    operationalReserve,
    operationalReservePct,
    strategicCash,
    strategicCashPct,
    strategicCashDriftPct,
    investableIdle,
    investableIdlePct,
    cashIdleDays,
    recentDepositCooldownActive,
    cashIdleWarning,
    cashDeployAdvice,
    totalCash,
    frozenCash,
    totalEquity,
  };
}
