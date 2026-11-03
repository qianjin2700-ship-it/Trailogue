import { createHash, randomBytes } from 'node:crypto';

import type { ShareLinkDTO, SharedStoryDTO, StoryContentDTO } from '@trailogue/contracts';
import type {
  PhotoRepository,
  ShareLinkRepository,
  StoryRepository,
  TripRepository,
} from '@trailogue/database';

import { HttpError } from '../../errors/httpError.js';
import type { PhotoObjectStorage } from '../photos/photoService.js';

export class ShareService {
  constructor(
    private readonly shares: Pick<
      ShareLinkRepository,
      'create' | 'findActiveByTokenHash' | 'revokeForUser' | 'incrementVisit'
    >,
    private readonly trips: Pick<TripRepository, 'findByIdForUser'>,
    private readonly stories: Pick<StoryRepository, 'findLatestForTrip' | 'findByIdForUser'>,
    private readonly photos: Pick<PhotoRepository, 'listReadyForTrip'>,
    private readonly storage: Pick<PhotoObjectStorage, 'createReadUrl'>,
    private readonly appBaseUrl: string,
    private readonly readUrlTtlSeconds: number,
  ) {}

  async create(userId: string, tripId: string): Promise<ShareLinkDTO> {
    if (!await this.trips.findByIdForUser(tripId, userId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
    }
    const story = await this.stories.findLatestForTrip(userId, tripId);
    if (!story) throw new HttpError(409, 'CONFLICT', 'Generate a story before sharing');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    const created = await this.shares.create({
      userId,
      tripId,
      storyId: story.id,
      tokenHash: hashToken(token),
      expiresAt,
    });
    return {
      id: created.id,
      url: `${this.appBaseUrl.replace(/\/+$/, '')}/share/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async revoke(userId: string, shareId: string): Promise<void> {
    if (!await this.shares.revokeForUser(shareId, userId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Share link not found');
    }
  }

  async resolve(token: string): Promise<SharedStoryDTO> {
    const link = await this.shares.findActiveByTokenHash(hashToken(token));
    if (!link) throw new HttpError(404, 'NOT_FOUND', 'Shared story not found or expired');
    const [trip, story, photos] = await Promise.all([
      this.trips.findByIdForUser(link.tripId, link.userId),
      this.stories.findByIdForUser(link.storyId, link.userId),
      this.photos.listReadyForTrip(link.userId, link.tripId, 50),
    ]);
    if (!trip || !story) throw new HttpError(404, 'NOT_FOUND', 'Shared story not found');
    await this.shares.incrementVisit(link.id);
    return {
      tripTitle: trip.title,
      story: story.content as unknown as StoryContentDTO,
      photos: await Promise.all(photos.map(async (photo) => ({
        id: photo.id,
        url: await this.storage.createReadUrl(photo.storageKey, this.readUrlTtlSeconds),
        width: photo.width,
        height: photo.height,
      }))),
    };
  }
}

export function renderSharedStoryHtml(shared: SharedStoryDTO): string {
  const photos = new Map(shared.photos.map((photo) => [photo.id, photo.url]));
  const chapters = shared.story.chapters.map((chapter) => `
    <section><p class="meta">${escapeHtml([chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · '))}</p>
    <h2>${escapeHtml(chapter.title)}</h2><p class="copy">${escapeHtml(chapter.narrative)}</p>
    ${chapter.photoIds.map((id) => photos.get(id)
      ? `<figure><img src="${escapeHtml(photos.get(id)!)}" alt="">${chapter.captions[id] ? `<figcaption>${escapeHtml(chapter.captions[id])}</figcaption>` : ''}</figure>`
      : '').join('')}</section>`).join('');
  return `<!doctype html><html lang="${escapeHtml(shared.story.meta.actualLanguage ?? 'zh-CN')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(shared.story.title)}</title><style>body{margin:0 auto;max-width:720px;padding:30px 22px 72px;background:#f7f4ee;color:#29251f;font:17px/1.75 Georgia,"Songti SC",serif}h1{font-size:2rem;line-height:1.25;margin:0 0 8px}.subtitle{color:#7d5c3c;font-style:italic;margin:0 0 24px}.meta{color:#8b6d50;font-size:.8rem;font-weight:700;letter-spacing:.04em;margin:0 0 6px}h2{font-size:1.4rem;line-height:1.3;margin:0 0 10px}.copy{margin:0 0 18px;white-space:pre-wrap}section{border-top:1px solid #d8cdbe;margin-top:34px;padding-top:26px}figure{margin:24px 0}img{border-radius:10px;width:100%}figcaption{color:#6f655a;font-size:.8rem;margin-top:8px;text-align:center}</style></head><body><h1>${escapeHtml(shared.story.title)}</h1>${shared.story.subtitle ? `<p class="subtitle">${escapeHtml(shared.story.subtitle)}</p>` : ''}${shared.story.preface ? `<p class="copy">${escapeHtml(shared.story.preface)}</p>` : ''}${chapters}${shared.story.epilogue ? `<p class="copy" style="margin-top:34px">${escapeHtml(shared.story.epilogue)}</p>` : ''}</body></html>`;
}

export function renderSharedMagazineHtml(shared: SharedStoryDTO): string {
  const photoMap = new Map(shared.photos.map((photo) => [photo.id, photo]));
  const firstChapterPhoto = shared.story.chapters[0]?.photoIds[0];
  const coverPhoto = (firstChapterPhoto ? photoMap.get(firstChapterPhoto) : undefined) ?? shared.photos[0];
  const coverUrl = coverPhoto?.url ?? '';
  const figure = (photoId: string, caption?: string) => {
    const photo = photoMap.get(photoId);
    if (!photo) return '';
    const aspect = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '4 / 3';
    return `<figure><div class="frame"><img loading="lazy" src="${escapeHtml(photo.url)}" style="aspect-ratio:${aspect}" alt=""></div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
  };
  const chapters = shared.story.chapters.map((chapter) => {
    const meta = [chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · ');
    return `<section class="chapter">${meta ? `<p class="eyebrow">${escapeHtml(meta)}</p>` : ''}<h2>${escapeHtml(chapter.title)}</h2><p class="body">${escapeHtml(chapter.narrative)}</p>${chapter.photoIds.map((id) => figure(id, chapter.captions[id])).join('')}</section>`;
  }).join('');
  return `<!doctype html><html lang="${escapeHtml(shared.story.meta.actualLanguage ?? 'zh-CN')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(shared.story.title)}</title><style>body{margin:0;background:#f3eee6;color:#17262c;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","PingFang TC","Yu Gothic",sans-serif;-webkit-font-smoothing:antialiased}.cover{position:relative;min-height:62vh;display:flex;align-items:flex-end;background:#14283b;color:#fff;overflow:hidden}.cover>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,17,25,.12) 30%,rgba(8,17,25,.92) 100%)}.cover-copy{position:relative;z-index:2;padding:26px 22px 34px;max-width:680px;width:100%}.cover .eyebrow{color:#fff;text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800;margin:0}.cover h1{font-family:Georgia,"Songti SC",serif;font-size:2.35rem;line-height:1.12;margin:10px 0 6px;letter-spacing:-.5px}.cover .subtitle{color:#e7d8c8;font-style:italic;font-size:1.02rem;margin:0}.preface{max-width:680px;margin:0 auto;padding:32px 22px 4px}.chapter{max-width:680px;margin:0 auto;padding:34px 22px;border-top:2px solid #d7643d}.preface+.chapter{border-top:none}.eyebrow{color:#d7643d;font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}h2{font-family:Georgia,"Songti SC",serif;font-size:1.7rem;line-height:1.2;margin:0 0 14px}.body{margin:0;font-size:1rem;line-height:1.78;color:#24343a;white-space:pre-wrap}figure{margin:26px 0}.frame{overflow:hidden;border-radius:8px;background:#e8e1d7}.frame img{display:block;width:100%;max-height:74vh;object-fit:cover;object-position:center}figcaption{margin-top:9px;color:#6f655a;font-size:.82rem;text-align:center}</style></head><body><header class="cover">${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="">` : ''}<div class="shade"></div><div class="cover-copy"><p class="eyebrow">${escapeHtml(shared.tripTitle)}</p><h1>${escapeHtml(shared.story.title)}</h1>${shared.story.subtitle ? `<p class="subtitle">${escapeHtml(shared.story.subtitle)}</p>` : ''}</div></header>${shared.story.preface ? `<section class="preface"><p class="body">${escapeHtml(shared.story.preface)}</p></section>` : ''}${chapters}${shared.story.epilogue ? `<section class="chapter epilogue"><p class="body">${escapeHtml(shared.story.epilogue)}</p></section>` : ''}</body></html>`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!);
}
