"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Dialog } from "@/components/ui/dialog";
import {
  DaaSurfaceActionButton,
  DaaSurfaceDialogShell,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { applyWorkbenchTargetWeights } from "@/src/daa/modules/workbench/targetAllocationApply";

type Template = {
  id: string;
  name: string;
  desc: string;
  weights: Record<string, number>;
};

const TEMPLATES: Template[] = [
  {
    id: "classic_60_40",
    name: "经典 60/40",
    desc: "60% 美股 + 40% 债券，最经典的资产配置方案",
    weights: { "US::SPY": 60, "US::BND": 40 },
  },
  {
    id: "all_weather",
    name: "全天候",
    desc: "桥水 All Weather 思路，覆盖多经济周期",
    weights: { "US::SPY": 30, "US::TLT": 40, "US::GLD": 15, "US::DBC": 7.5, "US::IEF": 7.5 },
  },
  {
    id: "three_fund",
    name: "三基金",
    desc: "美股 + 国际股票 + 债券的简约组合",
    weights: { "US::VTI": 50, "US::EFA": 30, "US::BND": 20 },
  },
  {
    id: "golden_butterfly",
    name: "金蝴蝶",
    desc: "5 等分：大盘 + 小盘 + 长债 + 短债 + 黄金",
    weights: { "US::SPY": 20, "US::IWM": 20, "US::TLT": 20, "US::SGOV": 20, "US::GLD": 20 },
  },
  {
    id: "risk_parity_lite",
    name: "风险平价 (简化版)",
    desc: "按波动率倒数近似配置",
    weights: { "US::SPY": 25, "US::TLT": 35, "US::GLD": 20, "US::DBC": 10, "US::IEF": 10 },
  },
  {
    id: "growth_tilt",
    name: "成长偏重",
    desc: "偏重科技和成长型资产",
    weights: { "US::QQQ": 40, "US::SPY": 25, "US::EFA": 15, "US::BND": 10, "US::GLD": 10 },
  },
];

export function PortfolioTemplateDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    const tpl = TEMPLATES.find((t) => t.id === selected);
    if (!tpl) return;
    setApplying(true);
    try {
      await applyWorkbenchTargetWeights(tpl.weights, {
        source: "portfolio_template_apply",
        reason: `应用「${tpl.name}」模板为目标权重`,
        payload: {
          templateId: tpl.id,
          templateName: tpl.name,
          weights: tpl.weights,
        },
      });
      await props.onApplied?.();
      toast.success(`已应用「${tpl.name}」模板为目标权重`);
      props.onOpenChange(false);
    } catch (err) {
      toast.error("应用失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DaaSurfaceDialogShell
        accent="primary"
        className="max-w-lg"
        title="选择组合模板"
        description="选择一个经典配置方案，一键应用为目标权重"
        footer={
          <div className="flex justify-end gap-2">
            <DaaSurfaceActionButton tone="neutral" onClick={() => props.onOpenChange(false)}>
              取消
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton
              tone="primary"
              disabled={!selected || applying}
              onClick={() => void handleApply()}
            >
              {applying ? "应用中…" : "应用模板"}
            </DaaSurfaceActionButton>
          </div>
        }
      >
        <div className="space-y-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelected(tpl.id)}
              className={`w-full rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors ${
                selected === tpl.id
                  ? "border-[var(--primary)]/40 bg-[var(--primary-bg)]"
                  : "border-[var(--border)] hover:border-[var(--primary)]/20 hover:bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">{tpl.name}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">{tpl.desc}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(tpl.weights).map(([key, pct]) => (
                      <span
                        key={key}
                        className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]"
                      >
                        {key.replace(/^US:/, "")} {pct}%
                      </span>
                    ))}
                  </div>
                </div>
                {selected === tpl.id && (
                  <Check className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                )}
              </div>
            </button>
          ))}
        </div>
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
