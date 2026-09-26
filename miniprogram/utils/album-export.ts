/**
 * utils/album-export.ts
 * 旅迹成书 — 相册导出渲染（单张长图 + PDF 页图）
 *
 * 设计要点：
 * 1. 全部用 canvas 2d 在「逻辑坐标」下绘制，物理像素 = 逻辑 × dpr，
 *    由 ctx.setTransform(dpr,0,0,dpr,0,0) 完成缩放，字号统一用逻辑值。
 * 2. 长图：不再分段，整本故事渲染为一张长图；dpr 自适应（2 → 1 → …），
 *    保证不超过 canvas 尺寸/像素面积上限，防止超长内容渲染失败。
 * 3. PDF：A4 逻辑尺寸 595×842（pt 口径），独立版式（字号收敛为印刷级小字），
 *    dpr2 → 1190×1684 物理像素；逐页上传云存储，由 export 云函数 pdf-lib
 *    按页图原始尺寸合成 PDF，下载后 openDocument 预览（可转发/保存）。
 * 4. 照片统一使用 thumb_file_id 的临时 URL（canvas 不能直接绘制 cloud:// fileID）。
 */
import { getStory } from '../services/story';
import { getPhotoFiles } from '../services/photo';
import { getAlbum } from '../services/album';
import { createPdf } from '../services/export';
import { StoryOutput } from '../types';

// ============================================================
// 版式档案：长图 / PDF 各一套（宽度、边距、字号、行距、照片行高）
// ============================================================

interface ExportStyle {
  /** 逻辑页宽 */
  pageW: number;
  padding: number;
  contentW: number;
  footerH: number;
  fontCoverTitle: string;
  coverTitleLh: number;
  fontChapter: string;
  chapterLh: number;
  fontBody: string;
  bodyLh: number;
  fontMeta: string;
  metaLh: number;
  fontCaption: string;
  captionLh: number;
  fontLabel: string;
  labelLh: number;
  fontFooter: string;
  /** 照片行：单张 / 双张的行高 */
  photoSingleH: number;
  photoPairH: number;
}

/** 长图版式：手机屏宽口径（375），字号适中 */
const LONG_STYLE: ExportStyle = (() => {
  const pageW = 375;
  const padding = 20;
  return {
    pageW,
    padding,
    contentW: pageW - padding * 2,
    footerH: 34,
    fontCoverTitle: 'bold 30px sans-serif',
    coverTitleLh: 44,
    fontChapter: 'bold 19px sans-serif',
    chapterLh: 30,
    fontBody: '15px sans-serif',
    bodyLh: 27,
    fontMeta: '12px sans-serif',
    metaLh: 20,
    fontCaption: '11px sans-serif',
    captionLh: 18,
    fontLabel: 'bold 12px sans-serif',
    labelLh: 18,
    fontFooter: '10px sans-serif',
    photoSingleH: 150,
    photoPairH: 120,
  };
})();

/** PDF 版式：A4 pt 口径（595×842），字号收敛为印刷级（正文约 8pt 视感） */
const PDF_STYLE: ExportStyle = (() => {
  const pageW = 595;
  const padding = 48;
  return {
    pageW,
    padding,
    contentW: pageW - padding * 2, // 499
    footerH: 30,
    fontCoverTitle: 'bold 26px sans-serif',
    coverTitleLh: 38,
    fontChapter: 'bold 15px sans-serif',
    chapterLh: 24,
    fontBody: '11px sans-serif',
    bodyLh: 19,
    fontMeta: '9px sans-serif',
    metaLh: 15,
    fontCaption: '9px sans-serif',
    captionLh: 15,
    fontLabel: 'bold 10px sans-serif',
    labelLh: 15,
    fontFooter: '8px sans-serif',
    photoSingleH: 280,
    photoPairH: 200,
  };
})();

/** A4 逻辑页高（595 × 1.414 ≈ 842） */
const PDF_PAGE_H = 842;
const PDF_DPR = 2;

/** 长图基准 DPR（内容超长时自动降档） */
const LONG_DPR = 2;
/** canvas 单边物理像素上限（iOS 安全值） */
const MAX_CANVAS_SIDE = 16384;
/** canvas 总像素面积预算（现代手机安全值） */
const MAX_CANVAS_AREA = 64 * 1024 * 1024;

// 主题色（与 app.wxss 对齐）
const COLOR = {
  bg: '#FFFDF8',
  text: '#2C2C2C',
  secondary: '#888888',
  hint: '#B0B0B0',
  primary: '#4A7C59',
  line: '#EDEDED',
};

// ============================================================
// 行流模型：内容先展开为行，再由分页器按页高切分
// ============================================================
export type ExportLine =
  | { kind: 'gap'; h: number }
  | { kind: 'divider'; h: number; color?: string }
  | { kind: 'text'; text: string; font: string; color: string; h: number; align?: 'left' | 'center' }
  | { kind: 'photo'; urls: string[]; h: number };

interface ExportPageSegment {
  lines: ExportLine[];
  /** 内容实际占用高度（不含 padding/footer） */
  height: number;
}

export interface ExportHooks {
  onProgress?: (done: number, total: number) => void;
  onUpload?: () => void;
}

/**
 * 用户主动中止场景（拒绝授权、取消保存弹窗等），页面据此静默/轻提示处理。
 * toast 非空时页面可弹一条轻提示（如「已取消保存」）；空串则完全静默。
 */
export class ExportCancelError extends Error {
  readonly toast: string;
  constructor(toast = '') {
    super(toast || '已取消');
    this.name = 'ExportCancelError';
    this.toast = toast;
  }
}

// ============================================================
// 导出入口
// ============================================================

/** 保存长图到相册（整本故事合成一张长图） */
export async function exportLongImage(
  page: ExportPage,
  albumId: string,
  hooks?: ExportHooks
): Promise<{ saved: number }> {
  if (!(await ensureAlbumAuth())) {
    throw new ExportCancelError(); // 授权流程已给过反馈，静默收场
  }

  const st = LONG_STYLE;
  const data = await prepareExportData(albumId);
  const { canvas, ctx } = await getPageCanvas(page);
  const lines = buildLines(data, ctx, st);
  const imageMap = await loadImages(canvas, collectUrls(lines));

  const contentH = sumLinesH(lines);
  const totalH = st.padding * 2 + contentH + st.footerH;
  const dpr = pickLongDpr(totalH);

  hooks?.onProgress?.(1, 1);
  drawPage(ctx, { lines, height: contentH }, st, totalH, dpr, imageMap);
  const path = await canvasToTemp(canvas);

  await saveImageToAlbum(path);
  return { saved: 1 };
}

/** 生成 PDF 并在小程序内预览（可转发/保存） */
export async function exportPdf(
  page: ExportPage,
  albumId: string,
  hooks?: ExportHooks
): Promise<{ pageCount: number }> {
  const st = PDF_STYLE;
  const data = await prepareExportData(albumId);
  const { canvas, ctx } = await getPageCanvas(page);
  const lines = buildLines(data, ctx, st);
  const imageMap = await loadImages(canvas, collectUrls(lines));
  const pages = paginate(lines, PDF_PAGE_H, st);

  // 1. 渲染页图（A4 逻辑尺寸，dpr2）
  const paths: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    hooks?.onProgress?.(i + 1, pages.length);
    drawPage(ctx, pages[i], st, PDF_PAGE_H, PDF_DPR, imageMap);
    paths.push(await canvasToTemp(canvas));
  }

  // 2. 上传页图 → 云函数合成
  hooks?.onUpload?.();
  const pageFileIds = await uploadPages(paths);
  const { pdf_file_id } = await createPdf(albumId, pageFileIds);

  // 3. 下载 PDF → 落为「相册名.pdf」→ 预览（showMenu 支持转发/保存，文件名即相册名）
  const dl = await wx.cloud.downloadFile({ fileID: pdf_file_id });
  const pdfPath = await persistNamedPdf(dl.tempFilePath, data.albumName);
  wx.showToast({ title: 'PDF 已保存到本地，正在打开预览', icon: 'none', duration: 2500 });
  await openPdf(pdfPath);
  return { pageCount: pages.length };
}

// ============================================================
// 数据准备
// ============================================================

interface ExportData {
  story: StoryOutput;
  albumName: string;
  /** photoId -> 临时 https URL（thumb） */
  photoUrls: Record<string, string>;
}

async function prepareExportData(albumId: string): Promise<ExportData> {
  const { story } = await getStory(albumId);

  // 照片记录 ID → thumb fileID → 临时 URL（成对构造，避免 filter 后索引错位）
  const ids = Array.from(new Set((story.chapters || []).flatMap((c) => c.photo_ids || [])));
  const photoUrls: Record<string, string> = {};
  if (ids.length > 0) {
    const { files } = await getPhotoFiles(ids);
    const pairs = ids
      .map((id) => ({ pid: id, fileId: files[id]?.thumb_file_id || files[id]?.file_id }))
      .filter((p): p is { pid: string; fileId: string } => Boolean(p.fileId));

    // getTempFileURL 单次上限 50，分批换临时 URL
    const BATCH = 45;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      const res = await wx.cloud.getTempFileURL({ fileList: batch.map((b) => b.fileId) });
      res.fileList.forEach((f, j) => {
        if (f.tempFileURL) photoUrls[batch[j].pid] = f.tempFileURL;
      });
    }
  }

  let albumName = '旅迹成书';
  try {
    const { album } = await getAlbum(albumId);
    if (album?.name) albumName = album.name;
  } catch (err) {
    console.warn('getAlbum failed for export', err);
  }

  return { story, albumName, photoUrls };
}

// ============================================================
// 内容行流构建
// ============================================================

function buildLines(
  data: ExportData,
  ctx: CanvasCtx,
  st: ExportStyle
): ExportLine[] {
  const { story, albumName, photoUrls } = data;
  const lines: ExportLine[] = [];
  const W = st.contentW;

  // ---- 封面 ----
  lines.push({ kind: 'gap', h: 40 });
  lines.push({ kind: 'text', text: '旅 迹 成 书', font: st.fontLabel, color: COLOR.primary, h: st.labelLh, align: 'center' });
  lines.push({ kind: 'gap', h: 16 });
  for (const seg of wrapText(ctx, story.title || '无题之旅', W, st.fontCoverTitle)) {
    lines.push({ kind: 'text', text: seg, font: st.fontCoverTitle, color: COLOR.text, h: st.coverTitleLh, align: 'center' });
  }
  if (story.subtitle) {
    lines.push({ kind: 'gap', h: 8 });
    for (const seg of wrapText(ctx, story.subtitle, W, st.fontMeta)) {
      lines.push({ kind: 'text', text: seg, font: st.fontMeta, color: COLOR.secondary, h: st.metaLh, align: 'center' });
    }
  }
  lines.push({ kind: 'gap', h: 24 });
  lines.push({ kind: 'divider', h: 1 });
  lines.push({ kind: 'gap', h: 24 });
  lines.push({ kind: 'text', text: albumName, font: st.fontMeta, color: COLOR.hint, h: st.metaLh, align: 'center' });
  lines.push({ kind: 'gap', h: 40 });

  // ---- 开篇 ----
  lines.push({ kind: 'text', text: '开 篇', font: st.fontLabel, color: COLOR.primary, h: st.labelLh });
  lines.push({ kind: 'gap', h: 10 });
  for (const seg of wrapText(ctx, story.preface || '', W, st.fontBody)) {
    lines.push({ kind: 'text', text: seg, font: st.fontBody, color: COLOR.text, h: st.bodyLh });
  }

  // ---- 章节 ----
  for (const ch of story.chapters || []) {
    lines.push({ kind: 'gap', h: 30 });
    lines.push({ kind: 'divider', h: 1, color: COLOR.line });
    lines.push({ kind: 'gap', h: 16 });
    for (const seg of wrapText(ctx, ch.title || '章节', W, st.fontChapter)) {
      lines.push({ kind: 'text', text: seg, font: st.fontChapter, color: COLOR.text, h: st.chapterLh });
    }
    const metaParts = [ch.date_label, ch.location_label].filter(Boolean).join(' · ');
    if (metaParts) {
      lines.push({ kind: 'gap', h: 6 });
      lines.push({ kind: 'text', text: metaParts, font: st.fontMeta, color: COLOR.secondary, h: st.metaLh });
    }
    lines.push({ kind: 'gap', h: 10 });
    for (const seg of wrapText(ctx, ch.narrative || '', W, st.fontBody)) {
      lines.push({ kind: 'text', text: seg, font: st.fontBody, color: COLOR.text, h: st.bodyLh });
    }

    // 照片网格（每行 2 张 + 图说）
    const pids = ch.photo_ids || [];
    if (pids.length > 0) {
      lines.push({ kind: 'gap', h: 14 });
      for (let i = 0; i < pids.length; i += 2) {
        const row = pids.slice(i, i + 2);
        const urls = row.map((pid) => photoUrls[pid] || '');
        lines.push({
          kind: 'photo',
          urls,
          h: row.length === 1 ? st.photoSingleH : st.photoPairH,
        });
        for (const pid of row) {
          const cap = ch.captions?.[pid];
          if (cap) {
            for (const seg of wrapText(ctx, cap, W, st.fontCaption)) {
              lines.push({ kind: 'text', text: seg, font: st.fontCaption, color: COLOR.hint, h: st.captionLh });
            }
          }
        }
      }
    }
  }

  // ---- 尾声 ----
  lines.push({ kind: 'gap', h: 30 });
  lines.push({ kind: 'divider', h: 1, color: COLOR.line });
  lines.push({ kind: 'gap', h: 16 });
  lines.push({ kind: 'text', text: '尾 声', font: st.fontLabel, color: COLOR.primary, h: st.labelLh });
  lines.push({ kind: 'gap', h: 10 });
  for (const seg of wrapText(ctx, story.epilogue || '', W, st.fontBody)) {
    lines.push({ kind: 'text', text: seg, font: st.fontBody, color: COLOR.text, h: st.bodyLh });
  }

  return lines;
}

/** 文本按宽度换行（中文按字符断行） */
function wrapText(ctx: CanvasCtx, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    if (cur && ctx.measureText(cur + ch).width > maxWidth) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 收集所有照片 URL（去重） */
function collectUrls(lines: ExportLine[]): string[] {
  const urls = new Set<string>();
  for (const line of lines) {
    if (line.kind === 'photo') {
      line.urls.forEach((u) => {
        if (u) urls.add(u);
      });
    }
  }
  return Array.from(urls);
}

function sumLinesH(lines: ExportLine[]): number {
  return lines.reduce((sum, l) => sum + l.h, 0);
}

// ============================================================
// 分页 / 长图高度
// ============================================================

/** 按页高将行流切成页；行放不下整页时整体挪到下一页 */
function paginate(lines: ExportLine[], pageH: number, st: ExportStyle): ExportPageSegment[] {
  const availH = pageH - st.padding * 2 - st.footerH;
  const pages: ExportPageSegment[] = [];
  let cur: ExportLine[] = [];
  let curH = 0;

  for (const line of lines) {
    if (cur.length > 0 && curH + line.h > availH) {
      pages.push({ lines: cur, height: curH });
      cur = [];
      curH = 0;
    }
    cur.push(line);
    curH += line.h;
  }
  if (cur.length > 0) {
    pages.push({ lines: cur, height: curH });
  }
  return pages;
}

/**
 * 长图 DPR 自适应：优先 2，超出 canvas 边长/面积预算则逐级降档（2 → 1 → 0.5 …）。
 * 极端超长内容宁可降低清晰度也不截断。
 */
function pickLongDpr(totalH: number): number {
  let dpr = LONG_DPR;
  while (dpr > 0.25) {
    const w = LONG_STYLE.pageW * dpr;
    const h = totalH * dpr;
    if (w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA) {
      return dpr;
    }
    dpr /= 2;
  }
  return dpr;
}

// ============================================================
// 渲染
// ============================================================

function drawPage(
  ctx: CanvasCtx,
  segment: ExportPageSegment,
  st: ExportStyle,
  pageH: number,
  dpr: number,
  imageMap: Record<string, CanvasImage>
): void {
  const canvas = ctx.canvas as WechatMiniprogram.Canvas;
  canvas.width = Math.round(st.pageW * dpr);
  canvas.height = Math.round(pageH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 背景
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, st.pageW, pageH);

  // 内容
  let y = st.padding;
  for (const line of segment.lines) {
    drawLine(ctx, line, st, st.padding, y, imageMap);
    y += line.h;
  }

  // 页脚
  drawFooter(ctx, st, pageH);
}

function drawLine(
  ctx: CanvasCtx,
  line: ExportLine,
  st: ExportStyle,
  x: number,
  y: number,
  imageMap: Record<string, CanvasImage>
): void {
  switch (line.kind) {
    case 'gap':
      break;
    case 'divider': {
      ctx.strokeStyle = line.color || COLOR.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + line.h / 2);
      ctx.lineTo(x + st.contentW, y + line.h / 2);
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.textAlign = line.align || 'left';
      ctx.textBaseline = 'middle';
      const tx = line.align === 'center' ? st.pageW / 2 : x;
      ctx.fillText(line.text, tx, y + line.h / 2);
      break;
    }
    case 'photo': {
      const urls = line.urls.filter(Boolean);
      if (urls.length === 0) break;
      const gap = 8;
      if (urls.length === 1) {
        const img = imageMap[urls[0]];
        if (img) drawImageAspectFill(ctx, img, x, y, st.contentW, line.h);
      } else {
        const w = (st.contentW - gap) / 2;
        for (let i = 0; i < 2; i++) {
          const img = imageMap[urls[i]];
          if (img) drawImageAspectFill(ctx, img, x + i * (w + gap), y, w, line.h);
        }
      }
      break;
    }
  }
}

/** aspectFill 裁剪绘制 */
function drawImageAspectFill(
  ctx: CanvasCtx,
  img: CanvasImage,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawFooter(ctx: CanvasCtx, st: ExportStyle, pageH: number): void {
  ctx.font = st.fontFooter;
  ctx.fillStyle = COLOR.hint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('由 旅迹成书 · AI 生成', st.pageW / 2, pageH - st.footerH / 2);
}

// ============================================================
// canvas 节点 & 图片加载
// ============================================================

type ExportPage = WechatMiniprogram.Page.TrivialInstance;
type CanvasCtx = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type CanvasImage = WechatMiniprogram.Image;

/** 获取页面内隐藏 canvas 2d 节点 */
function getPageCanvas(
  page: ExportPage
): Promise<{ canvas: WechatMiniprogram.Canvas; ctx: CanvasCtx }> {
  return new Promise((resolve, reject) => {
    page
      .createSelectorQuery()
      .select('#export-canvas')
      .fields({ node: true })
      .exec((res) => {
        const r = res && res[0];
        if (!r || !r.node) {
          reject(new Error('canvas 节点获取失败'));
          return;
        }
        const canvas = r.node as WechatMiniprogram.Canvas;
        const ctx = canvas.getContext('2d') as CanvasCtx;
        resolve({ canvas, ctx });
      });
  });
}

function loadImage(canvas: WechatMiniprogram.Canvas, url: string): Promise<CanvasImage> {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${url.slice(0, 60)}`));
    img.src = url;
  });
}

async function loadImages(
  canvas: WechatMiniprogram.Canvas,
  urls: string[]
): Promise<Record<string, CanvasImage>> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  // 容错：个别图片加载失败只跳过该图（绘制时判空），不中断整个导出
  const results = await Promise.all(
    unique.map((url) =>
      loadImage(canvas, url).catch((err) => {
        console.warn('导出图片加载失败（已跳过）', err);
        return undefined;
      })
    )
  );
  const map: Record<string, CanvasImage> = {};
  unique.forEach((url, i) => {
    if (results[i]) map[url] = results[i] as CanvasImage;
  });
  return map;
}

// ============================================================
// 输出：导出图片 / 上传 / 保存相册
// ============================================================

function canvasToTemp(canvas: WechatMiniprogram.Canvas): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'jpg',
      quality: 0.92,
      success: (res) => resolve(res.tempFilePath),
      fail: reject,
    });
  });
}

/** 逐页上传页图到云存储（带 openid 隔离前缀，export 云函数按此前缀校验归属） */
async function uploadPages(paths: string[]): Promise<string[]> {
  const openid = getApp<IAppOption>().globalData.openid;
  if (!openid) {
    throw new Error('登录信息缺失，无法导出 PDF');
  }
  const ids: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < paths.length; i++) {
    const { fileID } = await wx.cloud.uploadFile({
      cloudPath: `export/pdf-pages/${openid}/${stamp}-${i}.jpg`,
      filePath: paths[i],
    });
    ids.push(fileID);
  }
  return ids;
}

/**
 * 保存图片到相册（统一封装，全项目共用）：
 * - 用户取消（PC 微信/开发者工具会弹保存路径对话框）→ ExportCancelError，轻提示「已取消保存」
 * - 保存时才被拒权限（与前置授权检查的竞态兜底）→ 引导去设置，开启后自动重试一次
 * - 其他失败 → Error，携带可读 errMsg（避免弹 [object Object]）
 */
export async function saveImageToAlbum(filePath: string): Promise<void> {
  try {
    await rawSaveToAlbum(filePath);
  } catch (err) {
    const msg = getErrMsg(err);
    if (/cancel/i.test(msg)) {
      // 用户在保存弹窗点了取消，是正常操作而非失败
      throw new ExportCancelError('已取消保存');
    }
    if (/auth|deny/i.test(msg)) {
      const granted = await requestAlbumAuthFromSetting();
      if (!granted) throw new ExportCancelError();
      await rawSaveToAlbum(filePath); // 授权后重试一次
      return;
    }
    throw new Error(`保存到相册失败：${msg}`);
  }
}

function rawSaveToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: reject,
    });
  });
}

/** 引导用户到设置开启相册写权限，返回最终是否已开启 */
async function requestAlbumAuthFromSetting(): Promise<boolean> {
  try {
    const { confirm } = await wx.showModal({
      title: '需要相册权限',
      content: '保存图片到相册需要相册权限，请在设置中开启后重试',
      confirmText: '去设置',
      cancelText: '取消',
    });
    if (!confirm) return false;
    const s = await wx.openSetting();
    return s.authSetting['scope.writePhotosAlbum'] === true;
  } catch {
    return false;
  }
}

/** 提取微信 API 失败对象的可读信息（避免 String(err) 得到 [object Object]） */
export function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const e = err as { errMsg?: string };
    if (e.errMsg) return e.errMsg;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** 相册写权限检查/授权 */
async function ensureAlbumAuth(): Promise<boolean> {
  try {
    const { authSetting } = await wx.getSetting();
    if (authSetting['scope.writePhotosAlbum'] === true) return true;

    if (authSetting['scope.writePhotosAlbum'] === false) {
      const { confirm } = await wx.showModal({
        title: '需要相册权限',
        content: '保存长图到相册需要访问你的相册，请在设置中开启权限',
        confirmText: '去设置',
        cancelText: '取消',
      });
      if (confirm) {
        await wx.openSetting();
        const s = await wx.getSetting();
        return s.authSetting['scope.writePhotosAlbum'] === true;
      }
      return false;
    }

    try {
      await wx.authorize({ scope: 'scope.writePhotosAlbum' });
      return true;
    } catch {
      return false;
    }
  } catch {
    // 开发者工具等环境 getSetting 异常时放行，让 saveImageToPhotosAlbum 自行判断
    return true;
  }
}

/** 打开 PDF 预览（showMenu 支持转发/保存到文件） */
function openPdf(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      fileType: 'pdf',
      showMenu: true,
      success: () => resolve(),
      fail: reject,
    });
  });
}

/**
 * 把临时 PDF 落盘为「相册名.pdf」（用户无需手动命名）：
 * - 文件名清洗：去掉文件系统非法字符，长度截断 30 字
 * - 同名旧文件先删除（重复导出直接覆盖）
 * - 任一步失败都退回临时路径，不阻断预览
 */
function persistNamedPdf(tempPath: string, albumName: string): Promise<string> {
  const safe =
    albumName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) ||
    '旅迹成书';
  const target = `${wx.env.USER_DATA_PATH}/${safe}.pdf`;
  const fs = wx.getFileSystemManager();

  return new Promise((resolve) => {
    const finish = () => {
      fs.saveFile({
        tempFilePath: tempPath,
        filePath: target,
        success: () => resolve(target),
        fail: () => resolve(tempPath), // 落盘失败退回临时路径，预览不受影响
      });
    };
    try {
      fs.unlinkSync(target); // 覆盖同名旧文件（不存在时会抛错，忽略）
    } catch {
      // 不存在同名文件，直接落盘
    }
    finish();
  });
}
