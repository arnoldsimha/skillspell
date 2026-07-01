import {
  Controller,
  Get,
  Param,
  Query,
  Header,
  ParseUUIDPipe,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { ExportService } from './export.service.js';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';
import { ParseVersionPipe } from '../common/pipes/parse-version.pipe.js';

/**
 * Valid export formats — must match the ExportFormat type from shared.
 * Used for runtime validation of the `format` query parameter.
 */
const VALID_FORMATS = ['claude', 'cursor', 'windsurf', 'copilot', 'roo'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /api/export/:id/zip?format=claude — Download skill as a zip file.
   * GET /api/export/v:version/:id/zip?format=claude — same, for a specific version.
   * Defaults to 'claude' if no format is specified.
   *
   * Ownership is enforced by the global SkillOwnerGuard via @CheckOwnership.
   */
  @Get([':id/zip', 'v:version/:id/zip'])
  @CheckOwnership('id')
  @Header('Content-Type', 'application/zip')
  async exportZip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseVersionPipe) version?: number,
    @Query('format') format: string = 'claude',
  ): Promise<StreamableFile> {
    // Runtime validation: reject unknown format values
    if (!VALID_FORMATS.includes(format as ExportFormat)) {
      throw new BadRequestException(
        `Invalid export format "${format}". Valid formats: ${VALID_FORMATS.join(', ')}`,
      );
    }

    const { stream, name } = await this.exportService.exportAsZip(
      id,
      format as ExportFormat,
      version,
    );

    // Sanitize skill name for use in Content-Disposition header:
    // strip anything that isn't alphanumeric, hyphen, underscore, or dot.
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'skill';

    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${safeName}-${format}.zip"`,
    });
  }
}
