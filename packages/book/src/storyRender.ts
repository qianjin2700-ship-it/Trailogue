import { classNames, escapeHtml, escapeMultiline, safeImageUrl } from './html.js';
import { STORY_METRICS, STORY_TOKENS } from './tokens.js';
import type { BlockPhoto, StoryBlock, StoryDocument } from './types.js';

export interface StoryRenderOptions {
  /**
   * 预览模式：注入与 1.0 Book Preview 相同的 postMessage 协议
   * （`photo-error` / `preview-ready`），并加上预览背板。
   * PDF 模式保持纯净，避免脚本进入打印文档。
   */
  preview?: boolean;
}

/**
 * Story 渲染器：块序列 → 一篇可读的长文。
 *
 * 视觉原则（对应 STORY_DESIGN）：
 *  - 单栏、固定行长（700px），不随屏幕变宽而拉长句子；
 *  - 正文 16.5px / 1.75，段落之间 18px，章节之间 40px 并带分隔线；
 *  - 照片宽度只有三档（大图 / 并排 / 图组），不做自由浮动。
 *
 * 与 Magazine 不同，Story 是**流式文档**（没有固定页高），
 * 所以不需要分页：长度天然由内容决定，不存在「文字溢出页」的问题。
 */
export function renderStoryHtml(document: StoryDocument, options: StoryRenderOptions = {}): string {
  const t = STORY_TOKENS;
  const body = document.blocks.map((block) => renderBlock(block)).join('\n');
  const script = options.preview
    ? `<script>(()=>{const send=(value)=>window.ReactNativeWebView?.postMessage(JSON.stringify(value));document.querySelectorAll('img.photo').forEach((image)=>{image.addEventListener('error',()=>{image.closest('figure')?.classList.add('photo-error');send({type:'photo-error',photoId:image.getAttribute('data-photo-id')||''});},{once:true});});send({type:'preview-ready',photoCount:${document.stats.photoCount}});})();true;</script>`
    : '';
  return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>
:root{color-scheme:light}
*{box-sizing:border-box}
html{background:${t.paperAlt}}
body{margin:0 auto;max-width:${STORY_METRICS.measurePx}px;padding:32px 22px 72px;background:${t.paper};color:${t.inkSoft};font-family:${t.body};font-size:${STORY_METRICS.bodySizePx}px;line-height:${STORY_METRICS.bodyLineHeight};-webkit-font-smoothing:antialiased}
.story-header{margin:0 0 26px}
.eyebrow{color:${t.accent};font-size:.8rem;font-weight:700;letter-spacing:.06em;margin:0 0 10px;text-transform:uppercase}
h1{color:${t.ink};font-family:${t.display};font-size:1.8rem;line-height:1.22;margin:0}
.subtitle{color:${t.accent};font-style:italic;margin:10px 0 0}
h2{color:${t.ink};font-family:${t.display};font-size:1.32rem;line-height:1.3;margin:0 0 10px}
p{margin:0}
.copy{margin:0 0 ${STORY_METRICS.paragraphGapPx}px;white-space:pre-wrap}
.chapter{border-top:1px solid ${t.rule};margin-top:${STORY_METRICS.sectionGapPx}px;padding-top:26px}
.chapter .meta{color:${t.accent};font-size:.8rem;font-weight:700;letter-spacing:.04em;margin:0 0 6px}
figure{margin:0;overflow:hidden}
img.photo{display:block;width:100%;height:auto;background:${t.paperAlt};border-radius:8px}
figcaption{color:${t.muted};font-size:.78rem;line-height:1.5;margin-top:8px;text-align:center}
.figure-large{margin:26px 0 26px}
.figure-large img.photo{border-radius:10px}
.figure-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:24px 0}
.figure-pair img.photo{height:100%;object-fit:cover;aspect-ratio:3/4}
.figure-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:24px 0}
.figure-gallery img.photo{height:100%;object-fit:cover;aspect-ratio:1/1;border-radius:6px}
.pull{border-left:3px solid ${t.accent};margin:32px 0;padding:4px 0 4px 18px}
.pull p{color:${t.ink};font-family:${t.display};font-size:1.18rem;line-height:1.5;white-space:pre-wrap}
.pull cite{color:${t.muted};display:block;font-size:.78rem;font-style:normal;margin-top:8px}
.closing{margin-top:38px;padding-top:26px;border-top:1px solid ${t.rule}}
.photo-error{display:none}
@media (max-width:520px){
  body{padding:24px 18px 56px;font-size:16px}
  h1{font-size:1.6rem}
  .figure-pair,.figure-gallery{grid-template-columns:1fr}
  .figure-pair img.photo,.figure-gallery img.photo{aspect-ratio:auto;height:auto}
}
${options.preview ? `body.preview{background:${t.paper}}` : ''}
</style></head><body class="${options.preview ? 'preview' : 'print'}">
${body}
${script}
</body></html>`;
}

function renderBlock(block: StoryBlock): string {
  switch (block.type) {
    case 'header':
      return `<header class="story-header">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ''}<h1>${escapeHtml(block.title)}</h1>${block.subtitle ? `<p class="subtitle">${escapeHtml(block.subtitle)}</p>` : ''}</header>`;
    case 'paragraph':
      return `<p class="copy">${escapeMultiline(block.text)}</p>`;
    case 'section':
      return `<section class="chapter">${block.eyebrow ? `<p class="meta">${escapeHtml(block.eyebrow)}</p>` : ''}<h2>${escapeHtml(block.title)}</h2>${block.text ? `<p class="copy">${escapeMultiline(block.text)}</p>` : ''}</section>`;
    case 'figure':
      return renderFigure(block.layout, block.photos);
    case 'quote':
      return `<blockquote class="pull"><p>${escapeMultiline(block.text)}</p>${block.attribution ? `<cite>${escapeHtml(block.attribution)}</cite>` : ''}</blockquote>`;
    case 'closing':
      return `<p class="copy closing">${escapeMultiline(block.text)}</p>`;
    default:
      return '';
  }
}

function renderFigure(layout: 'large' | 'pair' | 'gallery', photos: BlockPhoto[]): string {
  const figures = photos.map((photo) => renderPhoto(photo)).join('');
  if (layout === 'pair') return `<div class="figure-pair">${figures}</div>`;
  if (layout === 'gallery') return `<div class="figure-gallery">${figures}</div>`;
  return `<div class="${classNames('figure-large')}">${figures}</div>`;
}

function renderPhoto(photo: BlockPhoto): string {
  const src = safeImageUrl(photo.url);
  const caption = photo.caption?.trim();
  if (!src) {
    return `<figure class="photo-missing"><figcaption>${caption ? escapeHtml(caption) : 'Photo unavailable'}</figcaption></figure>`;
  }
  return `<figure><img class="photo" data-photo-id="${escapeHtml(photo.id)}" src="${src}" alt="">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}
