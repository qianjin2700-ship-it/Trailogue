/**
 * Trailogue Pro 权限开关（Phase B0，仅设计，不含支付）。
 *
 * 冻结决策（2026-11-05）：
 *   - 首批候选能力：Premium Magazine layouts + High-resolution PDF
 *   - 本阶段只保留 entitlement / feature-gate 的**纯函数**，
 *     不接 StoreKit、不接收据校验、不产生任何网络请求。
 *
 * 因此这里的实现刻意「小」：它只回答「当前用户在不在这个能力的可用范围内」，
 * 至于怎么拿到 Pro（自动续期订阅 / 一次性解锁 / 试用）全部留给后续阶段。
 * 好处是：将来接入 StoreKit 时，业务代码不需要改 ——
 * 只要把真实权益解析成 `Entitlements`，gate 的判断逻辑原样复用。
 */

export type ProFeature = 'premium_magazine_layouts' | 'high_resolution_pdf';

export type PlanTier = 'free' | 'pro';

export interface Entitlements {
  tier: PlanTier;
  /**
   * 细粒度开关：用于将来做「单项解锁」或运营补偿。
   * 为空表示按 tier 走默认规则。
   */
  features?: readonly ProFeature[] | undefined;
}

export const PRO_FEATURES: readonly ProFeature[] = [
  'premium_magazine_layouts',
  'high_resolution_pdf',
];

export interface FeatureCatalogEntry {
  readonly id: ProFeature;
  readonly label: string;
  /** 免费用户得到的版本 */
  readonly freeValue: string;
  /** Pro 用户得到的版本 */
  readonly proValue: string;
}

export const FEATURE_CATALOG: Record<ProFeature, FeatureCatalogEntry> = {
  premium_magazine_layouts: {
    id: 'premium_magazine_layouts',
    label: 'Premium magazine layouts',
    freeValue: 'classic',
    proValue: 'premium',
  },
  high_resolution_pdf: {
    id: 'high_resolution_pdf',
    label: 'High-resolution PDF',
    freeValue: 'standard (long edge 1600px)',
    proValue: 'high (long edge 3200px)',
  },
};

/** 免费 / Pro 的导出分辨率（占位值，实施阶段再对齐 expo-print 能力） */
export const PDF_RESOLUTION = {
  standard: { label: 'standard', longEdgePx: 1600, targetDpi: 150 },
  high: { label: 'high', longEdgePx: 3200, targetDpi: 300 },
} as const;

export function isEntitled(entitlements: Entitlements, feature: ProFeature): boolean {
  if (entitlements.features?.includes(feature)) return true;
  return entitlements.tier === 'pro';
}

export function magazineLayoutTier(entitlements: Entitlements): 'classic' | 'premium' {
  return isEntitled(entitlements, 'premium_magazine_layouts') ? 'premium' : 'classic';
}

export function pdfResolution(entitlements: Entitlements): (typeof PDF_RESOLUTION)['standard' | 'high'] {
  return isEntitled(entitlements, 'high_resolution_pdf')
    ? PDF_RESOLUTION.high
    : PDF_RESOLUTION.standard;
}

/** 默认权益：1.0 用户全部是免费版，没有任何 Pro 能力 */
export const FREE_ENTITLEMENTS: Entitlements = { tier: 'free' };
