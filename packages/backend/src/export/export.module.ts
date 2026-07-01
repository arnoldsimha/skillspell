import { Module } from '@nestjs/common';
import { ExportService } from './export.service.js';
import { ExportController } from './export.controller.js';

@Module({
  imports: [],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
