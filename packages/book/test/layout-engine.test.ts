import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkPhotos,
  classifyAspect,
  coverVisibleFraction,
  DEFAULT_ASPECT,
  figureFit,
  figureSlotAspect,
  MIN_FULL_BLEED_VISIBLE,
  MIN_VISIBLE_FRACTION,
  pageSlotAspects,
  photoAspect,
  pickLead,
  placeholderPhoto,
  resolvePhotos,
  planPlates,
  splitPhotoRun,
  stackedRowWeights,
  twoSpreadOrientation,
} from '../src/index.js';

/**
 * 版式引擎的几何层与照片分组。
 *
 * 这里锁定的是「不会因为改一个常量就悄悄退化」的硬约束：
 * 分组规则、裁切阈值、槽位比例、缺失照片的容错。
 */

test('splitPhotoRun：余数为 1 时先切独立大图，永不产生 0 张的块', () => {
  const cases: Record<number, number[]> = {
    0: [],
    1: [1],
    2: [2],
    3: [3],
    4: [1, 3],
    5: [2, 3],
    6: [3, 3],
    7: [1, 3, 3],
    8: [2, 3, 3],
    9: [3, 3, 3],
    10: [1, 3, 3, 3],
    11: [2, 3, 3, 3],
    12: [3, 3, 3, 3],
    20: [2, 3, 3, 3, 3, 3, 3],
    24: [3, 3, 3, 3, 3, 3, 3, 3],
  };
  for (const [count, expected] of Object.entries(cases)) {
    const sizes = splitPhotoRun(Number(count));
    assert.deepEqual(sizes, expected, `${count} 张的切分不符合预期`);
    assert.equal(
      sizes.reduce((total, size) => total + size, 0),
      Number(count),
      `${count} 张切分后总数对不上`,
    );
    assert.ok(sizes.every((size) => size >= 1 && size <= 3), `${count} 张出现了越界分块`);
  }
});

test('chunkPhotos：切分后不丢图、不重排', () => {
  const photos = Array.from({ length: 11 }, (_, index) => placeholderPhoto(index, 1.5, `p${index}`));
  const chunks = chunkPhotos(photos);
  assert.deepEqual(
    chunks.flat().map((photo) => photo.id),
    photos.map((photo) => photo.id),
  );
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    splitPhotoRun(photos.length),
  );
});

test('photoAspect：缺宽高 / 非法值一律回落到 3:2', () => {
  assert.equal(photoAspect(undefined), DEFAULT_ASPECT);
  assert.equal(photoAspect({ width: null, height: 100 }), DEFAULT_ASPECT);
  assert.equal(photoAspect({ width: 0, height: 0 }), DEFAULT_ASPECT);
  assert.equal(photoAspect({ width: 300, height: 200 }), 1.5);
  assert.equal(photoAspect({ width: 200, height: 300 }), 2 / 3);
});

test('classifyAspect：四档边界', () => {
  assert.equal(classifyAspect(0.7), 'portrait');
  assert.equal(classifyAspect(0.86), 'square');
  assert.equal(classifyAspect(1.2), 'landscape');
  assert.equal(classifyAspect(1.8), 'wide');
});

test('coverVisibleFraction：可见比例永远 ≤ 1，且左右对称', () => {
  assert.equal(coverVisibleFraction(1.5, 1.5), 1);
  assert.equal(coverVisibleFraction(1.5, 0.75), 0.5);
  assert.equal(coverVisibleFraction(0.75, 1.5), 0.5);
  for (const source of [0.5, 0.75, 1, 1.5, 2.4]) {
    for (const slot of [0.37, 0.56, 0.77, 1.32]) {
      const visible = coverVisibleFraction(source, slot);
      assert.ok(visible > 0 && visible <= 1, `${source}/${slot} 可见比例越界：${visible}`);
    }
  }
});

test('figureFit：满幅页允许更大裁切，只有极端比例才留白', () => {
  // 3:2 横图放进 Letter 竖版：可见 0.77/1.5 ≈ 0.51 → cover。
  // 满幅页留白会露出底色，看起来像渲染失败，所以这里必须铺满。
  const wide = { width: 1500, height: 1000 };
  assert.equal(figureFit('hero', 0, wide).strategy, 'cover');

  // 3:1 全景：可见 0.26 < MIN_FULL_BLEED_VISIBLE → contain（裁了就只剩一条缝）
  const panorama = { width: 3000, height: 1000 };
  assert.equal(figureFit('hero', 0, panorama).strategy, 'contain');
  assert.ok(figureFit('hero', 0, panorama).visible < MIN_FULL_BLEED_VISIBLE);

  // 接近页面比例的竖图 → cover 满幅
  const nearPage = { width: 780, height: 1000 };
  assert.equal(figureFit('hero', 0, nearPage).strategy, 'cover');

  // 有图框的槽位阈值更严：0.56 的竖槽放竖图铺满，放横图就留白
  assert.equal(figureFit('three_collage', 1, { width: 700, height: 1000 }).strategy, 'cover');
  assert.equal(figureFit('three_collage', 1, { width: 1500, height: 1000 }).strategy, 'contain');
});

test('twoSpreadOrientation：只有两张都是竖图才并排', () => {
  const portrait = placeholderPhoto(1, 0.72, 'p');
  const square = placeholderPhoto(2, 1.0, 's');
  const landscape = placeholderPhoto(3, 1.5, 'l');
  assert.equal(twoSpreadOrientation([portrait, portrait]), 'portrait');
  // 方图在 0.39 的竖槽里只剩 39% 可见，必须改成上下分栏
  assert.equal(twoSpreadOrientation([square, square]), 'landscape');
  assert.equal(twoSpreadOrientation([landscape, landscape]), 'landscape');
  assert.equal(twoSpreadOrientation([portrait, landscape]), 'landscape');
});

test('stackedRowWeights / pageSlotAspects：上下分栏让两张图裁切比例相同', () => {
  const landscape = placeholderPhoto(1, 1.5, 'l');
  const portrait = placeholderPhoto(2, 0.7, 'p');
  const weights = stackedRowWeights([landscape, portrait]);
  assert.ok(weights[0]! < weights[1]!, '横图那一行应当更矮');

  const slots = pageSlotAspects({
    kind: 'two_spread',
    lead: 'landscape',
    photos: [landscape, portrait],
  });
  const visibleA = figureFit('two_spread', 0, landscape, 'landscape', slots[0]).visible;
  const visibleB = figureFit('two_spread', 1, portrait, 'landscape', slots[1]).visible;
  assert.ok(Math.abs(visibleA - visibleB) < 0.02, `两张图可见比例应接近：${visibleA} / ${visibleB}`);
  assert.ok(visibleA > MIN_VISIBLE_FRACTION);
});

test('planPlates：方向混合与极端比例不再挤进同一页', () => {
  const portrait = placeholderPhoto(1, 0.72, 'p');
  const landscape = placeholderPhoto(2, 1.5, 'l');
  const square = placeholderPhoto(3, 1.0, 's');

  // 三张同方向 → 一页
  assert.equal(planPlates([landscape, landscape, landscape]).length, 1);
  // 混合方向 → 拆成 1 + 2
  const mixed = planPlates([portrait, landscape, landscape]);
  assert.deepEqual(mixed.map((chunk) => chunk.length), [1, 2]);
  // 全景 → 单独成页
  const panorama = placeholderPhoto(4, 3.2, 'w');
  assert.deepEqual(planPlates([landscape, panorama, landscape, square]).map((c) => c.length), [1, 1, 2]);
});

test('figureSlotAspect：满幅页接近 Letter 比例，拼版槽位比满幅更窄', () => {
  const pageAspect = figureSlotAspect('cover');
  assert.ok(Math.abs(pageAspect - 215.9 / 279.4) < 1e-9);
  assert.equal(figureSlotAspect('hero'), pageAspect);
  assert.equal(figureSlotAspect('full_width'), pageAspect);
  assert.ok(figureSlotAspect('image_text') < pageAspect, '文图分栏的图片列比正页更窄');
  assert.ok(figureSlotAspect('two_spread') < pageAspect);
  // 左图通栏（占满内容高度）因此更窄；右侧两张是半高，反而更宽
  assert.ok(figureSlotAspect('three_collage', 0) < figureSlotAspect('three_collage', 1));
});

test('pickLead：首图决定竖 / 横，空数组回落到横构图', () => {
  assert.equal(pickLead([]), 'landscape');
  assert.equal(pickLead([{ id: 'a', url: '', width: 700, height: 1000 }]), 'portrait');
  assert.equal(pickLead([{ id: 'a', url: '', width: 1600, height: 1000 }]), 'landscape');
});

test('resolvePhotos：去重、跳过缺失、保持输入顺序', () => {
  const photos = new Map([
    ['a', { id: 'a', url: 'a' }],
    ['b', { id: 'b', url: 'b' }],
  ]);
  assert.deepEqual(
    resolvePhotos(['b', 'missing', 'a', 'b'], photos).map((photo) => photo.id),
    ['b', 'a'],
  );
});
