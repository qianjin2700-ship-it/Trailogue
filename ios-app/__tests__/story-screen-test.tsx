import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppError } from '@/api/errors';
import StoryScreen from '@/app/(app)/trips/story';
import type { StoryDTO } from '@/contracts/story';

const mockGetLatest = jest.fn();
const mockGenerate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/composition/services', () => ({
  storyRepository: {
    getLatest: (...args: unknown[]) => mockGetLatest(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

const story: StoryDTO = {
  id: 'story-1', tripId: 'trip-1', version: 1, source: 'ai', degraded: false,
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
    },
  },
};

describe('<StoryScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLatest.mockRejectedValue(new AppError('NOT_FOUND', 404));
    mockGenerate.mockResolvedValue(story);
    mockUpdate.mockResolvedValue({ ...story, version: 2 });
  });

  it('generates a real persisted story after an empty state', async () => {
    const screen = render(<StoryScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate story' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Generate story' }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('trip-1', null));
    await waitFor(() => expect(screen.getByText('Kyoto in autumn')).toBeTruthy());
  });

  it('edits story text and persists a new version', async () => {
    mockGetLatest.mockResolvedValueOnce(story);
    const screen = render(<StoryScreen />);
    await waitFor(() => expect(screen.getByText('Kyoto in autumn')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Edit story' }));
    fireEvent.changeText(screen.getByLabelText('Story title'), 'Edited Kyoto');
    fireEvent.press(screen.getByRole('button', { name: 'Save new version' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
      'trip-1', expect.objectContaining({ title: 'Edited Kyoto' }),
    ));
  });
});
