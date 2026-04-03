"use client";

import { Dialog } from "@/components/ui/dialog";

import {
  DaaSurfaceDialogShell,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { AssetKlineChart } from "@/app/daa/dashboard/workbench/_components/AssetKlineChart";

export type AssetDetailDraft = {
  symbol: string;
  market: string;
  assetKey: string;
  name?: string;
};

export function AssetDetailDialog({
  draft,
  onClose,
}: {
  draft: AssetDetailDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DaaSurfaceDialogShell
        accent="cyan"
        className="max-w-4xl"
        title={draft?.symbol ?? ""}
        description={draft?.name || `${draft?.market ?? ""} 市场 · K 线图表`}
        badges={
          draft ? (
            <DaaSurfaceStatusPill tone="cyan">{draft.market}</DaaSurfaceStatusPill>
          ) : null
        }
      >
        {draft ? (
          <AssetKlineChart
            symbol={draft.symbol}
            market={draft.market}
          />
        ) : null}
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
