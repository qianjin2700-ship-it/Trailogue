import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import CreativeRequirementsScreen from '@/app/(app)/trips/creative';
import { defaultCreativeRequirements } from '@/features/stories/creativeRequirements';

const mockGetTrip = jest.fn();
const mockUpdateTrip = jest.fn();
const mockUpdateCreativeRequirements = jest.fn();
const mockGenerate = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('@/composition/services', () => ({
  tripRepository: {
    getTrip: (...args: unknown[]) => mockGetTrip(...args),
    updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
    updateCreativeRequirements: (...args: unknown[]) => mockUpdateCreativeRequirements(...args),
  },
  storyRepository: { generate: (...args: unknown[]) => mockGenerate(...args) },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

test('persists creative requirements and only generates after explicit confirmation', async () => {
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
