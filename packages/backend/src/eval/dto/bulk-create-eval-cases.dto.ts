import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEvalCaseDto } from './create-eval-case.dto.js';

export class BulkCreateEvalCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateEvalCaseDto)
  cases!: CreateEvalCaseDto[];
}
