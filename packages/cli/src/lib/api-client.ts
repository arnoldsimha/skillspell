export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export function createApiClient(baseUrl: string, token?: string) {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}/api${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...baseHeaders, ...(init?.headers as Record<string, string> | undefined) },
      });
    } catch (err) {
      throw new ApiError(
        err instanceof Error ? `Network error: ${err.message}` : 'Network error: unable to reach the server',
        0,
      );
    }
    if (!res.ok) {
      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        /* ignore parse errors */
      }
      const message = body.message
        ? String(body.message)
        : `Request failed with status ${res.status}`;
      const errorCode = typeof body.errorCode === 'string' ? body.errorCode : undefined;
      throw new ApiError(message, res.status, errorCode);
    }
    return res.json() as Promise<T>;
  }

  return { request };
}
