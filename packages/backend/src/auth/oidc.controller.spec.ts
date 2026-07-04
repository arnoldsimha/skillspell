/**
 * OidcController — Unit tests.
 *
 * Tests cli_redirect validation, protocol gate, and IdP redirect flow.
 */

// Mock openid-client before any imports that transitively load it (ESM-only module, breaks Jest CJS)
jest.mock('openid-client', () => ({
  discovery: jest.fn().mockResolvedValue({}),
  buildAuthorizationUrl: jest.fn().mockReturnValue(new URL('https://idp.example.com/authorize?state=test')),
  authorizationCodeGrant: jest.fn().mockResolvedValue({}),
  fetchUserInfo: jest.fn().mockResolvedValue({}),
  randomPKCECodeVerifier: jest.fn().mockReturnValue('test-verifier'),
  calculatePKCECodeChallenge: jest.fn().mockResolvedValue('test-challenge'),
  randomState: jest.fn().mockReturnValue('test-state'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORGANIZATION_REPOSITORY } from '@skillspell/shared';
import { OidcController } from './oidc.controller.js';
import { OidcAuthService } from './strategies/oidc.strategy.js';
import { CliAuthService } from './cli-auth.service.js';
import { TokenService } from './token.service.js';

// ─── Mock factories ────────────────────────────────────────────────────────

function buildOidcAuthServiceMock() {
  return {
    getLoginRedirectUrl: jest.fn().mockResolvedValue({
      redirectUrl: 'https://idp.example.com/authorize?state=test-state',
      state: 'test-state',
    }),
    consumeOidcState: jest.fn().mockReturnValue({
      code_verifier: 'verifier-xyz',
      expiresAt: Date.now() + 60_000,
    }),
    validateCallback: jest.fn().mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        authProviders: ['oidc'],
      },
      providerUserId: 'sub1',
      providerEmail: 'test@example.com',
      providerDisplayName: 'Test User',
    }),
    getFrontendRedirectUrl: jest.fn().mockReturnValue('https://app.example.com'),
    getCallbackUrl: jest.fn().mockReturnValue('https://app.example.com/api/auth/oidc/callback'),
  };
}

function buildOrgRepoMock(activeSsoProtocol = 'oidc') {
  return {
    findSingleton: jest.fn().mockResolvedValue({
      id: 'org-1',
      activeSsoProtocol,
      ssoLoginEnabled: true,
      passwordLoginEnabled: true,
    }),
  };
}

function buildResponse() {
  return {
    redirect: jest.fn(),
    cookie: jest.fn(),
  };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    protocol: 'https',
    get: jest.fn().mockReturnValue('app.example.com'),
    originalUrl: '/api/auth/oidc/callback?code=abc&state=test-state',
    path: '/api/auth/oidc/callback',
    headers: { 'user-agent': 'jest-test' },
    ip: '127.0.0.1',
    ...overrides,
  };
}

async function buildController(
  oidcAuthServiceMock = buildOidcAuthServiceMock(),
  orgRepoMock = buildOrgRepoMock(),
) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [OidcController],
    providers: [
      { provide: OidcAuthService, useValue: oidcAuthServiceMock },
      {
        provide: CliAuthService,
        useValue: {
          storeCliCode: jest.fn(),
          CODE_TTL_MS: 60_000,
        },
      },
      {
        provide: TokenService,
        useValue: {
          generateTokenPair: jest.fn().mockResolvedValue({
            accessToken: 'access-token-abc',
            refreshToken: 'refresh-token-xyz',
          }),
        },
      },
      { provide: ORGANIZATION_REPOSITORY, useValue: orgRepoMock },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'auth.refreshTokenExpiry') return '7d';
            if (key === 'app.isProduction') return false;
            return undefined;
          }),
        },
      },
    ],
  }).compile();

  return module.get<OidcController>(OidcController);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('OidcController (OIDC-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('oidcLogin', () => {
    it('OIDC-01a: rejects non-localhost cli_redirect with BadRequestException (400)', async () => {
      const controller = await buildController();
      const res = buildResponse();

      await expect(
        controller.oidcLoginCli({ cli_redirect: 'http://192.168.1.1/evil' }, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('OIDC-01a: also rejects https-based non-localhost redirect', async () => {
      const controller = await buildController();
      const res = buildResponse();

      await expect(
        controller.oidcLoginCli({ cli_redirect: 'https://attacker.com/callback' }, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('OIDC-01a: rejects userinfo bypass (localhost:x@evil.com)', async () => {
      const controller = await buildController();
      const res = buildResponse();

      // This string passes a naive startsWith('http://localhost:') check but the
      // real host is evil.com — it must be rejected to prevent SSO code leakage.
      await expect(
        controller.oidcLoginCli({ cli_redirect: 'http://localhost:1@evil.com/callback' }, res as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('OIDC-01b: CLI flow accepts loopback 127.0.0.1 cli_redirect', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      const controller = await buildController(oidcAuthServiceMock, buildOrgRepoMock('oidc'));
      const res = buildResponse();

      const result = await controller.oidcLoginCli(
        { cli_redirect: 'http://127.0.0.1:5000/callback' },
        res as any,
      );

      expect(result).toEqual({ redirectUrl: 'https://idp.example.com/authorize?state=test-state' });
    });

    it('OIDC-01b: CLI flow accepts localhost cli_redirect and returns redirectUrl', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      const orgRepoMock = buildOrgRepoMock('oidc');
      const controller = await buildController(oidcAuthServiceMock, orgRepoMock);
      const res = buildResponse();

      const result = await controller.oidcLoginCli(
        { cli_redirect: 'http://localhost:3001/callback' },
        res as any,
      );

      expect(oidcAuthServiceMock.getLoginRedirectUrl).toHaveBeenCalledWith(
        'http://localhost:3001/callback',
        undefined,
      );
      expect(result).toEqual({ redirectUrl: 'https://idp.example.com/authorize?state=test-state' });
    });

    it('OIDC-01b: browser flow redirects to IdP', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      const controller = await buildController(oidcAuthServiceMock);
      const res = buildResponse();

      await controller.oidcLoginBrowser(res as any);

      expect(oidcAuthServiceMock.getLoginRedirectUrl).toHaveBeenCalledWith();
      expect(res.redirect).toHaveBeenCalledWith('https://idp.example.com/authorize?state=test-state');
    });

    it('OIDC-01c: rejects when activeSsoProtocol is not oidc with UnauthorizedException', async () => {
      const orgRepoMock = buildOrgRepoMock('saml');
      const controller = await buildController(buildOidcAuthServiceMock(), orgRepoMock);
      const res = buildResponse();

      await expect(
        controller.oidcLoginBrowser(res as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('OIDC-01c: rejects when org has no activeSsoProtocol (null org)', async () => {
      const orgRepoMock = { findSingleton: jest.fn().mockResolvedValue(null) };
      const controller = await buildController(buildOidcAuthServiceMock(), orgRepoMock);
      const res = buildResponse();

      await expect(
        controller.oidcLoginBrowser(res as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('oidcCallback', () => {
    it('redirects to #error=csrf_failed when state param is missing', async () => {
      const controller = await buildController();
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback(undefined, undefined, req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://app.example.com/sso-callback#error=csrf_failed',
      );
    });

    it('redirects to #error=oidc_state_expired when consumeOidcState returns null', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      oidcAuthServiceMock.consumeOidcState.mockReturnValue(null);
      const controller = await buildController(oidcAuthServiceMock);
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback(
        'some-code',
        'unknown-state',
        req as any,
        res as any,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'https://app.example.com/sso-callback#error=oidc_state_expired',
      );
    });

    it('browser flow: sets redirect with access token fragment on success', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      // pendingState has no cliRedirect → browser flow
      oidcAuthServiceMock.consumeOidcState.mockReturnValue({
        code_verifier: 'verifier',
        expiresAt: Date.now() + 60_000,
      });
      const controller = await buildController(oidcAuthServiceMock);
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback('some-code', 'valid-state', req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/sso-callback#token='),
      );
    });

    it('CLI flow: redirects to cliRedirect with one-time code when pendingState has cliRedirect', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      oidcAuthServiceMock.consumeOidcState.mockReturnValue({
        code_verifier: 'verifier',
        cliRedirect: 'http://localhost:7777/callback',
        expiresAt: Date.now() + 60_000,
      });
      const cliAuthServiceMock = {
        storeCliCode: jest.fn(),
        CODE_TTL_MS: 60_000,
      };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [OidcController],
        providers: [
          { provide: OidcAuthService, useValue: oidcAuthServiceMock },
          { provide: CliAuthService, useValue: cliAuthServiceMock },
          {
            provide: TokenService,
            useValue: {
              generateTokenPair: jest.fn().mockResolvedValue({
                accessToken: 'access-abc',
                refreshToken: 'refresh-xyz',
              }),
            },
          },
          { provide: ORGANIZATION_REPOSITORY, useValue: buildOrgRepoMock() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string) => {
                if (key === 'auth.refreshTokenExpiry') return '7d';
                if (key === 'app.isProduction') return false;
                return undefined;
              }),
            },
          },
        ],
      }).compile();
      const controller = module.get<OidcController>(OidcController);
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback('code', 'state', req as any, res as any);

      expect(cliAuthServiceMock.storeCliCode).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: 'user-1',
          email: 'test@example.com',
          accessToken: 'access-abc',
          refreshToken: 'refresh-xyz',
        }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:7777/callback?code='),
      );
    });

    it('re-validates stored cli_redirect on callback and rejects a bypass URL', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      // A malicious cli_redirect that somehow reached the state store must not
      // receive the one-time code — the callback re-validates before redirecting.
      oidcAuthServiceMock.consumeOidcState.mockReturnValue({
        code_verifier: 'verifier',
        cliRedirect: 'http://localhost:1@evil.com/callback',
        expiresAt: Date.now() + 60_000,
      });
      const controller = await buildController(oidcAuthServiceMock);
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback('code', 'state', req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://app.example.com/sso-callback#error=invalid_redirect',
      );
      expect(res.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining('evil.com'),
      );
    });

    it('redirects to #error=sso_failed when validateCallback throws', async () => {
      const oidcAuthServiceMock = buildOidcAuthServiceMock();
      oidcAuthServiceMock.validateCallback.mockRejectedValue(new Error('token exchange failed'));
      oidcAuthServiceMock.consumeOidcState.mockReturnValue({
        code_verifier: 'verifier',
        expiresAt: Date.now() + 60_000,
      });
      const controller = await buildController(oidcAuthServiceMock);
      const res = buildResponse();
      const req = buildRequest();

      await controller.oidcCallback('code', 'state', req as any, res as any);

      expect(res.redirect).toHaveBeenCalledWith(
        'https://app.example.com/sso-callback#error=sso_failed',
      );
    });
  });
});
