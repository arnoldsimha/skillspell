import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for admin user creation.
 *
 * - password is optional: if omitted the user is SSO-only
 * - role defaults to 'user' in the service layer
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
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsIn(['user', 'admin'])
  @IsOptional()
  role?: 'user' | 'admin';

  @IsString()
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
  @IsOptional()
  password?: string;
}
