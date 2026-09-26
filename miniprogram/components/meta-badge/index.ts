// components/meta-badge/index.ts — 来源徽标
Component({
  properties: {
    source: { type: String, value: 'unknown' },
    confidence: { type: Number, value: 0 },
  },
  data: {
    label: '',
    color: '',
  },
  observers: {
    'source, confidence': function (source: string, confidence: number) {
      const config: Record<string, { label: string; color: string }> = {
        exif: { label: 'EXIF', color: '#4a7c59' },
        file_meta: { label: '文件', color: '#b0b0b0' },
        inferred: { label: `推断 ${Math.round(confidence * 100)}%`, color: '#e8a87c' },
        user: { label: '用户', color: '#4a90d9' },
        unknown: { label: '未知', color: '#b0b0b0' },
      };
      const c = config[source] || config.unknown;
      this.setData({ label: c.label, color: c.color });
    },
  },
});
