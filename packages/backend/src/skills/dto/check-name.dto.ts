import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CheckNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
