// components/long-image-canvas/index.ts — 长图离屏渲染
import { saveImageToAlbum, ExportCancelError } from '../../utils/album-export';

Component({
  properties: {
    story: { type: Object, value: {} },
    canvasId: { type: String, value: 'longImage' },
  },
  data: {
    rendering: false,
  },
  methods: {
    /**
     * 渲染长图并保存到相册
     */
    async render() {
      const story = this.data.story as Record<string, unknown> | undefined;
      if (!story || this.data.rendering) return;
      this.setData({ rendering: true });

      try {
        const width = 750;
        let height = 400;
        height += 120;
        const chapters = (story.chapters as Array<Record<string, unknown>>) || [];
        for (const ch of chapters) {
          const narrative = (ch.narrative as string) || '';
          const photoIds = (ch.photo_ids as string[]) || [];
          height += 80 + narrative.length * 2 + photoIds.length * 200;
        }
        height += 120;

        const query = this.createSelectorQuery();
        query.select(`#${this.data.canvasId}`).fields({ node: true, size: true });
        const res: any = await new Promise((resolve) => {
          query.exec((r: any[]) => resolve(r[0]));
        });

        const canvas = res.node as any;
        const ctx = canvas.getContext('2d') as any;
        const dpr = wx.getWindowInfo().pixelRatio;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#2c2c2c';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((story.title as string) || '旅迹成书', width / 2, 80);

        // TODO: 完整渲染逻辑（序言/章节/照片/图说/结尾）

        const tempPath = await new Promise<string>((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas,
            success: (r) => resolve(r.tempFilePath),
            fail: reject,
          });
        });

        await saveImageToAlbum(tempPath);
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      } catch (err) {
        if (err instanceof ExportCancelError) {
          if (err.toast) wx.showToast({ title: err.toast, icon: 'none' });
        } else {
          console.error('render long image failed', err);
          wx.showToast({ title: '保存失败', icon: 'error' });
        }
      } finally {
        this.setData({ rendering: false });
      }
    },
  },
});
