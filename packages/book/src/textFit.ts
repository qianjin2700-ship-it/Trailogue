import { MAGAZINE_TYPE, MM_TO_PT, PAGE } from './tokens.js';

/**
 * 确定性文字排布估算。
 *
 * 为什么需要它：Magazine 是**固定高度**的页面（Letter 279.4mm），
 * 正文一旦超出版心就会被 CSS 裁掉 —— 用户会丢内容。
 * 浏览器/WebView 里没有可靠的「同步测量文字高度」手段
 * （await 字体、异步 layout 都会让渲染变成不确定的），
 * 所以这里用**字符宽度估算**代替真实测量：
 *
 *  - CJK 字符宽度 ≈ 1em，拉丁字符 ≈ 0.52em（Helvetica / PingFang 的平均值）；
 *  - 每行可用宽度（em）= 栏宽（pt）/ 字号（pt）；
 *  - 按段落累加，行数向上取整，最后乘一个保守系数。
 *
 * 估算只允许**高估**（多算行数），因为高估最多让版式提前分页，
 * 低估才会导致文字被裁。所以这里面没有「精确」目标，只有「安全」目标。
 */

const CJK_PATTERN =
  /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;

/** 拉丁文本右端参差造成的宽度浪费（CJK 换行不留空隙，不适用） */
const RAGGED_FACTOR = 1.04;

export function isCjkChar(character: string): boolean {
  return CJK_PATTERN.test(character);
}

/** 单个字符的宽度（单位 em） */
export function charWidthEm(character: string): number {
  if (character === '\t') return 2;
  return isCjkChar(character) ? 1 : 0.52;
}

function cjkRatio(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  const cjk = chars.filter(isCjkChar).length;
  return cjk / chars.length;
}

/** 一行能放多少个「混合字宽」的字符 */
export function charsPerLine(lineWidthEm: number): number {
  return Math.max(1, Math.floor(lineWidthEm));
}

/** 把毫米宽度换算成 em 数（每行可容纳宽度） */
export function widthMmToLineEm(widthMm: number, fontSizePt: number): number {
  return (widthMm * MM_TO_PT) / fontSizePt;
}

/** 一段文字的估算行数（只高估不低估） */
export function estimateLineCount(text: string, lineWidthEm: number): number {
  if (!text) return 0;
  const factor = cjkRatio(text) >= 0.5 ? 1 : RAGGED_FACTOR;
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines += 1;
      continue;
    }
    let em = 0;
    for (const character of paragraph) em += charWidthEm(character);
    lines += Math.max(1, Math.ceil((em * factor) / lineWidthEm));
  }
  return lines;
}

/** 某类页面的正文容量（行 / 每行 em） */
export interface TextCapacity {
  lines: number;
  lineWidthEm: number;
  charsPerLine: number;
}

export type MagazineTextZone = 'hero' | 'image_text' | 'quote' | 'closing';

export function magazineTextCapacity(zone: MagazineTextZone): TextCapacity {
  const spec =
    zone === 'hero'
      ? { lines: MAGAZINE_TYPE.heroCapacityLines, widthMm: MAGAZINE_TYPE.heroTextWidthMm, sizePt: MAGAZINE_TYPE.bodySizePt }
      : zone === 'image_text'
        ? {
            lines: MAGAZINE_TYPE.imageTextCapacityLines,
            widthMm: MAGAZINE_TYPE.imageTextWidthMm,
            sizePt: MAGAZINE_TYPE.bodySizePt,
          }
        : zone === 'quote'
          ? {
              lines: MAGAZINE_TYPE.quoteCapacityLines,
              widthMm: PAGE.widthMm - PAGE.marginMm * 2,
              sizePt: MAGAZINE_TYPE.quoteSizePt,
            }
          : {
              lines: MAGAZINE_TYPE.closingCapacityLines,
              widthMm: MAGAZINE_TYPE.closingTextWidthMm,
              sizePt: MAGAZINE_TYPE.closingSizePt,
            };

  const lineWidthEm = widthMmToLineEm(spec.widthMm, spec.sizePt);
  return {
    lines: spec.lines,
    lineWidthEm,
    charsPerLine: charsPerLine(lineWidthEm),
  };
}

/** 断句：先段落，再句子，最后按字符硬切（保证任何输入都能被切开） */
function splitAtoms(text: string, lineWidthEm: number): string[] {
  const atoms: string[] = [];
  const sentencePattern = /[^。！？!?；;.\n]+[。！？!?；;.]?\s*/g;
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) continue;
    if (estimateLineCount(paragraph, lineWidthEm) <= 1) {
      atoms.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(sentencePattern) ?? [paragraph];
    for (const sentence of sentences) {
      if (estimateLineCount(sentence, lineWidthEm) <= 1) {
        atoms.push(sentence);
        continue;
      }
      // 单句仍然超宽：按字符硬切成「一行一段」，最后再被合并
      const chars = [...sentence];
      let buffer = '';
      let em = 0;
      for (const character of chars) {
        const width = charWidthEm(character);
        if (em + width > lineWidthEm && buffer) {
          atoms.push(buffer);
          buffer = '';
          em = 0;
        }
        buffer += character;
        em += width;
      }
      if (buffer) atoms.push(buffer);
    }
  }
  return atoms;
}

/**
 * 把正文切成「每页都不溢出、且不丢字」的若干段。
 *
 * 返回数组长度即页数；拼接（去掉分页产生的换行）等于原文字符序列，
 * 这一点由测试保证 —— 正文不能被排版吃掉。
 */
export function splitTextIntoPages(text: string, capacity: TextCapacity): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (estimateLineCount(trimmed, capacity.lineWidthEm) <= capacity.lines) return [trimmed];

  const atoms = splitAtoms(trimmed, capacity.lineWidthEm);
  const pages: string[] = [];
  let current: string[] = [];
  let used = 0;

  const flush = () => {
    if (current.length) {
      pages.push(current.join('').trim());
      current = [];
      used = 0;
    }
  };

  for (const atom of atoms) {
    const cost = estimateLineCount(atom, capacity.lineWidthEm);
    if (used + cost > capacity.lines) {
      flush();
    }
    if (cost > capacity.lines) {
      // 理论上不会发生（splitAtoms 已把原子切到 1 行），保险起见单独成页
      pages.push(atom.trim());
      continue;
    }
    current.push(atom);
    used += cost;
  }
  flush();

  return pages.filter((page) => page.length > 0);
}
