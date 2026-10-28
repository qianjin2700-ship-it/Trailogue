import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Photo } from '@/domain/photo/photo';

const MAX_PRINT_EDGE = 1_600;
const PRINT_JPEG_QUALITY = 0.72;
const PHOTO_PREPARATION_CONCURRENCY = 3;

export type PdfPhotoLoader = (photo: Photo) => Promise<string>;

export interface MaterializedBookPhotos {
  photos: Map<string, Photo>;
  skippedCount: number;
}

export async function materializeBookPhotos(
  source: Map<string, Photo>,
  loader: PdfPhotoLoader = loadPhotoAsDataUri,
  timeoutMs = 15_000,
): Promise<MaterializedBookPhotos> {
  const entries = [...source.entries()];
  const prepared = new Array<[string, Photo] | null>(entries.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor++;
      const [id, photo] = entries[index];
      try {
        const dataUri = await withTimeout(
          loader(photo),
          timeoutMs,
          `Photo ${index + 1} took too long to prepare`,
        );
        if (!dataUri.startsWith('data:image/')) throw new Error('Invalid prepared image data');
        prepared[index] = [id, { ...photo, url: dataUri }];
      } catch {
        prepared[index] = null;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(PHOTO_PREPARATION_CONCURRENCY, entries.length) },
      () => worker(),
    ),
  );
  const photos = new Map(prepared.filter((entry): entry is [string, Photo] => entry !== null));
  return { photos, skippedCount: entries.length - photos.size };
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function loadPhotoAsDataUri(photo: Photo): Promise<string> {
  const safeId = photo.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const downloaded = new File(Paths.cache, `trailogue-pdf-${safeId}.jpg`);
  let renderedUri: string | null = null;
  let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
  let rendered: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | null = null;

  try {
    await File.downloadFileAsync(photo.url, downloaded, { idempotent: true });
    context = ImageManipulator.manipulate(downloaded.uri);
    const longestEdge = Math.max(photo.width ?? 0, photo.height ?? 0);
    if (longestEdge > MAX_PRINT_EDGE) {
      if ((photo.width ?? 0) >= (photo.height ?? 0)) context.resize({ width: MAX_PRINT_EDGE });
      else context.resize({ height: MAX_PRINT_EDGE });
    }
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      base64: true,
      compress: PRINT_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    renderedUri = saved.uri;
    if (!saved.base64) throw new Error('The prepared photo did not contain image data');
    return `data:image/jpeg;base64,${saved.base64}`;
  } finally {
    rendered?.release();
    context?.release();
    if (downloaded.exists) downloaded.delete();
    if (renderedUri) {
      const renderedFile = new File(renderedUri);
      if (renderedFile.exists) renderedFile.delete();
    }
  }
}
