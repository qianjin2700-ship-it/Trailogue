import type { TripDetailDTO, TripListDTO } from '@/contracts/trip';

import type { ApiClient } from './client';

export interface TripsApi {
  getTrips(cursor?: string, limit?: number): Promise<TripListDTO>;
  getTrip(id: string): Promise<TripDetailDTO>;
}

export function createTripsApi(client: ApiClient): TripsApi {
  return {
    getTrips(cursor, limit = 20) {
      const search = new URLSearchParams({ limit: String(limit) });
      if (cursor) search.set('cursor', cursor);
      return client.request<TripListDTO>(`/v1/albums?${search.toString()}`);
    },
    getTrip(id) {
      return client.request<TripDetailDTO>(`/v1/albums/${encodeURIComponent(id)}`);
    },
  };
}

