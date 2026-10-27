import { render, waitFor } from '@testing-library/react-native';

import { AppError } from '@/api/errors';
import TripListScreen from '@/app/(app)/trips/index';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockGetTrips = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrips: (...args: unknown[]) => mockGetTrips(...args) },
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (effect: React.EffectCallback) => React.useEffect(effect, [effect]),
  };
});

describe('<TripListScreen /> session expiry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrips.mockRejectedValue(new AppError('UNAUTHORIZED', 401));
  });

  it('clears the stored session when the protected trip list returns 401', async () => {
    render(<TripListScreen />);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});
