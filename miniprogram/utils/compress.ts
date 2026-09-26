/**
 * utils/compress.ts
 * 本地缩略图压缩（长边 1080px）
 */

const THUMB_MAX_EDGE = 1080;

/**
 * 压缩图片为缩略图
 * @param filePath 原图本地路径
 * @returns 压缩后临时文件路径
 */
export function compressToThumb(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: (info) => {
        const { width, height } = info;
        const longEdge = Math.max(width, height);

        // 已小于阈值，不压缩
        if (longEdge <= THUMB_MAX_EDGE) {
          resolve(filePath);
          return;
        }

        const scale = THUMB_MAX_EDGE / longEdge;
        const targetWidth = Math.round(width * scale);
        const targetHeight = Math.round(height * scale);

        wx.compressImage({
          src: filePath,
          quality: 85,
          compressedWidth: targetWidth,
          compressedHeight: targetHeight,
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => {
            // 压缩失败则用原图
            console.warn('compressImage failed, using original', err);
            resolve(filePath);
          },
        });
      },
      fail: (err) => {
        reject(new Error(`getImageInfo failed: ${err.errMsg}`));
      },
    });
  });
}

/**
 * 计算文件内容 hash（采样版）：头/中/尾各读 256KB，三组不同种子的 FNV-1a 指纹 + 文件大小。
 * ⚠️ 旧实现是 `local:临时文件名:文件大小`，而 chooseMedia 每次选图生成随机新文件名，
 * 同一张照片重复选择时 hash 永远不同，导致云端查重（is_duplicate）完全失效 —— 已废弃。
 * 现返回内容指纹（content: 前缀），同内容文件必得同 hash；读文件失败时退化为唯一串保证上传不中断。
 */
export function computeFileHash(filePath: string, fileSize: number): Promise<string> {
  const CHUNK = 256 * 1024;
  const fs = wx.getFileSystemManager();

  const readChunk = (position: number, length: number): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        position,
        length,
        success: (res) => resolve(res.data as ArrayBuffer),
        fail: (err) => reject(new Error(err.errMsg || 'readFile failed')),
      });
    });

  /** FNV-1a 32 位滚动哈希 */
  const fnv1a = (buf: ArrayBuffer, seed: number): string => {
    const bytes = new Uint8Array(buf);
    let h = seed >>> 0;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  return (async () => {
    try {
      if (fileSize <= 0) return 'content:0:0';

      let bufs: ArrayBuffer[];
      if (fileSize <= CHUNK) {
        bufs = [await readChunk(0, fileSize)];
      } else {
        const mid = Math.floor((fileSize - CHUNK) / 2);
        bufs = [
          await readChunk(0, CHUNK),
          await readChunk(mid, CHUNK),
          await readChunk(fileSize - CHUNK, CHUNK),
        ];
      }

      const h1 = fnv1a(bufs[0], 0x811c9dc5);
      const h2 = fnv1a(bufs[bufs.length > 1 ? 1 : 0], 0x12345678);
      const h3 = fnv1a(bufs[bufs.length > 2 ? 2 : 0], 0x9e3779b9);
      return `content:${h1}${h2}${h3}:${fileSize}`;
    } catch (err) {
      // 读文件失败（模拟器/权限异常等）：退化为唯一串，仅失去查重能力，不阻塞上传
      console.warn('computeFileHash sampled read failed, fallback to unique', err);
      return `unreadable:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    }
  })();
}

/** 支持的文件格式 */
export const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'heic'] as const;

/** 最大文件大小 20MB */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * 检查文件格式
 */
export function checkFileFormat(filePath: string): 'jpeg' | 'png' | 'heic' | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.heic')) return 'heic';
  return null;
}
