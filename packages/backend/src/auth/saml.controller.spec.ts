import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ORGANIZATION_REPOSITORY } from '@skillspell/shared';
import { SamlController } from './saml.controller.js';
import { TokenService } from './token.service.js';
import { SamlAuthService } from './strategies/saml.strategy.js';
import { CliAuthService } from './cli-auth.service.js';

describe('SamlController — CLI SSO extensions', () => {
  let controller: SamlController;
  let samlAuthService: jest.Mocked<Partial<SamlAuthService>>;
  let tokenService: jest.Mocked<Partial<TokenService>>;
  let cliAuthService: jest.Mocked<Partial<CliAuthService>>;

  beforeEach(async () => {
    samlAuthService = {
      generateRelayState: jest.fn().mockReturnValue('encoded.hmac'),
      verifyRelayState: jest.fn().mockReturnValue(true),
      getLoginRedirectUrl: jest.fn().mockResolvedValue('https://idp.example.com/sso'),
      validateCallback: jest.fn(),
      extractCliRedirect: jest.fn().mockReturnValue(null),
      extractCliState: jest.fn().mockReturnValue(null),
      getFrontendRedirectUrl: jest.fn().mockReturnValue('https://app.skillspell.dev'),
      getSamlConfig: jest.fn().mockResolvedValue(null),
    };
    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({ accessToken: 'access.token', refreshToken: 'refresh.token' }),
      generateAccessToken: jest.fn().mockReturnValue('access.token'),
    };
    cliAuthService = {
      storeCliCode: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SamlController],
      providers: [
        { provide: SamlAuthService, useValue: samlAuthService },
        { provide: TokenService, useValue: tokenService },
        { provide: CliAuthService, useValue: cliAuthService },
        { provide: ORGANIZATION_REPOSITORY, useValue: { findSingleton: jest.fn().mockResolvedValue({ ssoLoginEnabled: true }) } },
        { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((key: string) => {
          if (key === 'auth.refreshTokenExpiry') return '7d';
          if (key === 'app.isProduction') return false;
          return undefined;
        }) } },
      ],
    }).compile();

    controller = module.get<SamlController>(SamlController);
  });

  describe('samlLogin — cli_redirect validation (SSO-01, D-06)', () => {
    it('7-02-01: rejects non-localhost cli_redirect with BadRequestException', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(
        controller.samlLogin('http://evil.com/callback', undefined, mockRes),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid localhost cli_redirect without error', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(
        controller.samlLogin('http://localhost:12345/callback', undefined, mockRes),
      ).resolves.not.toThrow();
      expect(samlAuthService.generateRelayState).toHaveBeenCalledWith('http://localhost:12345/callback', undefined);
    });

    it('accepts no cli_redirect (browser flow)', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(controller.samlLogin(undefined, undefined, mockRes)).resolves.not.toThrow();
      expect(samlAuthService.generateRelayState).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  describe('samlLogin — CLI state nonce (security finding #3)', () => {
    const CLI_STATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

    it('passes a valid state through to generateRelayState', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await controller.samlLogin('http://localhost:12345/callback', CLI_STATE, mockRes);
      expect(samlAuthService.generateRelayState).toHaveBeenCalledWith('http://localhost:12345/callback', CLI_STATE);
    });

    it('rejects a state with invalid characters', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(
        controller.samlLogin('http://localhost:12345/callback', 'bad state<script>', mockRes),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an overlong state', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(
        controller.samlLogin('http://localhost:12345/callback', 'a'.repeat(200), mockRes),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSsoStatus — OIDC extensions (OIDC-03, D-08)', () => {
    it('OIDC-03: returns oidcEnabled=true and activeSsoProtocol=oidc when org has activeSsoProtocol=oidc', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [SamlController],
        providers: [
          { provide: SamlAuthService, useValue: { ...samlAuthService, getSamlConfig: jest.fn().mockResolvedValue(null) } },
          { provide: TokenService, useValue: tokenService },
          { provide: CliAuthService, useValue: cliAuthService },
          {
            provide: ORGANIZATION_REPOSITORY,
            useValue: {
              findSingleton: jest.fn().mockResolvedValue({
                ssoLoginEnabled: true,
                passwordLoginEnabled: true,
                activeSsoProtocol: 'oidc',
              }),
            },
          },
          { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((key: string) => {
            if (key === 'auth.refreshTokenExpiry') return '7d';
            if (key === 'app.isProduction') return false;
            return undefined;
          }) } },
        ],
      }).compile();

      const oidcController = module.get<SamlController>(SamlController);
      const status = await oidcController.getSsoStatus();

      expect(status.oidcEnabled).toBe(true);
      expect(status.samlEnabled).toBe(false);
      expect(status.activeSsoProtocol).toBe('oidc');
    });

    it('returns samlEnabled=false and oidcEnabled=false when activeSsoProtocol=null', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [SamlController],
        providers: [
          { provide: SamlAuthService, useValue: { ...samlAuthService, getSamlConfig: jest.fn().mockResolvedValue(null) } },
          { provide: TokenService, useValue: tokenService },
          { provide: CliAuthService, useValue: cliAuthService },
          {
            provide: ORGANIZATION_REPOSITORY,
            useValue: {
              findSingleton: jest.fn().mockResolvedValue({
                ssoLoginEnabled: true,
                passwordLoginEnabled: true,
                activeSsoProtocol: null,
              }),
            },
          },
          { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((key: string) => {
            if (key === 'auth.refreshTokenExpiry') return '7d';
            if (key === 'app.isProduction') return false;
            return undefined;
          }) } },
        ],
      }).compile();

      const nullController = module.get<SamlController>(SamlController);
      const status = await nullController.getSsoStatus();

      expect(status.oidcEnabled).toBe(false);
      expect(status.samlEnabled).toBe(false);
      expect(status.activeSsoProtocol).toBeNull();
    });
  });

  describe('samlCallback — CLI branch (SSO-02, D-07, D-08)', () => {
    const mockBody = { SAMLResponse: 'base64saml', RelayState: 'encoded.hmac' };
    const mockReq = { headers: { 'user-agent': 'test' } } as any;

    it('7-04-01: redirects to cli_redirect?code=<code> when RelayState contains cliRedirect', async () => {
      (samlAuthService.extractCliRedirect as jest.Mock).mockReturnValue('http://localhost:9876/callback');
      (samlAuthService.validateCallback as jest.Mock).mockResolvedValue({
        user: { id: 'u1', email: 'user@example.com', role: 'user', firstName: 'Test', lastName: 'User', authProviders: [] },
      });
      const mockRes = { redirect: jest.fn() } as any;
      await controller.samlCallback(mockBody, mockReq, mockRes);
      const redirectArg: string = mockRes.redirect.mock.calls[0][0];
      expect(redirectArg).toMatch(/^http:\/\/localhost:9876\/callback\?code=[0-9a-f]{64}$/);
      expect(cliAuthService.storeCliCode).toHaveBeenCalled();
    });

    it('7-04-02: double-validates cli_redirect — redirects to sso-callback#error when non-localhost', async () => {
      (samlAuthService.extractCliRedirect as jest.Mock).mockReturnValue('http://evil.com/callback');
      (samlAuthService.validateCallback as jest.Mock).mockResolvedValue({
        user: { id: 'u1', email: 'user@example.com', role: 'user', firstName: 'Test', lastName: 'User', authProviders: [] },
      });
      const mockRes = { redirect: jest.fn() } as any;
      await controller.samlCallback(mockBody, mockReq, mockRes);
      expect(mockRes.redirect.mock.calls[0][0]).toContain('sso-callback#error=invalid_redirect');
      expect(cliAuthService.storeCliCode).not.toHaveBeenCalled();
    });

    it('echoes the CLI state nonce on the localhost redirect (security finding #3)', async () => {
      (samlAuthService.extractCliRedirect as jest.Mock).mockReturnValue('http://localhost:9876/callback');
      (samlAuthService.extractCliState as jest.Mock).mockReturnValue('a1b2c3d4e5f60718293a4b5c6d7e8f90');
      (samlAuthService.validateCallback as jest.Mock).mockResolvedValue({
        user: { id: 'u1', email: 'user@example.com', role: 'user', firstName: 'Test', lastName: 'User', authProviders: [] },
      });
      const mockRes = { redirect: jest.fn() } as any;
      await controller.samlCallback(mockBody, mockReq, mockRes);
      const redirectArg: string = mockRes.redirect.mock.calls[0][0];
      expect(redirectArg).toMatch(
        /^http:\/\/localhost:9876\/callback\?code=[0-9a-f]{64}&state=a1b2c3d4e5f60718293a4b5c6d7e8f90$/,
      );
    });
  });

  describe('samlCallback — RelayState required (security finding #2)', () => {
    it('rejects a callback with no RelayState (IdP-initiated flow disabled)', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      const mockReq = { headers: { 'user-agent': 'test' } } as any;
      await controller.samlCallback({ SAMLResponse: 'base64saml' }, mockReq, mockRes);
      expect(mockRes.redirect.mock.calls[0][0]).toContain('sso-callback#error=csrf_failed');
      expect(samlAuthService.validateCallback).not.toHaveBeenCalled();
      expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
    });

    it('still rejects an invalid RelayState nonce', async () => {
      (samlAuthService.verifyRelayState as jest.Mock).mockReturnValue(false);
      const mockRes = { redirect: jest.fn() } as any;
      const mockReq = { headers: { 'user-agent': 'test' } } as any;
      await controller.samlCallback({ SAMLResponse: 'base64saml', RelayState: 'tampered.hmac' }, mockReq, mockRes);
      expect(mockRes.redirect.mock.calls[0][0]).toContain('sso-callback#error=csrf_failed');
      expect(samlAuthService.validateCallback).not.toHaveBeenCalled();
    });
  });
});
