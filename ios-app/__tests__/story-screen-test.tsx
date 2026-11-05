import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppError } from '@/api/errors';
import StoryScreen from '@/app/(app)/trips/story';
import type { StoryDTO } from '@/contracts/story';

const mockGetLatest = jest.fn();
const mockGenerate = jest.fn();
const mockUpdate = jest.fn();
const mockListVersions = jest.fn();
const mockGetPhotos = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/composition/services', () => ({
  photoRepository: { getPhotos: (...args: unknown[]) => mockGetPhotos(...args) },
  storyRepository: {
    getLatest: (...args: unknown[]) => mockGetLatest(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    listVersions: (...args: unknown[]) => mockListVersions(...args),
  },
}));
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(View, { ...props, testID: 'story-web-preview' }) };
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

const story: StoryDTO = {
  id: 'story-1', tripId: 'trip-1', version: 1, source: 'ai', degraded: false,
  versionType: 'generated', languageMode: 'en', actualLanguage: 'en',
  creativeSnapshot: {
    mainPerson: null, companions: null, relationship: null, focusPerson: null,
    writingStyle: 'warm_documentary', customWritingStyle: null, contentLength: 'standard',
    customWordCount: null, focuses: ['journey'], specialMemories: null, emphasis: null,
    avoidExpressions: null, otherRequirements: null, generationLanguage: 'en', bookStyle: 'travel_magazine',
  },
  createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z',
  content: {
    title: 'Kyoto in autumn', subtitle: 'Five quiet days', preface: 'A quiet beginning.',
    chapters: [{
      chapterId: 'ch1', title: 'Arrival', dateLabel: 'Nov 1', locationLabel: 'Kyoto',
      narrative: 'The visible streets and leaves marked the first day.', photoIds: ['photo-1'],
      captions: { 'photo-1': 'Autumn street' }, locked: false, userEdited: false,
    }],
    epilogue: 'The journey remains.', shareSummary: 'Kyoto in autumn.',
    meta: {
      model: 'deepseek-flash', generatedAt: '2026-10-27T00:00:00.000Z',
      degraded: false, visionAvailable: true, uncertainNotes: [], totalTokens: 300, callCount: 2,
      languageMode: 'en', actualLanguage: 'en',
    },
  },
};

describe('<StoryScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatest.mockRejectedValue(new AppError('NOT_FOUND', 404));
    mockGenerate.mockResolvedValue(story);
    mockUpdate.mockResolvedValue({ ...story, version: 2 });
    mockListVersions.mockResolvedValue([story]);
    mockGetPhotos.mockResolvedValue([{
      id: 'photo-1', tripId: 'trip-1', status: 'ready', url: 'https://example.test/photo.jpg',
      originalFilename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 10, width: 1200, height: 800,
      capturedAt: null, createdAt: new Date(0), uploadedAt: new Date(0), caption: null, locationName: null,
    }]);
  });

  it('requires creative confirmation before generating from an empty state', async () => {
    const screen = render(<StoryScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set requirements & generate' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Set requirements & generate' }));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('edits story text and persists a new version', async () => {
    mockGetLatest.mockResolvedValueOnce(story);
    const screen = render(<StoryScreen />);
    await waitFor(() => expect(screen.getByTestId('story-web-preview')).toBeTruthy());
    const source = screen.getByTestId('story-web-preview').props.source as { html: string };
    expect(source.html).toContain('Kyoto in autumn');
    expect(source.html).toContain('https://example.test/photo.jpg');
    fireEvent.press(screen.getByRole('button', { name: 'Edit story' }));
    fireEvent.changeText(screen.getByLabelText('Story title'), 'Edited Kyoto');
    fireEvent.press(screen.getByRole('button', { name: 'Save new version' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      'trip-1', expect.objectContaining({ title: 'Edited Kyoto' }),
    ));
  });
});
