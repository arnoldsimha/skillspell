import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestTestPromptsDto {
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  existingPrompt?: string;

  /** Name the user is typing for the test case — used to generate suggestions aligned with the intent. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  testCaseName?: string;
}
