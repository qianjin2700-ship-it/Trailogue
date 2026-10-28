import type { StoriesApi } from '@/api/stories';
import type { BookPreviewDTO, StoryContentDTO, StoryDTO } from '@/contracts/story';

export interface StoryRepository {
  generate(tripId: string, feedback?: string | null): Promise<StoryDTO>;
  getLatest(tripId: string): Promise<StoryDTO>;
  update(tripId: string, content: StoryContentDTO): Promise<StoryDTO>;
  listVersions(tripId: string): Promise<StoryDTO[]>;
  getBook(tripId: string): Promise<BookPreviewDTO>;
}

export function createStoryRepository(api: StoriesApi): StoryRepository {
  return {
    generate: (tripId, feedback) => api.generate(tripId, { feedback: feedback ?? null }),
    getLatest: (tripId) => api.getLatest(tripId),
    update: (tripId, content) => api.update(tripId, { content }),
    listVersions: (tripId) => api.listVersions(tripId),
    getBook: (tripId) => api.getBook(tripId),
  };
}
