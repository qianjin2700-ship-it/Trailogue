import type { CreateTripRequest } from '@/contracts/trip';
import type { TripsApi } from '@/api/trips';
import { mapTripDTO, type Trip, type TripSummary } from '@/domain/trip/trip';

export interface TripRepository {
  getTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip>;
  createTrip(input: CreateTripRequest, idempotencyKey: string): Promise<Trip>;
}

export function createTripRepository(api: TripsApi): TripRepository {
  return {
    async getTrips() {
      const page = await api.getTrips();
      const seen = new Set<string>();
      return page.data.map(mapTripDTO).filter((trip) => {
        if (seen.has(trip.id)) return false;
        seen.add(trip.id);
        return true;
      });
    },
    async getTrip(id) {
      return mapTripDTO(await api.getTrip(id));
    },
    async createTrip(input, idempotencyKey) {
      return mapTripDTO(await api.createTrip(input, idempotencyKey));
    },
  };
}

