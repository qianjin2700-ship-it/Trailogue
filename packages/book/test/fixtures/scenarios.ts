import { createDocumentSource, placeholderPhoto } from '../../src/index.js';
import type { BlockPhoto, DocumentSource } from '../../src/index.js';

/**
 * 确定性排版测试的场景矩阵（Phase B0）。
 *
 * 每个场景只描述「输入的形状」——照片数量、比例、文字长度、章节数，
 * 断言集中在 scenarios.test.ts 里统一执行，避免为每个场景手写期望值
 * （手写期望值会把测试变成「复述当前实现」，改版式就得改一堆断言）。
 *
 * 正文用真实标点构造，因为分页按句子边界切分，
 * 全是没有标点的长串会走到「按字符硬切」的分支，测不到主路径。
 */

const SENTENCE = '潮水退到堤外之后，滩涂上开始出现细小的动静。';
const SHORT = '清晨六点，风比想象中大。';
const TITLE_LONG =
  '深圳湾的候鸟与潮汐：一个关于等待、光线、鸟、潮水、滩涂、红树林、日落以及那些每年都会回来的旅行者的漫长清晨记录';

export interface Scenario {
  name: string;
  /** 该场景要验证的重点 */
  focus: string;
  source: DocumentSource;
}

function photoSeries(
  count: number,
  aspect: (index: number) => number,
  prefix = 'p',
): BlockPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    ...placeholderPhoto(index, aspect(index), `${prefix}${index + 1}`),
    id: `${prefix}-${index}`,
    caption: `照片 ${index + 1}`,
  }));
}

function textOf(seed: string, repeat: number): string {
  return Array.from({ length: repeat }, () => seed).join('');
}

interface ChapterSpec {
  photos: BlockPhoto[];
  narrative: string;
  title?: string;
  index: number;
}

function sourceFromChapters(
  chapters: ChapterSpec[],
  options: { title?: string; subtitle?: string | null; epilogue?: string | null; preface?: string | null; language?: string } = {},
): DocumentSource {
  const photos = chapters.flatMap((chapter) => chapter.photos);
  return createDocumentSource({
    language: options.language ?? 'zh',
    title: options.title ?? '测试旅行',
    subtitle: options.subtitle === undefined ? '副标题' : options.subtitle,
    preface: options.preface ?? null,
    epilogue: options.epilogue === undefined ? '回程的时候天已经暗了，相机里多了几百张照片。' : options.epilogue,
    startDate: '2026-10-03',
    endDate: '2026-10-05',
    coverPhotoId: photos[0]?.id ?? null,
    photos,
    chapters: chapters.map((chapter) => ({
      chapterId: `ch-${chapter.index}`,
      title: chapter.title ?? `第 ${chapter.index + 1} 章`,
      dateLabel: '10 月 3 日',
      locationLabel: '深圳湾',
      narrative: chapter.narrative,
      photoIds: chapter.photos.map((photo) => photo.id),
    })),
  });
}

/** 把 n 张照片大致平均分到 chapterCount 章 */
function splitChapters(photos: BlockPhoto[], chapterCount: number, narrative: string): ChapterSpec[] {
  const effective = Math.max(1, Math.min(chapterCount, photos.length || 1));
  const base = Math.floor(photos.length / effective);
  const extra = photos.length % effective;
  return Array.from({ length: effective }, (_, index) => {
    let offset = 0;
    for (let i = 0; i < index; i += 1) offset += base + (i < extra ? 1 : 0);
    const size = base + (index < extra ? 1 : 0);
    return {
      index,
      photos: photos.slice(offset, offset + size),
      narrative,
    };
  });
}

export const SCENARIOS: Scenario[] = [
  {
    name: '1 张照片',
    focus: '单图不产生空图组页；封面与尾页照片不重复堆叠',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(1, () => 1.5), narrative: textOf(SENTENCE, 1) }]),
  },
  {
    name: '2 张照片',
    focus: '双图页 / 并排块；不出现第三张占位',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(2, () => 1.5), narrative: textOf(SENTENCE, 1) }]),
  },
  {
    name: '3 张照片',
    focus: '三图拼版与图组块的边界',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(3, () => 1.2), narrative: textOf(SENTENCE, 2) }]),
  },
  {
    name: '4 张照片',
    focus: '余数为 1 的切分（1 + 3）不产生孤立尾图以外的空页',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(4, () => 1.5), narrative: textOf(SENTENCE, 2) }]),
  },
  {
    name: '8 张照片',
    focus: '多页图版的页序稳定性',
    source: sourceFromChapters(splitChapters(photoSeries(8, (i) => (i % 2 ? 1.5 : 0.8)), 2, textOf(SENTENCE, 2))),
  },
  {
    name: '12 张照片',
    focus: '中等规模画册的图版节奏',
    source: sourceFromChapters(splitChapters(photoSeries(12, (i) => (i % 3 === 0 ? 0.72 : 1.5)), 3, textOf(SENTENCE, 3))),
  },
  {
    name: '24 张照片（20+）',
    focus: '大画册不产生空白页、页数不失控、分隔页不滥插',
    source: sourceFromChapters(splitChapters(photoSeries(24, (i) => [0.72, 1.0, 1.5, 1.78][i % 4]!), 5, textOf(SENTENCE, 4))),
  },
  {
    name: '全竖图',
    focus: '竖构图走文图分栏，满幅页不出现过度裁切',
    source: sourceFromChapters(splitChapters(photoSeries(9, () => 0.7), 3, textOf(SENTENCE, 2))),
  },
  {
    name: '全横图',
    focus: '横构图满幅页改用 contain，避免裁掉主体',
    source: sourceFromChapters(splitChapters(photoSeries(9, () => 1.6), 3, textOf(SENTENCE, 2))),
  },
  {
    name: '横竖混合',
    focus: '同一页内不同比例的照片各自得到正确的填充策略',
    source: sourceFromChapters(splitChapters(photoSeries(12, (i) => [0.66, 1.0, 1.5, 2.0][i % 4]!), 4, textOf(SENTENCE, 2))),
  },
  {
    name: '极短文字',
    focus: '文字不足时不产生只有边框的空页',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(4, () => 1.5), narrative: SHORT }]),
  },
  {
    name: '极长正文',
    focus: '正文按句子分页，不裁字、不溢出',
    source: sourceFromChapters([
      { index: 0, photos: photoSeries(3, () => 1.5), narrative: textOf(SENTENCE, 90) },
    ], { epilogue: textOf(SENTENCE, 60) }),
  },
  {
    name: '超长标题',
    focus: '标题换行不破版（无溢出、不撑高页面）',
    source: sourceFromChapters(
      [{ index: 0, photos: photoSeries(4, () => 1.5), narrative: textOf(SENTENCE, 2), title: TITLE_LONG }],
      { title: TITLE_LONG, subtitle: TITLE_LONG },
    ),
  },
  {
    name: '缺 subtitle',
    focus: '缺字段时输出结构仍然完整，不出现空标签占位',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(4, () => 1.5), narrative: textOf(SENTENCE, 2) }], {
      subtitle: null,
    }),
  },
  {
    name: '多章节（8 章）',
    focus: '分隔页受上限约束，页序仍按章节顺序',
    source: sourceFromChapters(splitChapters(photoSeries(24, (i) => (i % 2 ? 1.5 : 0.75)), 8, textOf(SENTENCE, 3))),
  },
  {
    name: '单章节大画册',
    focus: '只有一章时不插分隔页',
    source: sourceFromChapters([{ index: 0, photos: photoSeries(16, (i) => (i % 2 ? 1.6 : 0.7)), narrative: textOf(SENTENCE, 6) }]),
  },
  {
    name: '无照片纯文字',
    focus: '文字-only 章节仍然成页，且没有空的图片槽位',
    source: sourceFromChapters([{ index: 0, photos: [], narrative: textOf(SENTENCE, 30) }]),
  },
  {
    name: '英文长文',
    focus: '拉丁文本换行估算保守，不因词宽低估而溢出',
    source: createDocumentSource({
      language: 'en',
      title: 'Two Days by the Bay',
      subtitle: 'A short walk, a long wait',
      epilogue: 'We drove home in the dark.',
      startDate: '2026-10-03',
      endDate: '2026-10-04',
      photos: photoSeries(6, (i) => (i % 2 ? 1.5 : 0.8), 'en'),
      chapters: [
        {
          chapterId: 'en-1',
          title: 'Before the tide turned',
          dateLabel: 'October 3',
          locationLabel: 'Shenzhen Bay',
          narrative:
            'The tide had not turned yet when we arrived. The water was flat and grey, and the bridge lights were still on. '.repeat(12),
          photoIds: ['en-0', 'en-1'],
        },
        {
          chapterId: 'en-2',
          title: 'Mudflats',
          narrative: 'The birds came in slowly, one species after another. '.repeat(10),
          photoIds: ['en-2', 'en-3', 'en-4', 'en-5'],
        },
      ],
    }),
  },
];
