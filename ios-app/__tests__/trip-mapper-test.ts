import { mapTripDTO } from '@/domain/trip/trip';

describe('trip mappers', () => {
  it('maps the shared trip DTO to the iOS domain model', () => {
    const trip = mapTripDTO({
      id: 'trip-1',
      title: 'Kyoto in Autumn',
      description: 'Temples and food',
      destinationName: 'Kyoto',
      status: 'published',
      coverPhotoId: null,
      photoCount: 18,
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      storyBackground: null,
      peopleNotes: null,
      highlights: null,
      writingStyle: 'warm_documentary',
      customWritingStyle: null,
      avoidExpressions: null,
      contentLength: 'medium',
      arrangement: 'timeline',
      creativeRequirements: {
        mainPerson: null, companions: null, relationship: null, focusPerson: null,
        writingStyle: 'warm_documentary', customWritingStyle: null, contentLength: 'standard',
        customWordCount: null, focuses: [], specialMemories: null, emphasis: null,
        avoidExpressions: null, otherRequirements: null, generationLanguage: 'auto', bookStyle: 'travel_magazine',
      },
      createdAt: '2026-10-01T08:30:00.000Z',
      updatedAt: '2026-10-14T08:30:00.000Z',
    });

    expect(trip).toEqual(expect.objectContaining({
      id: 'trip-1',
      title: 'Kyoto in Autumn',
      status: 'published',
      photoCount: 18,
      coverPhotoId: null,
      coverUrl: null,
      destinationName: 'Kyoto',
      description: 'Temples and food',
      startDate: '2026-10-01',
      endDate: '2026-10-14',
      storyBackground: null,
      peopleNotes: null,
      highlights: null,
      writingStyle: 'warm_documentary',
      customWritingStyle: null,
      avoidExpressions: null,
      contentLength: 'medium',
      arrangement: 'timeline',
      creativeRequirements: {
        mainPerson: null, companions: null, relationship: null, focusPerson: null,
        writingStyle: 'warm_documentary', customWritingStyle: null, contentLength: 'standard',
        customWordCount: null, focuses: [], specialMemories: null, emphasis: null,
        avoidExpressions: null, otherRequirements: null, generationLanguage: 'auto', bookStyle: 'travel_magazine',
      },
      createdAt: new Date('2026-10-01T08:30:00.000Z'),
      updatedAt: new Date('2026-10-14T08:30:00.000Z'),
    }));
  });

  it('preserves missing travel dates as null', () => {
    const trip = mapTripDTO({
      id: 'trip-2',
      title: 'Undated notes',
      description: null,
      destinationName: null,
      status: 'draft',
      coverPhotoId: null,
      photoCount: 0,
      startDate: null,
      endDate: null,
      storyBackground: null,
      peopleNotes: null,
      highlights: null,
      writingStyle: 'warm_documentary',
      customWritingStyle: null,
      avoidExpressions: null,
      contentLength: 'medium',
      arrangement: 'timeline',
      creativeRequirements: {
        mainPerson: null, companions: null, relationship: null, focusPerson: null,
        writingStyle: 'warm_documentary', customWritingStyle: null, contentLength: 'standard',
        customWordCount: null, focuses: [], specialMemories: null, emphasis: null,
        avoidExpressions: null, otherRequirements: null, generationLanguage: 'auto', bookStyle: 'travel_magazine',
      },
      createdAt: '2026-10-01T08:30:00.000Z',
      updatedAt: '2026-10-01T08:30:00.000Z',
    });

    expect(trip.startDate).toBeNull();
    expect(trip.endDate).toBeNull();
  });
});
