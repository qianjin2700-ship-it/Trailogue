import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { PhotoSection } from '@/features/photos/PhotoSection';

const prepared = {
  clientUploadId: '74000000-0000-4000-8000-000000000007',
  uri: 'file:///normalized.jpg',
  originalFilename: 'normalized.jpg',
  mimeType: 'image/jpeg' as const,
  fileSize: 2_048,
  width: 1600,
  height: 1200,
};
const mockGetPhotos = jest.fn();
const mockUpload = jest.fn();
const mockSelect = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  photoRepository: { getPhotos: (...args: unknown[]) => mockGetPhotos(...args) },
  photoUploadService: { upload: (...args: unknown[]) => mockUpload(...args) },
}));
jest.mock('@/features/photos/expoPhotoSelection', () => ({
  selectAndPreparePhotos: () => mockSelect(),
}));

describe('<PhotoSection />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPhotos.mockResolvedValue([]);
    mockSelect.mockResolvedValue([prepared]);
  });

  it('keeps a failed photo and retries it with the same prepared upload', async () => {
    mockGetPhotos
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'photo-1', tripId: 'trip-1', status: 'ready',
        url: 'https://reads.example/photo-1', originalFilename: 'normalized.jpg',
        mimeType: 'image/jpeg', fileSize: 2_048, width: 1600, height: 1200,
        capturedAt: null, createdAt: new Date(), uploadedAt: new Date(),
      }]);
    mockUpload
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_tripId, _photo, progress) => {
        progress(1);
        return { id: 'photo-1' };
      });
    const screen = render(<PhotoSection tripId="trip-1" />);
    await waitFor(() => expect(screen.getByText('Add up to five photos from your library.')).toBeTruthy());

    fireEvent.press(screen.getByText('Add Photos'));
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    expect(mockUpload.mock.calls[0][1]).toBe(prepared);
    expect(mockUpload.mock.calls[1][1]).toBe(prepared);
    await waitFor(() => expect(mockGetPhotos).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('normalized.jpg')).toBeTruthy();
  });
});
