import type { ProviderQuotaCacheEntry } from "../hooks/useProviderQuota";
import { sortQuotasByWindow } from "../../../usage/components/ProviderLimits/quotaParsing";
import type { OperationalQuota } from "./codexOperationalQuota";

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Preserve reported account and model scopes; absent windows are never synthesized. */
export function claudeOperationalQuotas(
  cache: ProviderQuotaCacheEntry | null | undefined
): (OperationalQuota & { name: string; label: string })[] {
  if (!cache || cache.message) return [];
  const windows = Object.entries({ ...cache.quotas, ...cache.modelQuotas }).flatMap(
    ([name, value]) => {
      if (!value || typeof value !== "object") return [];
      const quota = value as Record<string, unknown>;
      // The fetcher marks synthetic zeroes explicitly when upstream omitted utilization.
      if (quota.fractionReported === false) return [];
      const percent =
        finite(quota.used) && finite(quota.total) && quota.total > 0
          ? (quota.used / quota.total) * 100
          : finite(quota.remainingPercentage)
            ? 100 - quota.remainingPercentage
            : null;
      if (percent === null) return [];
      return [
        {
          name,
          label: typeof quota.displayName === "string" ? quota.displayName : name,
          usedPercent: Math.min(100, Math.max(0, Math.round(percent))),
          resetAt:
            typeof quota.resetAt === "string" && Number.isFinite(Date.parse(quota.resetAt))
              ? quota.resetAt
              : null,
        },
      ];
    }
  );
  return sortQuotasByWindow(windows);
}
