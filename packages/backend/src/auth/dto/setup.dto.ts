import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for first-run setup — creates the initial admin user.
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
export class SetupDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

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
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Organization name is required' })
  orgName!: string;

  @IsTimeZone()
  @IsNotEmpty()
  timezone!: string;
}
