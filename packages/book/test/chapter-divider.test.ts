import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCompactMockSource,
  createDocumentSource,
  createMockSource,
  DIVIDER_RULES,
  placeholderPhoto,
  planChapterDividers,
  planMagazine,
  type DocumentSource,
} from '../src/index.js';

/**
 * Chapter Divider 规则（Phase B0 冻结）。
 *
 * 这些用例是「规则文档」的可执行版本：任何人想改阈值，
 * 都会先在这里看到它对真实输入的影响。
 */

function chapter(count: number, narrative: string, prefix: string) {
  return {
    photos: Array.from({ length: count }, (_, index) => ({
      ...placeholderPhoto(index, 1.5, `${prefix}-${index}`),
      id: `${prefix}-${index}`,
    })),
    narrative,
  };
}

function sourceWithChapters(chapters: { photos: { id: string }[]; narrative: string }[]): DocumentSource {
  const photos = chapters.flatMap((item) => item.photos);
  return createDocumentSource({
    language: 'zh',
    title: '分隔页规则测试',
    photos: photos as never,
    coverPhotoId: photos[0]?.id ?? null,
    chapters: chapters.map((item, index) => ({
      chapterId: `c-${index}`,
      title: `第 ${index + 1} 章`,
      narrative: item.narrative,
      photoIds: item.photos.map((photo) => photo.id),
    })),
  });
}

const LONG = '潮水退到堤外之后，滩涂上开始出现细小的动静。'.repeat(6);

test('R1：单章节永不插分隔页', () => {
  const plan = planMagazine(
    sourceWithChapters([chapter(10, LONG, 'a')]),
  ).dividerPlan;
  assert.equal(plan.chapterIds.length, 0);
  assert.equal(plan.enabled, false);
  assert.ok(plan.skipped.every((item) => item.reason === 'single-chapter'));
});

test('R2：短旅行（预计页数 < 8）保持紧凑，不插分隔页', () => {
  const plan = planMagazine(createCompactMockSource()).dividerPlan;
  assert.equal(plan.chapterIds.length, 0);
  assert.equal(plan.enabled, false);
  assert.ok(plan.estimatedPageCount < DIVIDER_RULES.minPageCount);
  assert.ok(plan.skipped.every((item) => item.reason === 'short-book'));
});

test('R4 + R5：只有分量足够的非首章才拿到分隔页', () => {
  const plan = planMagazine(createMockSource()).dividerPlan;
  assert.deepEqual(plan.chapterIds, ['chapter-flats']);
  const reasons = Object.fromEntries(plan.skipped.map((item) => [item.chapterId, item.reason]));
  assert.equal(reasons['chapter-tide'], 'first-chapter');
  assert.equal(reasons['chapter-mangrove'], 'below-weight');
  assert.equal(reasons['chapter-sunset'], 'below-weight');
});

test('R6：8 章 24 张的大画册，分隔页仍被压在 3 页以内', () => {
  const source = sourceWithChapters(
    Array.from({ length: 8 }, (_, index) => chapter(3, LONG, `m${index}`)),
  );
  const plan = planMagazine(source).dividerPlan;
  assert.ok(plan.maxDividers <= DIVIDER_RULES.maxDividersHardCap);
  assert.ok(plan.chapterIds.length <= DIVIDER_RULES.maxDividersHardCap);
  // 章节数 8 → floor(8/2) = 4，但硬上限 3，页数上限再收敛
  assert.ok(plan.chapterIds.length <= Math.floor(8 / 2));
});

test('R7：两个分隔页太近时只保留一个（间距约束优先于数量上限）', () => {
  // 6 章 × 6 张：页数够多，但重章节连续 → 间距规则会砍掉相邻的那个
  const source = sourceWithChapters(
    Array.from({ length: 6 }, (_, index) => chapter(6, LONG, `s${index}`)),
  );
  const plan = planMagazine(source).dividerPlan;
  assert.ok(plan.maxDividers >= 1);
  assert.equal(plan.chapterIds.length, 1, '相邻章节不应同时插分隔页');
  assert.ok(plan.skipped.some((item) => item.reason === 'too-close' || item.reason === 'over-cap'));
});

test('显式覆盖：chapterDividers: true 强制每章一页，false 全部关闭', () => {
  const source = createMockSource();
  const forced = planMagazine(source, { chapterDividers: true }).dividerPlan;
  assert.equal(forced.chapterIds.length, source.chapters.length);

  const disabled = planMagazine(source, { chapterDividers: false }).dividerPlan;
  assert.equal(disabled.chapterIds.length, 0);
  assert.equal(disabled.enabled, false);
});

test('纯函数：planChapterDividers 不依赖编排器也能独立判断', () => {
  const plan = planChapterDividers({
    estimatedPageCount: 20,
    totalPhotoCount: 30,
    chapters: [
      { chapterId: 'a', index: 0, photoCount: 8, textLength: 800, pageCount: 4, hasContent: true },
      { chapterId: 'b', index: 1, photoCount: 8, textLength: 800, pageCount: 4, hasContent: true },
      { chapterId: 'c', index: 2, photoCount: 1, textLength: 40, pageCount: 1, hasContent: true },
    ],
  });
  assert.deepEqual(plan.chapterIds, ['b']);
  assert.equal(plan.maxDividers, 1);
});

test('空章节不参与分隔页判定', () => {
  const plan = planChapterDividers({
    estimatedPageCount: 20,
    totalPhotoCount: 30,
    chapters: [
      { chapterId: 'a', index: 0, photoCount: 8, textLength: 800, pageCount: 4, hasContent: true },
      { chapterId: 'empty', index: 1, photoCount: 0, textLength: 0, pageCount: 0, hasContent: false },
      { chapterId: 'c', index: 2, photoCount: 8, textLength: 800, pageCount: 4, hasContent: true },
    ],
  });
  assert.ok(!plan.chapterIds.includes('empty'));
  assert.ok(plan.skipped.some((item) => item.chapterId === 'empty' && item.reason === 'empty-chapter'));
});

test('规则常量被冻结：阈值变更需要同时改文档与测试', () => {
  assert.deepEqual(DIVIDER_RULES, {
    minPageCount: 8,
    minPhotoCount: 6,
    weightPhotoCount: 4,
    weightTextLength: 700,
    maxDividersHardCap: 3,
    minPagesBetween: 3,
  });
});
