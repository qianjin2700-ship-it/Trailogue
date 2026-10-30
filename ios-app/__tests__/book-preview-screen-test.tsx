import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import BookPreviewScreen from '@/app/(app)/trips/book';

const mockGetBook = jest.fn();
const mockUpdateBookLayout = jest.fn();
const mockGetPhotos = jest.fn();
const mockGetTrip = jest.fn();
const mockUpdateCreativeRequirements = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  photoRepository: { getPhotos: (...args: unknown[]) => mockGetPhotos(...args) },
  sharesApi: { create: jest.fn(), revoke: jest.fn() },
  storyRepository: {
    getBook: (...args: unknown[]) => mockGetBook(...args),
    updateBookLayout: (...args: unknown[]) => mockUpdateBookLayout(...args),
  },
  tripRepository: {
    getTrip: (...args: unknown[]) => mockGetTrip(...args),
    updateCreativeRequirements: (...args: unknown[]) => mockUpdateCreativeRequirements(...args),
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'book-web-preview' }),
  };
});

const book = {
  id: 'book-1',
  tripId: 'trip-1',
  storyId: 'story-1',
  title: 'Guishan Island',
  tripTitle: 'Guishan Island',
  subtitle: 'Sea and light',
  coverPhotoId: 'photo-1',
  status: 'ready',
  startDate: '2025-08-24',
  bookStyle: 'minimalist',
  layout: {},
  story: {
    title: 'Guishan Island',
    subtitle: 'Sea and light',
    preface: 'A quiet beginning.',
    chapters: [
      {
        chapterId: 'chapter-1',
        title: 'The lighthouse',
        dateLabel: 'August 24, 2025',
        locationLabel: 'Guishan Island',
        narrative: 'The path reached the sea and the lighthouse.',
        photoIds: ['photo-1'],
        captions: {},
        locked: false,
        userEdited: false,
      },
    ],
    epilogue: 'The light remained.',
    shareSummary: null,
    meta: {
      model: 'test',
      generatedAt: '2026-10-30T00:00:00.000Z',
      degraded: false,
      visionAvailable: true,
      uncertainNotes: [],
      totalTokens: 100,
      callCount: 1,
      languageMode: 'en',
      actualLanguage: 'en',
    },
  },
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
};

const photo = (url: string) => ({
  id: 'photo-1',
  tripId: 'trip-1',
  status: 'ready',
  url,
  originalFilename: 'lighthouse.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1000,
  width: 1600,
  height: 900,
  capturedAt: null,
  createdAt: new Date(0),
  uploadedAt: new Date(0),
  caption: null,
  locationName: null,
});

describe('<BookPreviewScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBook.mockResolvedValue(book);
    mockGetPhotos.mockResolvedValue([photo('https://example.test/original.jpg')]);
    mockUpdateBookLayout.mockResolvedValue(book);
    mockGetTrip.mockResolvedValue({ creativeRequirements: { bookStyle: 'minimalist' } });
    mockUpdateCreativeRequirements.mockResolvedValue({});
  });

  it('uses the PDF renderer in the app and exposes only working primary actions', async () => {
    const screen = render(<BookPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('book-web-preview')).toBeTruthy());

    const source = screen.getByTestId('book-web-preview').props.source as { html: string };
    expect(source.html).toContain('The lighthouse');
    expect(source.html).toContain('https://example.test/original.jpg');
    expect(screen.getByRole('button', { name: 'Try another design' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit story text' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeTruthy();
    expect(screen.queryByText('Reorder photos')).toBeNull();
    expect(screen.queryByText('Swap lead')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Try another design' }));
    await waitFor(() => expect(mockUpdateBookLayout).toHaveBeenCalledTimes(1));
    expect(mockUpdateBookLayout.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ version: 5 }),
    );
  });

  it('refreshes expired photo URLs once and updates the preview HTML', async () => {
    mockGetPhotos
      .mockResolvedValueOnce([photo('https://example.test/expired.jpg')])
      .mockResolvedValueOnce([photo('https://example.test/fresh.jpg')]);
    const screen = render(<BookPreviewScreen />);
    await waitFor(() => expect(screen.getByTestId('book-web-preview')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('book-web-preview').props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'photo-error', photoId: 'photo-1' }) },
      });
    });

    await waitFor(() => expect(mockGetPhotos).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const source = screen.getByTestId('book-web-preview').props.source as { html: string };
      expect(source.html).toContain('https://example.test/fresh.jpg');
    });
  });
});
