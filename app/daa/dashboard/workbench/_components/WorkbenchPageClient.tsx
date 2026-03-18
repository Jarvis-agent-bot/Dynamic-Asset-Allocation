"use client";

import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DeepLedgerSectionAnchor } from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { normalizeWorkbenchTab, type WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import { useWorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { WorkbenchActiveTabPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchActiveTabPanel";
import { WorkbenchBannerStack } from "@/app/daa/dashboard/workbench/_components/WorkbenchBannerStack";
import { WorkbenchCockpitSection } from "@/app/daa/dashboard/workbench/_components/WorkbenchCockpitSection";
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

type WorkbenchSection = "cockpit" | "portfolio" | "rebalance" | "cash";

function normalizeWorkbenchSection(input: string | null | undefined, fallbackTab: WorkbenchTab): WorkbenchSection {
  const text = String(input || "").trim().toLowerCase();
  if (text === "cockpit" || text === "portfolio" || text === "rebalance" || text === "cash") {
    return text;
  }
  if (fallbackTab === "rebalance") return "rebalance";
  if (fallbackTab === "cash") return "cash";
  return "portfolio";
}

export default function WorkbenchPageClient(props: {
  initialTab?: string;
  initialSection?: string;
}) {
  const model = useWorkbenchPageModel({ initialTab: props.initialTab });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cockpitRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const activeSection = useMemo(
    () => normalizeWorkbenchSection(searchParams.get("section") || props.initialSection, model.activeTab),
    [model.activeTab, props.initialSection, searchParams],
  );

  useEffect(() => {
    const nextSection = normalizeWorkbenchSection(searchParams.get("section") || props.initialSection, model.activeTab);
    const nextTab = nextSection === "rebalance"
      ? "rebalance"
      : nextSection === "cash"
        ? "cash"
        : normalizeWorkbenchTab(searchParams.get("tab") || props.initialTab || (nextSection === "portfolio" ? "positions" : model.activeTab));
    if (model.activeTab !== nextTab) {
      model.setActiveTab(nextTab);
    }
  }, [model.activeTab, model.setActiveTab, props.initialSection, props.initialTab, searchParams]);

  function updateUrl(section: WorkbenchSection, tab?: WorkbenchTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    if (tab) params.set("tab", tab);
    else params.delete("tab");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function focusSection(section: WorkbenchSection, nextTab?: WorkbenchTab) {
    if (nextTab) {
      model.setActiveTab(nextTab);
    }
    updateUrl(section, nextTab);
    const target = section === "cockpit" ? cockpitRef.current : workspaceRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSectionAnchor(event: MouseEvent<HTMLAnchorElement>, section: WorkbenchSection) {
    event.preventDefault();
    if (section === "rebalance") focusSection(section, "rebalance");
    else if (section === "cash") focusSection(section, "cash");
    else if (section === "portfolio") {
      const nextTab = model.activeTab === "watchlist" ? "watchlist" : "positions";
      focusSection(section, nextTab);
    } else {
      focusSection("cockpit", model.activeTab);
    }
  }

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

        <div ref={cockpitRef} className="space-y-4">
          <div className="grid gap-2 rounded-[18px] border border-[var(--border)] bg-[rgba(13,19,32,0.8)] p-2 md:grid-cols-4">
            {[
              { key: "cockpit" as const, label: "驾驶舱" },
              { key: "portfolio" as const, label: "组合" },
              { key: "rebalance" as const, label: "调仓" },
              { key: "cash" as const, label: "现金" },
            ].map((item) => (
              <DeepLedgerSectionAnchor
                key={item.key}
                href={`/daa/dashboard/workbench?section=${item.key}`}
                label={item.label}
                active={activeSection === item.key}
                onClick={(event) => handleSectionAnchor(event, item.key)}
              />
            ))}
          </div>

          {model.bootstrap && activeSection === "cockpit" ? <WorkbenchCockpitSection model={model} /> : null}
        </div>

        <div ref={workspaceRef}>
          {model.bootstrap && activeSection !== "cockpit" ? <WorkbenchActiveTabPanel model={model} /> : null}
        </div>

        <WorkbenchDialogs {...model.dialogProps} />
      </div>
    </WorkbenchErrorBoundary>
  );
}
