import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { SkillsService } from './skills.service.js';
import { SkillsController } from './skills.controller.js';

@Module({
  imports: [GenerationModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
