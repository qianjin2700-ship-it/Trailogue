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
const mockSetCoverPhoto = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  photoRepository: {
    getPhotos: (...args: unknown[]) => mockGetPhotos(...args),
    deletePhoto: jest.fn(),
    reorderPhotos: jest.fn(),
    updatePhoto: jest.fn(),
  },
  photoUploadService: { upload: (...args: unknown[]) => mockUpload(...args) },
  tripRepository: { setCoverPhoto: (...args: unknown[]) => mockSetCoverPhoto(...args) },
}));
jest.mock('@/features/photos/expoPhotoSelection', () => ({
  selectAndPreparePhotos: () => mockSelect(),
}));

describe('<PhotoSection />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPhotos.mockResolvedValue([]);
    mockSelect.mockResolvedValue([prepared]);
    mockSetCoverPhoto.mockResolvedValue(undefined);
  });

  it('keeps a failed photo and retries it with the same prepared upload', async () => {
    mockGetPhotos
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'photo-1', tripId: 'trip-1', status: 'ready',
        url: 'https://reads.example/photo-1', originalFilename: 'normalized.jpg',
        mimeType: 'image/jpeg', fileSize: 2_048, width: 1600, height: 1200,
        capturedAt: null, createdAt: new Date(), uploadedAt: new Date(),
        caption: null, locationName: null,
      }]);
    mockUpload
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_tripId, _photo, progress) => {
        progress(1);
        return { id: 'photo-1' };
      });
    const screen = render(<PhotoSection tripId="trip-1" />);
    await waitFor(() => expect(screen.getByText(
      'Choose up to 25 photos at once, with a maximum of 50 per trip.',
    )).toBeTruthy());

    fireEvent.press(screen.getByText('Add Photos'));
    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    expect(mockUpload.mock.calls[0][1]).toBe(prepared);
    expect(mockUpload.mock.calls[1][1]).toBe(prepared);
    await waitFor(() => expect(mockGetPhotos).toHaveBeenCalledTimes(3));
    expect(screen.getByLabelText('normalized.jpg')).toBeTruthy();
  });

  it('sets an owned ready photo as the trip cover', async () => {
    mockGetPhotos.mockResolvedValue([{
      id: 'photo-1', tripId: 'trip-1', status: 'ready',
      url: 'https://reads.example/photo-1', originalFilename: 'cover.jpg',
      mimeType: 'image/jpeg', fileSize: 2_048, width: 1600, height: 1200,
      capturedAt: null, createdAt: new Date(), uploadedAt: new Date(),
      caption: null, locationName: null,
    }]);
    const onCoverPhotoChange = jest.fn();
    const screen = render(
      <PhotoSection tripId="trip-1" onCoverPhotoChange={onCoverPhotoChange} />,
    );
    await waitFor(() => expect(screen.getByText('Set as cover')).toBeTruthy());

    fireEvent.press(screen.getByText('Set as cover'));

    await waitFor(() => expect(mockSetCoverPhoto).toHaveBeenCalledWith('trip-1', 'photo-1'));
    expect(onCoverPhotoChange).toHaveBeenCalledWith('photo-1');
  });
});
