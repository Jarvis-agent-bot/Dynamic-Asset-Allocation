import { requestDataV1 } from "@/src/daa/api/clientV1";
import type { AssetInsightDetailModeV1, DaaAssetInsightsResponseV1 } from "@/src/daa/insights/assetInsightsV1";

export async function fetchAssetInsightsV1(input: {
  symbols: string[];
  detailMode: AssetInsightDetailModeV1;
  analysisFocus: string;
  includeLlm?: boolean;
  fundOpsLimit?: number;
}): Promise<DaaAssetInsightsResponseV1> {
  return requestDataV1<DaaAssetInsightsResponseV1>("/api/daa/insights/assets", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
}
