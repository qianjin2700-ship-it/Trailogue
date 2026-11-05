import { createDocumentSource, type DocumentSource } from './source.js';
import type { BlockPhoto } from './types.js';

/**
 * 2.0 组件系统的演示数据。
 *
 * 照片全部是内联 SVG（data URI），不依赖网络 —— 这样生成的预览 HTML
 * 可以直接双击打开、也能离线在 WebView 里渲染，便于评审版式本身。
 */

const TONES: [string, string][] = [
  ['#2f4858', '#86b3c4'],
  ['#6b4f3a', '#d9a679'],
  ['#2d4a3e', '#8fbf9f'],
  ['#4a3b5c', '#b39ddb'],
  ['#3a3f2f', '#c2c98a'],
  ['#5c3b3b', '#d99a9a'],
  ['#22394d', '#7fb2d6'],
  ['#4b4033', '#cbb08a'],
  ['#33424a', '#9db9c0'],
];

/** 生成一张内联 SVG 占位照片，比例由 aspect（宽/高）决定 */
export function placeholderPhoto(
  index: number,
  aspect: number,
  label: string,
  width = 1400,
): BlockPhoto {
  const height = Math.round(width / aspect);
  const [from, to] = TONES[index % TONES.length]!;
  const radius = Math.round(Math.min(width, height) * 0.1);
  const fontSize = Math.round(Math.min(width, height) * 0.055);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${Math.round(width * 0.74)}" cy="${Math.round(height * 0.26)}" r="${radius}" fill="rgba(255,255,255,0.32)"/><path d="M0 ${Math.round(height * 0.74)} L${Math.round(width * 0.28)} ${Math.round(height * 0.56)} L${Math.round(width * 0.54)} ${Math.round(height * 0.76)} L${Math.round(width * 0.76)} ${Math.round(height * 0.62)} L${width} ${Math.round(height * 0.82)} L${width} ${height} L0 ${height} Z" fill="rgba(0,0,0,0.16)"/><text x="${Math.round(width / 2)}" y="${Math.round(height / 2)}" font-family="Helvetica,Arial,sans-serif" font-size="${fontSize}" fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text></svg>`;
  return {
    id: `mock-photo-${index}`,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    caption: label,
  };
}

const SPECS: { aspect: number; label: string; caption: string }[] = [
  { aspect: 1.5, label: 'Photo 1', caption: '清晨六点，潮水刚退到堤外' },
  { aspect: 0.75, label: 'Photo 2', caption: '反嘴鹬群落在滩涂上' },
  { aspect: 1.78, label: 'Photo 3', caption: '一整片被潮水留下的水面' },
  { aspect: 1.5, label: 'Photo 4', caption: '举着长焦的人在堤上排成一列' },
  { aspect: 0.8, label: 'Photo 5', caption: '红树林边缘的白鹭' },
  { aspect: 1.0, label: 'Photo 6', caption: '午后的光落在树根上' },
  { aspect: 1.6, label: 'Photo 7', caption: '退潮后露出的牡蛎礁' },
  { aspect: 1.5, label: 'Photo 8', caption: '夕阳把滩涂染成金色' },
  { aspect: 0.72, label: 'Photo 9', caption: '最后一班候鸟掠过天空' },
];

export function createMockPhotos(): BlockPhoto[] {
  return SPECS.map((spec, index) => ({
    ...placeholderPhoto(index, spec.aspect, spec.label),
    caption: spec.caption,
  }));
}

/**
 * 一份完整的中文示例旅行：4 章 9 张照片，比例覆盖竖构图 / 横构图 / 方图，
 * 用来验证版式引擎在不同宽高比下的决策。
 */
export function createMockSource(): DocumentSource {
  const photos = createMockPhotos();
  const id = (index: number) => photos[index]!.id;
  return createDocumentSource({
    language: 'zh',
    title: '深圳湾的候鸟与潮汐',
    subtitle: '一个关于等待、光线和鸟的清晨',
    preface:
      '这次没有去很远的地方。十月的一个周末，我把相机装进背包，坐地铁到深圳湾，想看看那些每年都会回来的鸟。',
    epilogue:
      '回程时天已经暗了。相机里多了几百张照片，大部分是废片，但有几张让我在回程的地铁上反复看。我想这就是为什么还要出门。',
    startDate: '2026-10-03',
    endDate: '2026-10-05',
    coverPhotoId: id(7),
    photos,
    chapters: [
      {
        chapterId: 'chapter-tide',
        title: '潮水退去之前',
        dateLabel: '10 月 3 日',
        locationLabel: '深圳湾公园',
        narrative:
          '六点不到，天还没有完全亮。海面是灰蓝色的，远处的桥灯还亮着。我沿着堤岸走了大概二十分钟，找到一处能下去滩涂的缺口。\n\n风比想象中大，吹得三脚架有点晃。我把外套的拉链拉到最上面，蹲下来等。',
        photoIds: [id(0), id(1)],
      },
      {
        chapterId: 'chapter-flats',
        title: '滩涂上的第一次相遇',
        dateLabel: '10 月 3 日',
        locationLabel: '深圳湾滩涂',
        narrative:
          '潮水退到堤外之后，滩涂上开始出现细小的动静。先是几只反嘴鹬，然后是成群的黑腹滨鹬。它们走得很慢，喙一下一下地探进泥里。\n\n我尽量不移动。有一只走到离我不到十米的地方，停下来看了我一眼，又低头继续找吃的。那一刻我屏住了呼吸。',
        photoIds: [id(2), id(3), id(4), id(5)],
      },
      {
        chapterId: 'chapter-mangrove',
        title: '午后的红树林',
        dateLabel: '10 月 4 日',
        locationLabel: '福田红树林',
        narrative:
          '中午的光太硬，本来不打算拍。但红树林里的光线被树叶切碎了，落在树根和水面上，反而好看。',
        photoIds: [id(6)],
      },
      {
        chapterId: 'chapter-sunset',
        title: '日落时的归途',
        dateLabel: '10 月 5 日',
        locationLabel: '深圳湾西岸',
        narrative:
          '最后一天我留到了日落。太阳落下去的时候，整片滩涂变成金色，鸟群一批一批地飞过。我再没有调参数，只是一直按快门。',
        photoIds: [id(7), id(8)],
      },
    ],
  });
}

/**
 * 一段紧凑的短旅行：2 章 4 张照片。
 * 用来验证「短旅行不加分隔页」的规则（见 chapterDivider）。
 */
export function createCompactMockSource(): DocumentSource {
  const photos = [placeholderPhoto(0, 0.75, 'Photo 1'), placeholderPhoto(1, 1.5, 'Photo 2')]
    .concat(placeholderPhoto(2, 1.5, 'Photo 3'), placeholderPhoto(3, 1.78, 'Photo 4'))
    .map((photo, index) => ({ ...photo, id: `compact-${index}`, caption: `Caption ${index + 1}` }));
  return createDocumentSource({
    language: 'zh',
    title: '顺德的雨天',
    subtitle: '两天的吃与走',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    photos,
    chapters: [
      {
        chapterId: 'compact-a',
        title: '到得比雨早',
        dateLabel: '9 月 20 日',
        locationLabel: '清晖园',
        narrative: '下车的时候雨刚停。园子里没什么人，石板路还是湿的，光从廊檐上漏下来。',
        photoIds: ['compact-0', 'compact-1'],
      },
      {
        chapterId: 'compact-b',
        title: '一碗双皮奶',
        dateLabel: '9 月 21 日',
        locationLabel: '大良',
        narrative: '第二天只做了一件事：把昨天路过的那家店再走一遍。',
        photoIds: ['compact-2', 'compact-3'],
      },
    ],
  });
}
