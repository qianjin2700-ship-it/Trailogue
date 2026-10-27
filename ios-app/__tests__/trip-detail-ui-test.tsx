import { render, waitFor } from '@testing-library/react-native';

import TripDetailScreen from '@/app/(app)/trips/[id]';

const mockGetTrip = jest.fn();
const mockGetPhotos = jest.fn().mockResolvedValue([]);
const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrip: (...args: unknown[]) => mockGetTrip(...args) },
  photoRepository: { getPhotos: (...args: unknown[]) => mockGetPhotos(...args) },
  photoUploadService: { upload: jest.fn() },
}));
jest.mock('expo-router', () => ({
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
      coverUrl: null,
      photoCount: 0,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      createdAt: new Date('2026-10-01T08:30:00.000Z'),
      updatedAt: new Date('2026-10-14T08:30:00.000Z'),
    });
  });

  it('renders the mapped travel date range', async () => {
    const screen = render(<TripDetailScreen />);

    await waitFor(() => expect(screen.getByText('Travel dates')).toBeTruthy());
    expect(screen.getByText('Nov 1 – Nov 5, 2026')).toBeTruthy();
  });
});
