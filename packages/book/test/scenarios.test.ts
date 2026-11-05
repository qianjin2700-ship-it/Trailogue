import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMagazineDocument,
  buildStoryDocument,
  planMagazine,
  renderMagazineHtml,
  renderStoryHtml,
} from '../src/index.js';
import { magazineViolations, storyViolations } from './invariants.js';
import { SCENARIOS } from './fixtures/scenarios.js';

/**
 * 场景矩阵回归（Phase B0 的核心交付）。
 *
 * 对每个场景执行四类断言：
 *   1. Magazine 不变量（空白页 / 孤立尾图 / 文字溢出 / 异常裁图 / 页序）
 *   2. Story 不变量（阅读顺序 / 空块 / 图组版式）
 *   3. 内容完整性（章节与照片不丢）
 *   4. 确定性（重复生成逐字节一致）
 */

for (const scenario of SCENARIOS) {
  test(`Magazine · ${scenario.name}｜${scenario.focus}`, () => {
    const plan = planMagazine(scenario.source);
    assert.deepEqual(magazineViolations(plan.document), [], `${scenario.name} 违反 Magazine 不变量`);
    assert.ok(plan.document.pages.length >= 2, '至少要有封面 + 尾页');

    // 章节不能凭空消失：有内容的章节必须至少贡献一页
    const usedChapters = new Set(
      plan.document.pages.map((page) => page.chapterId).filter((id): id is string => Boolean(id)),
    );
    scenario.source.chapters
      .filter((chapter) => chapter.title || chapter.narrative || chapter.photoIds.length)
      .forEach((chapter) => {
        assert.ok(usedChapters.has(chapter.chapterId), `章节 ${chapter.chapterId} 没有出现在画册里`);
      });

    // 分隔页不能超过 R6 上限
    const dividers = plan.document.pages.filter((page) => page.kind === 'chapter_divider');
    assert.ok(
      dividers.length <= plan.dividerPlan.maxDividers,
      `分隔页 ${dividers.length} 个，超过上限 ${plan.dividerPlan.maxDividers}`,
    );
    assert.ok(dividers.length <= 3, '分隔页硬上限 3 页');
  });

  test(`Story · ${scenario.name}｜${scenario.focus}`, () => {
    const document = buildStoryDocument(scenario.source);
    assert.deepEqual(storyViolations(document), [], `${scenario.name} 违反 Story 不变量`);

    // 阅读顺序稳定：章节在块序列中的出现顺序与输入一致
    const sectionTitles = document.blocks
      .filter((block) => block.type === 'section')
      .map((block) => (block.type === 'section' ? block.title : ''));
    const expectedTitles = scenario.source.chapters
      .filter((chapter) => chapter.title || chapter.narrative || chapter.photoIds.length)
      .map((chapter) => chapter.title);
    assert.deepEqual(sectionTitles, expectedTitles, 'Story 章节顺序与输入不一致');

    assert.equal(document.stats.photoCount, new Set(scenario.source.chapters.flatMap((chapter) => chapter.photoIds)).size);
  });

  test(`确定性 · ${scenario.name}｜重复生成逐字节一致`, () => {
    const firstPlan = planMagazine(scenario.source);
    const secondPlan = planMagazine(scenario.source);
    assert.equal(
      JSON.stringify(firstPlan.document),
      JSON.stringify(secondPlan.document),
      'Magazine 文档结构不稳定',
    );
    assert.equal(
      JSON.stringify(planMagazine(scenario.source).dividerPlan),
      JSON.stringify(planMagazine(scenario.source).dividerPlan),
      '分隔页决策不稳定',
    );

    assert.equal(
      renderMagazineHtml(firstPlan.document, { preview: true }),
      renderMagazineHtml(secondPlan.document, { preview: true }),
      'Magazine HTML 不稳定',
    );

    const story = buildStoryDocument(scenario.source);
    assert.equal(
      buildStoryDocument(scenario.source).blocks.map((block) => block.type).join('|'),
      story.blocks.map((block) => block.type).join('|'),
      'Story 块序列不稳定',
    );
    assert.equal(
      renderStoryHtml(buildStoryDocument(scenario.source)),
      renderStoryHtml(story),
      'Story HTML 不稳定',
    );
    assert.equal(
      JSON.stringify(buildMagazineDocument(scenario.source)),
      JSON.stringify(buildMagazineDocument(scenario.source)),
    );
  });

  test(`渲染 · ${scenario.name}｜打印与预览都可用`, () => {
    const document = planMagazine(scenario.source).document;
    const print = renderMagazineHtml(document);
    const preview = renderMagazineHtml(document, { preview: true });
    assert.ok(print.includes('@page{size:letter;margin:0}'), 'PDF 必须保持 Letter');
    assert.ok(!print.includes('0 8px 24px rgba(51,41,31,.18)'), '打印版不应带屏幕投影');
    assert.ok(preview.includes('0 8px 24px rgba(51,41,31,.18)'), '预览版需要投影以还原纸张感');
    assert.equal(
      (print.match(/<section class="page/g) ?? []).length,
      document.pages.length,
      '页数与渲染出的 section 数不一致',
    );
  });
}
