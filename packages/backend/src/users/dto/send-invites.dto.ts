import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
} from 'class-validator';

/**
 * DTO for sending invite emails.
 *
 * - 1 to 5 email addresses per request
 * - role defaults to 'user' in the service layer
 */
export class SendInvitesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one email address is required' })
  @ArrayMaxSize(5, { message: 'Maximum 5 email addresses per invite' })
  @IsEmail({}, { each: true, message: 'Each value must be a valid email address' })
  emails!: string[];

  @IsIn(['user', 'admin'])
  @IsOptional()
  role?: 'user' | 'admin';
}
