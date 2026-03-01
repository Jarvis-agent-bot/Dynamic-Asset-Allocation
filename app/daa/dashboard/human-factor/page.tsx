"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Database, Plus, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import MetricGauge from "../_components/MetricGauge";
import TierBadge from "../_components/TierBadge";
import {
  useHfFundRegistry,
  useLastRunResult,
  usePositions,
} from "../_components/useDaaStore";
import {
  DEFAULT_HF_FUND_REGISTRY,
  type DaaHfFundTrackRow,
} from "../../unifiedInputStore";

const DEFAULT_MARKET_SCOPE = ["US", "HK", "CN"];

const TIER_COLORS: Record<string, string> = {
  elite: "#10b981",
  steady: "#0ea5e9",
  watch: "#f59e0b",
  isolated: "#ef4444",
};

type HumanSignalBatch = {
  generatedAt: string;
  asOfDate: string;
  mode: string;
  marketScope: string[];
  actorCount: number;
  holdingCount: number;
  signals: Array<{
    symbol: string;
    market: string;
    aggregatedScorePct: number;
    convictionPct: number;
    thesisDriftPct: number;
    confidencePct: number;
    momentumRegime: string;
    stance: string;
    riskTags: string[];
    evidenceCount: number;
  }>;
  sources: Array<{
    channel: string;
    sourceName: string;
    itemCount: number;
  }>;
};

function normalizedFundCode(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function dedupeRegistry(rows: DaaHfFundTrackRow[]): DaaHfFundTrackRow[] {
  const map = new Map<string, DaaHfFundTrackRow>();
  for (const row of rows) {
    const fundCode = normalizedFundCode(row.fundCode);
    if (!fundCode) continue;
    map.set(fundCode, {
      fundCode,
      label: String(row.label || `基金 ${fundCode}`).trim() || `基金 ${fundCode}`,
      kind: row.kind,
      enabled: Boolean(row.enabled),
    });
  }
  return [...map.values()];
}

function emptyFundRow(): DaaHfFundTrackRow {
  return {
    fundCode: "",
    label: "",
    kind: "equity",
    enabled: true,
  };
}

function FundFormDialog({
  onSave,
}: {
  onSave: (row: DaaHfFundTrackRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DaaHfFundTrackRow>(emptyFundRow());

  function handleSave() {
    const fundCode = normalizedFundCode(form.fundCode);
    if (!fundCode) return;
    onSave({
      fundCode,
      label: String(form.label || `基金 ${fundCode}`).trim() || `基金 ${fundCode}`,
      kind: form.kind,
      enabled: true,
    });
    setOpen(false);
    setForm(emptyFundRow());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          添加基金
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增跟踪基金</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <Label>基金代码</Label>
            <Input
              placeholder="例如 006533"
              value={form.fundCode}
              onChange={(e) => setForm((prev) => ({ ...prev, fundCode: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>展示名称</Label>
            <Input
              placeholder="例如 易方达科融混合"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>类型</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={form.kind}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value as DaaHfFundTrackRow["kind"] }))}
            >
              <option value="equity">股票型</option>
              <option value="qdii">QDII</option>
              <option value="balanced">平衡/固收增强</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleSave} disabled={!normalizedFundCode(form.fundCode)}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HumanFactorPage() {
  const [storedRegistry, setStoredRegistry] = useHfFundRegistry();
  const [positions] = usePositions();
  const [lastRun] = useLastRunResult();

  const [signalBatch, setSignalBatch] = useState<HumanSignalBatch | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const registry = useMemo(
    () => dedupeRegistry(storedRegistry?.length ? storedRegistry : DEFAULT_HF_FUND_REGISTRY),
    [storedRegistry],
  );

  const enabledFundCodes = useMemo(
    () => registry.filter((item) => item.enabled).map((item) => item.fundCode),
    [registry],
  );

  const positionsList = positions ?? [];
  const trackedPositionCount = useMemo(() => {
    if (!signalBatch?.signals?.length) return 0;
    const symbols = new Set(signalBatch.signals.map((s) => String(s.symbol || "").trim().toUpperCase()));
    return positionsList.filter((p) => symbols.has(String(p.symbol || "").trim().toUpperCase())).length;
  }, [positionsList, signalBatch]);

  const decisions: Array<{
    symbol: string;
    tier: "elite" | "steady" | "watch" | "isolated";
    weightedScorePct: number;
    reasons: string[];
  }> = (lastRun as any)?.layers?.humanFactor?.assetDecisions ?? [];

  const defensiveConsensusPct = Number((lastRun as any)?.layers?.humanFactor?.defensiveConsensusPct ?? 0);

  const tierPieData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of decisions) counts[d.tier] = (counts[d.tier] ?? 0) + 1;
    return Object.entries(counts).map(([tier, count]) => ({
      name: tier,
      value: count,
      fill: TIER_COLORS[tier] ?? "#94a3b8",
    }));
  }, [decisions]);

  const loadSignalBatch = useCallback(async () => {
    setRefreshing(true);
    setSourceError("");
    try {
      const params = new URLSearchParams();
      params.set("markets", DEFAULT_MARKET_SCOPE.join(","));
      if (enabledFundCodes.length > 0) {
        params.set("fundCodes", enabledFundCodes.join(","));
      }

      const res = await fetch(`/api/daa/hf/scores?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        setSourceError(String(json?.error ?? `HTTP ${res.status}`));
        return;
      }

      setSignalBatch({
        generatedAt: String(json.generatedAt ?? ""),
        asOfDate: String(json.asOfDate ?? ""),
        mode: String(json.mode ?? ""),
        marketScope: Array.isArray(json.marketScope) ? json.marketScope : [],
        actorCount: Number(json.actorCount ?? 0),
        holdingCount: Number(json.holdingCount ?? 0),
        signals: Array.isArray(json.signals) ? json.signals : [],
        sources: Array.isArray(json.sources) ? json.sources : [],
      });
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [enabledFundCodes]);

  const runIngest = useCallback(async () => {
    setIngesting(true);
    setSourceError("");

    try {
      const res = await fetch("/api/daa/hf/ingest/run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          marketScope: DEFAULT_MARKET_SCOPE,
          fundCodes: enabledFundCodes,
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        setSourceError(String(json?.error ?? `HTTP ${res.status}`));
        return;
      }

      await loadSignalBatch();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  }, [enabledFundCodes, loadSignalBatch]);

  useEffect(() => {
    void loadSignalBatch();
  }, [loadSignalBatch]);

  function updateRegistry(next: DaaHfFundTrackRow[]) {
    setStoredRegistry(dedupeRegistry(next));
  }

  function toggleFundEnabled(index: number) {
    const next = [...registry];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    updateRegistry(next);
  }

  function removeFund(index: number) {
    updateRegistry(registry.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="人因中心" description="唯一入口：维护基金池、执行采集并查看人因信号。" />

      <Card className="border-sky-200/70">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                数据来源与采集状态
              </CardTitle>
              <CardDescription>当前采用丹券基金持仓为主源，按基金池采集并聚合为机会/风险信号。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadSignalBatch()} disabled={refreshing || ingesting}>
                <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button
                size="sm"
                onClick={() => void runIngest()}
                disabled={refreshing || ingesting || enabledFundCodes.length === 0}
              >
                <ShieldCheck className={`mr-1.5 h-3.5 w-3.5 ${ingesting ? "animate-spin" : ""}`} />
                运行采集
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sourceError ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">{sourceError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">采集模式</span>
              <div className="font-medium">{signalBatch?.mode || "-"}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">市场范围</span>
              <div className="font-medium">{signalBatch?.marketScope?.join(", ") || DEFAULT_MARKET_SCOPE.join(", ")}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">启用基金数</span>
              <div className="font-medium">{enabledFundCodes.length} / {registry.length}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">主体 / 持仓</span>
              <div className="font-medium">{signalBatch?.actorCount ?? 0} / {signalBatch?.holdingCount ?? 0}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">最新披露日</span>
              <div className="font-medium">{signalBatch?.asOfDate || "-"}</div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium">来源分布</div>
            <div className="flex flex-wrap gap-1.5">
              {signalBatch?.sources?.length ? (
                signalBatch.sources.map((source) => (
                  <span key={`${source.channel}-${source.sourceName}`} className="rounded-full border px-2 py-0.5 text-[11px]">
                    {source.sourceName} · {source.itemCount}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">暂无来源统计，点击「运行采集」后刷新。</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">跟踪基金池管理</CardTitle>
              <CardDescription>选择哪些基金参与人因层计算；仅启用项会参与采集。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <FundFormDialog
                onSave={(row) => {
                  updateRegistry([...registry, row]);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateRegistry(registry.map((item) => ({ ...item, enabled: true })))}
                disabled={!registry.length}
              >
                全部启用
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateRegistry(registry.map((item) => ({ ...item, enabled: false })))}
                disabled={!registry.length}
              >
                全部暂停
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStoredRegistry(DEFAULT_HF_FUND_REGISTRY.map((item) => ({ ...item })))}
              >
                恢复默认
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {registry.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>基金代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registry.map((fund, index) => (
                    <TableRow key={`${fund.fundCode}-${index}`}>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={fund.enabled ? "default" : "outline"}
                          className="h-7 px-2.5 text-xs"
                          onClick={() => toggleFundEnabled(index)}
                        >
                          {fund.enabled ? "启用" : "暂停"}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{fund.fundCode}</TableCell>
                      <TableCell>{fund.label}</TableCell>
                      <TableCell>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{fund.kind}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500"
                          onClick={() => removeFund(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无基金，请先添加至少一个基金代码。</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">防守共识</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricGauge label="防守共识" value={defensiveConsensusPct} thresholds={{ warning: 40, danger: 60 }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">分层分布</CardTitle>
          </CardHeader>
          <CardContent>
            {tierPieData.length ? (
              <div className="flex items-center gap-4">
                <div className="h-[120px] w-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={tierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={25}>
                        {tierPieData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  {tierPieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <TierBadge tier={item.name as any} />
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">运行决策后显示</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">覆盖情况</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">当前持仓数</span>
              <span className="font-medium">{positionsList.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">可匹配人因信号</span>
              <span className="font-medium">{trackedPositionCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground">信号总数</span>
              <span className="font-medium">{signalBatch?.signals?.length ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {signalBatch?.signals?.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">基金池衍生信号</CardTitle>
            <CardDescription>展示采集后聚合的人因机会/风险信号（按强度排序）。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>市场</TableHead>
                    <TableHead className="text-right">评分%</TableHead>
                    <TableHead className="text-right">置信度%</TableHead>
                    <TableHead className="text-right">漂移%</TableHead>
                    <TableHead className="text-right">可信度%</TableHead>
                    <TableHead>动量</TableHead>
                    <TableHead>风险标签</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalBatch.signals.slice(0, 15).map((sig) => (
                    <TableRow key={`${sig.symbol}-${sig.market}`}>
                      <TableCell className="font-medium">{sig.symbol}</TableCell>
                      <TableCell>{sig.market}</TableCell>
                      <TableCell className="text-right">{sig.aggregatedScorePct.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{sig.convictionPct.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{sig.thesisDriftPct.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{sig.confidencePct.toFixed(1)}</TableCell>
                      <TableCell className="text-xs">{sig.momentumRegime}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{sig.riskTags.length ? sig.riskTags.join(", ") : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {signalBatch.signals.length > 15 ? (
              <div className="mt-1 text-xs text-muted-foreground">仅展示前 15 条，完整结果请调用 `/api/daa/hf/scores`。</div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {decisions.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">上次运行的人因决策结果</CardTitle>
            <CardDescription>来自统一再平衡引擎，可与采集信号对照校验。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>分层</TableHead>
                    <TableHead className="text-right">评分%</TableHead>
                    <TableHead>Reasons</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.map((d, i) => (
                    <TableRow key={`${d.symbol}-${i}`}>
                      <TableCell className="font-medium">{d.symbol}</TableCell>
                      <TableCell><TierBadge tier={d.tier} /></TableCell>
                      <TableCell className="text-right">{d.weightedScorePct.toFixed(1)}</TableCell>
                      <TableCell className="max-w-[260px] text-xs text-muted-foreground">{d.reasons.length ? d.reasons.join("; ") : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
