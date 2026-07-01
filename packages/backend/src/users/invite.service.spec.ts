import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  INVITE_TOKEN_REPOSITORY,
  USER_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  type IInviteTokenRepository,
  type IUserRepository,
  type IOrganizationRepository,
} from '@skillspell/shared';
import { InviteService } from './invite.service';
import { EmailService } from '../email/email.service';
import { EmailTemplateLoaderService } from '../email/email-template-loader.service';
import { UsersService } from './users.service';
import { TokenService } from '../auth/token.service';

describe('InviteService', () => {
  let service: InviteService;
  let inviteRepo: jest.Mocked<IInviteTokenRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let orgRepo: jest.Mocked<IOrganizationRepository>;
  let emailService: jest.Mocked<EmailService>;
  let emailTemplateLoader: jest.Mocked<EmailTemplateLoaderService>;

  const TEST_ORG = {
    id: 'org-1',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const TEST_INVITER = {
    id: 'user-1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@test.com',
  };

  beforeEach(async () => {
    inviteRepo = {
      findByOrg: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue(undefined),
      consumeAndReplace: jest.fn().mockResolvedValue(undefined),
      findByTokenHash: jest.fn(),
      findPendingByEmail: jest.fn(),
    } as jest.Mocked<IInviteTokenRepository>;

    userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(TEST_INVITER),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    orgRepo = {
      findSingleton: jest.fn().mockResolvedValue(TEST_ORG),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IOrganizationRepository>;

    emailService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailService>;

    emailTemplateLoader = {
      render: jest.fn().mockResolvedValue('<html>invite</html>'),
      renderText: jest.fn().mockResolvedValue('invite text'),
    } as unknown as jest.Mocked<EmailTemplateLoaderService>;

    const module = await Test.createTestingModule({
      providers: [
        InviteService,
        { provide: INVITE_TOKEN_REPOSITORY, useValue: inviteRepo },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ORGANIZATION_REPOSITORY, useValue: orgRepo },
        { provide: EmailService, useValue: emailService },
        { provide: EmailTemplateLoaderService, useValue: emailTemplateLoader },
        { provide: UsersService, useValue: {} },
        { provide: TokenService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:5173'),
          },
        },
      ],
    }).compile();

    service = module.get(InviteService);

    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.clearAllMocks());

  // ── sendInvites: email-first ordering ────────────────────────────────

  describe('sendInvites', () => {
    const baseParams = {
      emails: ['user@example.com'],
      role: 'user' as const,
      invitedBy: 'user-1',
      orgId: 'org-1',
    };

    it('persists the token only after email is sent successfully', async () => {
      const callOrder: string[] = [];
      emailService.sendEmail.mockImplementation(async () => { callOrder.push('email'); });
      inviteRepo.create.mockImplementation(async (invite: any) => {
        callOrder.push('create');
        return invite;
      });

      await service.sendInvites(baseParams);

      expect(callOrder).toEqual(['email', 'create']);
    });

    it('does not persist the token when email send fails', async () => {
      emailService.sendEmail.mockRejectedValue(new Error('SMTP timeout'));

      const results = await service.sendInvites(baseParams);

      expect(inviteRepo.create).not.toHaveBeenCalled();
      expect(results[0].success).toBe(false);
      // Non-HttpException errors are normalised to a generic message by the service
      expect(results[0].error).toBe('Failed to send invite');
    });

    it('records success when both email and persist succeed', async () => {
      const results = await service.sendInvites(baseParams);

      expect(results[0].success).toBe(true);
      expect(inviteRepo.create).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when SMTP is not configured', async () => {
      emailService.isConfigured.mockResolvedValue(false);

      await expect(service.sendInvites(baseParams)).rejects.toThrow(BadRequestException);
      expect(inviteRepo.create).not.toHaveBeenCalled();
    });

    it('records failure without leaking token when email already registered', async () => {
      userRepo.findByEmail.mockResolvedValue({ id: 'existing' } as any);

      const results = await service.sendInvites(baseParams);

      expect(results[0].success).toBe(false);
      expect(inviteRepo.create).not.toHaveBeenCalled();
    });

    it('processes remaining emails after one failure', async () => {
      emailService.sendEmail
        .mockRejectedValueOnce(new Error('SMTP timeout'))
        .mockResolvedValue(undefined);

      const results = await service.sendInvites({
        ...baseParams,
        emails: ['fail@example.com', 'ok@example.com'],
      });

      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
      expect(inviteRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── resendInvite ──────────────────────────────────────────────────────

  describe('resendInvite', () => {
    const EXISTING_INVITE = {
      id: 'invite-1',
      orgId: 'org-1',
      email: 'user@example.com',
      tokenHash: 'abc123',
      invitedBy: 'user-1',
      role: 'user' as const,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      consumed: false,
      createdAt: new Date().toISOString(),
    };

    it('throws NotFoundException when invite does not exist', async () => {
      inviteRepo.findByOrg.mockResolvedValue([]);

      await expect(
        service.resendInvite('nonexistent', 'org-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invite is already consumed', async () => {
      inviteRepo.findByOrg.mockResolvedValue([{ ...EXISTING_INVITE, consumed: true }]);

      await expect(
        service.resendInvite('invite-1', 'org-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('always returns renewed: true (fresh token always generated)', async () => {
      inviteRepo.findByOrg.mockResolvedValue([EXISTING_INVITE]);

      const result = await service.resendInvite('invite-1', 'org-1', 'user-1');

      expect(result).toEqual({ renewed: true });
      expect(inviteRepo.consumeAndReplace).toHaveBeenCalledTimes(1);
    });

    it('calls consumeAndReplace with a new invite (different id and tokenHash)', async () => {
      inviteRepo.findByOrg.mockResolvedValue([EXISTING_INVITE]);

      await service.resendInvite('invite-1', 'org-1', 'user-1');

      const [consumedId, replacement] = inviteRepo.consumeAndReplace.mock.calls[0];
      expect(consumedId).toBe('invite-1');
      expect(replacement.id).not.toBe('invite-1');
      expect(replacement.tokenHash).not.toBe(EXISTING_INVITE.tokenHash);
      expect(replacement.consumed).toBe(false);
    });

    it('does not commit token if email delivery fails', async () => {
      inviteRepo.findByOrg.mockResolvedValue([EXISTING_INVITE]);
      emailService.sendEmail.mockRejectedValueOnce(new Error('SMTP failure'));

      await expect(
        service.resendInvite('invite-1', 'org-1', 'user-1'),
      ).rejects.toThrow();

      expect(inviteRepo.consumeAndReplace).not.toHaveBeenCalled();
    });
  });
});
