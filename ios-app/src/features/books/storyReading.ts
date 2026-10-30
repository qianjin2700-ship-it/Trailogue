import type { StoryContentDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';

/**
 * 基础图文版（Story）渲染器。
 *
 * 与 Private Share 网页保持同一种阅读形态：照片按章节顺序穿插在故事文字之后，
 * 不做画册排版。这是首发版里最稳定、最易读的输出形态。
 */
export function renderStoryReadingHtml(
  story: StoryContentDTO | null,
  photos: Map<string, Photo>,
): string {
  if (!story) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:40px 22px;background:#f7f4ee;color:#29251f;font:18px/1.8 Georgia,serif;text-align:center">No story yet. Write or generate the story first.</body></html>`;
  }
  const figure = (photoId: string, caption?: string) => {
    const photo = photos.get(photoId);
    if (!photo) return '';
    return `<figure><img class="photo" data-photo-id="${escapeHtml(photoId)}" src="${escapeHtml(photo.url)}" alt="">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
  };
  const chapters = story.chapters.map((chapter) => `
    <section>
      <p class="meta">${escapeHtml([chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · '))}</p>
      <h2>${escapeHtml(chapter.title)}</h2>
      <p class="copy">${escapeHtml(chapter.narrative)}</p>
      ${chapter.photoIds.map((photoId) => figure(photoId, chapter.captions[photoId])).join('')}
    </section>`).join('');
  return `<!doctype html><html lang="${escapeHtml(story.meta.actualLanguage ?? 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0 auto;max-width:760px;padding:28px 20px 64px;background:#f7f4ee;color:#29251f;font:18px/1.8 Georgia,"Songti SC",serif}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 8px}
h2{font-size:1.4rem;line-height:1.3;margin:0 0 10px}
.subtitle{color:#7d5c3c;font-style:italic;margin:0 0 20px}
.meta{color:#8b6d50;font-size:.8rem;font-weight:700;margin:0 0 6px;letter-spacing:.04em}
.copy{margin:0 0 20px;white-space:pre-wrap}
section{border-top:1px solid #d8cdbe;margin-top:34px;padding-top:26px}
figure{margin:22px 0}img.photo{display:block;width:100%;height:auto;border-radius:10px;background:#eae3d8}
figcaption{color:#6f655a;font-size:.78rem;margin-top:8px;text-align:center}
</style></head><body>
<h1>${escapeHtml(story.title)}</h1>
${story.subtitle ? `<p class="subtitle">${escapeHtml(story.subtitle)}</p>` : ''}
${story.preface ? `<p class="copy">${escapeHtml(story.preface)}</p>` : ''}
${chapters}
${story.epilogue ? `<p class="copy" style="margin-top:32px">${escapeHtml(story.epilogue)}</p>` : ''}
<script>(()=>{const send=(value)=>window.ReactNativeWebView?.postMessage(JSON.stringify(value));document.querySelectorAll('img.photo').forEach((image)=>{image.addEventListener('error',()=>{image.style.display='none';send({type:'photo-error',photoId:image.getAttribute('data-photo-id')||''});},{once:true});});})();true;</script>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]!);
}
