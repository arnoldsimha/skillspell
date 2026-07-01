import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for completing registration from an invite.
 *
 * The email is NOT in this DTO — it comes from the validated invite token.
 * Password policy matches CreateUserDto.
 */
export class CompleteInviteDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

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
}
