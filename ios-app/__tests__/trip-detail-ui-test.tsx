import { render, waitFor } from '@testing-library/react-native';

import TripDetailScreen from '@/app/(app)/trips/[id]';

const mockGetTrip = jest.fn();
const mockGetPhotos = jest.fn().mockResolvedValue([]);
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/features/photos/PhotoSection', () => ({ PhotoSection: () => null }));
jest.mock('@/composition/services', () => ({
  tripRepository: {
    getTrip: (...args: unknown[]) => mockGetTrip(...args),
    setCoverPhoto: jest.fn(), deleteTrip: jest.fn(),
  },
  photoRepository: {
    getPhotos: (...args: unknown[]) => mockGetPhotos(...args),
    deletePhoto: jest.fn(), reorderPhotos: jest.fn(), updatePhoto: jest.fn(),
  },
  photoUploadService: { upload: jest.fn() },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

describe('<TripDetailScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrip.mockResolvedValue({
      id: 'trip-1',
      title: 'Oregon Coast',
      description: null,
      destinationName: 'Oregon',
      status: 'draft',
      coverPhotoId: null,
      coverUrl: null,
      photoCount: 0,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      storyBackground: null,
      peopleNotes: null,
      highlights: null,
      writingStyle: 'warm_documentary',
      customWritingStyle: null,
      avoidExpressions: null,
      contentLength: 'medium',
      arrangement: 'timeline',
      createdAt: new Date('2026-10-01T08:30:00.000Z'),
      updatedAt: new Date('2026-10-14T08:30:00.000Z'),
    });
  });

  it('renders the mapped travel date range', async () => {
    const screen = render(<TripDetailScreen />);

    await waitFor(() => expect(screen.getByText('2026.11.01 — 2026.11.05')).toBeTruthy());
  });
});
