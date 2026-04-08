import { ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

/**
 * POST /api/daa/cron/health-check
 *
 * 每 30 分钟检查关键数据源的新鲜度（而非检查 job 记录，因为部分 cron 不写 job log）。
 * 检查 DB 中的数据时间戳来判断数据是否在正常刷新。
 */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;

    const pool = daaPgPool();
    const issues: string[] = [];

    // 检查 1: 价格快照是否有 30 分钟内的 fresh 数据
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS cnt FROM daa_market_price_snapshot
         WHERE status = 'fresh' AND fetched_at >= NOW() - INTERVAL '35 minutes'`,
      );
      const freshCount = Number(result.rows[0]?.cnt) || 0;
      if (freshCount === 0) {
        issues.push("price-snapshot: 最近 35 分钟无 fresh 价格数据");
      }
    } catch (e) {
      logSwallowed("cron-health.priceCheck", e);
    }

    // 检查 2: 市场指标快照是否有 65 分钟内的数据
    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS cnt FROM daa_market_indicator_snapshot_v1
         WHERE created_at >= NOW() - INTERVAL '65 minutes'`,
      );
      const indicatorCount = Number(result.rows[0]?.cnt) || 0;
      if (indicatorCount === 0) {
        issues.push("market-indicators: 最近 65 分钟无指标快照");
      }
    } catch (e) {
      logSwallowed("cron-health.indicatorCheck", e);
    }

    // 如果有问题，发送 TG 告警
    if (issues.length > 0) {
      try {
        const message = `⚠️ DAA Cron 健康检查告警\n\n${issues.map((i) => `• ${i}`).join("\n")}\n\n请检查 cron 容器日志。`;
        await sendTelegramByEnv(message, {
          eventType: "cron_health_alert",
          triggerSource: "cron_health_check",
          parseMode: null,
        });
      } catch (e) {
        logSwallowed("cron-health.notify", e);
      }
    }

    return ok({
      healthy: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
    });
  });
}
