import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, isAtLeast, canModifyUser } from './roles';

describe('ROLE_HIERARCHY', () => {
  it('should have owner > admin > user', () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.user);
  });
});

describe('isAtLeast', () => {
  it('owner is at least owner', () => {
    expect(isAtLeast('owner', 'owner')).toBe(true);
  });

  it('owner is at least admin', () => {
    expect(isAtLeast('owner', 'admin')).toBe(true);
  });

  it('owner is at least user', () => {
    expect(isAtLeast('owner', 'user')).toBe(true);
  });

  it('admin is at least admin', () => {
    expect(isAtLeast('admin', 'admin')).toBe(true);
  });

  it('admin is at least user', () => {
    expect(isAtLeast('admin', 'user')).toBe(true);
  });

  it('admin is NOT at least owner', () => {
    expect(isAtLeast('admin', 'owner')).toBe(false);
  });

  it('user is at least user', () => {
    expect(isAtLeast('user', 'user')).toBe(true);
  });

  it('user is NOT at least admin', () => {
    expect(isAtLeast('user', 'admin')).toBe(false);
  });

  it('user is NOT at least owner', () => {
    expect(isAtLeast('user', 'owner')).toBe(false);
  });
});

describe('canModifyUser', () => {
  // Owner can modify anyone
  it('owner can modify owner', () => {
    expect(canModifyUser('owner', 'owner')).toBe(true);
  });

  it('owner can modify admin', () => {
    expect(canModifyUser('owner', 'admin')).toBe(true);
  });

  it('owner can modify user', () => {
    expect(canModifyUser('owner', 'user')).toBe(true);
  });

  // Admin can only modify 'user' role
  it('admin can modify user', () => {
    expect(canModifyUser('admin', 'user')).toBe(true);
  });

  it('admin CANNOT modify admin', () => {
    expect(canModifyUser('admin', 'admin')).toBe(false);
  });

  it('admin CANNOT modify owner', () => {
    expect(canModifyUser('admin', 'owner')).toBe(false);
  });

  // User cannot modify anyone
  it('user CANNOT modify user', () => {
    expect(canModifyUser('user', 'user')).toBe(false);
  });

  it('user CANNOT modify admin', () => {
    expect(canModifyUser('user', 'admin')).toBe(false);
  });

  it('user CANNOT modify owner', () => {
    expect(canModifyUser('user', 'owner')).toBe(false);
  });
});
