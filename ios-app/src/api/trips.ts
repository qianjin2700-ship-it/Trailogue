import type { CreateTripRequest, CreativeRequirementsDTO, TripDTO, TripListResponse, UpdateTripRequest } from '@/contracts/trip';

import type { ApiClient } from './client';

export interface TripsApi {
  getTrips(cursor?: string, limit?: number): Promise<TripListResponse>;
  getTrip(id: string): Promise<TripDTO>;
  createTrip(input: CreateTripRequest, idempotencyKey: string): Promise<TripDTO>;
  updateTrip(id: string, input: UpdateTripRequest): Promise<TripDTO>;
  updateCreativeRequirements(id: string, input: CreativeRequirementsDTO): Promise<TripDTO>;
  setCoverPhoto(id: string, photoId: string | null): Promise<void>;
  deleteTrip(id: string): Promise<void>;
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
    async createTrip(input, idempotencyKey) {
      const response = await client.request<{ data: TripDTO }>('/v1/trips', {
        method: 'POST', body: input,
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      return response.data;
    },
    async updateTrip(id, input) {
      const response = await client.request<{ data: TripDTO }>(
        `/v1/trips/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: input },
      );
      return response.data;
    },
    async updateCreativeRequirements(id, creativeRequirements) {
      const response = await client.request<{ data: TripDTO }>(
        `/v1/trips/${encodeURIComponent(id)}/creative-requirements`,
        { method: 'PUT', body: { creativeRequirements } },
      );
      return response.data;
    },
    async setCoverPhoto(id, photoId) {
      await client.request(`/v1/trips/${encodeURIComponent(id)}/cover`, {
        method: 'PUT', body: { photoId },
      });
    },
    async deleteTrip(id) {
      await client.request(`/v1/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

