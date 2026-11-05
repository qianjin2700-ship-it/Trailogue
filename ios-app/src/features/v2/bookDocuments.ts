import type { BookPreviewDTO, StoryContentDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';

import {
  buildMagazineDocument,
  buildStoryDocument,
  sourceFromStory,
  type MagazineDocument,
  type StoryDocument,
} from './index';

export interface V2BookDocuments {
  story: StoryDocument;
  magazine: MagazineDocument;
}

/**
 * 1.0 API DTO -> 2.0 shared documents.
 *
 * This is the only iOS adapter between the existing API contract and
 * `@trailogue/book`. Preview and PDF both call it, so they cannot silently
 * drift into separate layout implementations again.
 */
export function createV2BookDocuments(
  story: StoryContentDTO,
  photos: Iterable<Photo>,
  options: {
    coverPhotoId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  } = {},
): V2BookDocuments {
  const source = sourceFromStory(story, [...photos], options);
  return {
    story: buildStoryDocument(source),
    magazine: buildMagazineDocument(source),
  };
}

export function createV2DocumentsFromBook(
  book: BookPreviewDTO,
  photos: Iterable<Photo>,
): V2BookDocuments {
  return createV2BookDocuments(book.story, photos, {
    coverPhotoId: book.coverPhotoId,
    startDate: book.startDate,
  });
}
