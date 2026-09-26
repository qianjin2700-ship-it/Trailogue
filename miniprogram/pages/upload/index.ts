// pages/upload/index.ts — 上传与处理进度
import { commitUpload, deletePhoto, requestMetaProcess } from '../../services/photo';
import { Photo, UploadStatus } from '../../types';
import { compressToThumb, computeFileHash, checkFileFormat, MAX_FILE_SIZE, SUPPORTED_FORMATS } from '../../utils/compress';
import { getFileTimeHint } from '../../utils/exif-hint';


interface UploadItem {
  localPath: string;
  thumbPath: string;
  status: UploadStatus;
  progress: number;
  failReason: string | null;
  photoId?: string;
  fileFormat: string;
  fileSize: number;
  fileHash: string;
  /** 上传前探测的本地文件时间（client_hint，prepare 阶段算好缓存） */
  clientTakenAt: string | null;
  /** 当前上传速率展示（如 "1.2MB/s"） */
  speedText?: string;
}

interface PageData {
  albumId: string;
  items: UploadItem[];
  photoCount: number;
  successCount: number;
  failCount: number;
  isUploading: boolean;
  showPrivacyNotice: boolean;
  showDuplicateDialog: boolean;
  duplicateItems: UploadItem[];
  statusText: Record<string, string>;
}

const MAX_PHOTOS = 50;

/** 并发上传数：3 路同时传，兼顾速度与 COS 连接稳定性 */
const UPLOAD_CONCURRENCY = 3;

/**
 * 上传重试前间隔（毫秒）。
 * 只在第一次失败后、下一次重试前等待，正常成功路径不减速。
 * 连续调用 cloud.uploadFile 时 COS 可能复用空闲 socket 并掐断连接，重试前错开时间片可规避 ECONNRESET/RequestTimeout。
 */
const UPLOAD_GAP_MS = 300;

/** 上传失败重试参数 */
const UPLOAD_RETRIES = 3;

/** 卡死看门狗：进度 N 毫秒无推进则 abort 当前上传走重试 */
const UPLOAD_STALL_MS = 30 * 1000;

/** 进度回调节流：百分比变化超过该值才 setData */
const PROGRESS_STEP = 3;

/** 格式化速率 */
function formatSpeed(kbPerSec: number): string {
  if (kbPerSec >= 1024) return `${(kbPerSec / 1024).toFixed(1)}MB/s`;
  return `${Math.round(kbPerSec)}KB/s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从上传错误中提取用户可读原因 */
function describeUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '上传失败');
  if (/ECONNRESET|RequestTimeout|socket connection|timeout/i.test(msg)) {
    return '网络连接中断，请点击重试';
  }
  if (/status 4\d\d/.test(msg)) {
    return '云存储拒绝请求，请稍后重试';
  }
  return msg || '上传失败';
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    items: [],
    photoCount: 0,
    successCount: 0,
    failCount: 0,
    isUploading: false,
    showPrivacyNotice: false,
    showDuplicateDialog: false,
    duplicateItems: [],
    statusText: {
      pending: '排队中',
      uploading: '上传中',
      uploaded: '已上传',
      failed: '失败',
      checking: '查重中',
      duplicate: '重复',
    },
  },

  onLoad(options: { album_id: string }) {
    this.setData({ albumId: options.album_id });
    // ⚠️ 必须与首页统一以服务端隐私同意状态为准（globalData.needPrivacyAgree）：
    // 原实现读本地 storage 的 privacy_agreed，与服务端 privacy_agreed_at 完全不通，
    // 新用户在首页同意后到这里还会再弹一次；且本页未绑 disagree 事件，
    // 点「不同意」弹窗不关闭，用户直接卡死在上传页。
    const app = getApp<IAppOption>();
    if (app.globalData.needPrivacyAgree) {
      this.setData({ showPrivacyNotice: true });
    }
  },

  onPrivacyAgree() {
    const app = getApp<IAppOption>();
    app.globalData.needPrivacyAgree = false;
    this.setData({ showPrivacyNotice: false });
  },

  /** 未同意隐私告知：不能进入上传流程（验收标准 F01），退回首页 */
  onPrivacyDisagree() {
    wx.showToast({ title: '同意后才能上传照片', icon: 'none' });
    wx.reLaunch({ url: '/pages/index/index' });
  },

  async onChoosePhotos() {
    if (this.data.photoCount >= MAX_PHOTOS) {
      wx.showToast({ title: '已达50张上限，可删除或更换照片', icon: 'none' });
      return;
    }

    const remaining = MAX_PHOTOS - this.data.photoCount;
    try {
      const res = await wx.chooseMedia({
        // chooseMedia 的 count 上限是 20：传更大的值真机上会被静默截断而非报错，
        // 超过 20 张时用户需分多次选择
        count: Math.min(remaining, 20),
        mediaType: ['image'],
        sourceType: ['album'],
        // 只用原图：compressed 压缩图会丢失 EXIF（拍摄时间/GPS），元数据解析依赖 EXIF
        sizeType: ['original'],
      });

      // 阶段 1：本地准备（格式/大小检查 + 压缩缩略图 + hash + 时间探测）
      // 全部准备完一次性加入列表，避免边压缩边上传导致界面只出现一张
      const prepared: UploadItem[] = [];
      for (const file of res.tempFiles) {
        if (this.data.photoCount + prepared.length >= MAX_PHOTOS) break;
        const item = await this.preparePhoto(file.tempFilePath, file.size);
        prepared.push(item);
      }
      this.setData({
        items: [...this.data.items, ...prepared],
        photoCount: this.data.photoCount + prepared.length,
      });

      // 阶段 2：并发上传（3 路同时传）
      await this.runUploadQueue(prepared);
    } catch (err) {
      // 用户取消选择是正常路径，静默；其余失败（权限/系统异常）给用户提示
      const msg = err instanceof Error ? err.message : String(err || '');
      if (!/cancel/i.test(msg)) {
        console.error('chooseMedia failed', err);
        wx.showToast({ title: '打开相册失败，请重试', icon: 'none' });
      }
    }
  },

  /** 本地准备：校验 + 压缩缩略图 + hash + 时间探测（不做任何网络操作） */
  async preparePhoto(filePath: string, fileSize: number): Promise<UploadItem> {
    // 1. 格式检查
    const format = checkFileFormat(filePath);
    if (!format) {
      return {
        localPath: filePath,
        thumbPath: filePath,
        status: 'failed',
        progress: 0,
        failReason: '格式不支持（仅 JPEG/PNG/HEIC）',
        fileFormat: 'unknown',
        fileSize,
        fileHash: '',
        clientTakenAt: null,
      };
    }

    // 2. 大小检查
    if (fileSize > MAX_FILE_SIZE) {
      return {
        localPath: filePath,
        thumbPath: filePath,
        status: 'failed',
        progress: 0,
        failReason: `文件超过20MB（${(fileSize / 1024 / 1024).toFixed(1)}MB）`,
        fileFormat: format,
        fileSize,
        fileHash: '',
        clientTakenAt: null,
      };
    }

    // 3. 压缩缩略图
    let thumbPath = filePath;
    try {
      thumbPath = await compressToThumb(filePath);
    } catch (err) {
      console.warn('compress failed', err);
    }

    // 4. 计算内容 hash（采样指纹，重复照片识别依据）
    const hash = await computeFileHash(filePath, fileSize);

    // 5. 探测本地文件时间（client_hint 兜底，提前算好避免上传路径上多做 IO）
    let clientTakenAt: string | null = null;
    try {
      clientTakenAt = await getFileTimeHint(filePath);
    } catch (err) {
      console.warn('getFileTimeHint failed', err);
    }

    return {
      localPath: filePath,
      thumbPath,
      status: 'pending',
      progress: 0,
      failReason: null,
      fileFormat: format,
      fileSize,
      fileHash: hash,
      clientTakenAt,
    };
  },

  /** 并发上传队列：固定 worker 数消费任务列表 */
  async runUploadQueue(items: UploadItem[]) {
    const queue = items.filter((i) => i.status !== 'failed');
    if (queue.length === 0) {
      this.updateCounters();
      return;
    }
    this.setData({ isUploading: true });
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await this.uploadItem(item);
      }
    };
    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, queue.length) },
      () => worker()
    );
    await Promise.all(workers);
    this.setData({ isUploading: false });
  },

  /** 带进度/速率/卡死看门狗的上传：进度 30s 无推进自动 abort 并重试 */
  async uploadFileWithRetry(
    cloudPath: string,
    filePath: string,
    onProgress?: (percent: number, speedKb: number) => void
  ): Promise<string> {
    let lastErr: unknown = new Error('上传失败');
    for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
      // 只有重试前才等待；首次尝试保持原速，避免正常网络下额外变慢
      if (attempt > 1) {
        await sleep(UPLOAD_GAP_MS);
      }
      try {
        const fileID = await new Promise<string>((resolve, reject) => {
          let lastMove = Date.now();
          const startedAt = Date.now();
          let watchdog: ReturnType<typeof setInterval> | null = null;
          const cleanup = () => {
            if (watchdog) clearInterval(watchdog);
          };

          // 回调风格调用返回 UploadTask（可用 onProgressUpdate / abort）
          const task = wx.cloud.uploadFile({
            cloudPath,
            filePath,
            success: (r) => {
              cleanup();
              resolve(r.fileID);
            },
            fail: (e) => {
              cleanup();
              reject(new Error(e.errMsg || '上传失败'));
            },
          });

          if (task && typeof task.onProgressUpdate === 'function') {
            task.onProgressUpdate((res) => {
              lastMove = Date.now();
              if (onProgress && res.progress > 0) {
                const secs = Math.max(0.5, (Date.now() - startedAt) / 1000);
                onProgress(res.progress, res.totalBytesSent / 1024 / secs);
              }
            });
          }

          // 看门狗：卡死（进度长时间无推进）时主动中断，fail 回调触发后走重试
          watchdog = setInterval(() => {
            if (Date.now() - lastMove > UPLOAD_STALL_MS) {
              try { task.abort(); } catch (e) { /* abort 失败忽略 */ }
            }
          }, 3000);
        });
        return fileID;
      } catch (err) {
        lastErr = err;
        console.warn(`uploadFile attempt ${attempt}/${UPLOAD_RETRIES} failed`, err);
        if (attempt < UPLOAD_RETRIES) {
          // 递增退避：第 1 次失败后等 1s，第 2 次等 2s
          await sleep(attempt * 1000);
        }
      }
    }
    throw lastErr;
  },

  async uploadItem(item: UploadItem) {
    let index = this.findItemIndex(item);
    if (index < 0) return; // 已不在列表中
    try {
      this.updateItem(index, { status: 'uploading', progress: 10, failReason: null, speedText: '' });

      // 进度节流：百分比跨过 PROGRESS_STEP 才刷新界面
      let lastShown = 0;
      const reportProgress = (lo: number, hi: number) => (pct: number, speedKb: number) => {
        const mapped = Math.min(hi, lo + Math.round(pct * (hi - lo) / 100));
        if (mapped - lastShown >= PROGRESS_STEP || mapped >= hi) {
          lastShown = mapped;
          this.updateItem(index, { progress: mapped, speedText: formatSpeed(speedKb) });
        }
      };

      // 上传原图（进度映射到 10~55）
      const originFileID = await this.uploadFileWithRetry(
        `albums/${this.data.albumId}/origin/${Date.now()}-${Math.random().toString(36).slice(6)}.jpg`,
        item.localPath,
        reportProgress(10, 55),
      );

      // 上传缩略图（进度映射到 55~80）
      const thumbFileID = await this.uploadFileWithRetry(
        `albums/${this.data.albumId}/thumb/${Date.now()}-${Math.random().toString(36).slice(6)}-thumb.jpg`,
        item.thumbPath,
        reportProgress(55, 80),
      );
      this.updateItem(index, { progress: 80, speedText: '' });

      // 提交到云函数（时间兜底已在 prepare 阶段探测好）
      const result = await commitUpload({
        album_id: this.data.albumId,
        file_id: originFileID,
        thumb_file_id: thumbFileID,
        file_size: item.fileSize,
        file_format: item.fileFormat as 'jpeg' | 'png' | 'heic',
        file_hash: item.fileHash,
        client_hint: { taken_at: item.clientTakenAt },
      });

      this.updateItem(index, {
        status: 'uploaded',
        progress: 100,
        photoId: result.photo_id,
      });

      // 重复照片处理
      if (result.is_duplicate) {
        this.handleDuplicate(item, result.duplicate_of, result.photo_id);
      }
    } catch (err) {
      console.error('uploadItem failed', err);
      this.updateItem(index, {
        status: 'failed',
        failReason: describeUploadError(err),
      });
    }
    this.updateCounters();
  },

  handleDuplicate(item: UploadItem, duplicateOf: string | null, photoId: string) {
    // 弹窗让用户选择保留或删除。
    // ⚠️ photoId 必须从 commitUpload 结果显式带入：items 数组里的对象已被 updateItem
    // 替换成新对象，旧引用（item）上永远没有 photoId，直接 push 会导致删除时无 ID 可删。
    this.setData({
      showDuplicateDialog: true,
      duplicateItems: [...this.data.duplicateItems, { ...item, photoId }],
    });
  },

  onDuplicateKeep(e: WechatMiniprogram.CustomEvent) {
    // 组件 triggerEvent 数据在 e.detail（不在 currentTarget.dataset）
    // ⚠️ 必须按索引移除：detail.photo 是视图层副本，与逻辑层 data 里的对象不是同一引用，
    // 用 filter((d) => d !== item) 引用比较永远匹配不到，弹窗列表不会刷新。
    const detail = (e.detail || {}) as { index?: number };
    const idx = typeof detail.index === 'number' ? detail.index : -1;
    if (idx < 0 || idx >= this.data.duplicateItems.length) return;
    // 从弹窗列表移除该项；全部处理完才关闭弹窗
    const duplicateItems = this.data.duplicateItems.filter((_, i) => i !== idx);
    this.setData({ duplicateItems, showDuplicateDialog: duplicateItems.length > 0 });
  },

  async onDuplicateRemove(e: WechatMiniprogram.CustomEvent) {
    // 组件 triggerEvent 数据在 e.detail（不在 currentTarget.dataset）
    // ⚠️ 统一按索引取项：detail.photo 是视图层副本，不能用于引用比较（见 onDuplicateKeep 注释）
    const detail = (e.detail || {}) as { index?: number; photo?: UploadItem };
    const idx = typeof detail.index === 'number' ? detail.index : -1;
    if (idx < 0 || idx >= this.data.duplicateItems.length) return;
    const item = this.data.duplicateItems[idx];

    // 云端软删 + 清理云存储文件
    if (item && item.photoId) {
      try {
        await deletePhoto(item.photoId);
      } catch (err) {
        console.error('deletePhoto failed', err);
        wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        return; // 失败时保留弹窗，让用户可重试
      }
    }

    // 从上传列表移除该照片
    const itemIndex = this.findItemIndex(item);
    if (itemIndex >= 0) {
      const items = [...this.data.items];
      items.splice(itemIndex, 1);
      this.setData({
        items,
        photoCount: Math.max(0, this.data.photoCount - 1),
      });
      this.updateCounters();
    }
    // 按索引从弹窗列表移除该项；全部处理完才关闭弹窗
    const duplicateItems = this.data.duplicateItems.filter((_, i) => i !== idx);
    this.setData({ duplicateItems, showDuplicateDialog: duplicateItems.length > 0 });
  },

  async onRetryItem(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index as number;
    const item = this.data.items[index];
    if (item.status !== 'failed') return;
    this.updateItem(index, { status: 'uploading', progress: 0, failReason: null });
    await this.uploadItem(item);
  },

  async onRetryAll() {
    const failedItems = this.data.items.filter((i) => i.status === 'failed');
    for (const item of failedItems) {
      const index = this.data.items.indexOf(item);
      this.updateItem(index, { status: 'pending', progress: 0, failReason: null });
    }
    await this.runUploadQueue(failedItems);
  },

  onComplete() {
    wx.navigateBack();
  },

  // === 辅助方法 ===

  /** 定位 item 在列表中的下标：先按引用，再按 localPath+fileHash 兜底（updateItem 替换对象后引用会失效） */
  findItemIndex(item: UploadItem): number {
    const idx = this.data.items.indexOf(item);
    if (idx >= 0) return idx;
    return this.data.items.findIndex(
      (i) => i.localPath === item.localPath && i.fileHash === item.fileHash
    );
  },

  updateItem(index: number, patch: Partial<UploadItem>) {
    const items = [...this.data.items];
    items[index] = { ...items[index], ...patch };
    this.setData({ items });
  },

  updateCounters() {
    const successCount = this.data.items.filter((i) => i.status === 'uploaded').length;
    const failCount = this.data.items.filter((i) => i.status === 'failed').length;
    this.setData({ successCount, failCount });
  },
});
