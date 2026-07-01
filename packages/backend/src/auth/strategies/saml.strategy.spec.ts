import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SAML_CONFIG_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
  type ISamlConfigRepository,
  type IOrganizationRepository,
  type IAuthTokenRepository,
  type IUserRepository,
  type Organization,
  type User,
  type SamlProviderConfig,
} from '@skillspell/shared';
import { SamlAuthService } from './saml.strategy';

/**
 * Unit tests for SamlAuthService — SAML SSO authentication.
 *
 * Tests cover:
 * - generateRelayState: format validation, HMAC signature
 * - verifyRelayState: happy path, tampered signature, expired nonce,
 *   missing/malformed input
 * - getSamlConfig: delegation to repository
 * - getLoginRedirectUrl: null when SSO not configured
 */

const TEST_ORG: Organization = {
  id: 'org-1',
  name: 'Test Org',
  passwordLoginEnabled: true,
  ssoLoginEnabled: true,
  marketplaceAllowSelfApproval: false,
  marketplaceEnabled: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const TEST_SAML_CONFIG: SamlProviderConfig = {
  id: 'test-idp',
  displayName: 'Test IdP',
  idpEntityId: 'https://idp.example.com',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'MIIC... (test cert)',
  spEntityId: 'https://app.example.com',
  attributeMapping: {
    email: 'email',
    firstName: 'given_name',
    lastName: 'family_name',
  },
  autoProvision: true,
  defaultRole: 'user',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('SamlAuthService', () => {
  let service: SamlAuthService;
  let samlConfigRepo: jest.Mocked<ISamlConfigRepository>;
  let orgRepo: jest.Mocked<IOrganizationRepository>;
  let authTokenRepo: jest.Mocked<IAuthTokenRepository>;
  let userRepo: jest.Mocked<IUserRepository>;

  beforeEach(async () => {
    samlConfigRepo = {
      getSamlConfig: jest.fn(),
      saveSamlConfig: jest.fn(),
      deleteSamlConfig: jest.fn(),
    } as jest.Mocked<ISamlConfigRepository>;

    orgRepo = {
      findSingleton: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IOrganizationRepository>;

    authTokenRepo = {
      saveRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      findRefreshTokenByTokenId: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokens: jest.fn(),
      cleanupExpiredTokens: jest.fn(),
      deleteAllExpiredTokens: jest.fn(),
      getSetupState: jest.fn(),
      saveSetupState: jest.fn(),
      saveSsoLink: jest.fn(),
      findBySsoProvider: jest.fn(),
      getSsoLinks: jest.fn(),
      removeSsoLink: jest.fn(),
    } as jest.Mocked<IAuthTokenRepository>;

    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      findByOwner: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlAuthService,
        { provide: SAML_CONFIG_REPOSITORY, useValue: samlConfigRepo },
        { provide: ORGANIZATION_REPOSITORY, useValue: orgRepo },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-jwt-secret-key'),
          },
        },
      ],
    }).compile();

    service = module.get<SamlAuthService>(SamlAuthService);
  });

  // ── generateRelayState ────────────────────────────────────────────────

  describe('generateRelayState', () => {
    it('should produce a base64url(JSON).hmac format string', () => {
      const relayState = service.generateRelayState();
      // New format: <base64url(JSON)>.<64-hex-hmac>
      expect(relayState).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
      // Decode payload
      const dotIdx = relayState.lastIndexOf('.');
      const encoded = relayState.slice(0, dotIdx);
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      // nonce: 32 hex chars (16 bytes)
      expect(payload.n).toMatch(/^[0-9a-f]{32}$/);
      // timestamp: number
      expect(typeof payload.t).toBe('number');
      // no cli_redirect for browser flow
      expect(payload.r).toBeUndefined();
    });

    it('should produce unique relay states on each call', () => {
      const rs1 = service.generateRelayState();
      const rs2 = service.generateRelayState();
      expect(rs1).not.toBe(rs2);
    });
  });

  // ── verifyRelayState ──────────────────────────────────────────────────

  describe('verifyRelayState', () => {
    it('should return true for a freshly generated relay state', () => {
      const relayState = service.generateRelayState();
      expect(service.verifyRelayState(relayState)).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(service.verifyRelayState(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(service.verifyRelayState('')).toBe(false);
    });

    it('should return false for malformed input (too few parts)', () => {
      expect(service.verifyRelayState('just-one-part')).toBe(false);
      expect(service.verifyRelayState('two.parts')).toBe(false);
    });

    it('should return false for tampered HMAC signature', () => {
      const relayState = service.generateRelayState();
      const parts = relayState.split('.');
      // Tamper with the HMAC
      parts[2] = 'a'.repeat(64);
      expect(service.verifyRelayState(parts.join('.'))).toBe(false);
    });

    it('should return false for tampered nonce', () => {
      const relayState = service.generateRelayState();
      const parts = relayState.split('.');
      // Tamper with the nonce
      parts[0] = 'b'.repeat(32);
      expect(service.verifyRelayState(parts.join('.'))).toBe(false);
    });

    it('should return false for tampered timestamp', () => {
      const relayState = service.generateRelayState();
      const parts = relayState.split('.');
      // Tamper with the timestamp (change by 1ms)
      parts[1] = String(parseInt(parts[1], 10) + 1);
      expect(service.verifyRelayState(parts.join('.'))).toBe(false);
    });

    it('should return false for expired relay state (>5 min old)', () => {
      // Manually construct a relay state with an old timestamp
      // We need to use the same HMAC key, so we can't easily test this
      // without access to the private jwtSecret. Instead, mock Date.now.
      const relayState = service.generateRelayState();

      // Fast-forward 6 minutes
      const originalNow = Date.now;
      Date.now = () => originalNow() + 6 * 60 * 1000;

      try {
        expect(service.verifyRelayState(relayState)).toBe(false);
      } finally {
        Date.now = originalNow;
      }
    });

    it('should accept relay state within the 5 minute window', () => {
      const relayState = service.generateRelayState();

      // Fast-forward 4 minutes (within 5 min TTL)
      const originalNow = Date.now;
      Date.now = () => originalNow() + 4 * 60 * 1000;

      try {
        expect(service.verifyRelayState(relayState)).toBe(true);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  // ── getSamlConfig ─────────────────────────────────────────────────────

  describe('getSamlConfig', () => {
    it('should return null when no organization exists', async () => {
      orgRepo.findSingleton.mockResolvedValue(null);

      const result = await service.getSamlConfig();
      expect(result).toBeNull();
    });

    it('should return config from repository', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      samlConfigRepo.getSamlConfig.mockResolvedValue(TEST_SAML_CONFIG);

      const result = await service.getSamlConfig();
      expect(result).toEqual(TEST_SAML_CONFIG);
      expect(samlConfigRepo.getSamlConfig).toHaveBeenCalledWith('org-1');
    });

    it('should return null when no SAML config exists', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      samlConfigRepo.getSamlConfig.mockResolvedValue(null);

      const result = await service.getSamlConfig();
      expect(result).toBeNull();
    });
  });

  // ── getLoginRedirectUrl ───────────────────────────────────────────────

  describe('getLoginRedirectUrl', () => {
    it('should throw when SSO is not configured', async () => {
      orgRepo.findSingleton.mockResolvedValue(null);

      await expect(service.getLoginRedirectUrl()).rejects.toThrow(
        'SAML SSO is not configured or is disabled',
      );
    });

    it('should throw when no SAML config in DB', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      samlConfigRepo.getSamlConfig.mockResolvedValue(null);

      await expect(service.getLoginRedirectUrl()).rejects.toThrow(
        'SAML SSO is not configured or is disabled',
      );
    });
  });

  // ── getSpMetadataXml ──────────────────────────────────────────────────

  describe('getSpMetadataXml', () => {
    it('should throw when SSO is not configured', async () => {
      orgRepo.findSingleton.mockResolvedValue(null);

      await expect(service.getSpMetadataXml()).rejects.toThrow(
        'SAML SSO is not configured',
      );
    });
  });

  // ── generateRelayState — CLI extensions ───────────────

  describe('generateRelayState — CLI extensions (SSO-01a, D-07)', () => {
    it('embeds cliRedirect in base64url JSON payload when provided', () => {
      const relayState = service.generateRelayState('http://localhost:9876/callback');
      // Format: <base64url>.<hmac>
      expect(relayState).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
      // Decode the payload
      const dotIdx = relayState.lastIndexOf('.');
      const encoded = relayState.slice(0, dotIdx);
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      expect(typeof payload.n).toBe('string');
      expect(typeof payload.t).toBe('number');
      expect(payload.r).toBe('http://localhost:9876/callback');
    });

    it('omits r field when no cliRedirect provided (browser flow)', () => {
      const relayState = service.generateRelayState();
      const dotIdx = relayState.lastIndexOf('.');
      const encoded = relayState.slice(0, dotIdx);
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      expect(payload.r).toBeUndefined();
    });
  });

  // ── verifyRelayState — format compatibility ─────────────────

  describe('verifyRelayState — format compatibility (SSO-01b)', () => {
    it('accepts new base64url.hmac format with valid HMAC and TTL', () => {
      const relayState = service.generateRelayState();
      expect(service.verifyRelayState(relayState)).toBe(true);
    });

    it('rejects old nonce.timestamp.hmac format (clean cutover)', () => {
      const oldFormat = 'abc123.1234567890.deadbeefdeadbeefdeadbeefdeadbeef';
      expect(service.verifyRelayState(oldFormat)).toBe(false);
    });

    it('rejects tampered payload (HMAC mismatch)', () => {
      const relayState = service.generateRelayState();
      const tampered = relayState.slice(0, -4) + 'dead';
      expect(service.verifyRelayState(tampered)).toBe(false);
    });

    it('rejects expired RelayState (TTL exceeded)', () => {
      const relayState = service.generateRelayState();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 6 * 60 * 1000; // +6 minutes
      try {
        expect(service.verifyRelayState(relayState)).toBe(false);
      } finally {
        Date.now = originalNow;
      }
    });
  });

  // ── verifyRelayState — explicit length guard before timingSafeEqual ──

  describe('verifyRelayState — WR-003 length guard', () => {
    it('returns false when provided HMAC has wrong length (short non-hex string)', () => {
      // Craft a RelayState where the HMAC portion is only 3 chars — not 64 hex chars.
      // Before the fix: timingSafeEqual throws TypeError (swallowed by catch).
      // After the fix: explicit length check returns false before timingSafeEqual is called.
      const encoded = Buffer.from(JSON.stringify({ n: 'abc', t: Date.now() })).toString('base64url');
      const shortHmac = 'abc'; // 3 chars, not 64
      const relayState = `${encoded}.${shortHmac}`;
      expect(service.verifyRelayState(relayState)).toBe(false);
    });

    it('returns false when provided HMAC is empty string after dot', () => {
      const encoded = Buffer.from(JSON.stringify({ n: 'abc', t: Date.now() })).toString('base64url');
      const relayState = `${encoded}.`;
      expect(service.verifyRelayState(relayState)).toBe(false);
    });

    it('still returns true for a correctly-formed relay state (regression guard)', () => {
      const relayState = service.generateRelayState();
      expect(service.verifyRelayState(relayState)).toBe(true);
    });
  });

  // ── publicUrl used for callbackUrl ─────────────────────────────

  describe('CR-004: publicUrl used for SAML callbackUrl', () => {
    it('getFrontendRedirectUrl returns the publicUrl from APP_PUBLIC_URL (not spEntityId)', () => {
      // The ConfigService mock returns 'test-jwt-secret-key' for every get() call,
      // so publicUrl is 'test-jwt-secret-key' in the test service instance.
      // This test documents that getFrontendRedirectUrl delegates to this.publicUrl,
      // confirming that createSamlInstance must use this.publicUrl for callbackUrl.
      const result = service.getFrontendRedirectUrl();
      // publicUrl comes from configService.get('app.publicUrl') which the mock returns as
      // 'test-jwt-secret-key' — strip trailing slashes per getFrontendRedirectUrl impl.
      expect(result).toBe('test-jwt-secret-key');
    });

    it('publicUrl is independent of spEntityId value in DB config (CR-004 isolation)', async () => {
      // Verify that the service can be constructed with a different publicUrl
      // than what would be stored in spEntityId — proving the decoupling.
      const module2 = await (await import('@nestjs/testing')).Test.createTestingModule({
        providers: [
          SamlAuthService,
          { provide: SAML_CONFIG_REPOSITORY, useValue: samlConfigRepo },
          { provide: ORGANIZATION_REPOSITORY, useValue: orgRepo },
          { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepo },
          { provide: USER_REPOSITORY, useValue: userRepo },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'app.publicUrl') return 'https://trusted.env.example.com';
                return 'test-jwt-secret-key';
              }),
            },
          },
        ],
      }).compile();

      const service2 = module2.get<SamlAuthService>(SamlAuthService);
      // publicUrl comes from env — it is NOT spEntityId ('https://app.example.com')
      expect(service2.getFrontendRedirectUrl()).toBe('https://trusted.env.example.com');
    });
  });

  // ── extractCliRedirect ───────────────────────────────────────

  describe('extractCliRedirect (SSO-01c)', () => {
    it('returns cli_redirect from valid RelayState when present', () => {
      const relayState = service.generateRelayState('http://localhost:9876/callback');
      expect(service.extractCliRedirect(relayState)).toBe('http://localhost:9876/callback');
    });

    it('returns null when cli_redirect absent (browser flow)', () => {
      const relayState = service.generateRelayState();
      expect(service.extractCliRedirect(relayState)).toBeNull();
    });

    it('returns null on corrupt string', () => {
      expect(service.extractCliRedirect('not-valid-at-all')).toBeNull();
    });
  });
});
