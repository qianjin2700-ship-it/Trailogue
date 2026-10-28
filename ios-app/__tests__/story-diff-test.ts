import type { StoryDTO } from '@/contracts/story';
import { compareStories } from '@/features/stories/storyDiff';

function version(version: number, narrative: string): StoryDTO {
  return {
    id: `story-${version}`, tripId: 'trip-1', version, source: 'mixed', degraded: false,
    versionType: version === 1 ? 'generated' : 'edited', languageMode: 'en', actualLanguage: 'en',
    creativeSnapshot: { mainPerson: null, companions: null, relationship: null, focusPerson: null, writingStyle: 'warm_documentary', customWritingStyle: null, contentLength: 'standard', customWordCount: null, focuses: ['journey'], specialMemories: null, emphasis: null, avoidExpressions: null, otherRequirements: null, generationLanguage: 'en', bookStyle: 'travel_magazine' },
    content: {
      title: 'A trip', subtitle: '', preface: 'Beginning', epilogue: 'End', shareSummary: null,
      chapters: [{ chapterId: 'one', title: 'Day one', dateLabel: null, locationLabel: null, narrative, photoIds: [], captions: {}, locked: false, userEdited: version > 1 }],
      meta: { model: 'test', generatedAt: new Date(0).toISOString(), degraded: false, visionAvailable: true, uncertainNotes: [], totalTokens: 0, callCount: 0, languageMode: 'en', actualLanguage: 'en' },
    }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  };
}

test('shows only meaningful changed story sections', () => {
  expect(compareStories(version(1, 'Original'), version(2, 'Edited'))).toEqual([{
    section: 'Chapter 1 story', before: 'Original', after: 'Edited',
  }]);
});
