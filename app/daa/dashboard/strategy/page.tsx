"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";

import { useStrategyConfig } from "../_components/useDaaStore";
import { DEFAULT_STRATEGY_CONFIG, type DaaStrategyConfig } from "../../unifiedInputStore";

type NumberFieldProps = {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  isPercent?: boolean;
};

function NumberField({ label, description, value, onChange, min = 0, max = 100, step = 1, suffix, isPercent }: NumberFieldProps) {
  const displayValue = isPercent ? value * 100 : value;
  const displayMin = isPercent ? min * 100 : min;
  const displayMax = isPercent ? max * 100 : max;
  const displayStep = isPercent ? step * 100 : step;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-medium">
          {Number.isFinite(displayValue) ? displayValue.toFixed(isPercent ? 1 : 0) : "0"}
          {suffix ?? (isPercent ? "%" : "")}
        </span>
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(e) => {
            const raw = Number(e.target.value);
            onChange(isPercent ? raw / 100 : raw);
          }}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-muted accent-sky-500"
        />
        <Input
          type="number"
          className="h-8 w-24 text-right text-sm"
          value={Number.isFinite(displayValue) ? (isPercent ? displayValue.toFixed(1) : displayValue.toFixed(0)) : ""}
          min={displayMin}
          max={displayMax}
          step={displayStep}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (!Number.isFinite(raw)) return;
            onChange(isPercent ? Math.min(max, Math.max(min, raw / 100)) : Math.min(max, Math.max(min, raw)));
          }}
        />
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const [config, setConfig] = useStrategyConfig();

  const updatePolicy = <K extends keyof DaaStrategyConfig["policy"]>(key: K, val: number) => {
    setConfig({ ...config, policy: { ...config.policy, [key]: val } });
  };

  const updateConstraints = <K extends keyof DaaStrategyConfig["constraints"]>(key: K, val: number) => {
    setConfig({ ...config, constraints: { ...config.constraints, [key]: val } });
  };

  const updateAccount = <K extends keyof DaaStrategyConfig["account"]>(key: K, val: DaaStrategyConfig["account"][K]) => {
    setConfig({ ...config, account: { ...config.account, [key]: val } });
  };
  const updateRisk = <K extends keyof DaaStrategyConfig["risk"]>(key: K, val: number) => {
    setConfig({ ...config, risk: { ...config.risk, [key]: val } });
  };

  function resetToDefaults() {
    setConfig({
      ...DEFAULT_STRATEGY_CONFIG,
      targetWeights: config.targetWeights,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="策略配置" description="唯一编辑入口：维护账户、约束与触发阈值。" />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={resetToDefaults}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> 重置默认值
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">账户设置</CardTitle>
            <CardDescription>资金池与估值基准</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>基准币种</Label>
              <Input
                value={config.account.baseCurrency || "USD"}
                onChange={(e) => updateAccount("baseCurrency", e.target.value.trim().toUpperCase() || "USD")}
                placeholder="USD / CNY / HKD"
              />
            </div>
            <div className="space-y-2">
              <Label>现金余额</Label>
              <Input
                type="number"
                value={config.account.cash ?? ""}
                onChange={(e) => updateAccount("cash", Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>可投资现金</Label>
                <Input
                  type="number"
                  value={config.account.investableCash ?? ""}
                  onChange={(e) => updateAccount("investableCash", Math.max(0, Number(e.target.value) || 0))}
                  placeholder="默认=现金余额"
                />
              </div>
              <div className="space-y-2">
                <Label>冻结现金</Label>
                <Input
                  type="number"
                  value={config.account.frozenCash ?? ""}
                  onChange={(e) => updateAccount("frozenCash", Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>总权益</Label>
              <p className="text-xs text-muted-foreground">留空则自动计算: 持仓市值 + 现金</p>
              <Input
                type="number"
                value={config.account.totalEquity ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  updateAccount("totalEquity", v ? Number(v) || null : null);
                }}
                placeholder="自动计算"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">约束条件</CardTitle>
            <CardDescription>仓位上限与最小交易量</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <NumberField
              label="最大单标的仓位"
              description="任何单个标的不得超过总仓位的此比例"
              value={config.constraints.maxPositionPct}
              onChange={(v) => updateConstraints("maxPositionPct", v)}
              min={0.01}
              max={1}
              step={0.01}
              isPercent
            />
            <div className="space-y-2">
              <Label>最小交易金额</Label>
              <Input
                type="number"
                value={config.constraints.minNotional || ""}
                onChange={(e) => updateConstraints("minNotional", Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <NumberField
              label="单笔最大占净值%"
              description="单笔调仓不得超过总资产的此比例"
              value={config.constraints.maxOrderPctOfNav}
              onChange={(v) => updateConstraints("maxOrderPctOfNav", v)}
              min={0.01}
              max={1}
              step={0.01}
              isPercent
            />
            <NumberField
              label="单笔最大占流动性%"
              description="单笔调仓不得超过该标的 24h 流动性的此比例"
              value={config.constraints.maxOrderPctOfLiquidity}
              onChange={(v) => updateConstraints("maxOrderPctOfLiquidity", v)}
              min={0.01}
              max={1}
              step={0.01}
              isPercent
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">触发策略</CardTitle>
            <CardDescription>漂移阈值与触发条件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <NumberField
              label="基础漂移触发阈值"
              description="当最大偏离超过此值时触发再平衡"
              value={config.policy.baseDriftTriggerPct}
              onChange={(v) => updatePolicy("baseDriftTriggerPct", v)}
              min={0.01}
              max={0.5}
              step={0.01}
              isPercent
            />
            <NumberField
              label="强势持仓漂移阈值"
              description="强势标的的触发阈值（允许利润奔跑）"
              value={config.policy.strongTrendDriftTriggerPct}
              onChange={(v) => updatePolicy("strongTrendDriftTriggerPct", v)}
              min={0.01}
              max={0.5}
              step={0.01}
              isPercent
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">人因策略阈值</CardTitle>
            <CardDescription>风控共识、隔离与价值陷阱参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <NumberField
              label="防守共识触发线"
              description="当防守共识超过此值时，系统整体降仓"
              value={config.policy.riskOffConsensusPct}
              onChange={(v) => updatePolicy("riskOffConsensusPct", v)}
              min={0.1}
              max={1}
              step={0.05}
              isPercent
            />
            <NumberField
              label="防守降仓比例"
              description="触发防守共识后，非低风险标的缩减到此比例"
              value={config.policy.riskOffScalePct}
              onChange={(v) => updatePolicy("riskOffScalePct", v)}
              min={0.1}
              max={1}
              step={0.05}
              isPercent
            />
            <NumberField
              label="价值陷阱论点漂移阈值"
              description="当论点漂移超过此值时标记为价值陷阱"
              value={config.policy.valueTrapThesisDriftPct}
              onChange={(v) => updatePolicy("valueTrapThesisDriftPct", v)}
              min={0.01}
              max={0.5}
              step={0.01}
              isPercent
            />
            <NumberField
              label="SB 隔离评分线"
              description="人因综合评分低于此阈值时自动隔离"
              value={config.policy.sbIsolationScorePct}
              onChange={(v) => updatePolicy("sbIsolationScorePct", v)}
              min={0.1}
              max={0.8}
              step={0.05}
              isPercent
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">风险护栏</CardTitle>
            <CardDescription>最大回撤、止损线与集中度上限</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <NumberField
              label="最大回撤"
              description="组合从历史高点回撤超过该值时进入 risk-off"
              value={config.risk.maxDrawdownPct}
              onChange={(v) => updateRisk("maxDrawdownPct", v)}
              min={0.05}
              max={0.5}
              step={0.01}
              isPercent
            />
            <NumberField
              label="单资产止损线"
              description="单标的跌幅超过阈值时触发减仓提示"
              value={config.risk.perAssetStopLossPct}
              onChange={(v) => updateRisk("perAssetStopLossPct", v)}
              min={0.05}
              max={0.5}
              step={0.01}
              isPercent
            />
            <NumberField
              label="单资产最大占比"
              description="超过该比例时标记集中度风险"
              value={config.risk.maxConcentrationPct}
              onChange={(v) => updateRisk("maxConcentrationPct", v)}
              min={0.1}
              max={1}
              step={0.01}
              isPercent
            />
            <NumberField
              label="高相关暴露上限"
              description="高相关资产合计暴露上限"
              value={config.risk.correlationCapPct}
              onChange={(v) => updateRisk("correlationCapPct", v)}
              min={0.1}
              max={1}
              step={0.01}
              isPercent
            />
            <NumberField
              label="高风险资产上限"
              description="高风险标签资产总暴露上限"
              value={config.risk.maxTotalRiskExposurePct}
              onChange={(v) => updateRisk("maxTotalRiskExposurePct", v)}
              min={0.1}
              max={1}
              step={0.01}
              isPercent
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
