import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * DTO for admin user updates.
 *
 * All fields are optional — only provided fields are updated.
 * Password change revokes all refresh tokens for the user.
 *
 * Password policy (static rules enforced via decorators):
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 *
 * The configurable PASSWORD_MIN_LENGTH from env is enforced at the service layer.
 */
export class UpdateUserDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsIn(['user', 'admin', 'owner'])
  @IsOptional()
  role?: 'user' | 'admin' | 'owner';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /**
   * When setting role to 'owner', caller must explicitly confirm
   * by setting this to true (prevents accidental ownership transfer).
   */
  @IsBoolean()
  @IsOptional()
  confirmOwnerTransfer?: boolean;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/\d/, {
    message: 'Password must contain at least one number',
  })
  @Matches(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, {
    message: 'Password must contain at least one special character',
  })
  @IsOptional()
  password?: string;
}
