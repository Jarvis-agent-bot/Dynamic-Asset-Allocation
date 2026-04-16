/**
 * meta/evaluateSelfAccuracy — 评估 Agent 自身历史准确率
 *
 * 按资产类别或时间段统计论点准确率，发现系统性偏差。
 */

import { registerTool } from "@/src/daa/agent/tools/registry";
import type { ToolExecutionContext, ToolResultV2 } from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

registerTool(
  {
    name: "evaluate_self_accuracy",
    description: "统计 Agent 历史论点的准确率（按资产、按时间段、按 conviction 级别）。适合发现系统性判断偏差。",
    category: "meta",
    parameters: {
      lookbackDays: { type: "number", description: "回看天数（默认 90）" },
    },
    outputSchema: {
      overallAccuracy: "number",
      totalReviewed: "number",
      accuracyByConviction: "object",
    },
    tags: ["accuracy", "self-evaluation", "bias"],
  },
  async (params: Record<string, unknown>, _ctx: ToolExecutionContext): Promise<ToolResultV2> => {
    const t0 = Date.now();
    const lookbackDays = Number(params.lookbackDays) || 90;

    try {
      const { query } = await import("@/src/daa/pg/pool");

      // 查询有复盘评分的论点
      const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
      const rows = await query<{
        thread_id: string;
        conviction_at_time: string;
        accuracy_score: number;
        review_window: string;
        created_at: string;
      }>(
        `SELECT r.thread_id, r.conviction_at_time, r.accuracy_score, r.review_window, r.created_at
         FROM daa_thesis_reviews r
         WHERE r.accuracy_score IS NOT NULL AND r.created_at >= $1
         ORDER BY r.created_at DESC`,
        [since],
      );

      if (!rows.length) {
        return {
          toolName: "evaluate_self_accuracy", category: "meta", success: true,
          data: { message: `最近 ${lookbackDays} 天内无复盘记录`, totalReviewed: 0 },
          outputFields: { overallAccuracy: 0, totalReviewed: 0 },
          latencyMs: Date.now() - t0,
        };
      }

      // 总体准确率
      const scores = rows.map(r => r.accuracy_score);
      const overallAccuracy = scores.reduce((a, b) => a + b, 0) / scores.length;

      // 按 conviction 分组统计
      const byConviction: Record<string, { count: number; sum: number }> = {};
      for (const r of rows) {
        const conv = r.conviction_at_time || "unknown";
        if (!byConviction[conv]) byConviction[conv] = { count: 0, sum: 0 };
        byConviction[conv].count++;
        byConviction[conv].sum += r.accuracy_score;
      }
      const accuracyByConviction = Object.fromEntries(
        Object.entries(byConviction).map(([k, v]) => [k, {
          count: v.count,
          avgAccuracy: Math.round((v.sum / v.count) * 100) / 100,
        }]),
      );

      // 按月分组统计趋势
      const byMonth: Record<string, { count: number; sum: number }> = {};
      for (const r of rows) {
        const month = r.created_at.slice(0, 7);
        if (!byMonth[month]) byMonth[month] = { count: 0, sum: 0 };
        byMonth[month].count++;
        byMonth[month].sum += r.accuracy_score;
      }
      const accuracyTrend = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          count: v.count,
          avgAccuracy: Math.round((v.sum / v.count) * 100) / 100,
        }));

      const data = {
        lookbackDays,
        totalReviewed: rows.length,
        overallAccuracy: Math.round(overallAccuracy * 100) / 100,
        accuracyByConviction,
        accuracyTrend,
        bestPerforming: accuracyTrend.length > 0
          ? accuracyTrend.reduce((best, cur) => cur.avgAccuracy > best.avgAccuracy ? cur : best)
          : null,
      };

      return {
        toolName: "evaluate_self_accuracy",
        category: "meta",
        success: true,
        data,
        outputFields: {
          overallAccuracy: data.overallAccuracy,
          totalReviewed: data.totalReviewed,
          accuracyByConviction,
        },
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      logSwallowed("toolV2.evaluate_self_accuracy", e);
      return { toolName: "evaluate_self_accuracy", category: "meta", success: false, data: null, outputFields: {}, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
    }
  },
);
