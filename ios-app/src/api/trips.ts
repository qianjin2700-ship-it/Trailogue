import type { TripDTO, TripListResponse } from '@/contracts/trip';

import type { ApiClient } from './client';

export interface TripsApi {
  getTrips(cursor?: string, limit?: number): Promise<TripListResponse>;
  getTrip(id: string): Promise<TripDTO>;
}

export function createTripsApi(client: ApiClient): TripsApi {
  return {
    getTrips(cursor, limit = 20) {
      const search = new URLSearchParams({ limit: String(limit) });
      if (cursor) search.set('cursor', cursor);
      return client.request<TripListResponse>(`/v1/trips?${search.toString()}`);
    },
    async getTrip(id) {
      const response = await client.request<{ data: TripDTO }>(`/v1/trips/${encodeURIComponent(id)}`);
      return response.data;
    },
  };
}

