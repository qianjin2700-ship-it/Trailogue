import { createPhotoUploadService } from '@/features/photos/photoUploadService';

const prepared = {
  clientUploadId: '74000000-0000-4000-8000-000000000007',
  uri: 'file:///normalized.jpg',
  originalFilename: 'normalized.jpg',
  mimeType: 'image/jpeg' as const,
  fileSize: 2_048,
  width: 1600,
  height: 1200,
};

describe('PhotoUploadService', () => {
  it('uploads, reports progress, and completes the photo', async () => {
    const createUploadIntent = jest.fn().mockResolvedValue({
      photoId: 'photo-1',
      uploadUrl: 'https://uploads.example/photo-1',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresAt: '2026-10-27T08:05:00.000Z',
      maxBytes: 15 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
    const completeUpload = jest.fn().mockResolvedValue({ id: 'photo-1' });
    const upload = jest.fn().mockImplementation(async (_input, onProgress) => {
      onProgress(0.5);
      onProgress(1);
    });
    const updates: number[] = [];
    const service = createPhotoUploadService({
      repository: { createUploadIntent, completeUpload, getPhotos: jest.fn() },
      transfer: { upload },
    });

    await expect(service.upload('trip-1', prepared, (progress) => updates.push(progress)))
      .resolves.toEqual({ id: 'photo-1' });
    expect(updates).toEqual([0.5, 1]);
    expect(createUploadIntent).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({
      uri: prepared.uri,
      url: 'https://uploads.example/photo-1',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      mimeType: 'image/jpeg',
    }, expect.any(Function));
    expect(completeUpload).toHaveBeenCalledWith('trip-1', 'photo-1');
  });

  it('reuses the same client upload id when a failed upload is retried', async () => {
    const createUploadIntent = jest.fn().mockResolvedValue({
      photoId: 'photo-1', uploadUrl: 'https://uploads.example/photo-1', method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' }, expiresAt: '2026-10-27T08:05:00.000Z',
      maxBytes: 15 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
    const upload = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const completeUpload = jest.fn().mockResolvedValue({ id: 'photo-1' });
    const service = createPhotoUploadService({
      repository: { createUploadIntent, completeUpload, getPhotos: jest.fn() },
      transfer: { upload },
    });

    await expect(service.upload('trip-1', prepared, jest.fn())).rejects.toThrow('offline');
    await expect(service.upload('trip-1', prepared, jest.fn())).resolves.toEqual({ id: 'photo-1' });
    expect(createUploadIntent.mock.calls.map((call) => call[1]))
      .toEqual([prepared.clientUploadId, prepared.clientUploadId]);
    expect(completeUpload).toHaveBeenCalledTimes(1);
  });
});
