/**
 * utils/exif-hint.ts
 * 本地文件时间兜底（二级推断依据）
 */

/**
 * 从本地文件信息获取拍摄时间提示
 * 微信 wx.getFileSystemManager().getFileInfo 可获取修改时间
 * @param filePath 本地文件路径
 * @returns ISO8601 时间字符串或 null
 */
export function getFileTimeHint(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager();
    fs.stat({
      path: filePath,
      success: (res) => {
        // 使用 stats 的 lastAccessedTime/lastModifiedTime 作为兜底
        const stats = (Array.isArray(res.stats) ? res.stats[0] : res.stats) as unknown as Record<string, number>;
        const lastModified = stats.lastModifiedTime || stats.lastAccessedTime || 0;
        if (lastModified > 0) {
          resolve(new Date(lastModified * 1000).toISOString());
        } else {
          resolve(null);
        }
      },
      fail: () => {
        resolve(null);
      },
    });
  });
}

/**
 * 格式化日期为可读标签
 * @param iso ISO8601 字符串
 * @returns 如 "8月15日 14:32"
 */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${date}日 ${hour}:${min}`;
}

/**
 * 格式化日期范围
 * @param start ISO8601
 * @param end ISO8601
 * @returns 如 "8月15日 - 8月17日"
 */
export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sStr = `${s.getMonth() + 1}月${s.getDate()}日`;
  const eStr = `${e.getMonth() + 1}月${e.getDate()}日`;
  if (sStr === eStr) return sStr;
  return `${sStr} - ${eStr}`;
}
