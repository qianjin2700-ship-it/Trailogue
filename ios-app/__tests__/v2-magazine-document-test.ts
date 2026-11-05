import {
  buildMagazineDocument,
  createDocumentSource,
  createMockSource,
  plateKind,
  splitPhotoRun,
} from '@/features/v2';

describe('Magazine 2.0 page composer', () => {
  const source = createMockSource();
  const document = buildMagazineDocument(source);

  it('第一页永远是封面，且带照片与标题', () => {
    expect(document.pages[0]).toMatchObject({ kind: 'cover', title: '深圳湾的候鸟与潮汐' });
    expect(document.pages[0]?.photos).toHaveLength(1);
  });

  it('第二页是行程信息页', () => {
    expect(document.pages[1]?.kind).toBe('trip_info');
    expect(document.trip).toMatchObject({
      locationLabel: '深圳湾公园',
      photoCount: 9,
      chapterCount: 4,
    });
  });

  it('每一章都有独立的分隔页', () => {
    const dividers = document.pages.filter((page) => page.kind === 'chapter_divider');
    expect(dividers).toHaveLength(4);
    expect(dividers.map((page) => page.title)).toEqual([
      '潮水退去之前',
      '滩涂上的第一次相遇',
      '午后的红树林',
      '日落时的归途',
    ]);
  });

  it('横构图主图用满幅 hero，剩余照片切成整版/拼版', () => {
    const kinds = document.pages.map((page) => page.kind);
    expect(kinds).toEqual([
      'cover',
      'trip_info',
      'chapter_divider',
      'hero',
      'full_width',
      'chapter_divider',
      'hero',
      'three_collage',
      'chapter_divider',
      'hero',
      'chapter_divider',
      'hero',
      'full_width',
      'closing',
    ]);
  });

  it('竖构图主图改用文图分栏，不强行满幅裁切', () => {
    const portraitSource = createDocumentSource({
      language: 'en',
      title: 'Portrait trip',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      chapters: [
        {
          chapterId: 'c1',
          title: 'Tall frame',
          narrative: 'A portrait photo leads this chapter.',
          photoIds: ['portrait-1'],
        },
      ],
      photos: [
        { id: 'portrait-1', url: 'https://example.com/portrait.jpg', width: 900, height: 1600 },
      ],
    });
    const portraitDocument = buildMagazineDocument(portraitSource);
    const lead = portraitDocument.pages.find((page) => page.chapterId === 'c1' && page.kind !== 'chapter_divider');
    expect(lead).toMatchObject({ kind: 'image_text', lead: 'portrait' });
  });

  it('没有照片的章节仍然保留文字页，内容不会凭空消失', () => {
    const textOnly = createDocumentSource({
      language: 'en',
      title: 'Text only',
      chapters: [
        { chapterId: 'c1', title: 'Words', narrative: 'Only words here.', photoIds: [] },
      ],
      photos: [],
    });
    const pages = buildMagazineDocument(textOnly).pages;
    expect(pages.some((page) => page.kind === 'image_text' && page.body === 'Only words here.')).toBe(
      true,
    );
  });

  it('提供引语候选时插入 quote 页', () => {
    const withQuote = buildMagazineDocument(source, {
      quotes: [{ chapterIndex: 1, text: '它停下来看了我一眼。', attribution: '深圳湾' }],
    });
    expect(withQuote.pages.some((page) => page.kind === 'quote')).toBe(true);
  });

  it('关闭章节分隔页/行程页的开关有效', () => {
    const bare = buildMagazineDocument(source, { chapterDividers: false, tripInfo: false });
    expect(bare.pages.some((page) => page.kind === 'chapter_divider')).toBe(false);
    expect(bare.pages.some((page) => page.kind === 'trip_info')).toBe(false);
  });

  it('尾页收束全篇，最多带 2 张照片', () => {
    const closing = document.pages.at(-1);
    expect(closing?.kind).toBe('closing');
    expect(closing?.photos.length).toBeLessThanOrEqual(2);
    expect(closing?.body).toContain('回程时天已经暗了');
  });

  it('是确定性的：同样输入两次构建结果完全一致', () => {
    expect(buildMagazineDocument(createMockSource())).toEqual(document);
  });

  it('照片切块规则不会留下孤立单图', () => {
    expect(splitPhotoRun(4)).toEqual([1, 3]);
    expect(splitPhotoRun(7)).toEqual([1, 3, 3]);
    expect(splitPhotoRun(8)).toEqual([3, 3, 2]);
    expect(plateKind(1)).toBe('full_width');
    expect(plateKind(2)).toBe('two_spread');
    expect(plateKind(3)).toBe('three_collage');
  });
});
