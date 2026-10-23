import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TripListScreen from '@/app/(app)/trips/index';

const mockSignOut = jest.fn().mockResolvedValue(undefined);

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrips: jest.fn().mockResolvedValue([]) },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('<TripListScreen />', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers sign out even when the trip list is empty', async () => {
    const screen = render(<TripListScreen />);
    await waitFor(() => expect(screen.getByText('No trips yet')).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
