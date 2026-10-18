import {
  createSessionToken,
  hashSessionToken,
  type SessionRepository,
  type SessionRecord,
} from '@trailogue/database';

export class SessionService {
  constructor(
    private readonly sessions: Pick<
      SessionRepository,
      'create' | 'findActiveByTokenHash' | 'revoke'
    >,
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  async create(userId: string, now = new Date()): Promise<{
    token: string;
    session: SessionRecord;
  }> {
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token, this.secret);
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1_000);
    const session = await this.sessions.create({ userId, tokenHash, expiresAt });
    return { token, session };
  }

  async verify(token: string, now = new Date()): Promise<SessionRecord | null> {
    return this.sessions.findActiveByTokenHash(hashSessionToken(token, this.secret), now);
  }

  async revoke(sessionId: string, now = new Date()): Promise<boolean> {
    return this.sessions.revoke(sessionId, now);
  }
}
