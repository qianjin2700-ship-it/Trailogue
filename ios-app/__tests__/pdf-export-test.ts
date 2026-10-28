import type { Photo } from '@/domain/photo/photo';
import { materializeBookPhotos, withTimeout } from '@/features/books/pdfExport';

const photo = (id: string): Photo => ({
  id,
  tripId: 'trip-1',
  status: 'ready',
  url: `https://example.test/${id}.jpg`,
  originalFilename: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 1_000,
  width: 1_600,
  height: 900,
  capturedAt: null,
  createdAt: new Date(0),
  uploadedAt: new Date(0),
  caption: null,
  locationName: null,
});

describe('PDF photo preparation', () => {
  it('replaces expiring remote URLs with embedded image data', async () => {
    const source = new Map([
      ['photo-1', photo('photo-1')],
      ['photo-2', photo('photo-2')],
    ]);

    const result = await materializeBookPhotos(
      source,
      async (item) => `data:image/jpeg;base64,${item.id}`,
      100,
    );

    expect(result.skippedCount).toBe(0);
    expect(result.photos.get('photo-1')?.url).toBe('data:image/jpeg;base64,photo-1');
    expect(result.photos.get('photo-2')?.url).toBe('data:image/jpeg;base64,photo-2');
  });

  it('finishes with the remaining photos when one image cannot be prepared', async () => {
    const source = new Map([
      ['good', photo('good')],
      ['bad', photo('bad')],
    ]);

    const result = await materializeBookPhotos(
      source,
      async (item) => {
        if (item.id === 'bad') throw new Error('download failed');
        return 'data:image/jpeg;base64,good';
      },
      100,
    );

    expect(result.skippedCount).toBe(1);
    expect([...result.photos.keys()]).toEqual(['good']);
  });

  it('rejects a native operation that never settles instead of waiting forever', async () => {
    await expect(withTimeout(new Promise(() => undefined), 5, 'PDF timed out')).rejects.toThrow('PDF timed out');
  });
});
