import { Module } from '@nestjs/common';
import { PublicController } from './public.controller.js';
import { PublicSkillsService } from './public-skills.service.js';

/**
 * PublicModule provides unauthenticated skill access endpoints.
 *
 * SKILL_REPOSITORY is provided globally by PostgresStorageModule (global: true)
 * so it is automatically injectable here without importing PostgresStorageModule.
 */
@Module({
  controllers: [PublicController],
  providers: [PublicSkillsService],
  exports: [PublicSkillsService],
})
export class PublicModule {}
