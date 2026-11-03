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
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: React.EffectCallback) => React.useEffect(effect, [effect]),
  };
});

describe('<TripListScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes to Settings and keeps sign out off the trip list', () => {
    const screen = render(<TripListScreen />);

    // 首发版：Sign out 移入 Settings，My Trips 首页不再作为主操作。
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('offers trip creation independently of list state', () => {
    const screen = render(<TripListScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Create trip' }));
    expect(mockPush).toHaveBeenCalledWith('/trips/new');
  });
});
