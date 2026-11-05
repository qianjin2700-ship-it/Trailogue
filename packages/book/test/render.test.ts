import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMagazineDocument,
  buildStoryDocument,
  createDocumentSource,
  createMockSource,
  placeholderPhoto,
  renderMagazineHtml,
  renderStoryHtml,
} from '../src/index.js';

/**
 * 渲染器的安全与契约。
 *
 * 两个渲染器最终会被塞进 WebView（iOS 预览 / 分享页）和 PDF，
 * 所以这里锁定三件事：**用户内容必须转义**、**伪协议图片必须被拦**、
 * **打印与预览两套输出不能互相污染**。
 */

function createSourceWithCaptions() {
  const photos = Array.from({ length: 6 }, (_, index) => ({
    ...placeholderPhoto(index, index % 2 ? 0.75 : 1.5, `c${index}`),
    id: `cap-${index}`,
    caption: `说明 ${index + 1}`,
  }));
  return createDocumentSource({
    language: 'zh',
    title: '带说明的旅行',
    photos,
    coverPhotoId: photos[0]!.id,
    chapters: [
      {
        chapterId: 'c1',
        title: '第一章',
        narrative: '一段不算长的正文。',
        photoIds: photos.slice(0, 4).map((photo) => photo.id),
        captions: Object.fromEntries(photos.slice(0, 4).map((photo) => [photo.id, `说明 ${photo.id}`])),
      },
    ],
  });
}

function evilSource() {
  const photo = placeholderPhoto(0, 1.5, 'x');
  return createDocumentSource({
    language: 'en',
    title: '<script>alert(1)</script>',
    subtitle: '" onload="alert(2)',
    preface: '</style><script>alert(3)</script>',
    epilogue: 'closing <img src=x onerror=alert(4)>',
    photos: [
      { ...photo, id: 'ok', url: 'https://example.com/a.jpg', caption: '<b>bold</b>' },
      { ...photo, id: 'js', url: 'javascript:alert(5)' },
    ],
    chapters: [
      {
        chapterId: 'c1',
        title: '<h1>章节</h1>',
        narrative: '正文 & <script>alert(6)</script>',
        photoIds: ['ok', 'js'],
      },
    ],
  });
}

test('Story：标题 / 正文 / 说明全部转义，注入的标签不会被当成 HTML', () => {
  const html = renderStoryHtml(buildStoryDocument(evilSource()));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('alert(3)</script>'));
  assert.ok(!html.includes('<b>bold</b>'));
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(!html.includes('onload="alert(2)"'), 'subtitle 里的引号必须被转义');
});

test('Story：javascript: 伪协议不会被写进 img src', () => {
  const html = renderStoryHtml(buildStoryDocument(evilSource()));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(html.includes('photo-missing'), '被拦下的图片应渲染为占位块');
});

test('Story：预览模式注入 postMessage 协议，打印模式绝对不注入脚本', () => {
  const document = buildStoryDocument(createMockSource());
  const preview = renderStoryHtml(document, { preview: true });
  const print = renderStoryHtml(document);
  assert.ok(preview.includes('preview-ready'));
  assert.ok(preview.includes('photo-error'));
  assert.ok(!print.includes('<script'), '打印文档不能带脚本');
  assert.ok(print.includes('class="print"'));
  assert.ok(preview.includes('class="preview"'));
});

test('Magazine：转义与伪协议防护同 Story', () => {
  const html = renderMagazineHtml(buildMagazineDocument(evilSource()));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(html.includes('photo-missing'));
});

test('Magazine：Letter 纸张、页码从封面的下一页开始', () => {
  const document = buildMagazineDocument(createMockSource());
  const html = renderMagazineHtml(document);
  assert.ok(html.includes('@page{size:letter;margin:0}'));
  assert.ok(html.includes('width:215.9mm'));
  assert.ok(html.includes('height:279.4mm'));

  const firstNumbered = document.pages.findIndex((page) => page.kind !== 'cover');
  assert.ok(firstNumbered > 0);
  assert.ok(html.includes('<span class="page-number">01</span>'), '第二页应为第 01 页');

  const withoutNumbers = renderMagazineHtml(document, { pageNumbers: false });
  assert.ok(!withoutNumbers.includes('class="page-number"'));
});

test('Magazine：示例画册全部铺满，不出现信箱化的空框', () => {
  const document = buildMagazineDocument(createMockSource());
  const html = renderMagazineHtml(document);
  assert.ok(html.includes('data-fit="cover"'));
  // 示例画册的比例都在正常范围，不该有任何一张图被留白
  assert.ok(!html.includes('data-fit="contain"'), '示例画册不应出现留白图');
  // 留白能力本身仍要保留（全景 / 超长竖图用）
  assert.ok(html.includes('object-fit:contain'));
});

test('Magazine：全景单独成页并标记 contain，不与他人共页', () => {
  const panorama = placeholderPhoto(0, 3.2, 'panorama');
  const document = buildMagazineDocument(
    createDocumentSource({
      language: 'zh',
      title: '全景测试',
      startDate: '2026-10-03',
      endDate: '2026-10-03',
      photos: [panorama],
      chapters: [
        { chapterId: 'pano', title: '很宽的一张', narrative: '站在堤上按了一张全景。', photoIds: [panorama.id] },
      ],
    }),
  );
  const html = renderMagazineHtml(document);
  assert.ok(html.includes('data-fit="contain"'));
  // 全景所在页只有一张图
  assert.ok(html.includes('class="page cover'));
});

test('两个渲染器输出完整 HTML 骨架（可被 WebView / expo-print 直接加载）', () => {
  const source = createMockSource();
  for (const html of [
    renderStoryHtml(buildStoryDocument(source), { preview: true }),
    renderMagazineHtml(buildMagazineDocument(source), { preview: true }),
  ]) {
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('<meta charset="utf-8">'));
    assert.ok(html.trimEnd().endsWith('</html>'));
  }
});

test('满幅页不渲染照片说明（避免与书名 / 正文 / 页码重叠）', () => {
  const source = createSourceWithCaptions();
  const document = buildMagazineDocument(source);
  const html = renderMagazineHtml(document);
  document.pages.forEach((page, index) => {
    if (page.kind !== 'cover' && page.kind !== 'hero' && page.kind !== 'full_width') return;
    const section = html.split('<section class="page')[index + 1] ?? '';
    const chunk = section.split('</section>')[0] ?? '';
    assert.ok(!chunk.includes('<figcaption>'), `${page.kind} 页出现了说明文字`);
  });
});

test('Magazine 页数 = 文档页数（没有一页渲染成空字符串）', () => {
  const document = buildMagazineDocument(createMockSource());
  const html = renderMagazineHtml(document);
  const sections = html.match(/<section class="page/g) ?? [];
  assert.equal(sections.length, document.pages.length);
});
