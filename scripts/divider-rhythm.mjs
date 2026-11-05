#!/usr/bin/env node
/**
 * 打印 Chapter Divider 的节奏表（供文档引用）。
 *
 *   node scripts/divider-rhythm.mjs
 *
 * 输出的表格直接贴进 docs/v2/CHAPTER_DIVIDER.md 即可 —— 文档里的数字
 * 不应该手写，否则改了阈值之后文档和代码会各说各话。
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const entry = resolve('packages/book/dist/index.js');
const book = await import(pathToFileURL(entry).href);

const SENTENCE = '潮水退到堤外之后，滩涂上开始出现细小的动静。';

function buildSource({ chapters, photosPerChapter, sentences }) {
  const photos = [];
  const chapterSpecs = Array.from({ length: chapters }, (_, chapterIndex) => {
    const start = chapterIndex * photosPerChapter;
    for (let i = 0; i < photosPerChapter; i += 1) {
      const photo = book.placeholderPhoto(start + i, i % 2 ? 1.5 : 0.75, `p${start + i + 1}`);
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
  return book.createDocumentSource({
    language: 'zh',
    title: '节奏测试',
    subtitle: '不同体量的书',
    startDate: '2026-10-03',
    endDate: '2026-10-05',
    photos,
    chapters: chapterSpecs,
  });
}

const cases = [
  [1, 4, 2, '单章 4 图'],
  [2, 2, 1, '2 章 4 图'],
  [2, 4, 3, '2 章 8 图'],
  [3, 3, 2, '3 章 9 图'],
  [4, 2, 2, '4 章 8 图'],
  [4, 4, 4, '4 章 16 图'],
  [6, 3, 3, '6 章 18 图'],
  [8, 3, 3, '8 章 24 图'],
  [12, 3, 2, '12 章 36 图'],
];

const rows = cases.map(([chapters, photosPerChapter, sentences, label]) => {
  const plan = book.planMagazine(buildSource({ chapters, photosPerChapter, sentences }));
  const dividers = plan.document.pages.filter((page) => page.kind === 'chapter_divider');
  return {
    label,
    chapters,
    photos: chapters * photosPerChapter,
    pages: plan.document.pages.length,
    dividers: dividers.length,
    which: dividers.map((page) => page.ordinal).join('、') || '—',
    max: plan.dividerPlan.maxDividers,
  };
});

console.log('| 规模 | 章 | 图 | 页 | 分隔页 | 出现在第几章 | R6 上限 |');
console.log('|---|---|---|---|---|---|---|');
for (const row of rows) {
  console.log(
    `| ${row.label} | ${row.chapters} | ${row.photos} | ${row.pages} | ${row.dividers} | ${row.which} | ${row.max} |`,
  );
}
