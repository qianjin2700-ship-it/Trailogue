import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TripListScreen from '@/app/(app)/trips/index';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();
const mockGetTrips = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrips: (...args: unknown[]) => mockGetTrips(...args) },
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

describe('<TripListScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrips.mockResolvedValue([]);
  });

  it('offers sign out even when the trip list is empty', async () => {
    const screen = render(<TripListScreen />);
    await waitFor(() => expect(screen.getByText('No trips yet')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('offers trip creation when an existing trip makes the list non-empty', async () => {
    mockGetTrips.mockResolvedValueOnce([{
      id: 'fixture-trip',
      title: 'Wave 2.5B — Pacific Coast',
      destinationName: 'California',
      status: 'draft',
      photoCount: 0,
      coverUrl: null,
      updatedAt: new Date('2026-10-25T00:00:00.000Z'),
    }]);

    const screen = render(<TripListScreen />);
    await waitFor(() => expect(screen.getByText('Wave 2.5B — Pacific Coast')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Create trip' }));
    expect(mockPush).toHaveBeenCalledWith('/trips/new');
  });
});
