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
        controller.samlLogin('http://evil.com/callback', mockRes),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid localhost cli_redirect without error', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(
        controller.samlLogin('http://localhost:12345/callback', mockRes),
      ).resolves.not.toThrow();
      expect(samlAuthService.generateRelayState).toHaveBeenCalledWith('http://localhost:12345/callback');
    });

    it('accepts no cli_redirect (browser flow)', async () => {
      const mockRes = { redirect: jest.fn() } as any;
      await expect(controller.samlLogin(undefined, mockRes)).resolves.not.toThrow();
      expect(samlAuthService.generateRelayState).toHaveBeenCalledWith(undefined);
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
  });
});
