import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MarketplaceListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((s: string) => s.trim()).filter(Boolean)
      : value,
  )
  categories?: string[];

  @IsOptional()
  @IsEnum(['popular', 'newest', 'downloads', 'upvotes', 'name'])
  sort?: 'popular' | 'newest' | 'downloads' | 'upvotes' | 'name' = 'popular';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 30;
}
