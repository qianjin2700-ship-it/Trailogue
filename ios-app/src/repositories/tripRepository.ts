import type { TripsApi } from '@/api/trips';
import { mapTripDTO, type Trip, type TripSummary } from '@/domain/trip/trip';

export interface TripRepository {
  getTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip>;
}

export function createTripRepository(api: TripsApi): TripRepository {
  return {
    async getTrips() {
      const page = await api.getTrips();
      return page.data.map(mapTripDTO);
    },
    async getTrip(id) {
      return mapTripDTO(await api.getTrip(id));
    },
  };
}

