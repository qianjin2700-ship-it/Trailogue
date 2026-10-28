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
      }))),
    };
  }
}

export function renderSharedStoryHtml(shared: SharedStoryDTO): string {
  const photos = new Map(shared.photos.map((photo) => [photo.id, photo.url]));
  const chapters = shared.story.chapters.map((chapter) => `
    <section><p class="meta">${escapeHtml([chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · '))}</p>
    <h2>${escapeHtml(chapter.title)}</h2><p>${escapeHtml(chapter.narrative)}</p>
    ${chapter.photoIds.map((id) => photos.get(id)
      ? `<figure><img src="${escapeHtml(photos.get(id)!)}" alt=""><figcaption>${escapeHtml(chapter.captions[id] ?? '')}</figcaption></figure>`
      : '').join('')}</section>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(shared.story.title)}</title><style>body{margin:auto;max-width:760px;padding:32px 20px 72px;background:#f7f4ee;color:#29251f;font:18px/1.8 Georgia,serif}h1,h2{text-align:center}h1{font-size:2.5rem}.subtitle,.meta{text-align:center;color:#765c43}section{border-top:1px solid #d8cdbe;margin-top:42px;padding-top:32px}img{border-radius:10px;width:100%}figure{margin:28px 0}figcaption{text-align:center;color:#6f655a;font-size:.8rem}</style></head><body><h1>${escapeHtml(shared.story.title)}</h1><p class="subtitle">${escapeHtml(shared.story.subtitle)}</p><p>${escapeHtml(shared.story.preface)}</p>${chapters}<p>${escapeHtml(shared.story.epilogue)}</p></body></html>`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]!);
}
