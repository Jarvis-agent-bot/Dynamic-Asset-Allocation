"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWatchlistCandidates } from "../_components/useDaaStore";

import type { DaaWatchlistCandidateRow } from "../../unifiedInputStore";

function emptyCandidate(): DaaWatchlistCandidateRow {
  return {
    symbol: "",
    market: "US",
    currency: "USD",
    enabled: true,
    targetWeightHint: 0.03,
    tags: [],
    notes: "",
  };
}

export default function WatchlistPage() {
  const [candidates, setCandidates] = useWatchlistCandidates();
  const [draft, setDraft] = useState<DaaWatchlistCandidateRow>(emptyCandidate());

  const list = candidates ?? [];
  const enabledCount = useMemo(() => list.filter((item) => item.enabled).length, [list]);

  function addCandidate() {
    const symbol = String(draft.symbol || "").trim().toUpperCase();
    if (!symbol) return;

    const next: DaaWatchlistCandidateRow = {
      ...draft,
      symbol,
      market: String(draft.market || "US").trim().toUpperCase() || "US",
      currency: String(draft.currency || "USD").trim().toUpperCase() || "USD",
      targetWeightHint: Math.max(0, Math.min(1, Number(draft.targetWeightHint) || 0)),
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      notes: String(draft.notes || "").trim(),
    };

    const key = `${next.symbol}::${next.market}`;
    const index = list.findIndex((item) => `${item.symbol}::${item.market}` === key);
    if (index >= 0) {
      const updated = [...list];
      updated[index] = next;
      setCandidates(updated);
    } else {
      setCandidates([...list, next]);
    }
    setDraft(emptyCandidate());
  }

  function removeCandidate(index: number) {
    setCandidates(list.filter((_, i) => i !== index));
  }

  function toggleEnabled(index: number) {
    const next = [...list];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setCandidates(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="候选池" description="维护可被系统评估的观察标的，支持现金起步建仓。" />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">候选池概览</CardTitle>
          <CardDescription>总计 {list.length} 个，启用 {enabledCount} 个。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1.5 md:col-span-1">
              <Label>代码</Label>
              <Input value={draft.symbol} onChange={(e) => setDraft((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} placeholder="SPY" />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>市场</Label>
              <Input value={draft.market} onChange={(e) => setDraft((prev) => ({ ...prev, market: e.target.value.toUpperCase() }))} placeholder="US" />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>币种</Label>
              <Input value={draft.currency} onChange={(e) => setDraft((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} placeholder="USD" />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label>权重提示%</Label>
              <Input type="number" min={0} max={100} step={0.5} value={Math.round((draft.targetWeightHint || 0) * 100)} onChange={(e) => setDraft((prev) => ({ ...prev, targetWeightHint: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)) }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>标签（逗号分隔）</Label>
              <Input value={draft.tags.join(",")} onChange={(e) => setDraft((prev) => ({ ...prev, tags: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) }))} placeholder="ai,largecap" />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button size="sm" onClick={addCandidate} disabled={!String(draft.symbol || "").trim()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> 添加候选
            </Button>
          </div>

          {list.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>代码</TableHead>
                    <TableHead>市场</TableHead>
                    <TableHead>币种</TableHead>
                    <TableHead className="text-right">权重提示%</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((item, index) => (
                    <TableRow key={`${item.symbol}-${item.market}-${index}`}>
                      <TableCell>
                        <Button size="sm" variant={item.enabled ? "default" : "outline"} className="h-7 px-2.5 text-xs" onClick={() => toggleEnabled(index)}>
                          {item.enabled ? "启用" : "暂停"}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{item.symbol}</TableCell>
                      <TableCell>{item.market}</TableCell>
                      <TableCell>{item.currency}</TableCell>
                      <TableCell className="text-right">{(item.targetWeightHint * 100).toFixed(1)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.tags.length ? item.tags.join(", ") : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeCandidate(index)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无候选标的，新增后可参与机会评分与自动建仓建议。</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
