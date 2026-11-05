/**
 * 日期与文案格式化。
 *
 * 为什么不用 `Intl`：Hermes 上的 Intl 支持随 iOS 版本漂移，
 * 而 PDF 与分享页要求同一份内容在设备端和服务端输出完全一致的字面量，
 * 所以这里用固定表 + 纯字符串处理。
 */

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface DateParts {
  year: string;
  month: number;
  day: number;
}

function parse(value: string | null | undefined): DateParts | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: match[1]!, month, day };
}

export function formatDateLabel(value: string | null | undefined, language: string): string | undefined {
  const parts = parse(value);
  if (!parts) return undefined;
  if (language.startsWith('zh')) return `${parts.year}年${parts.month}月${parts.day}日`;
  if (language === 'ja') return `${parts.year}年${parts.month}月${parts.day}日`;
  if (language === 'ko') return `${parts.year}년 ${parts.month}월 ${parts.day}일`;
  return `${EN_MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

/**
 * 旅行日期区间。同月合并年份与月份（`October 1 – 5, 2026`），
 * 跨月保留两段，跨年完整输出。
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  language: string,
): string | undefined {
  const from = parse(start);
  const to = parse(end);
  if (!from) return undefined;
  if (!to || (from.year === to.year && from.month === to.month && from.day === to.day)) {
    return formatDateLabel(start, language);
  }
  const cjk = language.startsWith('zh') || language === 'ja' || language === 'ko';
  if (cjk) return `${formatDateLabel(start, language)} – ${formatDateLabel(end, language)}`;
  if (from.year === to.year && from.month === to.month) {
    return `${EN_MONTHS[from.month - 1]} ${from.day} – ${to.day}, ${from.year}`;
  }
  if (from.year === to.year) {
    return `${EN_MONTHS[from.month - 1]} ${from.day} – ${EN_MONTHS[to.month - 1]} ${to.day}, ${from.year}`;
  }
  return `${formatDateLabel(start, language)} – ${formatDateLabel(end, language)}`;
}

/** 内容量文案：两种形态共用同一套表达，避免 1.0 里 Story/Magazine 信息类型不一致 */
export function contentSummary(chapterCount: number, photoCount: number): string {
  const chapters = `${chapterCount} ${chapterCount === 1 ? 'chapter' : 'chapters'}`;
  const photos = `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`;
  return `${chapters} · ${photos}`;
}
