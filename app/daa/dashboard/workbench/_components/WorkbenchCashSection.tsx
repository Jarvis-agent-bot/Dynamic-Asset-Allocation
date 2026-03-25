"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  appendCashLedgerEntry,
  listCashLedger,
  type StoreCashLedgerEntry,
} from "@/src/daa/modules/store/storeApi";
import type { DaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";
import type { WorkbenchAccountBreakdownItem } from "@/src/daa/modules/workbench/workbenchTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const CASH_CURRENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "USD", label: "美元 (USD)" },
  { value: "EUR", label: "欧元 (EUR)" },
  { value: "USDC", label: "稳定币 (USDC)" },
  { value: "RMB", label: "人民币 (RMB/CNY)" },
  { value: "HKD", label: "港元 (HKD)" },
];

function normalizeCashCurrency(value: string): string {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RMB" || raw === "CNH") return "CNY";
  return raw || "USD";
}

function formatCashMeta(row: StoreCashLedgerEntry) {
  const tags: string[] = [];
  if (row.entryKind === "opening_balance") tags.push("期初余额");
  else if (row.entryKind === "trade_execution") tags.push("成交入账");
  else if (row.entryKind === "dividend") tags.push("分红");
  else if (row.entryKind) tags.push("手工流水");
  if (row.baseCurrency) tags.push(row.baseCurrency);
  if (row.accountBaseCurrency && row.accountBaseCurrency !== row.baseCurrency) tags.push(`到账 ${row.accountBaseCurrency}`);
  if (row.ticketId) tags.push(`ticket:${row.ticketId}`);
  if (row.cycleId) tags.push(`cycle:${row.cycleId}`);
  return tags;
}

export function WorkbenchCashSection(props: {
  baseCurrency: string;
  entries?: StoreCashLedgerEntry[];
  ledgerMeta?: DaaCurrentLedgerMeta | null;
  cashMutationsAllowed?: boolean;
  readOnlyReason?: string | null;
  accountBreakdown?: WorkbenchAccountBreakdownItem[];
  onCashChanged?: () => void;
}) {
  const {
    baseCurrency,
    entries,
    ledgerMeta,
    cashMutationsAllowed = true,
    readOnlyReason,
    accountBreakdown = [],
    onCashChanged,
  } = props;

  const [cashLedger, setCashLedger] = useState<StoreCashLedgerEntry[]>(entries || []);
  const [loading, setLoading] = useState(!entries);
  const [dialogSide, setDialogSide] = useState<"deposit" | "withdraw" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashCurrency, setCashCurrency] = useState(baseCurrency === "CNY" ? "RMB" : baseCurrency);
  const [cashNote, setCashNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadLedger = useCallback(async () => {
    try {
      const entries = await listCashLedger(100);
      setCashLedger(entries);
    } catch (err) {
  logSwallowed("WorkbenchCashSection.loadData", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!entries) {
      void loadLedger();
    }
  }, [entries, loadLedger]);

  useEffect(() => {
    if (!entries) return;
    setCashLedger(entries);
    setLoading(false);
  }, [entries]);

  const dialogOpen = dialogSide != null;

  const closeDialog = useCallback(() => {
    setDialogSide(null);
    setCashAmount("");
    setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
    setCashNote("");
  }, [baseCurrency]);

  useEffect(() => {
    if (dialogOpen) setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
  }, [dialogOpen, baseCurrency]);

  const handleSubmit = useCallback(async () => {
    if (!dialogSide || submitting) return;
    if (!cashMutationsAllowed) {
      toast.error(readOnlyReason || "当前现金余额为只读状态。");
      return;
    }
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的金额");
      return;
    }
    setSubmitting(true);
    try {
      await appendCashLedgerEntry({
        side: dialogSide,
        amount,
        baseCurrency: cashCurrency,
        note: cashNote.trim() || undefined,
      });
      toast.success(dialogSide === "deposit" ? "入金已记录" : "出金已记录");
      closeDialog();
      await loadLedger();
      onCashChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "现金流水提交失败");
    } finally {
      setSubmitting(false);
    }
  }, [cashAmount, cashCurrency, cashMutationsAllowed, cashNote, closeDialog, dialogSide, loadLedger, onCashChanged, readOnlyReason, submitting]);

  return (
    <>
      <DaaSurfacePanel
        accent="indigo"
        title={cashMutationsAllowed ? "现金流水" : "现金流水（只读）"}
        subtitle={accountBreakdown.length > 1
          ? "这里保留当前账本现金流水，并拆开显示各本地执行通道的资金分布，方便核对现金去向。"
          : cashMutationsAllowed
            ? "记录入金出金并查看最近资金进出，确认账户现金变化是否符合预期。"
            : "当前余额为只读状态，这里只保留本地资金流水作为审计记录。"}
        action={cashMutationsAllowed ? (
          <div className="flex flex-wrap gap-2">
            <DaaSurfaceActionButton tone="success" onClick={() => setDialogSide("deposit")}>
              <Plus className="h-4 w-4" />
              入金
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton tone="warning" onClick={() => setDialogSide("withdraw")}>
              <Minus className="h-4 w-4" />
              出金
            </DaaSurfaceActionButton>
          </div>
        ) : undefined}
        bodyClassName="pt-0"
      >
        <div className="grid gap-3 border-b border-[var(--border)] pb-4 md:grid-cols-3">
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">当前账本起点</div>
            <div className="mt-2 text-sm text-[var(--text)]">{ledgerMeta?.ledgerStartTs ? formatDateTime(ledgerMeta.ledgerStartTs) : "尚未建立"}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">现金流水表只保留这次账本起点之后的新记录。</div>
          </div>
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">期初余额</div>
            <div className="mt-2 text-sm text-[var(--text)]">{formatCurrency(ledgerMeta?.openingBalance || 0, baseCurrency)}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">如果你之前做过历史入金，这里会显示账本重置后保留下来的起点现金。</div>
          </div>
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">数据来源</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text)]">
              <span>本地模拟账本</span>
              <DaaSurfaceStatusPill tone={accountBreakdown.length > 1 ? "cyan" : cashMutationsAllowed ? "slate" : "amber"}>
                {accountBreakdown.length > 1 ? "分账户展示" : cashMutationsAllowed ? "可编辑" : "只读"}
              </DaaSurfaceStatusPill>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {accountBreakdown.length > 1
                ? `当前展示 ${cashLedger.length} 条本地流水；下方拆分仅用于解释不同执行通道的现金分布。`
                : `当前展示 ${cashLedger.length} 条本地流水，入金、出金和成交现金变化都会统一记录在这里。`}
            </div>
            {!cashMutationsAllowed && readOnlyReason ? (
              <div className="mt-2 text-xs leading-5 text-[var(--faint)]">{readOnlyReason}</div>
            ) : null}
          </div>
        </div>

        {accountBreakdown.length > 0 ? (
          <div className="mt-4 grid gap-3 border-b border-[var(--border)] pb-4 md:grid-cols-2 xl:grid-cols-3">
            {accountBreakdown.map((item) => (
              <div key={`${item.venueKind}:${item.accountId || "default"}`} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{item.label}</div>
                  <DaaSurfaceStatusPill tone={item.cashMutationsAllowed ? "cyan" : "amber"}>
                    {item.cashMutationsAllowed ? "可编辑" : "只读"}
                  </DaaSurfaceStatusPill>
                </div>
                <div className="mt-3 text-sm text-[var(--text)]">
                  {item.accountId ? `账户 ${item.accountId}` : "默认账户"}
                </div>
                <div className="mt-2 grid gap-1 text-xs text-[var(--muted)]">
                  <div>现金 {formatCurrency(item.cash, item.baseCurrency)}</div>
                  <div>可投资 {formatCurrency(item.investableCash, item.baseCurrency)}</div>
                  <div>冻结 {formatCurrency(item.frozenCash, item.baseCurrency)}</div>
                </div>
                {item.readOnlyReason ? (
                  <div className="mt-2 text-xs leading-5 text-[var(--faint)]">{item.readOnlyReason}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)]">
                <TableHead>时间</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashLedger.map((row) => {
                const side = row.side === "withdraw" ? "出金" : "入金";
                const amount = row.amountInAccountBase ?? row.amount;
                const displayCurrency = row.amountInAccountBase != null
                  ? (row.accountBaseCurrency || baseCurrency)
                  : (row.baseCurrency || baseCurrency);
                const tags = formatCashMeta(row);
                return (
                  <TableRow key={row.id} className="border-[var(--border)]">
                    <TableCell className="text-sm text-[var(--text)]">{(row.ts || row.createdAt || "").slice(0, 16).replace("T", " ")}</TableCell>
                    <TableCell>
                      <DaaSurfaceStatusPill tone={row.side === "withdraw" ? "amber" : "green"}>{side}</DaaSurfaceStatusPill>
                    </TableCell>
                    <TableCell className="text-sm text-[var(--text)]">
                      <div>{formatCurrency(amount, displayCurrency)}</div>
                      {row.amountInAccountBase != null && row.baseCurrency !== row.accountBaseCurrency ? (
                        <div className="mt-1 text-xs text-[var(--muted)]">原币 {formatCurrency(row.amount, row.baseCurrency || baseCurrency)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted)]">
                      <div>{row.note || (row.entryKind === "trade_execution" ? "成交自动入账" : row.entryKind === "opening_balance" ? "账本重置后的期初余额" : "-")}</div>
                      {tags.length > 0 ? <div className="mt-1 text-xs text-[var(--faint)]">{tags.join(" · ")}</div> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && cashLedger.length === 0 ? (
                <TableRow className="border-[var(--border)]">
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-[var(--faint)]">
                    {cashMutationsAllowed
                      ? "当前还没有入金或出金记录，先记录一笔资金变动后这里才会出现流水。"
                      : "当前没有可展示的本地现金流水；只读模式下余额不会由这里的流水直接驱动。"}
                  </TableCell>
                </TableRow>
              ) : null}
              {loading ? (
                <TableRow className="border-[var(--border)]">
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-[var(--faint)]">加载中...</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DaaSurfacePanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md border-[var(--border)] bg-[var(--surface)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>{dialogSide === "withdraw" ? "记录出金" : "记录入金"}</DialogTitle>
            <DialogDescription>仅记录现金流水并更新现金余额，不会触发自动交易。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>币种</Label>
              <select
                value={cashCurrency}
                onChange={(e) => setCashCurrency(e.target.value)}
                className="h-10 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--elevated)] px-3 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(56,189,248,0.16)]"
              >
                {CASH_CURRENCY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>金额（{normalizeCashCurrency(cashCurrency)}）</Label>
              <Input type="number" min="0" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder={`请输入 ${normalizeCashCurrency(cashCurrency)} 金额`} className="border-[var(--border-strong)] bg-[var(--elevated)]" />
              <p className="text-xs text-[var(--muted)]">系统会按最新汇率折算到账户基准币 {baseCurrency} 后更新现金余额。</p>
            </div>
            <div className="space-y-1.5">
              <Label>备注（可选）</Label>
              <Input value={cashNote} onChange={(e) => setCashNote(e.target.value)} placeholder="例如：工资入账 / 提现" className="border-[var(--border-strong)] bg-[var(--elevated)]" />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={closeDialog} className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--text)]">取消</button>
            <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50">{submitting ? "提交中..." : "确认提交"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
