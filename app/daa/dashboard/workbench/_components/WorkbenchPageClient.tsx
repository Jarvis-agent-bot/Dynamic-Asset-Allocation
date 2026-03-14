"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchDialogs } from "@/app/daa/dashboard/workbench/_components/WorkbenchDialogs";
import { WorkbenchSummaryHeader } from "@/app/daa/dashboard/workbench/_components/WorkbenchSummaryHeader";

class WorkbenchErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[WorkbenchErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-red-800">工作台加载异常</h3>
          <p className="mt-2 text-sm text-red-600">{this.state.error?.message || "未知错误"}</p>
          <button
            className="mt-4 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WorkbenchPageClient(props: {
  initialTab?: string;
}) {
  const model = useWorkbenchPageModel({ initialTab: props.initialTab });

  return (
    <WorkbenchErrorBoundary>
      <div className="space-y-4">
        <WorkbenchBannerStack
          error={model.error}
          authRequired={model.authRequired}
          bootstrap={model.bootstrap}
          executionReceipt={model.executionReceipt}
          onClearExecutionReceipt={model.clearExecutionReceipt}
        />

        <WorkbenchSummaryHeader
          baseCurrency={model.bootstrap?.baseCurrency || "USD"}
          totalEquity={model.totalEquity}
          holdingsValue={model.holdingsValue}
          cashValue={model.cashValue}
          loading={model.loading && !model.bootstrap}
          refreshing={model.refreshing}
          onRefresh={() => void model.loadBootstrap(true)}
        />

        {model.bootstrap ? <WorkbenchActiveTabPanel model={model} /> : null}

        <WorkbenchDialogs {...model.dialogProps} />
      </div>
    </WorkbenchErrorBoundary>
  );
}
