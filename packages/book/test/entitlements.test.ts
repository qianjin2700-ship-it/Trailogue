import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FEATURE_CATALOG,
  FREE_ENTITLEMENTS,
  isEntitled,
  magazineLayoutTier,
  PDF_RESOLUTION,
  pdfResolution,
  PRO_FEATURES,
  type Entitlements,
} from '../src/index.js';

/**
 * Pro 权限开关（只做 gate，不做支付）。
 *
 * 冻结前提：2.0 首批候选能力 = Premium Magazine layouts + High-resolution PDF。
 * 这些用例证明「免费用户拿不到 Pro 能力」，而接入 StoreKit 时
 * 只需要把真实权益解析成 Entitlements，业务代码不用改。
 */

test('免费用户不具备任何 Pro 能力', () => {
  PRO_FEATURES.forEach((feature) => {
    assert.equal(isEntitled(FREE_ENTITLEMENTS, feature), false, `${feature} 不应默认开启`);
  });
  assert.equal(magazineLayoutTier(FREE_ENTITLEMENTS), 'classic');
  assert.deepEqual(pdfResolution(FREE_ENTITLEMENTS), PDF_RESOLUTION.standard);
});

test('Pro 用户解锁全部首批能力', () => {
  const pro: Entitlements = { tier: 'pro' };
  PRO_FEATURES.forEach((feature) => assert.equal(isEntitled(pro, feature), true));
  assert.equal(magazineLayoutTier(pro), 'premium');
  assert.deepEqual(pdfResolution(pro), PDF_RESOLUTION.high);
  assert.ok(PDF_RESOLUTION.high.longEdgePx > PDF_RESOLUTION.standard.longEdgePx);
  assert.ok(PDF_RESOLUTION.high.targetDpi > PDF_RESOLUTION.standard.targetDpi);
});

test('细粒度权益可以单项解锁（运营补偿 / 试用）', () => {
  const single: Entitlements = { tier: 'free', features: ['high_resolution_pdf'] };
  assert.equal(isEntitled(single, 'high_resolution_pdf'), true);
  assert.equal(isEntitled(single, 'premium_magazine_layouts'), false);
  assert.equal(magazineLayoutTier(single), 'classic');
  assert.deepEqual(pdfResolution(single), PDF_RESOLUTION.high);
});

test('权益目录与能力列表一致，没有漏配的能力', () => {
  assert.deepEqual(
    [...PRO_FEATURES].sort(),
    Object.keys(FEATURE_CATALOG).sort(),
  );
  PRO_FEATURES.forEach((feature) => {
    const entry = FEATURE_CATALOG[feature];
    assert.equal(entry.id, feature);
    assert.ok(entry.label.length > 0);
    assert.notEqual(entry.freeValue, entry.proValue);
  });
});

test('未定义的 tier 不会被当成 Pro（防御式判断）', () => {
  const bogus = { tier: 'enterprise' } as unknown as Entitlements;
  assert.equal(isEntitled(bogus, 'premium_magazine_layouts'), false);
});
