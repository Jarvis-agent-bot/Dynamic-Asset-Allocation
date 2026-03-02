"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import TierBadge from "../_components/TierBadge";
import { formatCurrency, formatPercent } from "../_components/daaFormatters";
import { useFxRates, useLastRunResult, usePositions, useStrategyConfig } from "../_components/useDaaStore";
import { useMarketDataClient } from "../../useMarketDataClient";
import type { DaaPositionRow } from "../../unifiedInputStore";

const MARKETS = ["US", "HK", "CN", "CRYPTO", "OTHER"] as const;
const CURRENCIES = ["USD", "CNY", "HKD"] as const;
const TAG_OPTIONS = ["high", "mid", "low", "growth", "bond", "cash", "crypto", "sb"] as const;

type LastRunPlan = {
  layers?: {
    humanFactor?: {
      assetDecisions?: Array<{
        symbol: string;
        tier: string;
      }>;
    };
  };
};

function extractPlan(payload: unknown): LastRunPlan | null {
  const value = payload as any;
  if (!value || typeof value !== "object") return null;
  if (value.layers && typeof value.layers === "object") return value as LastRunPlan;
  if (value.plan && typeof value.plan === "object" && value.plan.layers) return value.plan as LastRunPlan;
  return null;
}

function emptyPosition(): DaaPositionRow {
  return {
    symbol: "",
    market: "US",
    currency: "USD",
    qty: 0,
    price: 0,
    costBasis: 0,
    tags: [],
    liquidityNotional24h: 0,
  };
}

function normalizeMarket(value: string): string {
  const market = String(value || "").trim().toUpperCase();
  if (market === "A") return "CN";
  return market || "US";
}

function resolveFxRateToBase(
  baseCurrency: string,
  localCurrency: string,
  fxLookup: Map<string, number>,
): number | null {
  const base = String(baseCurrency || "").trim().toUpperCase() || "USD";
  const local = String(localCurrency || "").trim().toUpperCase() || base;
  if (local === base) return 1;

  const direct = fxLookup.get(`${local}/${base}`);
  if (direct && direct > 0) return direct;

  const reverse = fxLookup.get(`${base}/${local}`);
  if (reverse && reverse > 0) return 1 / reverse;

  return null;
}

// ——— 删除确认弹窗 ———
function DeleteConfirmDialog({
  onConfirm,
  trigger,
  title = "确认删除",
  description = "此操作不可撤销，是否确认删除？",
}: {
  onConfirm: () => void;
  trigger: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ——— 新增 / 编辑持仓弹窗 ———
function PositionFormDialog({
  initial,
  title,
  onSave,
  trigger,
}: {
  initial: DaaPositionRow;
  title: string;
  onSave: (p: DaaPositionRow) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);

  const update = <K extends keyof DaaPositionRow>(key: K, val: DaaPositionRow[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  function handleSave() {
    if (!form.symbol.trim()) return;
    onSave({
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      market: normalizeMarket(form.market),
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>代码</Label>
              <Input value={form.symbol} onChange={(e) => update("symbol", e.target.value.toUpperCase())} placeholder="SPY" />
            </div>
            <div className="space-y-1.5">
              <Label>市场</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.market}
                onChange={(e) => update("market", e.target.value)}
              >
                {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>数量</Label>
              <Input type="number" value={form.qty || ""} onChange={(e) => update("qty", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>价格</Label>
              <Input type="number" value={form.price || ""} onChange={(e) => update("price", Number(e.target.value) || 0)} step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label>成本价</Label>
              <Input type="number" value={form.costBasis || ""} onChange={(e) => update("costBasis", Number(e.target.value) || 0)} step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label>币种</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              24h 流动性（名义金额）
              <span className="ml-1 text-xs font-normal text-muted-foreground">用于流动性风险评估</span>
            </Label>
            <Input
              type="number"
              value={form.liquidityNotional24h || ""}
              onChange={(e) => update("liquidityNotional24h", Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((tag) => {
                const active = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      active
                        ? tag === "sb"
                          ? "border-red-300 bg-red-100 text-red-700"
                          : "border-sky-300 bg-sky-100 text-sky-700"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => {
                      update("tags", active ? form.tags.filter((t) => t !== tag) : [...form.tags, tag]);
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleSave} disabled={!form.symbol.trim()}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ——— JSON 批量导入弹窗 ———
function ImportDialog({ onImport }: { onImport: (rows: DaaPositionRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleImport() {
    setError("");
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: DaaPositionRow[] = arr.map((item: any) => ({
        symbol: String(item.symbol ?? "").trim().toUpperCase(),
        market: normalizeMarket(String(item.market ?? "US")),
        currency: String(item.currency ?? "USD").trim().toUpperCase(),
        qty: Number(item.qty) || 0,
        price: Number(item.price) || 0,
        costBasis: Number(item.costBasis) || 0,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        liquidityNotional24h: Number(item.liquidityNotional24h) || 0,
      })).filter((r) => r.symbol);

      if (!rows.length) {
        setError("未识别到有效持仓。");
        return;
      }
      onImport(rows);
      setOpen(false);
      setText("");
    } catch {
      setError("JSON 格式错误，应为持仓对象数组。");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-3.5 w-3.5" /> 导入
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批量导入持仓 (JSON)</DialogTitle>
        </DialogHeader>
        <Textarea
          className="min-h-[200px] font-mono text-xs"
          placeholder={`[{"symbol":"SPY","market":"US","qty":40,"price":545,"tags":["mid"]}]`}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(""); }}
        />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleImport}>导入</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ——— 主页面 ———
export default function PositionsPage() {
  const [positions, setPositions] = usePositions();
  const [config, setConfig] = useStrategyConfig();
  const [fxRates] = useFxRates();
  const [lastRun] = useLastRunResult();
  const marketData = useMarketDataClient();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncResult, setSyncResult] = useState<{ count: number; total: number } | null>(null);

  const list = positions ?? [];
  const fxRateRows = fxRates ?? [];
  const result = extractPlan(lastRun);
  const decisions = result?.layers?.humanFactor?.assetDecisions ?? [];
  const displayCurrency = String(config.account.baseCurrency || "USD").trim().toUpperCase() || "USD";

  const fxLookup = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of fxRateRows) {
      const baseCcy = String(row.baseCcy || "").trim().toUpperCase();
      const quoteCcy = String(row.quoteCcy || "").trim().toUpperCase();
      const rate = Number(row.rate);
      if (!baseCcy || !quoteCcy || !Number.isFinite(rate) || rate <= 0) continue;
      out.set(`${baseCcy}/${quoteCcy}`, rate);
    }
    return out;
  }, [fxRateRows]);

  const valuationRows = useMemo(() => {
    return list.map((position) => {
      const localValue = position.qty * position.price;
      const fxRate = resolveFxRateToBase(displayCurrency, position.currency, fxLookup);
      const baseValue = fxRate != null ? localValue * fxRate : null;
      return { localValue, baseValue, fxRate };
    });
  }, [displayCurrency, fxLookup, list]);

  const totalValue = useMemo(
    () => valuationRows.reduce((sum, row) => sum + (row.baseValue ?? 0), 0),
    [valuationRows],
  );
  const unresolvedFxCount = useMemo(
    () => valuationRows.filter((row) => row.localValue > 0 && row.baseValue == null).length,
    [valuationRows],
  );

  const tierMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of decisions) m.set(d.symbol, d.tier);
    return m;
  }, [decisions]);

  const addPosition = useCallback((p: DaaPositionRow) => {
    const next = [...list, p];
    setPositions(next);
    if (!(p.symbol in config.targetWeights)) {
      const tw = { ...config.targetWeights };
      tw[p.symbol] = 0;
      setConfig({ ...config, targetWeights: tw });
    }
  }, [list, setPositions, config, setConfig]);

  const updatePosition = useCallback((index: number, p: DaaPositionRow) => {
    const next = [...list];
    next[index] = p;
    setPositions(next);
  }, [list, setPositions]);

  const removePosition = useCallback((index: number) => {
    const next = list.filter((_, i) => i !== index);
    setPositions(next);
  }, [list, setPositions]);

  const importPositions = useCallback((rows: DaaPositionRow[]) => {
    setPositions([...list, ...rows]);
    const tw = { ...config.targetWeights };
    for (const r of rows) {
      if (!(r.symbol in tw)) tw[r.symbol] = 0;
    }
    setConfig({ ...config, targetWeights: tw });
  }, [list, setPositions, config, setConfig]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daa-positions.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [list]);

  async function syncPrices() {
    if (syncing) return;
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const today = new Date();
      const start = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);

      const updated = [...list];
      let count = 0;
      for (let i = 0; i < updated.length; i++) {
        const p = updated[i];
        try {
          const series = await marketData.yfinance.priceSeriesBars({ symbol: p.symbol, start, end });
          const last = Number(series[series.length - 1]?.close || 0);
          if (last > 0) {
            updated[i] = { ...p, price: last };
            count++;
          }
        } catch {
          // 单只标的失败不中断整体同步
        }
      }
      setPositions(updated);
      if (count === 0) {
        setSyncError("No prices updated. Check symbol format.");
      } else {
        setSyncResult({ count, total: updated.length });
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const targetWeightSum = useMemo(() => {
    return Object.values(config.targetWeights).reduce((s, v) => s + (Number(v) || 0), 0);
  }, [config.targetWeights]);

  const portfolioBase = totalValue + config.account.cash;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader title="持仓配置" description="唯一编辑入口：维护持仓与目标权重。" />

        {syncError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        ) : null}

        {syncResult ? (
          <Alert>
            <AlertDescription>
              价格同步完成：{syncResult.count} / {syncResult.total} 个标的更新成功。
            </AlertDescription>
          </Alert>
        ) : null}

        {/* 持仓列表 Card —— 操作按钮集中在 CardHeader 右侧 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">持仓列表</CardTitle>
                <CardDescription>
                  {list.length} 个标的，总市值 {formatCurrency(totalValue, displayCurrency)}
                  {unresolvedFxCount > 0 ? `（${unresolvedFxCount} 个标的缺少 FX 汇率）` : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PositionFormDialog
                  initial={emptyPosition()}
                  title="新增持仓"
                  onSave={addPosition}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-2 h-3.5 w-3.5" /> 新增持仓
                    </Button>
                  }
                />
                <ImportDialog onImport={importPositions} />
                <Button variant="outline" size="sm" onClick={exportJson} disabled={!list.length}>
                  <Download className="mr-2 h-3.5 w-3.5" /> 导出
                </Button>
                <Button variant="outline" size="sm" onClick={() => void syncPrices()} disabled={syncing || !list.length}>
                  <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                  {syncing ? "同步中..." : "同步价格"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {unresolvedFxCount > 0 ? (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  检测到跨币种持仓缺少汇率，当前总市值与权重按已换算标的计算。请在"系统设置 → 汇率快照"补齐。
                </AlertDescription>
              </Alert>
            ) : null}
            {list.length ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>代码</TableHead>
                      <TableHead>市场</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">价格</TableHead>
                      <TableHead className="text-right">市值</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dashed">权重%</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            基于「持仓市值 + 现金」计算，分母约 {formatCurrency(portfolioBase, displayCurrency)}
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((p, i) => {
                      const mv = valuationRows[i]?.baseValue ?? null;
                      const fxMissing = (valuationRows[i]?.localValue ?? 0) > 0 && mv == null;
                      const pct = !fxMissing && mv != null && portfolioBase > 0 ? (mv / portfolioBase) * 100 : 0;
                      const tier = tierMap.get(p.symbol);
                      return (
                        <TableRow key={`${p.symbol}-${i}`}>
                          <TableCell className="font-medium">{p.symbol}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.market}</TableCell>
                          <TableCell className="text-right">{p.qty}</TableCell>
                          <TableCell className="text-right">{p.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {mv != null ? (
                              formatCurrency(mv, displayCurrency)
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help text-muted-foreground underline decoration-dashed">-</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  缺少 {p.currency}/{displayCurrency} 汇率，请在系统设置 → 汇率快照中补齐
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {p.tags.map((t) => (
                                <span
                                  key={t}
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                    t === "sb" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {tier ? <TierBadge tier={tier as any} /> : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {fxMissing ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help text-muted-foreground underline decoration-dashed">-</span>
                                </TooltipTrigger>
                                <TooltipContent>缺少汇率，无法计算权重</TooltipContent>
                              </Tooltip>
                            ) : (
                              formatPercent(pct, 1)
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <PositionFormDialog
                                initial={p}
                                title="编辑持仓"
                                onSave={(updated) => updatePosition(i, updated)}
                                trigger={
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                }
                              />
                              <DeleteConfirmDialog
                                onConfirm={() => removePosition(i)}
                                description={`确认删除持仓 ${p.symbol}？此操作不可撤销。`}
                                trigger={
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                }
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                暂无持仓，点击右上角"新增持仓"开始。
              </div>
            )}
          </CardContent>
        </Card>

        {/* 目标权重 Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">目标权重</CardTitle>
            <CardDescription>
              权重总和: {formatPercent(targetWeightSum * 100, 1)} / 100%
              {targetWeightSum < 0.999 ? ` (${formatPercent((1 - targetWeightSum) * 100, 1)} 隐含现金)` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(config.targetWeights)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([symbol, weight]) => (
                  <div key={symbol} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium">{symbol}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round((weight as number) * 100)}
                      onChange={(e) => {
                        const tw = { ...config.targetWeights };
                        tw[symbol] = Number(e.target.value) / 100;
                        setConfig({ ...config, targetWeights: tw });
                      }}
                      className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-muted accent-sky-500"
                    />
                    <Input
                      type="number"
                      className="h-8 w-20 text-right text-sm"
                      value={Math.round((weight as number) * 100)}
                      min={0}
                      max={100}
                      onChange={(e) => {
                        const tw = { ...config.targetWeights };
                        tw[symbol] = Math.min(1, Math.max(0, Number(e.target.value) / 100));
                        setConfig({ ...config, targetWeights: tw });
                      }}
                    />
                    <span className="w-6 text-xs text-muted-foreground">%</span>
                    <DeleteConfirmDialog
                      onConfirm={() => {
                        const tw = { ...config.targetWeights };
                        delete tw[symbol];
                        setConfig({ ...config, targetWeights: tw });
                      }}
                      description={`确认从目标权重中移除 ${symbol}？`}
                      trigger={
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                ))}
              {!Object.keys(config.targetWeights).length ? (
                <div className="text-xs text-muted-foreground">添加持仓后会自动创建权重条目。</div>
              ) : null}
              {targetWeightSum > 1.001 ? (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs">
                    权重总和超过 100%，系统将自动归一化。
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
