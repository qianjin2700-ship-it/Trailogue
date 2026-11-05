/**
 * 生成 Story 2.0 / Magazine 2.0 的静态预览（docs/v2/previews/*.html）。
 *
 * 预览必须由**同一份渲染器**产出，否则预览就不能代表真实效果 ——
 * 而渲染器现在住在 `packages/book`（@trailogue/book），
 * iOS 预览、expo-print PDF、服务端分享页读的都是它。
 *
 * 用法：
 *   npm --prefix packages/book run build
 *   node scripts/render-v2-previews.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'docs/v2/previews');
const entry = resolve(root, 'packages/book/dist/index.js');

if (!existsSync(entry)) {
  console.error(`未找到编译产物：${entry}`);
  console.error('请先运行：npm --prefix packages/book run build');
  process.exit(1);
}

const book = await import(pathToFileURL(entry).href);

const outputs = [];

function render(name, source) {
  const plan = book.planMagazine(source);
  const story = book.renderStoryHtml(book.buildStoryDocument(source), { preview: true });
  const magazine = book.renderMagazineHtml(plan.document, { preview: true });
  outputs.push({ name, story, magazine, plan });
}

render('story', book.createMockSource());
render('magazine', book.createMockSource());
render('magazine-compact', book.createCompactMockSource());

mkdirSync(target, { recursive: true });
for (const output of outputs) {
  const html = output.name === 'story' ? output.story : output.magazine;
  const file = resolve(target, `${output.name}-preview.html`);
  writeFileSync(file, html, 'utf8');
  const pages = output.plan.document.pages.length;
  const dividers = output.plan.dividerPlan.chapterIds.length;
  console.log(
    `${output.name}-preview.html  ${String(html.length).padStart(7)} bytes  ` +
      `页数 ${String(pages).padStart(2)}  分隔页 ${dividers}`,
  );
}
console.log(`→ ${target}`);
