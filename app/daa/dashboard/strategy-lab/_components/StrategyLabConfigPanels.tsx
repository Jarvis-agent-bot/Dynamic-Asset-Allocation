"use client";

import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { isVisibleHolding } from "@/app/daa/dashboard/_shared/holdingVisibility";
import {
  BASE_CURRENCY_OPTIONS,
  FREQUENCY_OPTIONS,
  STRATEGY_OPTIONS,
  type UseStrategyLabResult,
} from "./useStrategyLab";

interface StrategyLabConfigPanelsProps {
  state: UseStrategyLabResult;
}

type DatePreset = {
  label: string;
  resolveStartDate: (endDate: Date) => Date;
};

const DATE_PRESETS: DatePreset[] = [
  { label: "近 6 月", resolveStartDate: (endDate) => shiftMonths(endDate, -6) },
  { label: "近 1 年", resolveStartDate: (endDate) => shiftYears(endDate, -1) },
  { label: "近 3 年", resolveStartDate: (endDate) => shiftYears(endDate, -3) },
  { label: "近 5 年", resolveStartDate: (endDate) => shiftYears(endDate, -5) },
  { label: "今年以来", resolveStartDate: (endDate) => new Date(endDate.getFullYear(), 0, 1) },
];

function parseDateInput(value: string): Date {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function shiftYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function StrategyLabConfigPanels({ state }: StrategyLabConfigPanelsProps) {
  const {
    assetsLoading,
    assets,
    filteredAssets,
    assetFilter,
    setAssetFilter,
    config,
    setConfig,
    toggleAsset,
    toggleStrategy,
  } = state;

  return (
    <div className="space-y-5 xl:sticky xl:top-[104px] xl:self-start">
      <DaaSurfacePanel accent="primary" title="资产选择" subtitle="从当前资产池中选择要回测的资产。">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="搜索 symbol 或资产类别…"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className={daaSurfaceFieldClassName}
          />
          <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2">
            {assetsLoading ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-2.5 py-2 text-xs text-[var(--faint)]">加载资产池中…</div>
            ) : filteredAssets.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-2.5 py-2 text-xs text-[var(--faint)]">
                {assets.length === 0 ? "资产池为空，请先到持仓页添加资产" : "未找到匹配资产"}
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const checked = config.selectedAssets.includes(asset.assetKey);
                return (
                  <label
                    key={asset.assetKey}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--elevated)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAsset(asset.assetKey)}
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                    />
                    <span className="font-[var(--font-mono)] text-xs text-[var(--text)]">{asset.symbol}</span>
                    <span className="text-[11px] text-[var(--faint)]">{asset.assetClass}</span>
                    {isVisibleHolding(asset) ? (
                      <DaaSurfaceStatusPill tone="success" className="ml-auto text-[9px]">持仓</DaaSurfaceStatusPill>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
          <div className="text-xs text-[var(--faint)]">
            已选 {config.selectedAssets.length} 个资产
          </div>
        </div>
      </DaaSurfacePanel>

      <DaaSurfacePanel accent="info" title="策略选择" subtitle="可多选。">
        <div className="space-y-1">
          {STRATEGY_OPTIONS.map((strategyOption) => {
            const checked = config.selectedStrategies.includes(strategyOption.key);
            return (
              <label
                key={strategyOption.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition-colors hover:bg-[var(--elevated)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStrategy(strategyOption.key)}
                  className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                />
                <div>
                  <span className="text-[var(--text)]">{strategyOption.label}</span>
                  <span className="ml-2 text-[11px] text-[var(--faint)]">{strategyOption.desc}</span>
                </div>
              </label>
            );
          })}
        </div>
      </DaaSurfacePanel>

      <DaaSurfacePanel accent="warning" title="回测参数" subtitle="区间、频率和资金。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">起始日期</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig((prev) => ({ ...prev, startDate: e.target.value }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">结束日期</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig((prev) => ({ ...prev, endDate: e.target.value }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">常用区间</div>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const endDate = parseDateInput(config.endDate);
                    setConfig((prev) => ({
                      ...prev,
                      startDate: formatDateInput(preset.resolveStartDate(endDate)),
                      endDate: formatDateInput(endDate),
                    }));
                  }}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-bg)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-bg)]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">再平衡频率</label>
            <select
              value={config.rebalanceFrequency}
              onChange={(e) => setConfig((prev) => ({ ...prev, rebalanceFrequency: e.target.value }))}
              className={daaSurfaceFieldClassName}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">基准货币</label>
            <select
              value={config.baseCurrency}
              onChange={(e) => setConfig((prev) => ({ ...prev, baseCurrency: e.target.value }))}
              className={daaSurfaceFieldClassName}
            >
              {BASE_CURRENCY_OPTIONS.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">初始资金 ({config.baseCurrency})</label>
            <input
              type="number"
              min={1000}
              step={1000}
              value={config.initialCapital}
              onChange={(e) => setConfig((prev) => ({ ...prev, initialCapital: Math.max(1000, Number(e.target.value) || 100_000) }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">最小下单额 ({config.baseCurrency})</label>
            <input
              type="number"
              min={0}
              step={10}
              value={config.minOrderNotional}
              onChange={(e) => setConfig((prev) => ({ ...prev, minOrderNotional: Math.max(0, Number(e.target.value) || 0) }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
        </div>
      </DaaSurfacePanel>
    </div>
  );
}
