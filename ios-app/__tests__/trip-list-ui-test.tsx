import { fireEvent, render } from '@testing-library/react-native';

import { AppError } from '@/api/errors';
import type { LoadState } from '@/contracts/common';
import type { TripSummary } from '@/domain/trip/trip';
import { TripListContent } from '@/features/trips/TripListContent';

const callbacks = {
  onRefresh: jest.fn(),
  onRetry: jest.fn(),
  onCreateTrip: jest.fn(),
  onOpenTrip: jest.fn(),
};

function renderState(state: LoadState<TripSummary[]>) {
  return render(<TripListContent {...callbacks} refreshing={false} state={state} />);
}

describe('<TripListContent />', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading state', () => {
    const screen = renderState({ status: 'loading' });
    expect(screen.getByLabelText('Loading trips')).toBeTruthy();
  });

  it('shows empty state and create action', () => {
    const screen = renderState({ status: 'success', data: [] });
    expect(screen.getByText('No trips yet')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Create your first trip' }));
    expect(callbacks.onCreateTrip).toHaveBeenCalledTimes(1);
  });

  it('shows real mapped fields in success state', () => {
    const screen = renderState({
      status: 'success',
      data: [{
        id: 'trip-1',
        title: 'Kyoto in Autumn',
        status: 'published',
        photoCount: 18,
        coverPhotoId: null,
        coverUrl: null,
        destinationName: 'Kyoto',
        updatedAt: new Date('2026-10-14T08:30:00.000Z'),
      }],
    });

    expect(screen.getByText('Kyoto in Autumn')).toBeTruthy();
    expect(screen.getByText(/18 photos/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Open Kyoto in Autumn' }));
    expect(callbacks.onOpenTrip).toHaveBeenCalledWith('trip-1');
  });

  it('shows normalized error state and retry action', () => {
    const screen = renderState({ status: 'error', error: new AppError('NETWORK_ERROR') });
    expect(screen.getByText("Couldn't load trips")).toBeTruthy();
    expect(screen.queryByText('socket details')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  });
});
