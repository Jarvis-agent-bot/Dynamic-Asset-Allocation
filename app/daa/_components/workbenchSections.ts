export type WorkbenchSectionKey =
  | "today"
  | "portfolio"
  | "rebalance"
  | "trades"
  | "strategy-lab"
  | "settings";

export type WorkbenchSectionMeta = {
  key: WorkbenchSectionKey;
  href: string;
  label: string;
  shortLabel: string;
  hint: string;
};

export const WORKBENCH_SECTIONS: WorkbenchSectionMeta[] = [
  {
    key: "today",
    href: "/daa/dashboard/today",
    label: "今日",
    shortLabel: "今日",
    hint: "复核优先级与投资助理追问",
  },
  {
    key: "portfolio",
    href: "/daa/dashboard/portfolio",
    label: "持仓",
    shortLabel: "持仓",
    hint: "资产配置与观察列表管理",
  },
  {
    key: "rebalance",
    href: "/daa/dashboard/rebalance",
    label: "调仓",
    shortLabel: "调仓",
    hint: "查看市场环境，审阅建议并执行再平衡",
  },
  {
    key: "trades",
    href: "/daa/dashboard/trades",
    label: "交易记录",
    shortLabel: "交易",
    hint: "周期、订单与复盘报告",
  },
  {
    key: "strategy-lab",
    href: "/daa/dashboard/strategy-lab",
    label: "策略测试台",
    shortLabel: "回测",
    hint: "回测资产配置策略",
  },
  {
    key: "settings",
    href: "/daa/dashboard/settings",
    label: "设置",
    shortLabel: "设置",
    hint: "策略、风控与通知配置",
  },
];

export const FALLBACK_WORKBENCH_SECTION: WorkbenchSectionMeta = {
  key: "portfolio",
  href: "/daa/dashboard/portfolio",
  label: "资产中枢",
  shortLabel: "资产",
  hint: "",
};

export function resolveWorkbenchSection(pathname: string): WorkbenchSectionMeta {
  return (
    WORKBENCH_SECTIONS.find((section) => pathname.startsWith(section.href))
    ?? FALLBACK_WORKBENCH_SECTION
  );
}
