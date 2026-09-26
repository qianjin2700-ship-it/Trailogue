// pages/create-album/index.ts — 创建/编辑相册
import { createAlbum, updateAlbum } from '../../services/album';
import { errText } from '../../utils/request';
import { AlbumStyle, AlbumContentLength, AlbumArrangement, CreateAlbumParams } from '../../types';

interface PageOption {
  album_id?: string;
  name?: string;
  theme?: string;
  background?: string;
  relations?: string;
  highlights?: string;
  avoid_expressions?: string;
  style?: AlbumStyle;
  style_custom?: string;
  content_length?: AlbumContentLength;
  arrangement?: AlbumArrangement;
}

interface PageData {
  isEdit: boolean;
  albumId: string;
  form: {
    name: string;
    theme: string;
    background: string;
    relations: string;
    highlights: string;
    avoid_expressions: string;
    style: AlbumStyle;
    style_custom: string;
    content_length: AlbumContentLength;
    arrangement: AlbumArrangement;
  };
  styles: { label: string; value: AlbumStyle }[];
  lengths: { label: string; value: AlbumContentLength; hint: string }[];
  arrangements: { label: string; value: AlbumArrangement; hint: string }[];
  canSubmit: boolean;
}

const STYLES: { label: string; value: AlbumStyle }[] = [
  { label: '温暖纪实', value: 'warm_documentary' },
  { label: '轻松幽默', value: 'casual_humor' },
  { label: '文艺克制', value: 'literary' },
  { label: '亲子成长', value: 'family' },
  { label: '青春活力', value: 'youth' },
  { label: '简洁客观', value: 'concise' },
  { label: '自定义', value: 'custom' },
];

const LENGTHS: { label: string; value: AlbumContentLength; hint: string }[] = [
  { label: '简短', value: 'short', hint: '像杂志图说，点到为止，多留白' },
  { label: '适中', value: 'medium', hint: '具体但不冗长，信息量优先' },
  { label: '详细', value: 'long', hint: '游记散文式，细节与情绪铺陈更足' },
];

const ARRANGEMENTS: { label: string; value: AlbumArrangement; hint: string }[] = [
  { label: '时间线', value: 'timeline', hint: '按拍摄时间顺序翻页' },
  { label: '地点聚类', value: 'location', hint: '同一地点的照片放同一页' },
  { label: '事件流', value: 'event', hint: '按旅程阶段切分，如出发/游玩/夜游' },
];

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    isEdit: false,
    albumId: '',
    form: {
      name: '',
      theme: '',
      background: '',
      relations: '',
      highlights: '',
      avoid_expressions: '',
      style: 'warm_documentary',
      style_custom: '',
      content_length: 'medium',
      arrangement: 'timeline',
    },
    styles: STYLES,
    lengths: LENGTHS,
    arrangements: ARRANGEMENTS,
    canSubmit: false,
  },

  onLoad(options: PageOption) {
    if (options.album_id) {
      const decode = (v?: string) => (v ? decodeURIComponent(v) : '');
      this.setData({
        isEdit: true,
        albumId: options.album_id,
        form: {
          name: decode(options.name),
          theme: decode(options.theme),
          background: decode(options.background),
          relations: decode(options.relations),
          highlights: decode(options.highlights),
          avoid_expressions: decode(options.avoid_expressions),
          style: options.style || 'warm_documentary',
          style_custom: decode(options.style_custom),
          content_length: options.content_length || 'medium',
          arrangement: options.arrangement || 'timeline',
        },
      });
      this.validateForm();
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [`form.${field}`]: e.detail.value } as unknown as Partial<PageData>);
    this.validateForm();
  },

  onSelectStyle(e: WechatMiniprogram.TouchEvent) {
    const style = e.currentTarget.dataset.style as AlbumStyle;
    this.setData({ 'form.style': style });
  },

  onSelectLength(e: WechatMiniprogram.TouchEvent) {
    const content_length = e.currentTarget.dataset.length as AlbumContentLength;
    this.setData({ 'form.content_length': content_length });
  },

  onSelectArrangement(e: WechatMiniprogram.TouchEvent) {
    const arrangement = e.currentTarget.dataset.arrangement as AlbumArrangement;
    this.setData({ 'form.arrangement': arrangement });
  },

  validateForm() {
    const { name, style, style_custom } = this.data.form;
    const canSubmit = name.trim().length > 0 && name.length <= 20 &&
      (style !== 'custom' || style_custom.trim().length > 0);
    this.setData({ canSubmit });
  },

  async onSubmit() {
    if (!this.data.canSubmit) return;

    const params: CreateAlbumParams = {
      name: this.data.form.name.trim(),
      theme: this.data.form.theme.trim(),
      background: this.data.form.background.trim(),
      relations: this.data.form.relations.trim(),
      highlights: this.data.form.highlights.trim(),
      avoid_expressions: this.data.form.avoid_expressions.trim() || null,
      style: this.data.form.style,
      style_custom: this.data.form.style === 'custom' ? this.data.form.style_custom.trim() : null,
      content_length: this.data.form.content_length,
      arrangement: this.data.form.arrangement,
    };

    wx.showLoading({ title: '保存中...' });
    try {
      if (this.data.isEdit) {
        await updateAlbum(this.data.albumId, params);
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        wx.navigateBack();
      } else {
        const res = await createAlbum(params);
        wx.hideLoading();
        wx.showToast({ title: '已创建', icon: 'success' });
        wx.redirectTo({ url: `/pages/upload/index?album_id=${res.album_id}` });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('onSubmit failed', err);
      wx.showToast({ title: errText(err, '保存失败'), icon: 'none' });
    }
  },
});
