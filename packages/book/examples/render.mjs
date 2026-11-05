#!/usr/bin/env node
/**
 * 最小可运行示例：一份内容 → Story 网页 + Magazine PDF HTML。
 *
 *   npm --prefix packages/book run build
 *   node packages/book/examples/render.mjs [输出目录]
 *
 * 默认写到系统临时目录，不污染仓库。示例刻意只依赖 public API，
 * 与 iOS / Railway 的调用方式完全一致 —— 如果这段能跑通，
 * 说明包在自己的消费路径上是通的。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = process.argv[2] ?? join(tmpdir(), 'trailogue-book-example');
const entry = resolve('packages/book/dist/index.js');
const book = await import(pathToFileURL(entry).href);

/* 1. 内容：一份两章的小旅行（真实场景里这段来自 1.0 DTO 或 AI 结果） */
const source = book.createDocumentSource({
  language: 'zh',
  title: '顺德的雨天',
  subtitle: '两天的吃与走',
  preface: '出发前查了天气，两天都是雨。到了之后发现雨里的园子更好看。',
  epilogue: '回程的车上睡了一路，醒来已经在市区。',
  startDate: '2026-09-20',
  endDate: '2026-09-21',
  photos: [
    book.placeholderPhoto(0, 0.75, '清晖园'),
    book.placeholderPhoto(1, 1.5, '石板路'),
    book.placeholderPhoto(2, 1.5, '双皮奶'),
    book.placeholderPhoto(3, 1.78, '骑楼'),
  ].map((photo, index) => ({ ...photo, id: `demo-${index}` })),
  chapters: [
    {
      chapterId: 'day-1',
      title: '到得比雨早',
      dateLabel: '9 月 20 日',
      locationLabel: '清晖园',
      narrative: '下车的时候雨刚停。园子里没什么人，石板路还是湿的，光从廊檐上漏下来。',
      photoIds: ['demo-0', 'demo-1'],
    },
    {
      chapterId: 'day-2',
      title: '一碗双皮奶',
      dateLabel: '9 月 21 日',
      locationLabel: '大良',
      narrative: '第二天只做了一件事：把昨天路过的那家店再走一遍。',
      photoIds: ['demo-2', 'demo-3'],
    },
  ],
});

/* 2. 编排：两种形态读同一份 source */
const story = book.buildStoryDocument(source);
const plan = book.planMagazine(source);

/* 3. 渲染：preview=true 给 WebView，false 给 PDF */
const storyHtml = book.renderStoryHtml(story, { preview: true });
const magazinePreview = book.renderMagazineHtml(plan.document, { preview: true });
const magazinePrint = book.renderMagazineHtml(plan.document, { preview: false });

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'story.html'), storyHtml, 'utf8');
await writeFile(join(outDir, 'magazine.html'), magazinePreview, 'utf8');
await writeFile(join(outDir, 'magazine.print.html'), magazinePrint, 'utf8');

console.log(`输出目录：${outDir}`);
console.log(`  story.html            ${story.blocks.length} 个内容块`);
console.log(`  magazine.html         ${plan.document.pages.length} 页（预览）`);
console.log(`  magazine.print.html   ${plan.document.pages.length} 页（PDF）`);
console.log(`  分隔页                ${plan.dividerPlan.chapterIds.length} 个`);
