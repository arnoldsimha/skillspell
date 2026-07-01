import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/api/client.js', () => ({
  API_BASE: 'http://test',
  request: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { listPats, createPat, revokePat } from '../src/services/api/tokens.js';
import type { PatListItem, CreatePatResponse } from '../src/services/api/tokens.js';
import { request } from '../src/services/api/client.js';

const mockRequest = vi.mocked(request);

const TOKEN_FIXTURE: PatListItem = {
  id: 'tok-001',
  userId: 'user-001',
  name: 'CI pipeline',
  prefix: 'Va2VREE7',
  expiresAt: '2027-04-18T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
  createdAt: '2026-04-18T10:00:00.000Z',
};

describe('tokens API service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPats', () => {
    it('should call GET /auth/tokens and return array', async () => {
      mockRequest.mockResolvedValueOnce([TOKEN_FIXTURE]);

      const result = await listPats();

      expect(mockRequest).toHaveBeenCalledWith('http://test/auth/tokens');
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result).toEqual([TOKEN_FIXTURE]);
    });

    it('should return empty array when no tokens exist', async () => {
      mockRequest.mockResolvedValueOnce([]);

      const result = await listPats();

      expect(result).toEqual([]);
    });
  });

  describe('createPat', () => {
    it('should POST correct body and return CreatePatResponse with rawToken', async () => {
      const fixture: CreatePatResponse = {
        ...TOKEN_FIXTURE,
        rawToken: 'sksp_test_raw_token_value',
      };
      mockRequest.mockResolvedValueOnce(fixture);

      const result = await createPat({
        name: 'CI pipeline',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });

      expect(mockRequest).toHaveBeenCalledWith('http://test/auth/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'CI pipeline', expiresAt: '2027-01-01T00:00:00.000Z' }),
      });
      expect(result.rawToken).toBe('sksp_test_raw_token_value');
      expect(result.id).toBe('tok-001');
    });
  });

  describe('revokePat', () => {
    it('should send DELETE to /auth/tokens/:id', async () => {
      mockRequest.mockResolvedValueOnce(undefined);

      await revokePat('token-id-123');

      expect(mockRequest).toHaveBeenCalledWith(
        'http://test/auth/tokens/token-id-123',
        { method: 'DELETE' },
      );
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });
});
