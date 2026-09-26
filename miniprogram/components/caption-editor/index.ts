// components/caption-editor/index.ts — 图说行内编辑器
Component({
  properties: {
    value: { type: String, value: '' },
    photoId: { type: String, value: '' },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.triggerEvent('input', { photoId: this.data.photoId, value: e.detail.value });
    },
    onSave() {
      this.triggerEvent('save', { photoId: this.data.photoId, value: this.data.value });
    },
  },
});
