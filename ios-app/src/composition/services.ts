import { createAuthApi } from '@/api/auth';
import { createApiClient } from '@/api/client';
import { createTripsApi } from '@/api/trips';
import { createPhotosApi } from '@/api/photos';
import { expoPhotoTransfer } from '@/features/photos/expoPhotoTransfer';
import { createPhotoUploadService } from '@/features/photos/photoUploadService';
import { createPhotoRepository } from '@/repositories/photoRepository';
import { createUsersApi } from '@/api/users';
import { createTripRepository } from '@/repositories/tripRepository';
import { authStorage } from '@/services/authStorage';

export const apiClient = createApiClient({ getToken: () => authStorage.getToken() });
export const authApi = createAuthApi(apiClient);
export const usersApi = createUsersApi(apiClient);
export const tripsApi = createTripsApi(apiClient);
export const photosApi = createPhotosApi(apiClient);
export const tripRepository = createTripRepository(tripsApi);
export const photoRepository = createPhotoRepository(photosApi);
export const photoUploadService = createPhotoUploadService({
  repository: photoRepository,
  transfer: expoPhotoTransfer,
});

