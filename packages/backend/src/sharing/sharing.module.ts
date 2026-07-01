import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module.js';
import { ExportModule } from '../export/export.module.js';
import { GenerationModule } from '../generation/generation.module.js';
import { ShareController } from './share.controller.js';

@Module({
  imports: [SkillsModule, ExportModule, GenerationModule],
  controllers: [ShareController],
})
export class SharingModule {}
