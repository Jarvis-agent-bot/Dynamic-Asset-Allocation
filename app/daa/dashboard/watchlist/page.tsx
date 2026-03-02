"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useWatchlistCandidates } from "../_components/useDaaStore";

import type { DaaWatchlistCandidateRow } from "../../unifiedInputStore";

const TAG_OPTIONS = ["etf", "growth", "value", "bond", "crypto", "dividend", "tech", "us", "hk", "cn", "largecap"] as const;

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

// ——— 简易 Toggle Switch ———
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? (checked ? "已启用，点击暂停" : "已暂停，点击启用")}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? "bg-sky-500" : "bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ——— 删除确认弹窗 ———
function DeleteConfirmDialog({
  onConfirm,
  trigger,
  description = "此操作不可撤销，是否确认删除？",
}: {
  onConfirm: () => void;
  trigger: React.ReactNode;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
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

// ——— JSON 批量导入弹窗 ———
function ImportDialog({ onImport }: { onImport: (rows: DaaWatchlistCandidateRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleImport() {
    setError("");
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: DaaWatchlistCandidateRow[] = arr
        .map((item: any) => ({
          symbol: String(item.symbol ?? "").trim().toUpperCase(),
          market: String(item.market ?? "US").trim().toUpperCase() || "US",
          currency: String(item.currency ?? "USD").trim().toUpperCase() || "USD",
          enabled: item.enabled !== false,
          targetWeightHint: Math.max(0, Math.min(1, Number(item.targetWeightHint) || 0)),
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          notes: String(item.notes ?? "").trim(),
        }))
        .filter((r) => r.symbol);

      if (!rows.length) {
        setError("未识别到有效候选标的。");
        return;
      }
      onImport(rows);
      setOpen(false);
      setText("");
    } catch {
      setError("JSON 格式错误，应为候选对象数组。");
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
          <DialogTitle>批量导入候选池 (JSON)</DialogTitle>
        </DialogHeader>
        <Textarea
          className="min-h-[200px] font-mono text-xs"
          placeholder={`[{"symbol":"AAPL","market":"US","currency":"USD","targetWeightHint":0.05,"tags":["tech"],"notes":"苹果"}]`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
        />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleImport}>导入</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ——— 主页面 ———
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

  function importCandidates(rows: DaaWatchlistCandidateRow[]) {
    const merged = [...list];
    for (const row of rows) {
      const key = `${row.symbol}::${row.market}`;
      const idx = merged.findIndex((item) => `${item.symbol}::${item.market}` === key);
      if (idx >= 0) {
        merged[idx] = row;
      } else {
        merged.push(row);
      }
    }
    setCandidates(merged);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daa-watchlist.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function removeCandidate(index: number) {
    setCandidates(list.filter((_, i) => i !== index));
  }

  function toggleEnabled(index: number) {
    const next = [...list];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setCandidates(next);
  }

  function toggleDraftTag(tag: string) {
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="候选池" description="维护可被系统评估的观察标的，支持现金起步建仓。" />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">候选池概览</CardTitle>
              <CardDescription>
                总计 {list.length} 个，启用 {enabledCount} 个。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <ImportDialog onImport={importCandidates} />
              <Button variant="outline" size="sm" onClick={exportJson} disabled={!list.length}>
                <Download className="mr-2 h-3.5 w-3.5" /> 导出
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 添加表单 */}
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">新增候选标的</p>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>代码</Label>
                <Input
                  value={draft.symbol}
                  onChange={(e) => setDraft((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                  placeholder="SPY"
                />
              </div>
              <div className="space-y-1.5">
                <Label>市场</Label>
                <Input
                  value={draft.market}
                  onChange={(e) => setDraft((prev) => ({ ...prev, market: e.target.value.toUpperCase() }))}
                  placeholder="US"
                />
              </div>
              <div className="space-y-1.5">
                <Label>币种</Label>
                <Input
                  value={draft.currency}
                  onChange={(e) => setDraft((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                  placeholder="USD"
                />
              </div>
              <div className="space-y-1.5">
                <Label>权重提示%</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={Math.round((draft.targetWeightHint || 0) * 100)}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      targetWeightHint: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)),
                    }))
                  }
                />
              </div>
            </div>

            {/* Tag 点选 */}
            <div className="space-y-1.5">
              <Label>标签</Label>
              <div className="flex flex-wrap gap-1.5">
                {TAG_OPTIONS.map((tag) => {
                  const active = draft.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        active
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => toggleDraftTag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 备注 */}
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Input
                value={draft.notes ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="可选备注，如投资理由、关注原因等"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft(emptyCandidate())}
                disabled={!draft.symbol && !draft.notes && !draft.tags.length}
              >
                清空
              </Button>
              <Button size="sm" onClick={addCandidate} disabled={!String(draft.symbol || "").trim()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 添加候选
              </Button>
            </div>
          </div>

          {/* 候选列表 */}
          {list.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">启用</TableHead>
                    <TableHead>代码</TableHead>
                    <TableHead>市场</TableHead>
                    <TableHead>币种</TableHead>
                    <TableHead className="text-right">权重提示%</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((item, index) => (
                    <TableRow key={`${item.symbol}-${item.market}-${index}`} className={!item.enabled ? "opacity-50" : undefined}>
                      <TableCell>
                        <Toggle
                          checked={item.enabled}
                          onChange={() => toggleEnabled(index)}
                          label={item.enabled ? `暂停 ${item.symbol}` : `启用 ${item.symbol}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.symbol}</TableCell>
                      <TableCell>{item.market}</TableCell>
                      <TableCell>{item.currency}</TableCell>
                      <TableCell className="text-right">{(item.targetWeightHint * 100).toFixed(1)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.tags.length ? (
                            item.tags.map((t) => (
                              <span key={t} className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        {item.notes ? (
                          <span className="block truncate text-xs text-muted-foreground" title={item.notes}>
                            {item.notes}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteConfirmDialog
                          onConfirm={() => removeCandidate(index)}
                          description={`确认从候选池中移除 ${item.symbol}？`}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">暂无候选标的</p>
              <p className="mt-1 text-xs text-muted-foreground">在上方填写代码后点击"添加候选"，或使用"导入"批量添加</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
