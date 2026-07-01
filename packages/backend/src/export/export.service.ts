import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  SKILL_REPOSITORY,
  type ISkillRepository,
  type Skill,
  type ExportFormat,
} from '@skillspell/shared';
import archiver from 'archiver';
import { basename } from 'node:path';
import { buildFlatMarkdown } from '../common/utils/skill-assembler.js';

/**
 * Sanitize a name for safe use in zip archive paths.
 * Strips path separators, traversal sequences, and non-filesystem-safe characters.
 */
function sanitizePath(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_') || 'unnamed';
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  /** All supported export formats with metadata. */
  static readonly FORMATS: Record<
    ExportFormat,
    { name: string; description: string; outputPath: string }
  > = {
    claude: {
      name: 'Claude Code',
      description: 'Multi-file skill for .claude/skills/',
      outputPath: '.claude/skills/<name>/',
    },
    cursor: {
      name: 'Cursor',
      description: 'Single rule file for .cursor/rules/',
      outputPath: '.cursor/rules/<name>.md',
    },
    windsurf: {
      name: 'Windsurf',
      description: 'Single rules file at project root',
      outputPath: '.windsurfrules',
    },
    copilot: {
      name: 'GitHub Copilot',
      description: 'Instructions file for .github/',
      outputPath: '.github/copilot-instructions.md',
    },
    roo: {
      name: 'Roo Code',
      description: 'Multi-file skill for .roo/skills/',
      outputPath: '.roo/skills/<name>/',
    },
  };

  constructor(
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
  ) {}

  /**
   * Export a skill as a streamable zip archive in the specified IDE format.
   * Returns a Readable stream (the archiver) that can be piped directly
   * to the HTTP response — no full-buffer copy in memory.
   */
  async exportAsZip(
    skillId: string,
    format: ExportFormat = 'claude',
    version?: number,
  ): Promise<{ stream: Readable; name: string }> {
    if (!ExportService.FORMATS[format]) {
      throw new BadRequestException(`Unsupported export format: "${format}"`);
    }

    const skill = await this.skillRepo.findById(skillId);
    if (!skill) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    let exportData: Skill;

    if (version != null && version !== skill.version) {
      // Load historical version snapshot
      const snapshot = await this.skillRepo.getVersionSnapshot(skillId, version);
      if (!snapshot) {
        throw new NotFoundException(
          `Version ${version} not found for skill "${skillId}"`,
        );
      }
      // Merge snapshot content with skill metadata (name, status, etc.)
      exportData = {
        ...skill,
        skillContent: snapshot.skillContent,
        scripts: snapshot.scripts,
        references: snapshot.references,
        assets: snapshot.assets,
        version: snapshot.version,
        description: snapshot.description,
      };
      this.logger.log(
        `Exporting skill "${skill.name}" v${version} as zip (format: ${format})`,
      );
    } else {
      exportData = skill;
      this.logger.log(
        `Exporting skill "${skill.name}" (current v${skill.version}) as zip (format: ${format})`,
      );
    }

    const stream = this.buildZipStream(exportData, format);
    return { stream, name: skill.name };
  }

  /**
   * Build a zip archive as a Readable stream. The archive is *not* buffered
   * in memory — data flows directly from archiver into the consumer.
   */
  private buildZipStream(skill: Skill, format: ExportFormat): Readable {
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err: Error) => {
      this.logger.error(`Archive error for skill "${skill.name}": ${err}`);
      archive.destroy(err);
    });

    switch (format) {
      case 'claude':
        this.addClaudeFormat(archive, skill);
        break;
      case 'cursor':
        this.addCursorFormat(archive, skill);
        break;
      case 'windsurf':
        this.addWindsurfFormat(archive, skill);
        break;
      case 'copilot':
        this.addCopilotFormat(archive, skill);
        break;
      case 'roo':
        this.addRooFormat(archive, skill);
        break;
    }

    archive.finalize().catch((err) => {
      this.logger.error(`Archive finalize error: ${err}`);
      archive.destroy(err);
    });

    return archive as unknown as Readable;
  }

  // ─── Format Adapters ──────────────────────────────────────────────

  /**
   * Claude Code format: multi-file skill under .claude/skills/<name>/
   */
  private addClaudeFormat(archive: archiver.Archiver, skill: Skill): void {
    const safeName = sanitizePath(skill.name);
    const base = `.claude/skills/${safeName}`;

    archive.append(skill.skillContent, { name: `${base}/SKILL.md` });

    for (const file of skill.scripts) {
      archive.append(file.content, { name: `${base}/scripts/${sanitizePath(file.name)}` });
    }
    for (const file of skill.references) {
      archive.append(file.content, { name: `${base}/references/${sanitizePath(file.name)}` });
    }
    for (const file of skill.assets) {
      archive.append(file.content, { name: `${base}/assets/${sanitizePath(file.name)}` });
    }
  }

  /**
   * Cursor format: single .md file under .cursor/rules/<name>.md
   * Merges all content into one flat markdown document.
   */
  private addCursorFormat(archive: archiver.Archiver, skill: Skill): void {
    const content = buildFlatMarkdown(skill, false);
    archive.append(content, { name: `.cursor/rules/${sanitizePath(skill.name)}.md` });
  }

  /**
   * Windsurf format: single .windsurfrules file at project root.
   * Merges all content into one flat markdown document.
   */
  private addWindsurfFormat(archive: archiver.Archiver, skill: Skill): void {
    const content = buildFlatMarkdown(skill, false);
    archive.append(content, { name: '.windsurfrules' });
  }

  /**
   * GitHub Copilot format: single .github/copilot-instructions.md file.
   * Merges all content into one flat markdown document.
   */
  private addCopilotFormat(archive: archiver.Archiver, skill: Skill): void {
    const content = buildFlatMarkdown(skill, false);
    archive.append(content, { name: '.github/copilot-instructions.md' });
  }

  /**
   * Roo Code format: multi-file skill under .roo/skills/<name>/
   * Same structure as Claude but under a different root path.
   */
  private addRooFormat(archive: archiver.Archiver, skill: Skill): void {
    const safeName = sanitizePath(skill.name);
    const base = `.roo/skills/${safeName}`;

    // Roo uses the same SKILL.md convention
    archive.append(skill.skillContent, { name: `${base}/SKILL.md` });

    for (const file of skill.scripts) {
      archive.append(file.content, { name: `${base}/scripts/${sanitizePath(file.name)}` });
    }
    for (const file of skill.references) {
      archive.append(file.content, { name: `${base}/references/${sanitizePath(file.name)}` });
    }
    for (const file of skill.assets) {
      archive.append(file.content, { name: `${base}/assets/${sanitizePath(file.name)}` });
    }
  }
}
