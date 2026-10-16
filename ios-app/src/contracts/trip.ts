import type { CursorPage } from './common';

export type TripStatus = 'draft' | 'reviewing' | 'generating' | 'done' | 'failed';

export interface TripListItemDTO {
  album_id: string;
  name: string;
  status: TripStatus;
  photo_count: number;
  cover_thumb_url: string | null;
  updated_at: string;
}

export type TripListDTO = CursorPage<TripListItemDTO>;

/** Existing CloudBase `albums` document shape returned by getAlbum. */
export interface TripDTO {
  _id: string;
  _openid: string;
  name: string;
  theme: string;
  background: string;
  relations: string;
  highlights: string;
  style: string;
  style_custom: string | null;
  avoid_expressions: string | null;
  content_length: 'short' | 'medium' | 'long';
  arrangement: 'timeline' | 'location' | 'event';
  status: TripStatus;
  photo_count: number;
  fact_base_snapshot_id: string | null;
  story_id: string | null;
  cover_file_id: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface TripDetailDTO {
  album: TripDTO;
  groups: {
    _id: string;
    title: string;
    photo_ids: string[];
    location_label: string;
  }[];
  meta_summary: { high: number; low: number; unknown: number };
  active_job: { job_id: string; type: string; progress: number } | null;
}

