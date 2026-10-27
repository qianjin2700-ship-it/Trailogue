export const identityProviders = ['apple', 'google', 'email'] as const;
export type IdentityProvider = (typeof identityProviders)[number];

export const tripStatuses = ['draft', 'published', 'archived'] as const;
export type TripStatus = (typeof tripStatuses)[number];

export const photoStatuses = ['pending', 'ready', 'failed', 'deleting'] as const;
export type PhotoStatus = (typeof photoStatuses)[number];

export const storySources = ['user', 'ai', 'mixed'] as const;
export type StorySource = (typeof storySources)[number];

export const bookStatuses = ['draft', 'generating', 'ready', 'failed'] as const;
export type BookStatus = (typeof bookStatuses)[number];

export const jobStatuses = ['pending', 'running', 'completed', 'failed'] as const;
export type JobStatus = (typeof jobStatuses)[number];

export interface User {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TripSummary {
  id: string;
  title: string;
  description: string | null;
  destinationName: string | null;
  status: TripStatus;
  coverPhotoId: string | null;
  photoCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type Trip = TripSummary;
