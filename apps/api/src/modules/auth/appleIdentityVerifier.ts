export interface VerifiedAppleIdentity {
  providerUserId: string;
  email: string | null;
}

export interface AppleIdentityVerifier {
  verify(input: {
    identityToken: string;
    authorizationCode: string | null;
    nonce: string;
  }): Promise<VerifiedAppleIdentity>;
}

export class AppleIdentityVerificationNotConfigured implements AppleIdentityVerifier {
  async verify(): Promise<VerifiedAppleIdentity> {
    throw new Error('Apple identity verification is scheduled for Phase B');
  }
}
