import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CreativeRequirementsScreen from '@/app/(app)/trips/creative';
import { AppError } from '@/api/errors';
import { defaultCreativeRequirements } from '@/features/stories/creativeRequirements';

const mockGetTrip = jest.fn();
const mockUpdateTrip = jest.fn();
const mockUpdateCreativeRequirements = jest.fn();
const mockGenerate = jest.fn();
const mockGetLatest = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/composition/services', () => ({
  tripRepository: {
    getTrip: (...args: unknown[]) => mockGetTrip(...args),
    updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
    updateCreativeRequirements: (...args: unknown[]) => mockUpdateCreativeRequirements(...args),
  },
  storyRepository: {
    generate: (...args: unknown[]) => mockGenerate(...args),
    getLatest: (...args: unknown[]) => mockGetLatest(...args),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test('persists creative requirements and only generates after explicit confirmation', async () => {
  mockGetLatest.mockRejectedValue(new AppError('NOT_FOUND', 404));
  mockGetTrip.mockResolvedValue({
    id: 'trip-1',
    creativeRequirements: {
      ...defaultCreativeRequirements(),
      contentLength: 'medium',
      legacyBookLayout: 'single-photo',
    },
  });
  mockUpdateTrip.mockResolvedValue({ id: 'trip-1' });
  mockUpdateCreativeRequirements.mockResolvedValue({ id: 'trip-1' });
  mockGenerate.mockResolvedValue({ id: 'story-1' });
  const screen = render(<CreativeRequirementsScreen />);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(screen.getByText('Creative requirements')).toBeTruthy());
  expect(mockGenerate).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Main person'), 'My daughter');
  fireEvent.press(screen.getByText('English'));
  fireEvent.press(screen.getByRole('button', { name: 'Start generating story' }));
  await waitFor(() => expect(mockUpdateCreativeRequirements).toHaveBeenCalledWith('trip-1', expect.objectContaining({
    mainPerson: 'My daughter', generationLanguage: 'en', contentLength: 'standard',
  })));
  const saved = mockUpdateCreativeRequirements.mock.calls.at(-1)?.[1];
  expect(saved).not.toHaveProperty('legacyBookLayout');
  expect(mockUpdateTrip).not.toHaveBeenCalled();
  expect(mockGenerate).toHaveBeenCalledWith('trip-1', expect.objectContaining({ confirmed: true }));
}, 15_000);

test('no longer asks for a book style and always saves the magazine layout', async () => {
  const legacy = { ...defaultCreativeRequirements(), bookStyle: 'warm_memoir' as const };
  mockGetTrip.mockResolvedValue({ id: 'trip-1', creativeRequirements: legacy });
  mockGetLatest.mockResolvedValue({ id: 'story-1', creativeSnapshot: legacy });
  mockUpdateCreativeRequirements.mockResolvedValue({ id: 'trip-1' });
  const screen = render(<CreativeRequirementsScreen />);
  await waitFor(() => expect(screen.getByText('Creative requirements')).toBeTruthy());

  // 画册风格不再出现在创作要求里，也不再有两处重复选择。
  expect(screen.queryByText('Book style')).toBeNull();
  expect(screen.queryByText('Travel magazine')).toBeNull();
  expect(screen.queryByText('Warm memoir')).toBeNull();
  expect(screen.queryByText('Minimalist photo book')).toBeNull();
  expect(screen.queryByText('Apply style to book')).toBeNull();

  // 故事未变化时主按钮直接打开已有故事，不重新调用 AI。
  fireEvent.press(screen.getByRole('button', { name: 'Open current story' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/trips/story', params: { id: 'trip-1' } }));
  expect(mockGenerate).not.toHaveBeenCalled();
});

test('saves magazine as the only book style when generating', async () => {
  const legacy = { ...defaultCreativeRequirements(), bookStyle: 'minimalist' as const };
  mockGetLatest.mockRejectedValue(new AppError('NOT_FOUND', 404));
  mockGetTrip.mockResolvedValue({ id: 'trip-1', creativeRequirements: legacy });
  mockUpdateCreativeRequirements.mockResolvedValue({ id: 'trip-1' });
  mockGenerate.mockResolvedValue({ id: 'story-1', creativeSnapshot: legacy });
  const screen = render(<CreativeRequirementsScreen />);
  await waitFor(() => expect(screen.getByText('Creative requirements')).toBeTruthy());

  fireEvent.press(screen.getByRole('button', { name: 'Start generating story' }));
  await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
  expect(mockUpdateCreativeRequirements).toHaveBeenCalledWith('trip-1', expect.objectContaining({
    bookStyle: 'travel_magazine',
  }));
});

test('waits for in-flight photo uploads instead of showing an AI failure', async () => {
  mockGetLatest.mockRejectedValue(new AppError('NOT_FOUND', 404));
  mockGetTrip.mockResolvedValue({ id: 'trip-1', creativeRequirements: defaultCreativeRequirements() });
  mockUpdateCreativeRequirements.mockResolvedValue({ id: 'trip-1' });
  jest.useFakeTimers();
  try {
    // 前两次上传未完成 → 服务端返回 PHOTOS_UPLOADING；第三次成功。
    mockGenerate
      .mockRejectedValueOnce(new AppError('PHOTOS_UPLOADING', 409, undefined, {
        message: 'Preparing photos… 2 photos still uploading',
      }))
      .mockRejectedValueOnce(new AppError('PHOTOS_UPLOADING', 409, undefined, {
        message: 'Preparing photos… 1 photo still uploading',
      }))
      .mockResolvedValue({ id: 'story-1', creativeSnapshot: defaultCreativeRequirements() });

    const screen = render(<CreativeRequirementsScreen />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('Creative requirements')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Start generating story' }));

    await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(2_000); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(2_000); await Promise.resolve(); });

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(3));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/trips/story', params: { id: 'trip-1' } });
    expect(screen.queryByText(/AI photo analysis failed/i)).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
