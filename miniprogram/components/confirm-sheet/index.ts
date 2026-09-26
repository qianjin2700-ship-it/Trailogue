// components/confirm-sheet/index.ts — 危险操作确认底部弹层
Component({
  properties: {
    title: { type: String, value: '确认操作' },
    items: { type: Array, value: [] },
    danger: { type: Boolean, value: false },
  },
  methods: {
    onConfirm() {
      this.triggerEvent('confirm');
    },
    onCancel() {
      this.triggerEvent('cancel');
    },
  },
});
