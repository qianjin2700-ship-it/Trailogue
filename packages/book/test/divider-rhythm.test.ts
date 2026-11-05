import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDocumentSource,
  DIVIDER_RULES,
  placeholderPhoto,
  planMagazine,
} from '../src/index.js';
import type { BlockPhoto, DocumentSource } from '../src/index.js';

/**
 * Chapter Divider 的「节奏」回归（Phase B1）。
 *
 * 规则本身在 chapterDivider.test.ts 里逐条验证；这里验证的是
 * **不同内容规模下节奏是否自然** —— 也就是把一组「章节数 × 照片数 × 文字量」
 * 的书都跑一遍，检查分隔页始终满足：
 *
 *  1. 不出现在第一章（R4）；
 *  2. 不超过上限 min(3, ⌊章数/2⌋, ⌊页数/8⌋)（R6）；
 *  3. 任意两个分隔页之间至少隔 3 个内容页（R7）；
 *  4. 短书（< 8 页）一个都不插（R2）；
 *  5. 分隔页占比不超过全书 1/8 —— 它是呼吸，不是骨架。
 *
 * 这组断言的价值在于：以后调整 DIVIDER_RULES 的阈值时，
 * 一旦某个体量的书开始「每章一页」，这里立刻会红。
 */

const SENTENCE = '潮水退到堤外之后，滩涂上开始出现细小的动静。';

function buildSource(options: {
  chapters: number;
  photosPerChapter: number;
  sentences: number;
}): DocumentSource {
  const { chapters, photosPerChapter, sentences } = options;
  const photos: BlockPhoto[] = [];
  const chapterSpecs = Array.from({ length: chapters }, (_, chapterIndex) => {
    const start = chapterIndex * photosPerChapter;
    for (let i = 0; i < photosPerChapter; i += 1) {
      const photo = placeholderPhoto(start + i, i % 2 ? 1.5 : 0.75, `p${start + i + 1}`);
      photos.push({ ...photo, id: `p-${start + i}` });
    }
    return {
      chapterId: `ch-${chapterIndex}`,
      title: `第 ${chapterIndex + 1} 章`,
      dateLabel: '10 月 3 日',
      locationLabel: '深圳湾',
      narrative: SENTENCE.repeat(sentences),
      photoIds: photos.slice(start, start + photosPerChapter).map((photo) => photo.id),
    };
  });

  return createDocumentSource({
    language: 'zh',
    title: '节奏测试',
    subtitle: '不同体量的书',
    startDate: '2026-10-03',
    endDate: '2026-10-05',
    photos,
    chapters: chapterSpecs,
  });
}

/** 参与扫描的规模组合：短途（2 章 4 图）到大画册（12 章 36 图） */
const CASES = [
  { chapters: 1, photosPerChapter: 4, sentences: 2, label: '单章 4 图' },
  { chapters: 2, photosPerChapter: 2, sentences: 1, label: '2 章 4 图（短途）' },
  { chapters: 2, photosPerChapter: 4, sentences: 3, label: '2 章 8 图' },
  { chapters: 3, photosPerChapter: 3, sentences: 2, label: '3 章 9 图' },
  { chapters: 4, photosPerChapter: 2, sentences: 2, label: '4 章 8 图' },
  { chapters: 4, photosPerChapter: 4, sentences: 4, label: '4 章 16 图' },
  { chapters: 6, photosPerChapter: 3, sentences: 3, label: '6 章 18 图' },
  { chapters: 8, photosPerChapter: 3, sentences: 3, label: '8 章 24 图' },
  { chapters: 12, photosPerChapter: 3, sentences: 2, label: '12 章 36 图' },
] as const;

for (const item of CASES) {
  test(`分隔页节奏 · ${item.label}`, () => {
    const plan = planMagazine(buildSource(item));
    const pages = plan.document.pages;
    const dividerIndexes = pages
      .map((page, index) => (page.kind === 'chapter_divider' ? index : -1))
      .filter((index) => index >= 0);

    // R2：短书不插
    if (plan.estimatedPageCount < DIVIDER_RULES.minPageCount) {
      assert.equal(dividerIndexes.length, 0, `${item.label} 页数不足却插了分隔页`);
    }

    // R6：上限
    const cap = Math.min(
      DIVIDER_RULES.maxDividersHardCap,
      Math.floor(item.chapters / 2),
      Math.floor(plan.estimatedPageCount / DIVIDER_RULES.minPageCount),
    );
    assert.ok(
      dividerIndexes.length <= Math.max(0, cap),
      `${item.label} 分隔页 ${dividerIndexes.length} 个，超过上限 ${cap}`,
    );

    // R4：第一章不插（第一章的分隔页若存在，必定排在第 3 页之后）
    dividerIndexes.forEach((index) => {
      assert.ok(index > 1, `${item.label} 第 ${index + 1} 页出现分隔页，位置太靠前`);
    });

    // R7：间距
    for (let i = 1; i < dividerIndexes.length; i += 1) {
      const gap = dividerIndexes[i]! - dividerIndexes[i - 1]! - 1;
      assert.ok(
        gap >= DIVIDER_RULES.minPagesBetween,
        `${item.label} 两个分隔页之间只隔 ${gap} 页`,
      );
    }

    // 占比：分隔页永远只是少数页
    assert.ok(
      dividerIndexes.length <= Math.max(1, Math.floor(pages.length / 8)),
      `${item.label} 分隔页占 ${dividerIndexes.length}/${pages.length}，超过 1/8`,
    );

    // 分隔页序号必须等于章节序号（不是页码）
    dividerIndexes.forEach((index) => {
      const page = pages[index]!;
      const chapterOrder = pages
        .filter((item) => item.chapterId)
        .map((item) => item.chapterId!)
        .filter((id, i, list) => list.indexOf(id) === i);
      const ordinal = chapterOrder.indexOf(page.chapterId!) + 1;
      assert.equal(page.ordinal, ordinal, `${item.label} 分隔页序号与章节序号不一致`);
    });
  });
}

test('页数随照片数单调增长（不会出现「照片更多但页更少」）', () => {
  const small = planMagazine(buildSource({ chapters: 4, photosPerChapter: 2, sentences: 2 }));
  const large = planMagazine(buildSource({ chapters: 4, photosPerChapter: 6, sentences: 2 }));
  assert.ok(
    large.document.pages.length > small.document.pages.length,
    `照片变多页数却没变：${small.document.pages.length} → ${large.document.pages.length}`,
  );
});

test('同一份输入重复规划，分隔页决策完全一致', () => {
  const source = buildSource({ chapters: 6, photosPerChapter: 3, sentences: 3 });
  const first = planMagazine(source).dividerPlan;
  const second = planMagazine(source).dividerPlan;
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
