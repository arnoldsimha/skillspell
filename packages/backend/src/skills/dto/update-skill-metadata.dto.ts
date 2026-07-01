import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSkillMetadataDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  categoryIds?: string[];

}
