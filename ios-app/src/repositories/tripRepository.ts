import type { TripsApi } from '@/api/trips';
import { mapTripDTO, mapTripListItemDTO, type Trip, type TripSummary } from '@/domain/trip/trip';

export interface TripRepository {
  getTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip>;
}

export function createTripRepository(api: TripsApi): TripRepository {
  return {
    async getTrips() {
      const page = await api.getTrips();
      return page.items.map(mapTripListItemDTO);
    },
    async getTrip(id) {
      const detail = await api.getTrip(id);
      return mapTripDTO(detail.album);
    },
  };
}

