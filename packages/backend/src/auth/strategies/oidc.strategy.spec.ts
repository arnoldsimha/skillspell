/**
 * OidcAuthService — Unit tests.
 *
 * Tests claim extraction, attribute mapping, user auto-provisioning, and
 * pendingStateMap single-use enforcement.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  OIDC_CONFIG_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '@skillspell/shared';
import { OidcAuthService } from './oidc.strategy.js';
import { EncryptionService } from '../../common/services/encryption.service.js';

// ─── openid-client mock ────────────────────────────────────────────────────
// jest.mock factories are hoisted before variable initialization, so the factory
// must not reference module-level variables. Implementations are set in beforeEach.

jest.mock('openid-client', () => ({
  Configuration: jest.fn(),
  discovery: jest.fn(),
  allowInsecureRequests: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  fetchUserInfo: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  randomState: jest.fn(),
  skipStateCheck: Symbol('skipStateCheck'),
}));

const mockServerMetadata = {
  issuer: 'https://idp.example.com',
  authorization_endpoint: 'https://idp.example.com/authorize',
  token_endpoint: 'https://idp.example.com/token',
  jwks_uri: 'https://idp.example.com/.well-known/jwks.json',
};

const mockDiscoveryConfig = {
  serverMetadata: jest.fn(),
};

// ─── Shared mock factories ─────────────────────────────────────────────────

const mockOrg = {
  id: 'org-1',
  defaultTimezone: 'UTC',
  ssoLoginEnabled: true,
  activeSsoProtocol: 'oidc',
};

const baseOidcConfig = {
  issuerUrl: 'https://idp.example.com',
  clientId: 'client-id',
  encryptedClientSecret: 'client-secret',
  scopes: ['openid', 'email', 'profile'],
  attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name' },
  autoProvision: true,
  defaultRole: 'user' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user' as const,
  authProviders: ['oidc'],
};

function buildMocks(overrides: {
  oidcConfig?: object | null;
  foundUser?: object | null;
  createdUser?: object;
} = {}) {
  const oidcConfigRepo = {
    getOidcConfig: jest.fn().mockResolvedValue(
      overrides.oidcConfig !== undefined ? overrides.oidcConfig : baseOidcConfig,
    ),
    saveOidcConfig: jest.fn(),
    deleteOidcConfig: jest.fn(),
  };

  const orgRepo = {
    findSingleton: jest.fn().mockResolvedValue(mockOrg),
  };

  const authTokenRepo = {
    saveSsoLink: jest.fn().mockResolvedValue(undefined),
  };

  const userRepo = {
    findByEmail: jest.fn().mockResolvedValue(
      overrides.foundUser !== undefined ? overrides.foundUser : mockUser,
    ),
    create: jest.fn().mockResolvedValue(overrides.createdUser ?? mockUser),
    update: jest.fn().mockResolvedValue({ ...(overrides.createdUser ?? mockUser), authProviders: ['oidc'] }),
  };

  return { oidcConfigRepo, orgRepo, authTokenRepo, userRepo };
}

// In-memory store backing the CACHE_MANAGER mock for single-use state tests
const cacheStore = new Map<string, unknown>();

const mockCacheManager = {
  get: jest.fn((key: string) => Promise.resolve(cacheStore.get(key) ?? null)),
  set: jest.fn((key: string, value: unknown) => { cacheStore.set(key, value); return Promise.resolve(); }),
  del: jest.fn((key: string) => { cacheStore.delete(key); return Promise.resolve(); }),
};

async function buildService(
  mocks: ReturnType<typeof buildMocks>,
  { isProduction = false } = {},
): Promise<OidcAuthService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OidcAuthService,
      { provide: OIDC_CONFIG_REPOSITORY, useValue: mocks.oidcConfigRepo },
      { provide: ORGANIZATION_REPOSITORY, useValue: mocks.orgRepo },
      { provide: AUTH_TOKEN_REPOSITORY, useValue: mocks.authTokenRepo },
      { provide: USER_REPOSITORY, useValue: mocks.userRepo },
      { provide: EncryptionService, useValue: { decrypt: jest.fn((v: string) => v), encrypt: jest.fn((v: string) => v) } },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'app.isProduction') return isProduction;
            return 'https://app.example.com';
          }),
        },
      },
      { provide: CACHE_MANAGER, useValue: mockCacheManager },
    ],
  }).compile();

  return module.get<OidcAuthService>(OidcAuthService);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('OidcAuthService (OIDC-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();

    // Re-apply mockCacheManager implementations after clearAllMocks
    mockCacheManager.get.mockImplementation((key: string) => Promise.resolve(cacheStore.get(key) ?? null));
    mockCacheManager.set.mockImplementation((key: string, value: unknown) => { cacheStore.set(key, value); return Promise.resolve(); });
    mockCacheManager.del.mockImplementation((key: string) => { cacheStore.delete(key); return Promise.resolve(); });

    // Re-apply default mocks after clearAllMocks
    const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
    mockDiscoveryConfig.serverMetadata.mockReturnValue(mockServerMetadata);
    clientMock.Configuration.mockImplementation(() => ({ _reconstructed: true }));
    clientMock.discovery.mockResolvedValue(mockDiscoveryConfig);
    clientMock.allowInsecureRequests.mockReset();
    clientMock.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'sub1', email: 'test@example.com' }),
      access_token: 'access123',
    });
    clientMock.fetchUserInfo.mockResolvedValue({
      given_name: 'John',
      family_name: 'Doe',
      email: 'test@example.com',
    });
    clientMock.randomPKCECodeVerifier.mockReturnValue('test-verifier');
    clientMock.calculatePKCECodeChallenge.mockResolvedValue('test-challenge');
    clientMock.randomState.mockReturnValue('test-state');
    clientMock.buildAuthorizationUrl.mockReturnValue(
      new URL('https://idp.example.com/authorize?state=test-state'),
    );
  });

  it('OIDC-02a: validateCallback extracts email using attributeMapping.email claim', async () => {
    // attributeMapping.email = 'email', ID token claims = { sub: 'sub1', email: 'test@example.com' }
    const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
    clientMock.fetchUserInfo.mockResolvedValue({ email: 'test@example.com' });
    clientMock.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'sub1', email: 'test@example.com' }),
      access_token: 'access123',
    });

    const mocks = buildMocks();
    const service = await buildService(mocks);

    const pendingState = {
      code_verifier: 'test-verifier',
      expiresAt: Date.now() + 60_000,
    };

    const result = await service.validateCallback(
      'https://app.example.com/api/auth/oidc/callback?code=abc&state=test-state',
      pendingState,
    );

    expect(result.user.email).toBe('test@example.com');
    expect(result.providerEmail).toBe('test@example.com');
    expect(result.providerUserId).toBe('sub1');
  });

  it('OIDC-02b: validateCallback extracts firstName and lastName from mapped claims', async () => {
    // attributeMapping.firstName = 'given_name', userInfo = { given_name: 'John', family_name: 'Doe' }
    const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
    clientMock.fetchUserInfo.mockResolvedValue({
      given_name: 'John',
      family_name: 'Doe',
      email: 'test@example.com',
    });

    const mocks = buildMocks();
    const service = await buildService(mocks);

    const pendingState = {
      code_verifier: 'test-verifier',
      expiresAt: Date.now() + 60_000,
    };

    const result = await service.validateCallback(
      'https://app.example.com/api/auth/oidc/callback?code=abc&state=test-state',
      pendingState,
    );

    expect(result.providerDisplayName).toBe('John Doe');
  });

  it('OIDC-02c: validateCallback auto-provisions user when autoProvision=true and email not found', async () => {
    const newUser = {
      id: 'user-new',
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
      role: 'user' as const,
      authProviders: ['oidc'],
    };

    const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
    clientMock.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'sub-new', email: 'new@example.com' }),
      access_token: 'access456',
    });
    clientMock.fetchUserInfo.mockResolvedValue({
      given_name: 'New',
      family_name: 'User',
      email: 'new@example.com',
    });

    const mocks = buildMocks({ foundUser: null, createdUser: newUser });
    const service = await buildService(mocks);

    const pendingState = {
      code_verifier: 'test-verifier',
      expiresAt: Date.now() + 60_000,
    };

    const result = await service.validateCallback(
      'https://app.example.com/api/auth/oidc/callback?code=abc&state=test-state',
      pendingState,
    );

    expect(mocks.userRepo.create).toHaveBeenCalledTimes(1);
    expect(mocks.userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        role: 'user',
        orgId: 'org-1',
      }),
    );
    expect(result.user.id).toBe('user-new');
  });

  it('OIDC-02d: consumeOidcState is single-use — second call returns null', async () => {
    cacheStore.clear();
    const mocks = buildMocks();
    const service = await buildService(mocks);

    const stateKey = 'state-abc-123';
    const entry = {
      code_verifier: 'verifier-xyz',
      expiresAt: Date.now() + 60_000,
    };

    await service.storeOidcState(stateKey, entry);

    // First call: should return the entry
    const first = await service.consumeOidcState(stateKey);
    expect(first).not.toBeNull();
    expect(first?.code_verifier).toBe('verifier-xyz');

    // Second call: must return null (single-use enforcement)
    const second = await service.consumeOidcState(stateKey);
    expect(second).toBeNull();
  });

  it('getLoginRedirectUrl stores cliState in the pending state for the callback echo (security finding #3)', async () => {
    cacheStore.clear();
    const client = jest.requireMock('openid-client');
    client.discovery.mockResolvedValue(mockDiscoveryConfig);
    mockDiscoveryConfig.serverMetadata.mockReturnValue(mockServerMetadata);
    client.calculatePKCECodeChallenge.mockResolvedValue('test-challenge');
    client.randomState.mockReturnValue('server-state-1');
    client.buildAuthorizationUrl.mockReturnValue(
      new URL('https://idp.example.com/authorize?state=server-state-1'),
    );

    const service = await buildService(buildMocks());
    await service.getLoginRedirectUrl(
      'http://localhost:7777/callback',
      'cli-verifier',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );

    const entry = await service.consumeOidcState('server-state-1');
    expect(entry?.cliRedirect).toBe('http://localhost:7777/callback');
    expect(entry?.cliState).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });

  it('OIDC-02e: validateCallback throws UnauthorizedException when autoProvision=false and user not found', async () => {
    const configNoProvision = {
      ...baseOidcConfig,
      autoProvision: false,
    };

    const mocks = buildMocks({ oidcConfig: configNoProvision, foundUser: null });
    const service = await buildService(mocks);

    const pendingState = {
      code_verifier: 'test-verifier',
      expiresAt: Date.now() + 60_000,
    };

    await expect(
      service.validateCallback(
        'https://app.example.com/api/auth/oidc/callback?code=abc&state=test-state',
        pendingState,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('getDiscoveryConfig — cache behaviour', () => {
    const cacheKey = `oidc:config:${baseOidcConfig.issuerUrl}`;

    it('OIDC-02f: cache miss — calls discovery and stores serverMetadata() in the cache', async () => {
      const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
      const mocks = buildMocks();
      const service = await buildService(mocks);

      const config = await service.getDiscoveryConfig(baseOidcConfig as any);

      expect(clientMock.discovery).toHaveBeenCalledTimes(1);
      expect(clientMock.discovery).toHaveBeenCalledWith(
        new URL(baseOidcConfig.issuerUrl),
        baseOidcConfig.clientId,
        baseOidcConfig.encryptedClientSecret, // decrypt() is identity mock
        undefined,
        expect.anything(),
      );
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        cacheKey,
        mockServerMetadata,
        expect.any(Number),
      );
      expect(config).toBe(mockDiscoveryConfig);
    });

    it('OIDC-02g: cache hit — reconstructs Configuration without calling discovery', async () => {
      const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
      // Pre-populate cache with serialized server metadata
      cacheStore.set(cacheKey, mockServerMetadata);

      const mocks = buildMocks();
      const service = await buildService(mocks);

      await service.getDiscoveryConfig(baseOidcConfig as any);

      expect(clientMock.discovery).not.toHaveBeenCalled();
      expect(clientMock.Configuration).toHaveBeenCalledWith(
        mockServerMetadata,
        baseOidcConfig.clientId,
        baseOidcConfig.encryptedClientSecret,
      );
    });

    it('OIDC-02h: non-prod cache hit — calls allowInsecureRequests on reconstructed config', async () => {
      const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
      cacheStore.set(cacheKey, mockServerMetadata);

      const mocks = buildMocks();
      const service = await buildService(mocks, { isProduction: false });
      const reconstructed = await service.getDiscoveryConfig(baseOidcConfig as any);

      expect(clientMock.allowInsecureRequests).toHaveBeenCalledTimes(1);
      expect(clientMock.allowInsecureRequests).toHaveBeenCalledWith(reconstructed);
    });

    it('OIDC-02i: prod cache hit — does NOT call allowInsecureRequests', async () => {
      const clientMock = jest.requireMock('openid-client') as Record<string, jest.Mock>;
      cacheStore.set(cacheKey, mockServerMetadata);

      const mocks = buildMocks();
      const service = await buildService(mocks, { isProduction: true });
      await service.getDiscoveryConfig(baseOidcConfig as any);

      expect(clientMock.allowInsecureRequests).not.toHaveBeenCalled();
    });
  });
});
