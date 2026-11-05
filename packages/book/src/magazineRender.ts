import { classNames, escapeHtml, escapeMultiline, safeImageUrl } from './html.js';
import { figureFit, imageTextFigureHeightMm } from './layoutEngine.js';
import { MAGAZINE_TOKENS, PAGE } from './tokens.js';
import type { BlockPhoto, MagazineDocument, MagazinePage } from './types.js';

export interface MagazineRenderOptions {
  /**
   * 预览模式：页面按 860px 视口缩放并加投影，与 1.0 Book Preview 的观感一致。
   * 打印模式输出带 `@page` 的纯净文档，交给 expo-print 或服务端。
   */
  preview?: boolean;
  /** 是否显示页码，默认显示（封面除外） */
  pageNumbers?: boolean;
}

/**
 * Magazine 渲染器：页序列 → 一本可打印的画册。
 *
 * 每个 `kind` 对应一个固定版式组件，**不允许**在这里做「按内容自由发挥」的排版。
 * 新增版式必须先在 MAGAZINE_DESIGN 里定义，再在这里实现一个 `case`。
 *
 * 图片填充策略由 `figureFit()` 决定：比例接近槽位时 `cover`（满幅），
 * 差异过大时 `contain`（留白居中）—— 这是「不产生异常裁图」的落地点。
 */
export function renderMagazineHtml(
  document: MagazineDocument,
  options: MagazineRenderOptions = {},
): string {
  const t = MAGAZINE_TOKENS;
  const showNumbers = options.pageNumbers !== false;
  let printed = 0;
  const pages = document.pages
    .map((page) => {
      const isCover = page.kind === 'cover';
      if (!isCover) printed += 1;
      return renderPage(page, document, isCover ? null : printed, showNumbers);
    })
    .join('\n');

  return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><meta name="viewport" content="${options.preview ? `width=${PAGE.previewWidthPx}, initial-scale=1, maximum-scale=1, user-scalable=no` : 'width=device-width, initial-scale=1'}"><title>${escapeHtml(document.title)}</title><style>
@page{size:letter;margin:0}
:root{color-scheme:light}
*{box-sizing:border-box}
html{background:${t.paperAlt}}
body{margin:0;padding:${options.preview ? '22px 0 26px' : '0'};background:${options.preview ? t.paperAlt : t.paper};color:${t.ink};font-family:${t.body};-webkit-font-smoothing:antialiased}
.page{width:${PAGE.widthMm}mm;height:${PAGE.heightMm}mm;overflow:hidden;break-after:page;position:relative;background:${t.paper};padding:${PAGE.marginMm}mm;margin:${options.preview ? '0 auto 26px' : '0'};${options.preview ? `box-shadow:0 8px 24px rgba(51,41,31,.18);` : ''}}
.page:last-of-type{margin-bottom:${options.preview ? '0' : 'auto'}}
@media print{.page{margin:0;box-shadow:none}}
.eyebrow{color:${t.accent};font-size:8pt;font-weight:800;letter-spacing:1.4px;margin:0 0 5mm;text-transform:uppercase}
h1,h2,h3,p,figure,blockquote{margin:0}
h1{font-family:${t.display};font-size:46pt;line-height:1.02;letter-spacing:-1.4px;overflow-wrap:break-word}
h2{font-family:${t.display};font-size:27pt;line-height:1.1;overflow-wrap:break-word}
h3{font-family:${t.display};font-size:15pt;line-height:1.2}
.copy{font-size:10.5pt;line-height:1.72;white-space:pre-wrap;overflow-wrap:break-word}
figure{overflow:hidden;position:relative;background:${t.rule}}
img.photo{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 50%}
img.photo.fit-contain{object-fit:contain;background:transparent}
figcaption{bottom:0;color:#fff;font-size:7.5pt;left:0;line-height:1.35;padding:8mm 4mm 3mm;position:absolute;right:0;background:linear-gradient(transparent,rgba(0,0,0,.68))}
.page-number{bottom:9mm;color:${t.accent};font-size:8pt;font-weight:700;position:absolute;right:11mm}
.photo-missing{background:${t.rule};display:flex;align-items:center;justify-content:center}
.photo-error{display:none}

/* Cover */
.cover{padding:0;background:${t.cover};color:#fff}
.cover figure{position:absolute;inset:0;background:${t.cover}}
.cover .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,20,30,.15) 40%,rgba(8,16,24,.92) 96%)}
.cover .cover-copy{position:absolute;bottom:20mm;left:${PAGE.marginMm}mm;right:${PAGE.marginMm}mm;z-index:2}
.cover h1{font-size:48pt}
.cover .subtitle{font-family:${t.display};font-size:14pt;line-height:1.4;margin-top:5mm;max-width:150mm;opacity:.92}
.cover .eyebrow{color:#fff;opacity:.86}
.cover.portrait figure img.photo{object-position:50% 32%}

/* Trip info */
.trip_info{background:${t.cover};color:#fff;display:flex;flex-direction:column;justify-content:space-between}
.trip_info .eyebrow{color:${t.accent}}
.trip_info .facts{display:grid;grid-template-columns:1fr 1fr;gap:9mm 6mm;margin-top:auto}
.trip_info .fact-label{color:rgba(255,255,255,.55);font-size:8pt;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:2mm}
.trip_info .fact-value{font-family:${t.display};font-size:15pt;line-height:1.25}
.trip_info .rule{background:${t.accent};height:2.4mm;width:32mm;margin-bottom:9mm}

/* Chapter divider */
.chapter_divider{display:flex;flex-direction:column;justify-content:center;background:${t.paper}}
.chapter_divider .index{color:${t.accent};font-family:${t.display};font-size:12pt;font-weight:700;letter-spacing:2px}
.chapter_divider h2{font-size:38pt;margin-top:6mm}
.chapter_divider .meta{color:${t.muted};font-size:9.5pt;letter-spacing:.8px;margin-top:6mm}
.chapter_divider .rule{background:${t.accent};height:2.4mm;width:26mm;margin:10mm 0 0}

/* Hero：满幅大图 + 文字压底 */
.hero{padding:0;color:#fff;background:${t.cover}}
.hero figure{position:absolute;inset:0;background:${t.cover}}
.hero .scrim{position:absolute;inset:0;background:linear-gradient(180deg,transparent 38%,rgba(8,16,24,.88) 92%)}
.hero .hero-copy{bottom:18mm;left:${PAGE.marginMm}mm;position:absolute;right:${PAGE.marginMm}mm;z-index:2}
.hero h2{font-size:30pt;max-width:160mm}
.hero .copy{color:#fff;margin-top:5mm;max-width:130mm;opacity:.94;display:-webkit-box;-webkit-line-clamp:9;-webkit-box-orient:vertical;overflow:hidden}
.hero.portrait figure img.photo{object-position:50% 34%}

/* Image + text：竖构图主图分栏 */
.image_text{display:grid;grid-template-columns:1.06fr .94fr;gap:9mm;align-items:center}
.image_text.right{grid-template-columns:.94fr 1.06fr}
.image_text figure{height:${PAGE.heightMm - PAGE.marginMm * 2}mm;max-height:${PAGE.heightMm - PAGE.marginMm * 2}mm}
.image_text .text{max-height:100%;overflow:hidden}
.image_text h2{font-size:24pt;margin-bottom:5mm}
.image_text .copy{border-top:2mm solid ${t.accent};padding-top:5mm;display:-webkit-box;-webkit-line-clamp:18;-webkit-box-orient:vertical;overflow:hidden}
.image_text.text-only figure{display:none}
.image_text.text-only{grid-template-columns:1fr}
.image_text.text-only .text{max-width:150mm}

/* Full width */
.full_width{padding:0;background:${t.cover}}
.full_width figure{position:absolute;inset:0;background:${t.cover}}
.full_width .scrim{position:absolute;bottom:0;height:26%;left:0;right:0;background:linear-gradient(transparent,rgba(8,16,24,.78))}
.full_width figcaption{z-index:2}

/* Two spread */
.two_spread{padding:0;display:grid;grid-template-columns:1fr 1fr;gap:0}
.two_spread figure{height:100%;background:${t.cover}}
.two_spread .caption-band{position:absolute;bottom:0;left:0;right:0;height:18%;background:linear-gradient(transparent,rgba(8,16,24,.7));z-index:2}

/* Three collage */
.three_collage{padding:${PAGE.marginMm}mm;display:grid;grid-template-columns:1.24fr .76fr;grid-template-rows:1fr 1fr;gap:3mm}
.three_collage figure:first-child{grid-row:1/3}
.three_collage.landscape_lead{grid-template-columns:1fr 1fr;grid-template-rows:1.32fr 1fr}
.three_collage.landscape_lead figure:first-child{grid-column:1/3;grid-row:auto}

/* Quote */
.quote{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;background:${t.accentWash}}
.quote blockquote{font-family:${t.display};font-size:26pt;line-height:1.34;white-space:pre-wrap;max-height:180mm;overflow:hidden}
.quote .rule{background:${t.accent};height:2.4mm;width:24mm;margin:10mm 0 8mm}
.quote .meta{color:${t.muted};font-size:9.5pt;letter-spacing:1px;text-transform:uppercase}

/* Closing */
.closing{display:grid;grid-template-rows:auto 1fr auto;gap:8mm}
.closing .closing-photos{display:grid;grid-template-columns:1fr 1fr;gap:4mm;height:118mm}
.closing .closing-copy{font-family:${t.display};font-size:11pt;line-height:1.7;white-space:pre-wrap;align-self:center;max-width:165mm;max-height:120mm;overflow:hidden}
.closing .sign{color:${t.accent};font-size:9pt;font-weight:800;letter-spacing:2px;text-transform:uppercase}
</style></head><body class="${options.preview ? 'preview' : 'print'}">
${pages}
</body></html>`;
}

function renderPage(
  page: MagazinePage,
  document: MagazineDocument,
  number: number | null,
  showNumbers: boolean,
): string {
  const label = number !== null && showNumbers ? `<span class="page-number">${String(number).padStart(2, '0')}</span>` : '';
  const lead = page.lead ?? 'portrait';
  switch (page.kind) {
    case 'cover':
      return `<section class="${classNames('page', 'cover', page.lead)}">${figure(page.kind, 0, page.photos[0], lead)}<div class="scrim"></div><div class="cover-copy">${page.eyebrow ? `<p class="eyebrow">${escapeHtml(page.eyebrow)}</p>` : ''}<h1>${escapeHtml(page.title ?? document.title)}</h1>${page.body ? `<p class="subtitle">${escapeHtml(page.body)}</p>` : ''}</div></section>`;

    case 'trip_info':
      return `<section class="${classNames('page', 'trip_info')}"><div><p class="eyebrow">Trip notes</p><h2>${escapeHtml(document.title)}</h2></div><div><div class="rule"></div><div class="facts">${fact('Dates', document.trip.dateLabel)}${fact('Places', document.trip.locationLabel)}${fact('Photos', String(document.trip.photoCount))}${fact('Chapters', String(document.trip.chapterCount))}</div></div>${label}</section>`;

    case 'chapter_divider':
      return `<section class="${classNames('page', 'chapter_divider')}"><p class="index">${String(number ?? 1).padStart(2, '0')}</p><h2>${escapeHtml(page.title ?? '')}</h2>${page.eyebrow ? `<p class="meta">${escapeHtml(page.eyebrow)}</p>` : ''}<div class="rule"></div>${label}</section>`;

    case 'hero':
      return `<section class="${classNames('page', 'hero', page.lead)}">${figure(page.kind, 0, page.photos[0], lead)}<div class="scrim"></div><div class="hero-copy">${page.eyebrow ? `<p class="eyebrow">${escapeHtml(page.eyebrow)}</p>` : ''}${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}${page.body ? `<p class="copy">${escapeMultiline(page.body)}</p>` : ''}</div>${label}</section>`;

    case 'image_text': {
      const leadPhoto = page.photos[0];
      const photo = figure(page.kind, 0, leadPhoto, lead, leadPhoto
        ? ` style="height:${imageTextFigureHeightMm(leadPhoto).toFixed(1)}mm"`
        : '');
      const text = `<div class="text">${page.eyebrow ? `<p class="eyebrow">${escapeHtml(page.eyebrow)}</p>` : ''}${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}${page.body ? `<p class="copy">${escapeMultiline(page.body)}</p>` : ''}</div>`;
      const hasPhoto = Boolean(page.photos[0]);
      const order = page.align === 'right' ? `${text}${photo}` : `${photo}${text}`;
      return `<section class="${classNames('page', 'image_text', page.align === 'right' && 'right', !hasPhoto && 'text-only')}">${order}${label}</section>`;
    }

    case 'full_width':
      return `<section class="${classNames('page', 'full_width')}">${figure(page.kind, 0, page.photos[0], lead)}<div class="scrim"></div>${label}</section>`;

    case 'two_spread':
      return `<section class="${classNames('page', 'two_spread')}">${page.photos
        .slice(0, 2)
        .map((photo, index) => figure(page.kind, index, photo, lead))
        .join('')}${label}</section>`;

    case 'three_collage':
      return `<section class="${classNames('page', 'three_collage', page.lead === 'landscape' ? 'landscape_lead' : '')}">${page.photos
        .slice(0, 3)
        .map((photo, index) => figure(page.kind, index, photo, lead))
        .join('')}${label}</section>`;

    case 'quote':
      return `<section class="${classNames('page', 'quote')}"><blockquote>${escapeMultiline(page.body ?? '')}</blockquote><div class="rule"></div>${page.eyebrow ? `<p class="meta">${escapeHtml(page.eyebrow)}</p>` : ''}${label}</section>`;

    case 'closing':
      return `<section class="${classNames('page', 'closing')}"><div class="closing-photos">${page.photos
        .slice(0, 2)
        .map((photo, index) => figure(page.kind, index, photo, lead))
        .join('')}</div>${page.body ? `<p class="closing-copy">${escapeMultiline(page.body)}</p>` : '<p class="closing-copy"></p>'}<p class="sign">Trailogue</p>${label}</section>`;

    default:
      return '';
  }
}

/**
 * 满幅页（封面 / hero / 整版单图）不渲染说明文字。
 *
 * 原因：这三类页面的图片铺满版心，页面底部同时承载书名、正文或页码，
 * 说明文字压上去一定会重叠。说明只出现在有独立图片框的版式里
 * （文图分栏 / 双图跨版 / 三图拼版 / 尾页）。
 */
const CAPTION_KINDS = new Set<MagazinePage['kind']>([
  'image_text',
  'two_spread',
  'three_collage',
  'closing',
]);

function figure(
  kind: MagazinePage['kind'],
  index: number,
  photo: BlockPhoto | undefined,
  lead: 'portrait' | 'landscape',
  boxStyle = '',
): string {
  if (!photo) return '<figure class="photo-missing"></figure>';
  const src = safeImageUrl(photo.url);
  if (!src) return '<figure class="photo-missing"></figure>';
  const caption = CAPTION_KINDS.has(kind) ? photo.caption?.trim() : undefined;
  const fit = figureFit(kind, index, photo, lead);
  const classes = classNames('photo', fit.strategy === 'contain' && 'fit-contain');
  return `<figure${boxStyle}><img class="${classes}" data-photo-id="${escapeHtml(photo.id)}" data-fit="${fit.strategy}" src="${src}" alt="">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

function fact(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<div><p class="fact-label">${escapeHtml(label)}</p><p class="fact-value">${escapeHtml(value)}</p></div>`;
}
