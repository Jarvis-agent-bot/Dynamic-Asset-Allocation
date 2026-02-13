"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeDaaRecommendation } from "@/src/core/aiAnalysis";

import { loadPaperExecutionLog } from "@/src/daa/executionLogStore";
import { loadRebalanceLog } from "@/src/daa/rebalanceLogStore";

import { loadPortfolioStateV1 } from "./portfolioStateStore";
import { loadRebalanceScheduleStateV1 } from "./rebalanceScheduleStore";

import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  readJsonFromLs,
} from "./wizardStorage";
import { LS_TAG_TAXONOMY, loadTagTaxonomy } from "./tagTaxonomy";

export type DaaWorkflowExportBundleV1 = {
  schemaVersion: 1;
  generatedAt: string;

  // Core path: Step2 -> Step4 -> Step5 -> Step6 -> Step7
  market_events: unknown;
  rebalance_request: unknown;
  recommendation: unknown;
  ai_explain: unknown;
  human_profile: unknown;
  tag_taxonomy: unknown;

  // Observability v0: keep rolling histories so runs can be traced/replayed.
  portfolio_state: unknown;
  rebalance_log: unknown;
  paper_execution_log: unknown;

  // Optional v0 UI config for dynamic scheduling.
  rebalance_schedule?: unknown;

  meta: {
    tagTaxonomyConfigured: boolean;
  };
};

export function useDaaWorkflowExportBundleV1() {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const onData = () => setRev((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData as EventListener);
    window.addEventListener("storage", onData);
    return () => {
      window.removeEventListener(WIZARD_DATA_EVENT, onData as EventListener);
      window.removeEventListener("storage", onData);
    };
  }, []);

  const marketEvents = useMemo(() => readJsonFromLs(LS_MARKET_EVENTS), [rev]);
  const rebalanceReq = useMemo(() => readJsonFromLs(LS_REBALANCE_REQUEST), [rev]);
  const rebalanceResp = useMemo(() => readJsonFromLs(LS_REBALANCE_RESPONSE), [rev]);
  const humanProfile = useMemo(() => readJsonFromLs(LS_HUMAN_PROFILE), [rev]);

  const tagTaxonomyRaw = useMemo(() => readJsonFromLs(LS_TAG_TAXONOMY), [rev]);
  const tagTaxonomy = useMemo(() => loadTagTaxonomy(), [rev]);

  const portfolioState = useMemo(() => (typeof window === "undefined" ? null : loadPortfolioStateV1()), [rev]);
  const rebalanceLog = useMemo(() => (typeof window === "undefined" ? [] : loadRebalanceLog(window.localStorage)), [rev]);
  const paperExecutionLog = useMemo(() => (typeof window === "undefined" ? [] : loadPaperExecutionLog(window.localStorage)), [rev]);
  const rebalanceSchedule = useMemo(() => (typeof window === "undefined" ? null : loadRebalanceScheduleStateV1()), [rev]);

  const aiExplain = useMemo(() => {
    if (!rebalanceReq || !rebalanceResp) return null;
    try {
      return analyzeDaaRecommendation({
        baselineRequest: rebalanceReq,
        baselineResponse: rebalanceResp,
        marketEvents,
      });
    } catch {
      return null;
    }
  }, [marketEvents, rebalanceReq, rebalanceResp]);

  const exportBundle: DaaWorkflowExportBundleV1 = useMemo(
    () => ({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),

      market_events: marketEvents,
      rebalance_request: rebalanceReq,
      recommendation: rebalanceResp,
      ai_explain: aiExplain,
      human_profile: humanProfile,
      tag_taxonomy: tagTaxonomy,

      portfolio_state: portfolioState,
      rebalance_log: rebalanceLog,
      paper_execution_log: paperExecutionLog,
      rebalance_schedule: rebalanceSchedule,

      meta: {
        tagTaxonomyConfigured: !!tagTaxonomyRaw,
      },
    }),
    [
      aiExplain,
      humanProfile,
      marketEvents,
      paperExecutionLog,
      rebalanceSchedule,
      portfolioState,
      rebalanceLog,
      rebalanceReq,
      rebalanceResp,
      tagTaxonomy,
      tagTaxonomyRaw,
    ]
  );

  const marketEventCount = Array.isArray(marketEvents) ? marketEvents.length : 0;
  const hasRecommendation = !!rebalanceResp;
  const hasAiExplain = !!aiExplain;
  const hasHuman = !!humanProfile;
  const hasTagsConfigured = !!tagTaxonomyRaw;

  return {
    exportBundle,
    marketEventCount,
    hasRecommendation,
    hasAiExplain,
    hasHuman,
    hasTagsConfigured,
  };
}
