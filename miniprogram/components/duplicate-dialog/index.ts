// components/duplicate-dialog/index.ts — 重复照片提示弹窗
Component({
  properties: {
    photos: { type: Array, value: [] },
  },
  methods: {
    onKeep(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      this.triggerEvent('keep', { index, photo: this.data.photos[index] });
    },
    onRemove(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      this.triggerEvent('remove', { index, photo: this.data.photos[index] });
    },
  },
});
