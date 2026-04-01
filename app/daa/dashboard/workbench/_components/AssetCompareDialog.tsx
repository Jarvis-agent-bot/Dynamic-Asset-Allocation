"use client";

import { Dialog } from "@/components/ui/dialog";
import {
  DaaSurfaceDialogShell,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";

type CompareAsset = {
  assetKey: string;
  symbol: string;
  assetClass: string;
  lastPrice: number;
  currency: string;
  holdingQty: number;
  targetWeightHint: number;
  actualWeightPct: number;
  gapPct: number | null;
};

export function AssetCompareDialog(props: {
  assets: CompareAsset[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseCurrency: string;
}) {
  if (props.assets.length < 2) return null;

  const metrics: Array<{ label: string; render: (a: CompareAsset) => string }> = [
    { label: "当前价格", render: (a) => formatCurrency(a.lastPrice, a.currency) },
    { label: "资产类别", render: (a) => a.assetClass },
    { label: "持仓数量", render: (a) => a.holdingQty > 0 ? String(a.holdingQty) : "\u2014" },
    { label: "目标权重", render: (a) => a.targetWeightHint > 0 ? formatPercent(a.targetWeightHint) : "\u2014" },
    { label: "实际权重", render: (a) => formatPercent(a.actualWeightPct) },
    {
      label: "偏移",
      render: (a) =>
        a.gapPct != null
          ? `${a.gapPct > 0 ? "+" : ""}${a.gapPct.toFixed(2)}%`
          : "\u2014",
    },
  ];

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DaaSurfaceDialogShell
        accent="cyan"
        className="max-w-2xl"
        title="资产对比"
        description={`对比 ${props.assets.length} 个标的`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">
                  指标
                </th>
                {props.assets.map((a) => (
                  <th
                    key={a.assetKey}
                    className="px-3 py-2 text-center text-sm font-semibold text-[var(--text)]"
                  >
                    {a.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr
                  key={m.label}
                  className="border-b border-[var(--border)]/50"
                >
                  <td className="py-2 pr-4 text-xs text-[var(--muted)]">
                    {m.label}
                  </td>
                  {props.assets.map((a) => (
                    <td
                      key={a.assetKey}
                      className="px-3 py-2 text-center text-xs text-[var(--text)]"
                    >
                      {m.render(a)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
