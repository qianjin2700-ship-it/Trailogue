import { mapTripDTO, mapTripListItemDTO } from '@/domain/trip/trip';

describe('trip mappers', () => {
  it('maps the existing album list DTO to a trip summary without inventing fields', () => {
    const trip = mapTripListItemDTO({
      album_id: 'album-1',
      name: 'Kyoto in Autumn',
      status: 'done',
      photo_count: 18,
      cover_thumb_url: 'https://example.com/cover.jpg',
      updated_at: '2026-10-14T08:30:00.000Z',
    });

    expect(trip).toEqual({
      id: 'album-1',
      title: 'Kyoto in Autumn',
      status: 'done',
      photoCount: 18,
      coverUrl: 'https://example.com/cover.jpg',
      updatedAt: new Date('2026-10-14T08:30:00.000Z'),
    });
  });

  it('maps an existing album document to a trip detail model', () => {
    const trip = mapTripDTO({
      _id: 'album-1',
      _openid: 'private-owner-id',
      name: 'Kyoto in Autumn',
      theme: 'Temples and food',
      background: 'A long-awaited trip',
      relations: '',
      highlights: '',
      style: 'warm_documentary',
      style_custom: null,
      avoid_expressions: null,
      content_length: 'medium',
      arrangement: 'timeline',
      status: 'done',
      photo_count: 18,
      fact_base_snapshot_id: null,
      story_id: 'story-1',
      cover_file_id: null,
      created_at: '2026-10-01T08:30:00.000Z',
      updated_at: '2026-10-14T08:30:00.000Z',
      deleted: false,
    });

    expect(trip.id).toBe('album-1');
    expect(trip.title).toBe('Kyoto in Autumn');
    expect(trip).not.toHaveProperty('_openid');
  });
});
