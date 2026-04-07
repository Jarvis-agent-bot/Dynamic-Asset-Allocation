import { ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

/**
 * POST /api/daa/cron/health-check
 *
 * 每 30 分钟检查关键 cron 是否正常运行。
 * 如果 price-refresh 超过 30 分钟没有成功记录，发送 TG 告警。
 */
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;

    const pool = daaPgPool();
    const issues: string[] = [];

    // 检查 price-refresh 最近 30 分钟是否有成功记录
    try {
      const priceResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM daa_job_execution_logs
         WHERE job_type = 'cron_price_refresh' AND status = 'succeeded'
         AND started_at >= NOW() - INTERVAL '35 minutes'`,
      );
      const priceOk = Number(priceResult.rows[0]?.cnt) > 0;
      if (!priceOk) {
        issues.push("price-refresh: 最近 35 分钟无成功记录");
      }
    } catch (e) {
      logSwallowed("cron-health.priceCheck", e);
      issues.push("price-refresh: 检查失败");
    }

    // 检查 market-indicators-refresh 最近 60 分钟
    try {
      const indicatorResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM daa_job_execution_logs
         WHERE job_type = 'cron_market_indicators_refresh' AND status = 'succeeded'
         AND started_at >= NOW() - INTERVAL '65 minutes'`,
      );
      const indicatorOk = Number(indicatorResult.rows[0]?.cnt) > 0;
      if (!indicatorOk) {
        issues.push("market-indicators-refresh: 最近 65 分钟无成功记录");
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
