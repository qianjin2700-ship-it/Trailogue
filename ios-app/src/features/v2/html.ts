/**
 * HTML 输出的小工具。
 *
 * 两个渲染器（Story / Magazine）共用，避免各自实现转义导致某一端漏转义。
 * 用户内容（标题、正文、照片说明）一律经过 `escapeHtml`，
 * 只有我们自己拼的标签是「可信 HTML」。
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** 多行文本 → 保留换行的 HTML 段落内容 */
export function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r\n/g, '\n');
}

/** 只允许 http(s) 与 data: 图片，防止 javascript: 之类的伪协议进入 src */
export function safeImageUrl(value: string): string {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return escapeHtml(url);
  if (/^data:image\//i.test(url)) return escapeHtml(url);
  if (/^file:\/\//i.test(url)) return escapeHtml(url);
  return '';
}

export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
