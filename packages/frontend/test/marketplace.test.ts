import { describe, it, expect, vi, beforeEach } from 'vitest';

// These functions do not exist yet — tests will fail (RED) until Wave 1 implements them.
// browseMarketplace and downloadMarketplaceSkill are added in Wave 1.
// The existing marketplace.ts file has submitSkill and fetchMySubmissions only.
import {
  browseMarketplace,
  downloadMarketplaceSkill,
  getMarketplaceSkillDiagram,
} from '../src/services/api/marketplace.js';

// Mock the JSON request client
vi.mock('../src/services/api/client.js', () => ({
  request: vi.fn(),
  API_BASE: 'http://localhost:3001/api',
}));

// Mock authSDK for download tests
vi.mock('../src/services/auth-sdk.js', () => ({
  authSDK: { getAccessToken: vi.fn().mockResolvedValue('test-token') },
}));

// Mock global fetch for download tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock URL.createObjectURL and URL.revokeObjectURL for anchor-click download pattern
vi.stubGlobal('URL', {
  ...URL,
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn(),
});

// Mock document for anchor-click download pattern (node test environment has no DOM)
const mockAnchor = { href: '', download: '', click: vi.fn() };
vi.stubGlobal('document', {
  createElement: vi.fn().mockReturnValue(mockAnchor),
});

import { request } from '../src/services/api/client.js';

describe('browseMarketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
  });

  it('sends page param directly: page=3, limit=30', async () => {
    await browseMarketplace({ page: 3, limit: 30 });
    const calledUrl: string = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain('limit=30');
  });

  it('sends categories as comma-separated slugs', async () => {
    await browseMarketplace({ categories: ['devtools', 'security'] });
    const calledUrl: string = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('categories=devtools%2Csecurity');
  });

  it('omits page param (defaults to 1 server-side) and omits limit when no params passed', async () => {
    await browseMarketplace({});
    const calledUrl: string = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // page=1 is the default — omitted from URL to keep it clean
    expect(calledUrl).not.toContain('page=');
    expect(calledUrl).not.toContain('offset=');
  });

  it('returns BrowseMarketplaceResponse with items array and total number', async () => {
    const mockResponse = { items: [{ skillId: 'abc', name: 'Test', downloadCount: 5, categories: [], description: '', version: '1', submittedAt: '', submittedBy: '', submissionId: 'sub-1', upvoteCount: 0, isUpvoted: false, isFavorited: false }], total: 1 };
    (request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
    const result = await browseMarketplace({});
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(result.total).toBe(1);
    expect(Array.isArray(result.items)).toBe(true);
  });
});

describe('downloadMarketplaceSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses fetch (not request()) and sets Authorization header from authSDK', async () => {
    const mockBlob = new Blob(['zip'], { type: 'application/zip' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
      headers: { get: vi.fn().mockReturnValue('attachment; filename="skill.zip"') },
    };
    mockFetch.mockResolvedValue(mockResponse);

    await downloadMarketplaceSkill('skill-uuid-1', '2');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/marketplace/skill-uuid-1/download'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(mockResponse.blob).toHaveBeenCalled();
  });

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(downloadMarketplaceSkill('skill-uuid-1', '2')).rejects.toThrow('Download failed: 404');
  });
});

describe('getMarketplaceSkillDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls POST /marketplace/:skillId/diagram with force=false', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ mermaid: 'flowchart TD\n  A --> B' });

    const result = await getMarketplaceSkillDiagram('skill-uuid-1', false);

    expect(request).toHaveBeenCalledWith(
      'http://localhost:3001/api/marketplace/skill-uuid-1/diagram?force=false',
      { method: 'POST' },
    );
    expect(result).toEqual({ mermaid: 'flowchart TD\n  A --> B' });
  });

  it('calls POST with force=true when requested', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ mermaid: 'flowchart TD\n  A --> B' });

    await getMarketplaceSkillDiagram('skill-uuid-1', true);

    const calledUrl: string = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('force=true');
  });
});
