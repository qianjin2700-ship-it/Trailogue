import type { CreateTripRequest, CreativeRequirementsDTO, UpdateTripRequest } from '@/contracts/trip';
import type { TripsApi } from '@/api/trips';
import { mapTripDTO, type Trip, type TripSummary } from '@/domain/trip/trip';

export interface TripRepository {
  getTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip>;
  createTrip(input: CreateTripRequest, idempotencyKey: string): Promise<Trip>;
  updateTrip(id: string, input: UpdateTripRequest): Promise<Trip>;
  updateCreativeRequirements(id: string, input: CreativeRequirementsDTO): Promise<Trip>;
  setCoverPhoto(id: string, photoId: string | null): Promise<void>;
  deleteTrip(id: string): Promise<void>;
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
    async updateTrip(id, input) {
      return mapTripDTO(await api.updateTrip(id, input));
    },
    async updateCreativeRequirements(id, input) {
      return mapTripDTO(await api.updateCreativeRequirements(id, input));
    },
    setCoverPhoto(id, photoId) {
      return api.setCoverPhoto(id, photoId);
    },
    deleteTrip(id) {
      return api.deleteTrip(id);
    },
  };
}

