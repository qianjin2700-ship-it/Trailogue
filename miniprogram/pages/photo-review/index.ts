// pages/photo-review/index.ts — 元数据确认（三级降级交互 + 手动补充）
import { listPhotos, updatePhotoMeta, confirmMeta, requestMetaProcess, getMetaJobStatus, deletePhoto } from '../../services/photo';
import { errText } from '../../utils/request';
import { Photo } from '../../types';

/** 列表展示用照片：原始字段 + 预计算的展示字段（WXML 不能调函数） */
type DisplayPhoto = Photo & {
  _formattedTime: string;
  _locationLabel: string;
  _isDuplicate: boolean;
};

interface PageData {
  albumId: string;
  photos: DisplayPhoto[];
  summary: { high: number; low: number; unknown: number };
  /** 相册内重复照片数（按内容 hash 分组，每组超出 1 张的部分） */
  dupCount: number;
  loading: boolean;
  confirming: boolean;
  metaProcessing: boolean;
  metaProgress: string;
  // 编辑面板
  editing: boolean;
  editingPhoto: Photo | null;
  editTakenAt: string;
  editTakenTime: string;
  editCity: string;
  editPoi: string;
  editMarkUnknown: boolean;
  // 解析条卡死提示
  metaStuck: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    photos: [],
    summary: { high: 0, low: 0, unknown: 0 },
    dupCount: 0,
    loading: true,
    confirming: false,
    metaProcessing: false,
    metaProgress: '',
    editing: false,
    editingPhoto: null,
    editTakenAt: '',
    editTakenTime: '',
    editCity: '',
    editPoi: '',
    editMarkUnknown: false,
    metaStuck: false,
  },

  onLoad(options: { album_id: string }) {
    this.setData({ albumId: options.album_id });
    this.loadPhotos();
    this.startMetaProcessing();
  },

  onUnload() {
    this.destroyed = true;
    if (this.metaTimer) {
      clearTimeout(this.metaTimer);
      this.metaTimer = null;
    }
  },

  /** 触发 EXIF 自动解析（云端异步执行），并轮询进度刷新列表 */
  async startMetaProcessing() {
    if (this.destroyed) return;
    try {
      const res = await requestMetaProcess(this.data.albumId);
      if (res.status === 'succeeded') return;
      if (res.job_id) {
        // 触发方式变更（2026-08-29）：云端 fire-and-forget 调 internal-processMeta 会被运行时冻结，
        // 改由前端直调触发。客户端 callFunction 超时不影响云端继续执行（函数超时 300s），
        // 失败静默——解析任务仍可由下次进入页面或重新触发恢复。
        wx.cloud.callFunction({
          name: 'internal-processMeta',
          data: { job_id: res.job_id },
        }).catch(() => undefined);
        this.pollMetaJob(res.job_id);
      }
    } catch (err) {
      // 触发失败不阻塞页面，用户仍可手动补充
      console.error('requestMetaProcess failed', err);
    }
  },

  pollMetaJob(jobId: string) {
    if (this.destroyed) return;
    this.setData({ metaProcessing: true, metaProgress: '', metaStuck: false });
    let attempts = 0;
    let lastDone = -1;
    let stuckTicks = 0; // 连续没有进度推进的 tick 数

    const stopPolling = (clear = true) => {
      if (clear && this.metaTimer) {
        clearTimeout(this.metaTimer);
        this.metaTimer = null;
      }
      this.setData({ metaProcessing: false, metaStuck: false });
    };

    const tick = async () => {
      if (this.destroyed) return;
      attempts += 1;
      // 总超时保护：约 3 分钟仍没结果就停止轮询
      if (attempts > 60) {
        stopPolling(false);
        return;
      }
      try {
        const res = await getMetaJobStatus(jobId);
        if (this.destroyed) return;

        if (res.status === 'succeeded' || res.status === 'failed') {
          stopPolling(false);
          this.loadPhotos(); // 最终刷新一次
          return;
        }

        // 批进度推进时增量刷新列表（解析出的时间/地点实时出现）
        const { total, done } = res.batches;
        if (done > lastDone) {
          lastDone = done;
          stuckTicks = 0;
          this.setData({ metaProgress: total > 0 ? `${done}/${total}` : '', metaStuck: false });
          if (done > 0) this.loadPhotos();
        } else {
          stuckTicks += 1;
          // 30 秒无进度：提示用户可能卡住
          if (stuckTicks === 10) {
            this.setData({ metaStuck: true });
          }
          // 60 秒无进度：停止轮询，让用户可继续手动补充
          if (stuckTicks >= 20) {
            stopPolling(false);
            return;
          }
        }
      } catch (err) {
        // 轮询瞬时失败忽略；连续失败不阻塞，仍走超时保护
        console.error('pollMetaJob tick failed', err);
      }
      this.metaTimer = setTimeout(tick, 3000);
    };

    this.metaTimer = setTimeout(tick, 3000);
  },

  /** 用户手动关闭顶部解析提示条 */
  onCloseMetaBar() {
    if (this.metaTimer) {
      clearTimeout(this.metaTimer);
      this.metaTimer = null;
    }
    this.setData({ metaProcessing: false, metaStuck: false });
  },

  async loadPhotos() {
    this.setData({ loading: true });
    try {
      const res = await listPhotos(this.data.albumId);
      this.computeSummary(res.photos);
      // WXML 不能调用 TS 函数，展示字段需在此处预计算
      // 同时按内容 hash 标记重复照片（同 hash 按列表顺序保留第一张，其余标记）
      const seen = new Set<string>();
      let dupCount = 0;
      const photos = res.photos.map((p) => {
        const hash = p.file_hash || '';
        const trackable = hash !== '' && !hash.startsWith('local:') && !hash.startsWith('unreadable:');
        const isDuplicate = trackable && seen.has(hash);
        if (trackable) seen.add(hash);
        if (isDuplicate) dupCount++;
        return {
          ...p,
          _formattedTime: formatDateTime(p.taken_at),
          _locationLabel: buildLocationLabel(p.location),
          _isDuplicate: isDuplicate,
        };
      });
      this.setData({ photos, dupCount, loading: false });
    } catch (err) {
      console.error('listPhotos failed', err);
      wx.showToast({ title: '照片加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  computeSummary(photos: Photo[]) {
    let high = 0, low = 0, unknown = 0;
    for (const p of photos) {
      if (p.taken_at_source === 'exif' || p.taken_at_source === 'user') high++;
      else if (p.taken_at_source === 'unknown' || !p.taken_at_source) unknown++;
      else low++;
    }
    this.setData({ summary: { high, low, unknown } });
  },

  /** 点照片行打开编辑面板 */
  onUpdateMeta(e: WechatMiniprogram.TouchEvent) {
    const photoId = e.currentTarget.dataset.id as string;
    const photo = this.data.photos.find((p) => p._id === photoId) || null;
    if (!photo) return;

    const [date, time] = parseIsoToDateTime(photo.taken_at);
    const loc = (photo.location || {}) as { city?: string; poi?: string };
    this.setData({
      editing: true,
      editingPhoto: photo,
      editTakenAt: date,
      editTakenTime: time,
      editCity: loc.city || '',
      editPoi: loc.poi || '',
      editMarkUnknown: photo.taken_at_source === 'unknown' && !photo.taken_at,
    });
  },

  onCloseEdit() {
    this.setData({
      editing: false,
      editingPhoto: null,
      editTakenAt: '',
      editTakenTime: '',
      editCity: '',
      editPoi: '',
      editMarkUnknown: false,
    });
  },

  noop() {
    // 阻止编辑面板点击冒泡到遮罩
  },

  /** 删除照片（行内"删除"按钮，catchtap 不触发整行编辑） */
  async onDeletePhoto(e: WechatMiniprogram.TouchEvent) {
    const photoId = e.currentTarget.dataset.id as string;
    const photo = this.data.photos.find((p) => p._id === photoId);
    if (!photo) return;

    const { confirm } = await wx.showModal({
      title: '删除照片',
      content: '删除后该照片将从相册中移除（含云端文件），不可恢复。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#e64340',
      cancelText: '取消',
    });
    if (!confirm) return;

    try {
      await deletePhoto(photoId);
      const photos = this.data.photos.filter((p) => p._id !== photoId);
      this.computeSummary(photos);
      this.recomputeDuplicates(photos);
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (err) {
      console.error('deletePhoto failed', err);
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    }
  },

  /** 基于内容 hash 重算重复标记与计数（删除照片后调用） */
  recomputeDuplicates(photos: DisplayPhoto[]) {
    const seen = new Set<string>();
    let dupCount = 0;
    const next = photos.map((p) => {
      const hash = p.file_hash || '';
      const trackable = hash !== '' && !hash.startsWith('local:') && !hash.startsWith('unreadable:');
      const isDuplicate = trackable && seen.has(hash);
      if (trackable) seen.add(hash);
      if (isDuplicate) dupCount++;
      return { ...p, _isDuplicate: isDuplicate };
    });
    this.setData({ photos: next, dupCount });
  },

  /** 一键去重入口（页内横幅按钮）：删掉每组重复里靠后的照片，各保留一张 */
  async onDedupeAll() {
    const targets = this.data.photos.filter((p) => p._isDuplicate);
    if (targets.length === 0) return;
    const { confirm } = await wx.showModal({
      title: '一键去重',
      content: `将删除 ${targets.length} 张重复照片（每种保留一张），确定继续？`,
      confirmText: '删除重复',
      confirmColor: '#e64340',
      cancelText: '取消',
    });
    if (!confirm) return;
    await this.dedupeAll(targets);
  },

  /** 批量删除重复照片，完成后刷新列表。返回是否全部成功 */
  async dedupeAll(targets: Photo[]): Promise<boolean> {
    wx.showLoading({ title: '去重中...', mask: true });
    let failed = 0;
    for (const p of targets) {
      try {
        await deletePhoto(p._id);
      } catch (err) {
        console.error('dedupe deletePhoto failed', p._id, err);
        failed++;
      }
    }
    wx.hideLoading();
    await this.loadPhotos();
    if (failed > 0) {
      wx.showToast({ title: `${failed} 张删除失败，请重试`, icon: 'none' });
      return false;
    }
    wx.showToast({ title: `已删除 ${targets.length} 张重复照片`, icon: 'success' });
    return true;
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ editTakenAt: e.detail.value as string });
  },

  onTimeChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ editTakenTime: e.detail.value as string });
  },

  onCityInput(e: WechatMiniprogram.Input) {
    this.setData({ editCity: e.detail.value });
  },

  onPoiInput(e: WechatMiniprogram.Input) {
    this.setData({ editPoi: e.detail.value });
  },

  onMarkUnknownChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ editMarkUnknown: e.detail.value });
  },

  /** 保存手动补充的元数据 */
  async onSaveMeta() {
    const photo = this.data.editingPhoto;
    if (!photo) return;

    const payload = buildUpdatePayload(this.data, photo);
    if (!payload) return;

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await updatePhotoMeta({ photo_id: photo._id, ...payload });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      this.onCloseEdit();
      this.loadPhotos();
    } catch (err) {
      wx.hideLoading();
      console.error('updatePhotoMeta failed', err);
      wx.showToast({ title: errText(err, '保存失败'), icon: 'none' });
    }
  },

  async onConfirmAndGenerate() {
    // 前置拦截：照片数量不足（云函数要求 ≥5）。提前说清楚，不发无效请求
    if (this.data.photos.length < 5) {
      const lack = 5 - this.data.photos.length;
      wx.showModal({
        title: '照片数量不足',
        content: `生成故事至少需要 5 张照片，当前只有 ${this.data.photos.length} 张，再添加 ${lack} 张就可以生成了。`,
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    // 重复照片拦截：有重复时先问用户是否去重再继续
    const dupTargets = this.data.photos.filter((p) => p._isDuplicate);
    if (dupTargets.length > 0) {
      const { confirm } = await wx.showModal({
        title: '检测到重复照片',
        content: `相册中有 ${dupTargets.length} 张重复照片（每种保留一张）。建议先去重再生成故事，避免同一张照片重复出现在故事里。`,
        confirmText: '去重后继续',
        cancelText: '保留重复',
      });
      if (confirm) {
        const ok = await this.dedupeAll(dupTargets);
        if (!ok) return; // 有删除失败，中止本次确认，待用户重试
      }
    }

    const { unknown } = this.data.summary;
    if (unknown > 0) {
      const { confirm } = await wx.showModal({
        title: '还有未知元数据',
        content: `有 ${unknown} 张照片的拍摄时间/地点未知，可能影响故事生成效果。是否继续？`,
        confirmText: '继续生成',
        cancelText: '去补充',
      });
      if (!confirm) return;
    }

    this.setData({ confirming: true });
    try {
      await confirmMeta(this.data.albumId);
      wx.showToast({ title: '已确认', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/story-generating/index?album_id=${this.data.albumId}` });
      }, 800);
    } catch (err) {
      console.error('confirmMeta failed', err);
      // 用 modal 显示服务端返回的具体原因（如「至少需要5张照片」），
      // toast icon 模式放不下长文案，且不再吞掉真实原因
      wx.showModal({
        title: '确认失败',
        content: errText(err, '生成故事前确认失败，请重试'),
        showCancel: false,
        confirmText: '知道了',
      });
    } finally {
      this.setData({ confirming: false });
    }
  },
});

/** 把 ISO 时间拆成日期、时间两部分 */
function parseIsoToDateTime(iso?: string | null): [string, string] {
  if (!iso) return ['', ''];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return ['', ''];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return [`${yyyy}-${mm}-${dd}`, `${hh}:${mi}`];
}

/** 格式化用于列表展示 */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '未知时间';
  const [date, time] = parseIsoToDateTime(iso);
  if (!date) return '未知时间';
  return time ? `${date} ${time}` : date;
}

/** 地点展示标签：市 + 具体地点 */
function buildLocationLabel(loc?: { city?: string | null; district?: string | null; poi?: string | null } | null): string {
  if (!loc) return '未知地点';
  const parts = [loc.city, loc.poi].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : '未知地点';
}

function buildUpdatePayload(
  data: PageData,
  photo: Photo
): Record<string, unknown> | null {
  const { editTakenAt, editTakenTime, editCity, editPoi, editMarkUnknown } = data;
  const payload: Record<string, unknown> = {};

  if (editMarkUnknown) {
    payload.mark_unknown = ['taken_at', 'location'];
    return payload;
  }

  // 时间：有输入则必须同时有日期和时间
  if (editTakenAt || editTakenTime) {
    if (!editTakenAt || !editTakenTime) {
      wx.showToast({ title: '请同时选择日期和时间', icon: 'none' });
      return null;
    }
    payload.taken_at = `${editTakenAt}T${editTakenTime}:00`;
  } else if (photo.taken_at) {
    // 用户清空了原本存在的时间
    payload.taken_at = null;
  }

  // 地点：有输入则保存；原本有而现在清空则标记为未知
  if (editCity || editPoi) {
    payload.location = {
      city: editCity || null,
      poi: editPoi || null,
    };
  } else if (photo.location && (photo.location.city || photo.location.poi)) {
    payload.location = null;
  }

  return payload;
}
