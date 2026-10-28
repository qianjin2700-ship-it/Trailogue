import type { ApiDataResponse, ShareLinkDTO } from '@trailogue/contracts';

import type { ApiClient } from './client';

export interface SharesApi {
  create(tripId: string): Promise<ShareLinkDTO>;
  revoke(shareId: string): Promise<void>;
}

export function createSharesApi(client: ApiClient): SharesApi {
  return {
    async create(tripId) {
      return (await client.request<ApiDataResponse<ShareLinkDTO>>(
        `/v1/trips/${encodeURIComponent(tripId)}/shares`,
        { method: 'POST' },
      )).data;
    },
    async revoke(shareId) {
      await client.request(`/v1/shares/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
    },
  };
}
