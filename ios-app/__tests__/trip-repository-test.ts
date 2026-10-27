import type { TripsApi } from '@/api/trips';
import { createTripRepository } from '@/repositories/tripRepository';

const duplicateTrip = {
  id: 'trip-1',
  title: 'Kyoto in Autumn',
  description: null,
  destinationName: 'Kyoto',
  status: 'draft' as const,
  coverPhotoId: null,
  photoCount: 0,
  startDate: '2026-11-01',
  endDate: '2026-11-05',
  createdAt: '2026-10-01T08:30:00.000Z',
  updatedAt: '2026-10-14T08:30:00.000Z',
};

describe('TripRepository', () => {
  it('deduplicates repeated trip ids while preserving API order', async () => {
    const api = {
      getTrips: jest.fn().mockResolvedValue({
        data: [duplicateTrip, { ...duplicateTrip }, { ...duplicateTrip, id: 'trip-2' }],
        meta: { nextCursor: null },
      }),
    } as unknown as TripsApi;

    await expect(createTripRepository(api).getTrips()).resolves.toMatchObject([
      { id: 'trip-1' },
      { id: 'trip-2' },
    ]);
  });
});
