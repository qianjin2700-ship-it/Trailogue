import { fireEvent, render } from '@testing-library/react-native';

import TripListScreen from '@/app/(app)/trips/index';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrips: jest.fn(() => new Promise<never>(() => undefined)) },
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

describe('<TripListScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers sign out while trips are loading', () => {
    const screen = render(<TripListScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('offers trip creation independently of list state', () => {
    const screen = render(<TripListScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Create trip' }));
    expect(mockPush).toHaveBeenCalledWith('/trips/new');
  });
});
