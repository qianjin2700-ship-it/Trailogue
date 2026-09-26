// components/chapter-card/index.ts — 章节卡片（阅读/编辑双模式）
Component({
  properties: {
    chapter: { type: Object, value: {} },
    mode: { type: String, value: 'read' },
    locked: { type: Boolean, value: false },
  },
  methods: {
    onRegenerate() {
      if (this.data.locked) return;
      this.triggerEvent('regenerate', { chapter: this.data.chapter });
    },
    onToggleLock() {
      this.triggerEvent('lock', { chapter: this.data.chapter });
    },
    onTitleInput(e: WechatMiniprogram.Input) {
      this.triggerEvent('input', { field: 'title', value: e.detail.value });
    },
    onNarrativeInput(e: WechatMiniprogram.Input) {
      this.triggerEvent('input', { field: 'narrative', value: e.detail.value });
    },
  },
});
