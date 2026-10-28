import type { PhotoRepository, TripRecord, TripRepository } from '@trailogue/database';

import { HttpError } from '../../errors/httpError.js';
import type { PhotoObjectStorage } from '../photos/photoService.js';

export class TripService {
  constructor(
    private readonly trips: TripRepository,
    private readonly photos: Pick<PhotoRepository, 'listStorageKeysForTrip'>,
    private readonly storage: Pick<PhotoObjectStorage, 'deleteObject' | 'createReadUrl'>,
  ) {}

  create(input: Parameters<TripRepository['create']>[0]) {
    return this.trips.create(input);
  }

  async findByIdForUser(id: string, userId: string) {
    const trip = await this.trips.findByIdForUser(id, userId);
    return trip ? this.withCoverUrl(trip) : null;
  }

  async listForUser(input: Parameters<TripRepository['listForUser']>[0]) {
    return Promise.all((await this.trips.listForUser(input)).map((trip) => this.withCoverUrl(trip)));
  }

  updateForUser(
    id: string,
    userId: string,
    input: Parameters<TripRepository['updateForUser']>[2],
  ) {
    return this.trips.updateForUser(id, userId, input);
  }

  async setCoverPhoto(id: string, userId: string, photoId: string | null): Promise<boolean> {
    if (!await this.trips.setCoverPhoto(id, userId, photoId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Trip or cover photo not found');
    }
    return true;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const trip = await this.trips.findByIdForUser(id, userId);
    if (!trip) return false;
    const keys = await this.photos.listStorageKeysForTrip(userId, id);
    for (let offset = 0; offset < keys.length; offset += 5) {
      await Promise.all(keys.slice(offset, offset + 5).map((key) => this.storage.deleteObject(key)));
    }
    const deleted = await this.trips.deleteForUser(id, userId);
    if (!deleted) throw new HttpError(409, 'CONFLICT', 'Trip could not be deleted');
    return true;
  }

  private async withCoverUrl(trip: TripRecord): Promise<TripRecord> {
    return {
      ...trip,
      coverPhotoUrl: trip.coverStorageKey ? await this.storage.createReadUrl(trip.coverStorageKey, 900) : null,
    };
  }
}

