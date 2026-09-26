// components/empty-state/index.ts — 空态占位
Component({
  properties: {
    icon: { type: String, value: '📋' },
    text: { type: String, value: '暂无数据' },
    actionText: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
