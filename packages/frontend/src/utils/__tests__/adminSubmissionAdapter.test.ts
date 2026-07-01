import { describe, it, expect } from 'vitest';
import { adminSubmissionToSnapshot } from '../adminSubmissionAdapter.js';
import type { AdminSubmissionPreview } from '../../services/api/marketplace.js';

const basePreview: AdminSubmissionPreview = {
  id: 'sub-1',
  skillId: 'skill-abc',
  version: '3',
  status: 'pending_review',
  submittedBy: 'user@org.com',
  submitterName: 'Alice',
  submittedAt: '2026-05-16T10:00:00Z',
  submitterNote: null,
  skillName: 'My Skill',
  skillContent: '# My Skill\nDoes things.',
  scripts: [{ name: 'run.sh', content: '#!/bin/bash' }],
  references: [],
  assets: [],
};

describe('adminSubmissionToSnapshot', () => {
  it('maps all fields correctly', () => {
    const snapshot = adminSubmissionToSnapshot(basePreview);
    expect(snapshot.skillId).toBe('skill-abc');
    expect(snapshot.version).toBe(3);
    expect(snapshot.description).toBe('My Skill');
    expect(snapshot.skillContent).toBe('# My Skill\nDoes things.');
    expect(snapshot.scripts).toEqual([{ name: 'run.sh', content: '#!/bin/bash' }]);
    expect(snapshot.references).toEqual([]);
    expect(snapshot.assets).toEqual([]);
    expect(snapshot.createdAt).toBe('2026-05-16T10:00:00Z');
  });

  it('parses version string to number', () => {
    const snapshot = adminSubmissionToSnapshot({ ...basePreview, version: '12' });
    expect(snapshot.version).toBe(12);
  });
});
