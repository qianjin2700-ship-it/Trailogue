// components/photo-card/index.ts — 照片卡
Component({
  properties: {
    photo: { type: Object, value: {} },
    showMeta: { type: Boolean, value: false },
    editable: { type: Boolean, value: false },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { photo: this.data.photo });
    },
  },
});
