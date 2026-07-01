import { useMutation } from '@tanstack/react-query';
import type { ExportFormat } from '@skillspell/shared';
import { exportSkillZip } from '../services/api/index.js';

export interface UseExportReturn {
  exporting: boolean;
  error: string | null;
  exportSkill: (id: string, format: ExportFormat, version?: number) => Promise<void>;
}

export function useExport(): UseExportReturn {
  const mutation = useMutation({
    mutationFn: ({ id, format, version }: { id: string; format: ExportFormat; version?: number }) =>
      exportSkillZip(id, format, version),
  });

  return {
    exporting: mutation.isPending,
    error: mutation.error ? (mutation.error instanceof Error ? mutation.error.message : 'Export failed') : null,
    exportSkill: async (id: string, format: ExportFormat, version?: number) => {
      await mutation.mutateAsync({ id, format, version });
    },
  };
}
