import type { UpdateUserSettingsRequest } from '@trailogue/contracts';
import type { PhotoRepository, UserRecord, UserRepository } from '@trailogue/database';

import { HttpError } from '../../errors/httpError.js';
import type { PhotoObjectStorage } from '../photos/photoService.js';

export class UserService {
  constructor(
    private readonly users: Pick<UserRepository, 'findById' | 'updateSettings' | 'deleteForUser'>,
    private readonly photos: Pick<PhotoRepository, 'listStorageKeysForUser'>,
    private readonly storage: Pick<PhotoObjectStorage, 'deleteObject'>,
  ) {}

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.findById(id);
  }

  async update(id: string, input: UpdateUserSettingsRequest): Promise<UserRecord> {
    const current = await this.users.findById(id);
    if (!current) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    const retentionDays = input.retentionDays ?? current.retentionDays;
    if (retentionDays !== -1 && (retentionDays < 1 || retentionDays > 3650)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Retention period is invalid');
    }
    const updated = await this.users.updateSettings({
      id,
      displayName: input.displayName === undefined
        ? current.displayName
        : input.displayName?.trim() || null,
      retentionDays,
      privacyAgreedAt: input.privacyAgreed === undefined
        ? current.privacyAgreedAt
        : input.privacyAgreed ? new Date() : null,
    });
    if (!updated) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    return updated;
  }

  async deleteAccount(id: string): Promise<void> {
    const current = await this.users.findById(id);
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'User not found');
    const keys = await this.photos.listStorageKeysForUser(id);
    for (let index = 0; index < keys.length; index += 5) {
      await Promise.all(keys.slice(index, index + 5).map((key) => this.storage.deleteObject(key)));
    }
    if (!await this.users.deleteForUser(id)) {
      throw new HttpError(409, 'CONFLICT', 'Account could not be deleted');
    }
  }
}
