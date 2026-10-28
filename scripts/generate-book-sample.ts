import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import type { BookPreviewDTO } from '../ios-app/src/contracts/story.ts';
import type { Photo } from '../ios-app/src/domain/photo/photo.ts';
import { buildBookLayout, renderBookHtml } from '../ios-app/src/features/books/bookLayout.ts';

async function main() {
const root = process.cwd();
const imageDirectory = path.join(root, 'tmp', 'pdfs', 'guishan-images');
const files = (await readdir(imageDirectory)).filter((name) => name.endsWith('.jpg')).sort();
const photos = new Map<string, Photo>(files.map((name, index) => {
  const id = `photo-${index + 1}`;
  return [id, {
    id, tripId: 'sample-trip', status: 'ready', url: pathToFileURL(path.join(imageDirectory, name)).href,
    originalFilename: name, mimeType: 'image/jpeg', fileSize: 1,
    width: index % 4 === 0 ? 900 : 1600, height: index % 4 === 0 ? 1400 : 1000,
    capturedAt: null, createdAt: new Date(0), uploadedAt: new Date(0), caption: null, locationName: '桂山岛',
  }];
}));

const chapters = [
  {
    chapterId: 'walk', title: '海边的路，慢慢向岛心延伸', dateLabel: '2025.08.24 · 上午', locationLabel: '桂山岛',
    narrative: '阴天让岛上的颜色显得格外安静。我们沿着石板路往海边走，树影、红屋顶和潮水在路的两侧交替出现。孩子在长椅和卡通造型之间停下，这段没有赶路的漫步，成了旅行真正开始的时刻。',
    photoIds: ['photo-1', 'photo-2', 'photo-3'], captions: { 'photo-1': '通往海边的石板路', 'photo-2': '长椅旁的短暂停留', 'photo-3': '栏杆外的礁石和海' }, locked: false, userEdited: false,
  },
  {
    chapterId: 'lighthouse', title: '灯塔在风里慢慢靠近', dateLabel: '2025.08.24 · 白天', locationLabel: '灯塔步道',
    narrative: '离开步道后，视野突然展开。船只、防波堤和远处的山影把海面分成清晰的层次，白色灯塔从路的尽头一点点变得真切。大人和孩子分别在步道上留下身影，同一座灯塔，也因为彼此的陪伴而有了不同的意义。',
    photoIds: ['photo-4', 'photo-5', 'photo-6', 'photo-7', 'photo-8'], captions: { 'photo-5': '沿海步道通向灯塔', 'photo-6': '灯塔前的停留' }, locked: false, userEdited: false,
  },
  {
    chapterId: 'sunset', title: '海面收下了橙粉色的光', dateLabel: '2025.08.24 · 黄昏', locationLabel: '海边栏杆',
    narrative: '云层之间的光逐渐暖起来，橙粉色从天边落到水面。栏杆、船影和岸边植物都安静下来。我们没有急着离开，只是在同一片晚霞前留下合影。照片记住的不只是天色，还有一段一起等待的时间。',
    photoIds: ['photo-9', 'photo-10', 'photo-11', 'photo-12'], captions: { 'photo-11': '晚霞倒映在水面', 'photo-12': '一起看过的黄昏' }, locked: false, userEdited: false,
  },
  {
    chapterId: 'night', title: '夜色、秋千和一碗海味', dateLabel: '2025.08.24 · 夜晚', locationLabel: '水边',
    narrative: '天色完全暗下来后，岛上的光线换了一种节奏。秋千面向水面，港湾的灯火沿岸展开，白天走过的路也在投影中变得陌生。旅行的最后一页不是宏大风景，而是水边桌上一碗热着的蟹和虾。风还在吹，这一天便在海味里慢慢收尾。',
    photoIds: ['photo-13', 'photo-14', 'photo-15', 'photo-16', 'photo-17'], captions: { 'photo-13': '夜色里面向水面的秋千', 'photo-17': '水边的晚餐' }, locked: false, userEdited: false,
  },
];

const book: BookPreviewDTO = {
  id: 'sample-book', tripId: 'sample-trip', storyId: 'sample-story',
  title: '八月的桂山岛：风、灯塔与海味', tripTitle: '八月的桂山岛',
  subtitle: '在珠海度过的四天海边时光', coverPhotoId: 'photo-11',
  status: 'ready', startDate: '2025-08-24', bookStyle: 'travel_magazine',
  story: {
    title: '八月的桂山岛：风、灯塔与海味', subtitle: '在珠海度过的四天海边时光',
    preface: '旅行从2025年8月24日开始。这些照片记下了步道、灯塔、晚霞和水边的晚餐，也记下了家人一起走过的时间。对无法由照片确认的细节，这本书保留了克制的语气。',
    chapters, epilogue: '留下的照片停在第一天的夜里。海边的路、灯塔的光和晚餐的热气，把这段旅行保存成一段可以重新翻开的回忆。', shareSummary: null,
    meta: { model: 'layout-sample', generatedAt: new Date().toISOString(), degraded: false, visionAvailable: true, uncertainNotes: [], totalTokens: 0, callCount: 0, languageMode: 'zh-Hans', actualLanguage: 'zh-Hans' },
  }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const outputDirectory = path.join(root, 'tmp', 'pdfs');
await mkdir(outputDirectory, { recursive: true });
const document = buildBookLayout(book, photos);
await writeFile(path.join(outputDirectory, 'guishan-new-layout.html'), renderBookHtml(document, photos), 'utf8');
console.log(JSON.stringify({ pages: document.pages.length, layouts: [...new Set(document.pages.map((page) => page.kind))] }));
}

void main();
