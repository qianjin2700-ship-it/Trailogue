// pages/share/index.ts — 分享设置
import { createShare, getSharedStory, getShareQrCode } from '../../services/share';
import { getAlbum } from '../../services/album';
import { saveImageToAlbum, ExportCancelError } from '../../utils/album-export';
import { errText } from '../../utils/request';
import { enableShare, safeTitle } from '../../utils/share';
import { ShareLink, Album } from '../../types';

interface PageData {
  albumId: string;
  album: Pick<Album, 'name' | 'theme' | 'background'> | null;
  shareLink: ShareLink | null;
  sharePath: string;
  posterImage: string;
  loading: boolean;
  posterLoading: boolean;
  posterError: string;
  /** 当前访客无权访问该相册（不是自己的/链接失效），此时不能再尝试创建分享 */
  noAccess: boolean;
}

/** 海报画布尺寸（逻辑像素） */
const CANVAS_W = 375;
const CANVAS_H = 600;

/** 品牌主色（与 app.wxss --color-primary 一致） */
const COLOR_PRIMARY = '#4a7c59';

/** 小程序 canvas 2d 上下文/图片类型（typings 命名空间） */
type PosterContext = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type PosterImage = WechatMiniprogram.Image;

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    album: null,
    shareLink: null,
    sharePath: '',
    posterImage: '',
    loading: false,
    posterLoading: false,
    posterError: '',
    noAccess: false,
  },

  async onLoad(options: Record<string, string | undefined>) {
    const albumId = options.album_id || '';

    // 朋友圈落地页兜底：onShareTimeline 只能带 query 不能改 path，
    // 从朋友圈进来的是 /pages/share/index?token=xxx，本页无法凭 token 建分享，
    // 直接转交游客可读的 shared-view 页展示故事。
    const sceneToken = options.token || '';
    if (!albumId && sceneToken) {
      wx.redirectTo({ url: `/pages/shared-view/index?token=${sceneToken}` });
      return;
    }

    this.setData({ albumId });
    if (albumId) {
      try {
        const { album } = await getAlbum(albumId);
        this.setData({
          album: {
            name: album.name,
            theme: album.theme,
            background: album.background,
          },
        });
      } catch (err) {
        console.warn('getAlbum failed', err);
        // 不是自己的相册：别再尝试创建分享，否则会误弹「创建分享失败，请重试」
        this.setData({ noAccess: true, posterError: '请通过作者分享的链接查看' });
      }
    }
  },

  onShow() {
    // 开启转发给朋友 + 分享到朋友圈（两者都要显式声明，朋友圈还需下方 onShareTimeline）
    enableShare();

    // 进入页面即自动创建永久分享并绘制海报
    if (
      this.data.albumId &&
      !this.data.noAccess &&
      !this.data.shareLink &&
      !this.data.loading
    ) {
      this.ensureShareAndPoster();
    }
  },

  /** 自动创建永久分享 token，随后生成海报 */
  async ensureShareAndPoster() {
    this.setData({ loading: true, posterError: '' });
    try {
      const res = await createShare({
        album_id: this.data.albumId,
        expire_days: -1, // 直接永久，无需用户选择有效期
      });
      this.setData({
        shareLink: {
          _id: res.share_id,
          _openid: '',
          album_id: this.data.albumId,
          story_id: '',
          token: res.token,
          expire_at: null,
          revoked: false,
          visit_count: 0,
          created_at: new Date().toISOString(),
        },
        sharePath: res.path,
        loading: false,
      });
      await this.generatePoster();
    } catch (err) {
      console.error('ensureShareAndPoster failed', err);
      this.setData({ loading: false, posterError: '创建分享失败，请重试' });
    }
  },

  /** 绘制海报并把临时路径存到 data.posterImage 展示 */
  async generatePoster() {
    const token = this.data.shareLink?.token;
    if (!token || this.data.posterLoading) return;
    this.setData({ posterLoading: true, posterError: '' });
    try {
      const [storyRes, qrRes] = await Promise.all([
        getSharedStory(token),
        getShareQrCode(token),
      ]);

      const qrPath = `${wx.env.USER_DATA_PATH}/share-qrcode-${token.slice(0, 8)}.png`;
      const fs = wx.getFileSystemManager();
      fs.writeFileSync(qrPath, qrRes.qrcode_base64, 'base64');

      const posterImage = await this.drawPoster(
        storyRes.album_name,
        storyRes.story.title,
        storyRes.story.preface,
        storyRes.expire_at,
        qrPath
      );
      this.setData({ posterImage, posterLoading: false });
    } catch (err) {
      console.error('generatePoster failed', err);
      this.setData({ posterLoading: false, posterError: '海报生成失败，请重试' });
    }
  },


  /** 保存海报到相册 */
  async onSavePoster() {
    if (!this.data.posterImage) return;
    try {
      await saveImageToAlbum(this.data.posterImage);
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      if (err instanceof ExportCancelError) {
        // 用户主动取消（保存弹窗/授权弹窗），轻提示收场
        if (err.toast) wx.showToast({ title: err.toast, icon: 'none' });
        return;
      }
      console.error('savePoster failed', err);
      wx.showToast({ title: errText(err, '保存失败'), icon: 'none' });
    }
  },

  onShareAppMessage() {
    console.log('[SHARE_DIAG] share onShareAppMessage called');
    const albumName = this.data.album?.name || '旅迹成书';
    try {
      return {
        title: safeTitle(`${albumName} · 看看我制作的旅行故事`),
        path: this.data.sharePath || `/pages/shared-view/index?token=${this.data.shareLink?.token}`,
      };
    } catch (err) {
      console.error('[share] onShareAppMessage error', err);
      return { title: '旅迹成书', path: '/pages/index/index' };
    }
  },

  /** 分享到朋友圈：必须与 enableShare() 的 shareTimeline 配套才会显示该按钮 */
  onShareTimeline() {
    console.log('[SHARE_DIAG] share onShareTimeline called');
    const albumName = this.data.album?.name || '旅迹成书';
    try {
      return {
        title: safeTitle(`${albumName} · 看看我制作的旅行故事`),
        query: `token=${this.data.shareLink?.token || ''}`,
      };
    } catch (err) {
      console.error('[share] onShareTimeline error', err);
      return { title: '旅迹成书', query: '' };
    }
  },

  /** 在离屏 canvas 上绘制海报，返回临时图片路径 */
  drawPoster(
    albumName: string,
    title: string,
    preface: string,
    expireAt: string | null,
    qrPath: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const query = this.createSelectorQuery();
      query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
        const nodeInfo = res[0] as { node: WechatMiniprogram.Canvas } | undefined;
        if (!nodeInfo || !nodeInfo.node) {
          reject(new Error('画布初始化失败'));
          return;
        }
        const canvas = nodeInfo.node;
        const dpr = wx.getWindowInfo().pixelRatio || 2;
        canvas.width = CANVAS_W * dpr;
        canvas.height = CANVAS_H * dpr;
        const ctx = canvas.getContext('2d') as PosterContext;
        ctx.scale(dpr, dpr);

        const img = canvas.createImage();
        img.onerror = () => reject(new Error('小程序码加载失败'));
        img.onload = () => {
          try {
            this.renderPoster(ctx, albumName, title, preface, expireAt, img);
            wx.canvasToTempFilePath({
              canvas,
              success: (r) => resolve(r.tempFilePath),
              fail: () => reject(new Error('导出失败')),
            });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        };
        img.src = qrPath;
      });
    });
  },

  /** 海报内容绘制 */
  renderPoster(
    ctx: PosterContext,
    albumName: string,
    title: string,
    preface: string,
    expireAt: string | null,
    qrImg: PosterImage
  ) {
    const W = CANVAS_W;

    // 背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 顶部主题色封面区
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.fillRect(0, 0, W, 168);

    // 品牌行
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px sans-serif';
    ctx.fillText(`旅迹成书 · ${albumName}`, 24, 36);

    // 故事标题（最多 2 行）
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    const titleLines = wrapText(ctx, title || '我的旅行故事', W - 48, 2);
    let y = 82;
    for (const line of titleLines) {
      ctx.fillText(line, 24, y);
      y += 34;
    }

    // 开篇摘录
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '13px sans-serif';
    ctx.fillText('— 开篇 —', 24, 208);
    ctx.fillStyle = '#333333';
    ctx.font = '15px sans-serif';
    const prefaceLines = wrapText(ctx, preface || '把这段旅程装进一本小小的故事书。', W - 48, 5);
    y = 238;
    for (const line of prefaceLines) {
      ctx.fillText(line, 24, y);
      y += 26;
    }

    // 分隔线
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 428);
    ctx.lineTo(W - 24, 428);
    ctx.stroke();

    // 二维码（左下）
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = '12px sans-serif';
    ctx.drawImage(qrImg, 24, 456, 104, 104);

    // 右侧引导文案
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('长按识别小程序码', 152, 488);
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '13px sans-serif';
    ctx.fillText('查看完整旅行故事', 152, 514);

    // 有效期提示 + 品牌
    const expireText = expireAt
      ? `有效期至 ${expireAt.slice(0, 10)}`
      : '永久有效';
    ctx.fillText(expireText, 152, 542);

    ctx.fillStyle = '#b0b0b0';
    ctx.font = '11px sans-serif';
    ctx.fillText('旅迹成书 · AI 帮你把照片写成故事', W - 24 - ctx.measureText('旅迹成书 · AI 帮你把照片写成故事').width, 582);
  },
});

/** 按最大宽度换行，超出 maxLines 截断加省略号 */
function wrapText(ctx: PosterContext, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n' || ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch === '\n' ? '' : ch;
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + '…';
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}
