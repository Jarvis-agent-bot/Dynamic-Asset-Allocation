"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeDaaRecommendation, type AiAnalysis } from "@/src/core/aiAnalysis";

import { isValidTagTaxonomy, LS_TAG_TAXONOMY } from "./tagTaxonomy";
import { type DaaStepStatus } from "./steps";
import {
  LS_HUMAN_PROFILE,
  LS_MARKET_EVENTS,
  LS_MONEY_PLAN,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
  readJsonFromLs,
} from "./wizardStorage";

export type DaaTagTaxonomyRuntimeStatus = "default" | "configured" | "invalid";

export type DaaRuntime = {
  marketEventCount: number;
  hasRecommendation: boolean;
  hasHumanProfile: boolean;
  hasMoneyPlan: boolean;
  tagTaxonomyStatus: DaaTagTaxonomyRuntimeStatus;
  analysis: AiAnalysis | null;
  citationsCount: number;

  stepStatusById: Record<number, DaaStepStatus>;

  // If null: shortest path is ready.
  nextStepId: number | null;
  nextActionText: string;
};

function countMarketEvents(x: unknown): number {
  return Array.isArray(x) ? x.length : 0;
}

export function useDaaRuntime(): DaaRuntime {
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
  const moneyPlan = useMemo(() => readJsonFromLs(LS_MONEY_PLAN), [rev]);
  const humanProfile = useMemo(() => readJsonFromLs(LS_HUMAN_PROFILE), [rev]);
  const tagTaxonomyRaw = useMemo(() => readJsonFromLs(LS_TAG_TAXONOMY), [rev]);

  const marketEventCount = useMemo(() => countMarketEvents(marketEvents), [marketEvents]);
  const hasRecommendation = !!rebalanceResp;
  const hasHumanProfile = !!humanProfile;
  const hasMoneyPlan = !!moneyPlan;

  const tagTaxonomyStatus: DaaTagTaxonomyRuntimeStatus = useMemo(() => {
    if (!tagTaxonomyRaw) return "default";
    return isValidTagTaxonomy(tagTaxonomyRaw) ? "configured" : "invalid";
  }, [tagTaxonomyRaw]);

  const analysis: AiAnalysis | null = useMemo(() => {
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

  const citationsCount = analysis?.marketCitations?.length ?? 0;

  const stepStatusById: Record<number, DaaStepStatus> = useMemo(() => {
    const step2: DaaStepStatus = marketEventCount > 0 ? "done" : "todo";
    const step3: DaaStepStatus = hasMoneyPlan ? "done" : "wip";
    const step4: DaaStepStatus = hasRecommendation ? "done" : "todo";

    const step5: DaaStepStatus = !hasRecommendation ? "todo" : citationsCount > 0 ? "done" : "wip";
    const step6: DaaStepStatus = hasHumanProfile ? "done" : "todo";
    const step7: DaaStepStatus = tagTaxonomyStatus === "configured" ? "done" : tagTaxonomyStatus === "invalid" ? "todo" : "wip";

    return {
      1: "later",
      2: step2,
      3: step3,
      4: step4,
      5: step5,
      6: step6,
      7: step7,
    };
  }, [citationsCount, hasHumanProfile, hasMoneyPlan, hasRecommendation, marketEventCount, tagTaxonomyStatus]);

  const { nextStepId, nextActionText } = useMemo(() => {
    if (marketEventCount === 0) return { nextStepId: 2, nextActionText: "先补 Step2 events（至少 1 条）" };
    if (!hasRecommendation) return { nextStepId: 4, nextActionText: "去 Step4 运行一次 recommendation" };
    if (!hasHumanProfile) return { nextStepId: 6, nextActionText: "补齐 Step6 human profile" };

    if (hasRecommendation && citationsCount === 0) {
      return { nextStepId: 5, nextActionText: "检查 Step5 explain 的 citations（events/symbol 可能不匹配）" };
    }

    return { nextStepId: null, nextActionText: "已具备最短路径；可以导出 bundle" };
  }, [citationsCount, hasHumanProfile, hasRecommendation, marketEventCount]);

  return {
    marketEventCount,
    hasRecommendation,
    hasHumanProfile,
    hasMoneyPlan,
    tagTaxonomyStatus,
    analysis,
    citationsCount,
    stepStatusById,
    nextStepId,
    nextActionText,
  };
}
