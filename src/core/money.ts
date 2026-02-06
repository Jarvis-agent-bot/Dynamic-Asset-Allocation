export type RiskPreference = "high" | "mid" | "low";
export type RiskScore = "high" | "mid" | "low" | "sb"; // 你的标签里保留“傻逼”

export type Tags = {
  riskPreference?: RiskPreference;
  riskScore?: RiskScore;
  // future: custom tags
  custom?: string[];
};

export type MoneyAccount = {
  baseCcy: string; // e.g. CNY/USD
  totalEquity: number; // total capital
  cash: number; // available cash
  investable: number; // portion allowed to allocate
};

export type Constraints = {
  maxPositionPct: number; // 0..1
  maxIn: number; // max deposit per operation (absolute)
  maxOut: number; // max withdraw per operation (absolute)
};

export type AllocationItem = {
  id: string;
  label: string;
  targetPct: number; // 0..1
  tags?: Tags;
};

export type MoneyPlan = {
  account: MoneyAccount;
  constraints: Constraints;
  allocations: AllocationItem[];
};

export type MoneyValidationIssue = {
  path: string;
  message: string;
};

export function validateMoneyPlan(plan: MoneyPlan): MoneyValidationIssue[] {
  const issues: MoneyValidationIssue[] = [];

  const num = (x: unknown) => (typeof x === "number" ? x : Number(x));

  if (!plan.account.baseCcy) issues.push({ path: "account.baseCcy", message: "baseCcy required" });

  const total = num(plan.account.totalEquity);
  const cash = num(plan.account.cash);
  const investable = num(plan.account.investable);

  if (!Number.isFinite(total) || total <= 0) issues.push({ path: "account.totalEquity", message: "must be > 0" });
  if (!Number.isFinite(cash) || cash < 0) issues.push({ path: "account.cash", message: "must be >= 0" });
  if (!Number.isFinite(investable) || investable < 0) issues.push({ path: "account.investable", message: "must be >= 0" });
  if (Number.isFinite(total) && Number.isFinite(cash) && cash > total) {
    issues.push({ path: "account.cash", message: "cash cannot exceed totalEquity" });
  }
  if (Number.isFinite(total) && Number.isFinite(investable) && investable > total) {
    issues.push({ path: "account.investable", message: "investable cannot exceed totalEquity" });
  }

  const maxPos = num(plan.constraints.maxPositionPct);
  if (!Number.isFinite(maxPos) || maxPos <= 0 || maxPos > 1) {
    issues.push({ path: "constraints.maxPositionPct", message: "must be in (0,1]" });
  }

  const maxIn = num(plan.constraints.maxIn);
  const maxOut = num(plan.constraints.maxOut);
  if (!Number.isFinite(maxIn) || maxIn < 0) issues.push({ path: "constraints.maxIn", message: "must be >= 0" });
  if (!Number.isFinite(maxOut) || maxOut < 0) issues.push({ path: "constraints.maxOut", message: "must be >= 0" });

  let sum = 0;
  for (let i = 0; i < plan.allocations.length; i++) {
    const a = plan.allocations[i];
    const pct = num(a.targetPct);
    if (!a.id) issues.push({ path: `allocations[${i}].id`, message: "id required" });
    if (!a.label) issues.push({ path: `allocations[${i}].label`, message: "label required" });
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) issues.push({ path: `allocations[${i}].targetPct`, message: "must be in [0,1]" });
    if (Number.isFinite(pct)) sum += pct;
  }

  // v0: allow <=1 (reserve cash) but flag >1
  if (sum > 1.00001) issues.push({ path: "allocations", message: `sum(targetPct) must be <= 1 (got ${sum.toFixed(4)})` });

  return issues;
}
