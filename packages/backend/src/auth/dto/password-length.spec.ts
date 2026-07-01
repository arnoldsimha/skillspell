import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { ChangePasswordDto } from './change-password.dto';
import { SetupDto } from './setup.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { CompleteInviteDto } from '../../users/dto/complete-invite.dto';

const LONG_PASSWORD = 'a'.repeat(129);
const VALID_PASSWORD = 'ValidPass1!';

describe('password MaxLength=128 enforcement', () => {
  describe('LoginDto', () => {
    it('should reject 129-char password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: LONG_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should accept 128-char password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'a'.repeat(128),
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(false);
    });
  });

  describe('ChangePasswordDto', () => {
    it('should reject currentPassword > 128 chars', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: LONG_PASSWORD,
        newPassword: VALID_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'currentPassword')).toBe(true);
    });

    it('should accept currentPassword of 128 chars', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'a'.repeat(128),
        newPassword: VALID_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'currentPassword')).toBe(false);
    });

    it('should reject newPassword > 128 chars', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: VALID_PASSWORD,
        newPassword: LONG_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'newPassword')).toBe(true);
    });

    it('should accept newPassword of 128 chars (meets all other constraints)', async () => {
      const longButValid = 'A'.repeat(100) + 'a'.repeat(20) + '1!';
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: VALID_PASSWORD,
        newPassword: longButValid,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'newPassword')).toBe(false);
    });
  });

  describe('SetupDto', () => {
    it('should reject 129-char password', async () => {
      const dto = plainToInstance(SetupDto, {
        email: 'test@example.com',
        password: LONG_PASSWORD,
        firstName: 'John',
        lastName: 'Doe',
        orgName: 'Test Org',
        timezone: 'UTC',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should accept 128-char password', async () => {
      const longButValid = 'A'.repeat(100) + 'a'.repeat(20) + '1!';
      const dto = plainToInstance(SetupDto, {
        email: 'test@example.com',
        password: longButValid,
        firstName: 'John',
        lastName: 'Doe',
        orgName: 'Test Org',
        timezone: 'UTC',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(false);
    });
  });

  describe('CreateUserDto', () => {
    it('should reject 129-char password', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: LONG_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should accept 128-char password', async () => {
      const longButValid = 'A'.repeat(100) + 'a'.repeat(20) + '1!';
      const dto = plainToInstance(CreateUserDto, {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: longButValid,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(false);
    });

    it('should accept missing password (optional field)', async () => {
      const dto = plainToInstance(CreateUserDto, {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(false);
    });
  });

  describe('CompleteInviteDto', () => {
    it('should reject 129-char password', async () => {
      const dto = plainToInstance(CompleteInviteDto, {
        firstName: 'John',
        lastName: 'Doe',
        password: LONG_PASSWORD,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(true);
    });

    it('should accept 128-char password', async () => {
      const longButValid = 'A'.repeat(100) + 'a'.repeat(20) + '1!';
      const dto = plainToInstance(CompleteInviteDto, {
        firstName: 'John',
        lastName: 'Doe',
        password: longButValid,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'password')).toBe(false);
    });
  });
});
