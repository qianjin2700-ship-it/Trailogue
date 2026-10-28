import { fireEvent, render, waitFor } from '@testing-library/react-native';

import EditTripScreen from '@/app/(app)/trips/edit';
import { getTripListRevision } from '@/features/trips/tripListInvalidation';

const mockGetTrip = jest.fn();
const mockUpdateTrip = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: {
    getTrip: (...args: unknown[]) => mockGetTrip(...args),
    updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({ id: 'trip-1' }),
}));

describe('<EditTripScreen />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrip.mockResolvedValue({
      id: 'trip-1', title: 'Original', destinationName: 'Oregon', description: null,
      startDate: '2026-11-01', endDate: '2026-11-05',
    });
    mockUpdateTrip.mockResolvedValue({ id: 'trip-1' });
  });

  it('loads, saves, invalidates the list, and returns to detail', async () => {
    const before = getTripListRevision();
    const screen = render(<EditTripScreen />);
    await waitFor(() => expect(screen.getByDisplayValue('Original')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Trip title'), 'Edited');
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledWith(
      'trip-1', expect.objectContaining({ title: 'Edited' }),
    ));
    expect(getTripListRevision()).toBe(before + 1);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/trips/[id]', params: { id: 'trip-1' } });
  });
});

