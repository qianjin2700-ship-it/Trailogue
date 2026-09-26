// components/upload-item/index.ts — 上传列表项
Component({
  properties: {
    photo: { type: Object, value: {} },
    progress: { type: Number, value: 0 },
    status: { type: String, value: 'uploading' },
    failReason: { type: String, value: '' },
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry', { photo: this.properties.photo });
    },
    onBatchRetry() {
      this.triggerEvent('batchRetry');
    },
  },
});
