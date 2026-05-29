import { useMemo } from "react";

import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { SettingsNavItemId } from "./SettingsFormPrimitives";

/** 深度排序后序列化，消除嵌套字段顺序差异导致的误判。 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  return JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, k) => {
        sorted[k] = (value as Record<string, unknown>)[k];
        return sorted;
      }, {});
    }
    return value;
  });
}

export interface SettingsDirtyState {
  isDirty: boolean;
  sectionDirtyMap: Record<SettingsNavItemId, boolean>;
  dirtySectionCount: number;
}

export function useSettingsDirty(
  config: DaaSystemConfig | null,
  baselineConfig: DaaSystemConfig | null,
): SettingsDirtyState {
  const isDirty = useMemo(() => {
    if (!config || !baselineConfig) return false;
    return stableStringify(config) !== stableStringify(baselineConfig);
  }, [config, baselineConfig]);

  const sectionDirtyMap = useMemo<Record<SettingsNavItemId, boolean>>(() => {
    if (!config || !baselineConfig) {
      return { strategy: false, brain: false, data: false, notification: false };
    }
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    return {
      strategy: changed(config.policy, baselineConfig.policy)
        || changed(config.strategy?.risk, baselineConfig.strategy?.risk)
        || changed(config.strategy?.constraints, baselineConfig.strategy?.constraints)
        || changed(config.strategy?.execution, baselineConfig.strategy?.execution),
      brain: changed(config.brain, baselineConfig.brain)
        || changed(config.cognitiveAgent, baselineConfig.cognitiveAgent),
      data: changed(config.dataSources, baselineConfig.dataSources),
      notification: changed(config.notification, baselineConfig.notification),
    };
  }, [config, baselineConfig]);

  const dirtySectionCount = useMemo(
    () => Object.values(sectionDirtyMap).filter(Boolean).length,
    [sectionDirtyMap],
  );

  return { isDirty, sectionDirtyMap, dirtySectionCount };
}
