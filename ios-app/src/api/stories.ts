import type {
  ApiDataResponse,
  BookPreviewDTO,
  GenerateStoryRequest,
  StoryDTO,
  UpdateStoryRequest,
} from '@trailogue/contracts';

import type { ApiClient } from './client';

export interface StoriesApi {
  generate(tripId: string, input?: GenerateStoryRequest): Promise<StoryDTO>;
  getLatest(tripId: string): Promise<StoryDTO>;
  update(tripId: string, input: UpdateStoryRequest): Promise<StoryDTO>;
  listVersions(tripId: string): Promise<StoryDTO[]>;
  getBook(tripId: string): Promise<BookPreviewDTO>;
}

export function createStoriesApi(client: ApiClient): StoriesApi {
  const tripPath = (tripId: string) => `/v1/trips/${encodeURIComponent(tripId)}`;
  return {
    async generate(tripId, input = {}) {
      const response = await client.request<ApiDataResponse<StoryDTO>>(
        `${tripPath(tripId)}/story/generate`,
        { method: 'POST', body: input, timeoutMs: 300_000 },
      );
      return response.data;
    },
    async getLatest(tripId) {
      return (await client.request<ApiDataResponse<StoryDTO>>(`${tripPath(tripId)}/story`)).data;
    },
    async update(tripId, input) {
      return (await client.request<ApiDataResponse<StoryDTO>>(`${tripPath(tripId)}/story`, {
        method: 'PUT', body: input,
      })).data;
    },
    async listVersions(tripId) {
      return (await client.request<ApiDataResponse<StoryDTO[]>>(`${tripPath(tripId)}/stories`)).data;
    },
    async getBook(tripId) {
      return (await client.request<ApiDataResponse<BookPreviewDTO>>(`${tripPath(tripId)}/book`)).data;
    },
  };
}
