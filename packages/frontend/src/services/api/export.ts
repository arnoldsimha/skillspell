import type { ExportFormat } from '@skillspell/shared';
import { API_BASE, ApiError } from './client.js';
import { authSDK } from '../auth-sdk.js';

/** Trigger a zip download for a skill in the specified IDE format. */
export async function exportSkillZip(id: string, format: ExportFormat = 'claude', version?: number): Promise<void> {
  let res: Response;

  try {
    const vPrefix = version != null ? `v${version}/` : '';
    const url = `${API_BASE}/export/${vPrefix}${id}/zip?format=${encodeURIComponent(format)}`;
    const token = await authSDK.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    res = await fetch(url, { headers, credentials: 'include' });
  } catch (err) {
    throw new ApiError(
      err instanceof Error
        ? `Network error: ${err.message}`
        : 'Network error: unable to reach the server',
      0,
    );
  }

  if (!res.ok) {
    throw new ApiError(`Export failed with status ${res.status}`, res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="?(.+?)"?$/);
  const filename = filenameMatch?.[1] ?? `skill-${id}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
