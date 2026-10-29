import type { StoriesApi } from '@/api/stories';
import type { BookPreviewDTO, StoryContentDTO, StoryDTO } from '@/contracts/story';

export interface StoryRepository {
  generate(tripId: string, input: import('@/contracts/story').GenerateStoryRequest): Promise<StoryDTO>;
  getLatest(tripId: string): Promise<StoryDTO>;
  update(tripId: string, content: StoryContentDTO): Promise<StoryDTO>;
  listVersions(tripId: string): Promise<StoryDTO[]>;
  restore(tripId: string, storyId: string): Promise<StoryDTO>;
  getBook(tripId: string): Promise<BookPreviewDTO>;
  updateBookLayout(tripId: string, layout: Record<string, unknown>): Promise<BookPreviewDTO>;
}

export function createStoryRepository(api: StoriesApi): StoryRepository {
  return {
    generate: (tripId, input) => api.generate(tripId, input),
    getLatest: (tripId) => api.getLatest(tripId),
    update: (tripId, content) => api.update(tripId, { content }),
    listVersions: (tripId) => api.listVersions(tripId),
    restore: (tripId, storyId) => api.restore(tripId, storyId),
    getBook: (tripId) => api.getBook(tripId),
    updateBookLayout: (tripId, layout) => api.updateBookLayout(tripId, { layout }),
  };
}
