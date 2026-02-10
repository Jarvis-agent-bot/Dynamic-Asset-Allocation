export const DAA_STEP_STATUS_LABEL = {
  wip: "进行中",
  todo: "待做",
  done: "已完成",
  later: "以后",
} as const;

export type DaaStepStatus = keyof typeof DAA_STEP_STATUS_LABEL;

export type DaaStep = {
  id: number;
  title: string;
  desc: string;
  status?: DaaStepStatus | string;
};

export const DAA_STEPS: DaaStep[] = [
  {
    id: 1,
    title: "回测算法组合",
    desc: "定义回测输入、策略集合与关键指标输出。",
    status: "wip",
  },
  {
    id: 2,
    title: "市场信息（Twitter主观 + 雪球/yfinance客观）",
    desc: "把‘市场信息’拆成页面字段：主观观点 + 可验证客观数据。",
    status: "done",
  },
  {
    id: 3,
    title: "金额管理（比例分配/Tag/max in-out）",
    desc: "页面优先：先把资金约束与分配规则‘可配置化’。",
    status: "done",
  },
  {
    id: 4,
    title: "基准再平衡（v0 推荐）",
    desc: "v0：点击按钮调用 /api/daa/rebalance/simulate，生成再平衡推荐（orders + target weights + explain）。",
    status: "done",
  },
  {
    id: 5,
    title: "信号决策摘要（v0）",
    desc: "v0：粘贴 signals JSON 数组，提取最后一条作为‘今日动作摘要’，仅做展示与校验 + Copy JSON。",
    status: "done",
  },
  {
    id: 6,
    title: "人因模型（暂不做）",
    desc: "占位：把主观风险偏好等因素结构化。",
    status: "later",
  },
  {
    id: 7,
    title: "Tag 体系（占位）",
    desc: "占位：标签是配置与解释的关键。",
    status: "later",
  },
];

export function getStep(id: unknown): DaaStep | null {
  const stepId = Number(id);
  return DAA_STEPS.find((s) => s.id === stepId) || null;
}
