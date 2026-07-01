import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { CreatePatDto } from './dto/create-pat.dto.js';
import { CreatePatResponseDto, PatListItemDto } from './dto/pat-response.dto.js';
import { PersonalAccessTokensService } from './personal-access-tokens.service.js';

/**
 * Personal Access Token management endpoints.
 *
 * All routes require authentication (no @Public() — global JwtAuthGuard applies).
 * After Phase 05, the guard accepts both JWT and PAT tokens.
 *
 * Base path: /api/auth/tokens (global /api prefix + controller prefix 'auth/tokens')
 */
@Controller('auth/tokens')
export class PersonalAccessTokensController {
  constructor(
    private readonly patService: PersonalAccessTokensService,
  ) {}

  /**
   * Create a new personal access token.
   * Returns the raw token ONCE — it cannot be retrieved again.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePatDto,
  ): Promise<CreatePatResponseDto> {
    const result = await this.patService.create(userId, dto);
    return plainToInstance(CreatePatResponseDto, result, { excludeExtraneousValues: true });
  }

  /**
   * List the authenticated user's personal access tokens.
   * Returns name, prefix, createdAt, lastUsedAt — no raw tokens.
   */
  @Get()
  async list(@CurrentUser('id') userId: string): Promise<PatListItemDto[]> {
    const results = await this.patService.list(userId);
    return plainToInstance(PatListItemDto, results, { excludeExtraneousValues: true });
  }

  /**
   * Revoke a personal access token by ID.
   * ParseUUIDPipe validates the id before it reaches service.
   * Repository verifies ownership via WHERE id AND userId.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.patService.revoke(id, userId);
  }
}
