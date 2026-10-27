import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type React from 'react';

import { AppError } from '@/api/errors';
import TripListScreen from '@/app/(app)/trips/index';
import { invalidateTripList } from '@/features/trips/tripListInvalidation';

const mockGetTrips = jest.fn();
let focusEffect: React.EffectCallback | null = null;

jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/composition/services', () => ({
  tripRepository: { getTrips: (...args: unknown[]) => mockGetTrips(...args) },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: React.EffectCallback) => {
    focusEffect = effect;
  },
}));

const oldTrip = {
  id: 'trip-old',
  title: 'Existing trip',
  status: 'draft' as const,
  photoCount: 0,
  coverUrl: null,
  destinationName: 'Oregon',
  updatedAt: new Date('2026-10-14T08:30:00.000Z'),
};
const newTrip = { ...oldTrip, id: 'trip-new', title: 'New trip' };

async function focus() {
  await act(async () => {
    focusEffect?.();
    await Promise.resolve();
  });
}

describe('<TripListScreen /> focus refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusEffect = null;
  });

  it('refreshes an initially empty list after trip creation invalidates it', async () => {
    mockGetTrips.mockResolvedValueOnce([]).mockResolvedValueOnce([newTrip]);
    const screen = render(<TripListScreen />);

    await focus();
    await waitFor(() => expect(screen.getByText('No trips yet')).toBeTruthy());

    invalidateTripList();
    await focus();

    await waitFor(() => expect(screen.getByText('New trip')).toBeTruthy());
    expect(mockGetTrips).toHaveBeenCalledTimes(2);
  });

  it('refreshes a non-empty list once and skips ordinary focus changes', async () => {
    mockGetTrips.mockResolvedValueOnce([oldTrip]).mockResolvedValueOnce([newTrip, oldTrip]);
    const screen = render(<TripListScreen />);

    await focus();
    await waitFor(() => expect(screen.getByText('Existing trip')).toBeTruthy());

    invalidateTripList();
    await focus();
    await waitFor(() => expect(screen.getByText('New trip')).toBeTruthy());
    await focus();

    expect(mockGetTrips).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Existing trip')).toHaveLength(1);
  });

  it('keeps existing trips and offers retry when automatic refresh fails', async () => {
    mockGetTrips
      .mockResolvedValueOnce([oldTrip])
      .mockRejectedValueOnce(new AppError('NETWORK_ERROR'))
      .mockResolvedValueOnce([newTrip, oldTrip]);
    const screen = render(<TripListScreen />);

    await focus();
    await waitFor(() => expect(screen.getByText('Existing trip')).toBeTruthy());

    invalidateTripList();
    await focus();
    await waitFor(() => expect(screen.getByText("Couldn't refresh trips")).toBeTruthy());
    expect(screen.getByText('Existing trip')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Retry refresh' }));
    await waitFor(() => expect(screen.getByText('New trip')).toBeTruthy());
    expect(mockGetTrips).toHaveBeenCalledTimes(3);
  });
});
