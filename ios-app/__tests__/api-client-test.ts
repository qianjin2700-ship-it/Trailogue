import { createApiClient } from '@/api/client';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('API client', () => {
  it('returns data from a successful envelope and adds the session token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, { data: { id: '1' } }));
    const client = createApiClient({
      baseUrl: 'https://api.example.com/',
      fetch: fetchMock,
      getToken: async () => 'session-token',
    });

    await expect(client.request('/v1/example')).resolves.toEqual({ data: { id: '1' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/example',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer session-token' }) })
    );
  });

  it('normalizes a 401 response', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: jest.fn().mockResolvedValue(response(401, { error: { code: 'UNAUTHORIZED', message: 'raw backend message', requestId: 'request-1' } })),
    });

    await expect(client.request('/v1/example')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('normalizes a 500 response', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: jest.fn().mockResolvedValue(response(500, { error: { code: 'INTERNAL_ERROR', message: 'hidden', requestId: 'request-2' } })),
    });

    await expect(client.request('/v1/example')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      status: 500,
    });
  });

  it('normalizes a network failure without exposing its details', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      fetch: jest.fn().mockRejectedValue(new Error('socket details')),
    });

    await expect(client.request('/v1/example')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Check your connection and try again.',
    });
  });
});
