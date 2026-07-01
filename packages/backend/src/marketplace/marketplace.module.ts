import { Module } from '@nestjs/common';
import { ExportModule } from '../export/export.module.js';
import { GenerationModule } from '../generation/generation.module.js';
import { MarketplaceController } from './marketplace.controller.js';
import { AdminMarketplaceController } from './admin-marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { RequirementsCheckerService } from './requirements-checker.service.js';

@Module({
  imports: [ExportModule, GenerationModule],
  controllers: [MarketplaceController, AdminMarketplaceController],
  providers: [MarketplaceService, MarketplaceSubmissionService, RequirementsCheckerService],
  exports: [MarketplaceService, MarketplaceSubmissionService],
})
export class MarketplaceModule {}
