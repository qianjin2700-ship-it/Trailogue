// components/privacy-notice/index.ts — 首次上传隐私告知弹窗
Component({
  properties: {
    visible: { type: Boolean, value: false },
  },
  methods: {
    onAgree() {
      this.triggerEvent('agree');
    },
    onDisagree() {
      this.triggerEvent('disagree');
    },
  },
});
