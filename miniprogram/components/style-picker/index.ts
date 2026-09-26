// components/style-picker/index.ts — 文风选择卡片组
Component({
  properties: {
    value: { type: String, value: 'warm_documentary' },
    options: {
      type: Array,
      value: [
        { label: '温暖纪实', value: 'warm_documentary' },
        { label: '轻松幽默', value: 'casual_humor' },
        { label: '文艺克制', value: 'literary' },
        { label: '亲子成长', value: 'family' },
        { label: '青春活力', value: 'youth' },
        { label: '简洁客观', value: 'concise' },
        { label: '自定义', value: 'custom' },
      ],
    },
  },
  methods: {
    onSelect(e: WechatMiniprogram.TouchEvent) {
      const value = e.currentTarget.dataset.value as string;
      this.triggerEvent('change', { value });
    },
  },
});
