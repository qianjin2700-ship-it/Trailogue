import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NewTripScreen from '@/app/(app)/trips/new';
import { getTripListRevision } from '@/features/trips/tripListInvalidation';

const mockCreateTrip = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { createTrip: (...args: unknown[]) => mockCreateTrip(...args) },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '50000000-0000-4000-8000-000000000005' }));
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

describe('<NewTripScreen /> list invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTrip.mockResolvedValue({ id: 'trip-new' });
  });

  it('invalidates My Trips and opens the new detail after creation succeeds', async () => {
    const revisionBeforeCreate = getTripListRevision();
    const screen = render(<NewTripScreen />);

    fireEvent.changeText(screen.getByLabelText('Trip title'), 'Oregon Coast');
    fireEvent.changeText(screen.getByLabelText('Destination'), 'Oregon');
    fireEvent.changeText(screen.getByLabelText('Start date'), '2026-11-01');
    fireEvent.changeText(screen.getByLabelText('End date'), '2026-11-05');
    fireEvent.press(screen.getByRole('button', { name: 'Create trip' }));

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1));
    expect(getTripListRevision()).toBe(revisionBeforeCreate + 1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/trips/[id]',
      params: { id: 'trip-new' },
    });
  });
});
