import {
  buildMagazineDocument,
  buildStoryDocument,
  createMockSource,
  createDocumentSource,
  renderMagazineHtml,
  renderStoryHtml,
} from '@/features/v2';

const source = createMockSource();

describe('Story 2.0 renderer', () => {
  const html = renderStoryHtml(buildStoryDocument(source));

  it('输出单栏阅读版式：700px 行长 / 16.5px 正文', () => {
    expect(html).toContain('max-width:700px');
    expect(html).toContain('font-size:16.5px');
  });

  it('章节以分隔线切分，不是一整块文字', () => {
    expect((html.match(/<section class="chapter">/g) ?? []).length).toBe(4);
  });

  it('并排图与图组使用固定栅格，不做自由浮动', () => {
    expect(html).toContain('class="figure-pair"');
    expect(html).toContain('class="figure-gallery"');
    expect(html).not.toContain('float:left');
  });

  it('预览模式注入与 1.0 一致的 postMessage 协议，打印模式不带脚本', () => {
    const preview = renderStoryHtml(buildStoryDocument(source), { preview: true });
    expect(preview).toContain('preview-ready');
    expect(preview).toContain('photo-error');
    expect(html).not.toContain('preview-ready');
  });

  it('用户内容一律转义，标题里的标签不会被执行', () => {
    const evil = createDocumentSource({
      language: 'en',
      title: '<script>alert(1)</script>',
      preface: '5 < 6 && "quoted"',
      chapters: [{ chapterId: 'c1', title: 'Bold <b>x</b>', narrative: 'ok', photoIds: [] }],
      photos: [],
    });
    const evilHtml = renderStoryHtml(buildStoryDocument(evil));
    expect(evilHtml).not.toContain('<script>alert(1)</script>');
    expect(evilHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(evilHtml).toContain('5 &lt; 6 &amp;&amp; &quot;quoted&quot;');
  });

  it('非 http/data/file 的图片地址不会进入 img src', () => {
    const bad = createDocumentSource({
      language: 'en',
      title: 'Bad url',
      chapters: [{ chapterId: 'c1', title: 'x', narrative: 'y', photoIds: ['bad-1'] }],
      photos: [{ id: 'bad-1', url: 'javascript:alert(1)', width: 100, height: 100 }],
    });
    const badHtml = renderStoryHtml(buildStoryDocument(bad));
    expect(badHtml).not.toContain('javascript:alert(1)');
    expect(badHtml).toContain('photo-missing');
  });
});

describe('Magazine 2.0 renderer', () => {
  const document = buildMagazineDocument(source);
  const html = renderMagazineHtml(document);

  it('使用 Letter 页面尺寸，与 1.0 已导出的 PDF 一致', () => {
    expect(html).toContain('@page{size:letter;margin:0}');
    expect(html).toContain('215.9mm');
    expect(html).toContain('279.4mm');
  });

  it('每一页都渲染成一个独立的打印页', () => {
    expect((html.match(/<section class="page/g) ?? []).length).toBe(document.pages.length);
  });

  it('封面是深色整版，带书名与日期', () => {
    expect(html).toContain('class="page cover');
    expect(html).toContain('深圳湾的候鸟与潮汐');
    expect(html).toContain('2026年10月3日 – 2026年10月5日');
  });

  it('正文不会溢出页面：文字块限制行数', () => {
    expect(html).toContain('-webkit-line-clamp');
  });

  it('预览模式带视口缩放与投影，打印模式不带', () => {
    const preview = renderMagazineHtml(document, { preview: true });
    expect(preview).toContain('width=860');
    expect(preview).toContain('box-shadow');
    expect(html).toContain('width=device-width');
    expect(html).not.toContain('box-shadow:0 8px 24px');
  });
});

/**
 * 预览导出的输入保证：两种形态都能在同一份 mock 数据上渲染出完整文档。
 * 实际写文件由 `scripts/render-v2-previews.mjs` 完成（避免测试依赖 Node 类型）。
 */
describe('V2 预览可渲染', () => {
  it('Story 与 Magazine 的预览输出都是完整 HTML 文档', () => {
    const storyHtml = renderStoryHtml(buildStoryDocument(source), { preview: true });
    const magazineHtml = renderMagazineHtml(buildMagazineDocument(source), { preview: true });
    expect(storyHtml.startsWith('<!doctype html>')).toBe(true);
    expect(magazineHtml.startsWith('<!doctype html>')).toBe(true);
    expect(storyHtml.length).toBeGreaterThan(1000);
    expect(magazineHtml.length).toBeGreaterThan(1000);
  });
});
