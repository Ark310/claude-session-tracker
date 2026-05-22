import { describe, it, expect } from 'vitest';
import { resolveProjectPath, getRepoName } from '../lib/claude-reader';

describe('resolveProjectPath', () => {
  it('returns cwd when provided — this is the primary fix for the path bug', () => {
    expect(resolveProjectPath('-home-user-my-project', '/home/user/my-project')).toBe('/home/user/my-project');
  });

  it('returns cwd even when encoded path decode would produce a different result', () => {
    // Without cwd, -home-user-claude-session-tracker would decode wrong
    const encoded = '-home-user-claude-session-tracker';
    const cwd = '/home/user/claude-session-tracker';
    expect(resolveProjectPath(encoded, cwd)).toBe(cwd);
  });

  it('falls back to decoded encoded path when cwd is empty string', () => {
    // Best-effort fallback — known to be lossy for names with hyphens
    const result = resolveProjectPath('-home-user-myrepo', '');
    expect(result).toBe('/home/user/myrepo');
  });

  it('falls back to decoded encoded path when cwd is absent', () => {
    const result = resolveProjectPath('-home-user-myrepo', '');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles path with no cwd provided', () => {
    const result = resolveProjectPath('-home-user-repos-myapp', '');
    expect(result.startsWith('/')).toBe(true);
  });
});

describe('getRepoName', () => {
  it('returns the last path segment', () => {
    expect(getRepoName('/home/user/myrepo')).toBe('myrepo');
  });

  it('handles paths with hyphens in repo name', () => {
    expect(getRepoName('/home/user/claude-session-manager')).toBe('claude-session-manager');
  });

  it('handles trailing slash gracefully', () => {
    expect(getRepoName('/home/user/myrepo/')).toBe('myrepo');
  });
});
