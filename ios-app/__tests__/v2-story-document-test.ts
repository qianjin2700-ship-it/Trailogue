import { buildStoryDocument, createDocumentSource, createMockSource } from '@/features/v2';
import type { StoryFigureBlock } from '@/features/v2';

function figures(document: ReturnType<typeof buildStoryDocument>): StoryFigureBlock[] {
  return document.blocks.filter((block): block is StoryFigureBlock => block.type === 'figure');
}

describe('Story 2.0 document builder', () => {
  const source = createMockSource();
  const document = buildStoryDocument(source);

  it('以标题块开头，并带上旅行日期', () => {
    expect(document.blocks[0]).toMatchObject({ type: 'header', title: '深圳湾的候鸟与潮汐' });
    expect(document.blocks[0]).toHaveProperty('eyebrow', '2026年10月3日 – 2026年10月5日');
  });

  it('序言渲染为段落块', () => {
    expect(document.blocks[1]).toMatchObject({ type: 'paragraph' });
  });

  it('每一章生成一个 section 块，顺序与输入一致', () => {
    const sections = document.blocks.filter((block) => block.type === 'section');
    expect(sections.map((block) => (block.type === 'section' ? block.title : ''))).toEqual([
      '潮水退去之前',
      '滩涂上的第一次相遇',
      '午后的红树林',
      '日落时的归途',
    ]);
  });

  it('全部照片都被排进图文块，没有丢图', () => {
    const total = figures(document).reduce((sum, block) => sum + block.photos.length, 0);
    expect(total).toBe(9);
    expect(document.stats).toMatchObject({ chapterCount: 4, photoCount: 9 });
    expect(document.stats.textLength).toBeGreaterThan(100);
  });

  it('2 张照片切成并排，4 张照片切成「1 大图 + 3 图组」', () => {
    const layouts = figures(document).map((block) => `${block.layout}:${block.photos.length}`);
    expect(layouts).toEqual(['pair:2', 'large:1', 'gallery:3', 'large:1', 'pair:2']);
  });

  it('尾声渲染为 closing 块', () => {
    expect(document.blocks.at(-1)).toMatchObject({ type: 'closing' });
  });

  it('照片被删除后，故事仍然可读（只丢弃失联照片）', () => {
    const withGhost = createDocumentSource({
      language: 'en',
      title: 'Ghost photo',
      chapters: [
        {
          chapterId: 'c1',
          title: 'Only one real photo',
          narrative: 'Text stays.',
          photoIds: ['mock-photo-0', 'deleted-photo-id'],
        },
      ],
      photos: createMockSource().photos,
    });
    const ghostDocument = buildStoryDocument(withGhost);
    const total = figures(ghostDocument).reduce((sum, block) => sum + block.photos.length, 0);
    expect(total).toBe(1);
    expect(ghostDocument.blocks.some((block) => block.type === 'closing')).toBe(false);
  });

  it('提供高光引语时插入 quote 块', () => {
    const withQuote = buildStoryDocument(source, {
      highlights: [{ chapterIndex: 1, text: '有一只走到离我不到十米的地方。' }],
    });
    const quoteIndex = withQuote.blocks.findIndex((block) => block.type === 'quote');
    const sectionIndex = withQuote.blocks.findIndex(
      (block) => block.type === 'section' && block.title === '滩涂上的第一次相遇',
    );
    expect(quoteIndex).toBeGreaterThan(sectionIndex);
  });

  it('是确定性的：同样输入两次构建结果完全一致', () => {
    expect(buildStoryDocument(createMockSource())).toEqual(document);
  });
});
