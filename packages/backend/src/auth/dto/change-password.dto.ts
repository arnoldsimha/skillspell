import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for changing the current user's password.
 *
 * Requires the current password for verification and the new password
 * with the same policy as setup/create-user DTOs.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
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
  newPassword!: string;
}
