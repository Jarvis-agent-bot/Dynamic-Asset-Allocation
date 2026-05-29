"use client";

import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  BASE_CURRENCY_OPTIONS,
  FREQUENCY_OPTIONS,
  STRATEGY_OPTIONS,
  type UseStrategyLabResult,
} from "./useStrategyLab";

interface StrategyLabConfigPanelsProps {
  state: UseStrategyLabResult;
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
      <DaaSurfacePanel accent="cyan" title="资产选择" subtitle="从当前资产池中选择要回测的资产。">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="搜索 symbol 或资产类别…"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className={daaSurfaceFieldClassName}
          />
          <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-2">
            {assetsLoading ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--faint)]">加载资产池中…</div>
            ) : filteredAssets.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--faint)]">
                {assets.length === 0 ? "资产池为空，请先到持仓页添加资产" : "未找到匹配资产"}
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const checked = config.selectedAssets.includes(asset.assetKey);
                return (
                  <label
                    key={asset.assetKey}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAsset(asset.assetKey)}
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                    />
                    <span className="font-[var(--font-mono)] text-xs text-[var(--text)]">{asset.symbol}</span>
                    <span className="text-[11px] text-[var(--faint)]">{asset.assetClass}</span>
                    {asset.holdingQty > 0 ? (
                      <DaaSurfaceStatusPill tone="green" className="ml-auto text-[9px]">持仓</DaaSurfaceStatusPill>
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

      <DaaSurfacePanel accent="indigo" title="策略选择" subtitle="选择一个或多个配置策略进行对比回测。">
        <div className="space-y-1">
          {STRATEGY_OPTIONS.map((s) => {
            const checked = config.selectedStrategies.includes(s.key);
            return (
              <label
                key={s.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleStrategy(s.key)}
                  className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                />
                <div>
                  <span className="text-[var(--text)]">{s.label}</span>
                  <span className="ml-2 text-[11px] text-[var(--faint)]">{s.desc}</span>
                </div>
              </label>
            );
          })}
        </div>
      </DaaSurfacePanel>

      <DaaSurfacePanel accent="amber" title="回测参数" subtitle="设定回测区间、再平衡频率与初始资金。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">起始日期</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig((prev) => ({ ...prev, startDate: e.target.value }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">结束日期</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig((prev) => ({ ...prev, endDate: e.target.value }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">再平衡频率</label>
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
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">基准货币</label>
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
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">初始资金 ({config.baseCurrency})</label>
            <input
              type="number"
              min={1000}
              step={1000}
              value={config.initialCapital}
              onChange={(e) => setConfig((prev) => ({ ...prev, initialCapital: Math.max(1000, Number(e.target.value) || 100_000) }))}
              className={daaSurfaceFieldClassName}
            />
          </div>
        </div>
      </DaaSurfacePanel>
    </div>
  );
}
