import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    readlinkSync: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import fs from 'fs';
import { execSync } from 'child_process';

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockExecSync = vi.mocked(execSync);

// Import after mocks are set up
import { isPidAlive, isClaudeProcess, getProcessCmdline } from '../lib/process-utils';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, 'kill').mockImplementation(() => true);
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isPidAlive', () => {
  it('returns true when process.kill(pid, 0) succeeds', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(isPidAlive(1234)).toBe(true);
  });

  it('returns false when process.kill throws (process not found)', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    expect(isPidAlive(9999)).toBe(false);
  });
});

describe('getProcessCmdline', () => {
  it('reads /proc/<pid>/cmdline on linux and replaces null bytes', () => {
    mockReadFileSync.mockReturnValue('/usr/local/bin/claude\0--no-update\0' as never);
    const result = getProcessCmdline(1234);
    expect(result).toBe('/usr/local/bin/claude --no-update');
  });

  it('falls back to ps on linux when /proc fails', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('no /proc'); });
    mockExecSync.mockReturnValue('/usr/bin/node /usr/local/lib/claude\n' as never);
    const result = getProcessCmdline(1234);
    expect(result).toBe('/usr/bin/node /usr/local/lib/claude');
  });

  it('returns null when both methods fail', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('no proc'); });
    mockExecSync.mockImplementation(() => { throw new Error('no ps'); });
    const result = getProcessCmdline(1234);
    expect(result).toBeNull();
  });
});

describe('isClaudeProcess', () => {
  it('returns false for PID below 100', () => {
    expect(isClaudeProcess(99)).toBe(false);
    expect(isClaudeProcess(1)).toBe(false);
    expect(isClaudeProcess(0)).toBe(false);
  });

  it('returns true when cmdline contains "claude"', () => {
    mockReadFileSync.mockReturnValue('/usr/local/bin/claude\0' as never);
    expect(isClaudeProcess(1234)).toBe(true);
  });

  it('returns false when cmdline does not contain "claude"', () => {
    mockReadFileSync.mockReturnValue('/usr/bin/bash\0' as never);
    expect(isClaudeProcess(1234)).toBe(false);
  });

  it('returns false when cmdline is null', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error(); });
    mockExecSync.mockImplementation(() => { throw new Error(); });
    expect(isClaudeProcess(1234)).toBe(false);
  });

  it('returns true for PID exactly 100', () => {
    mockReadFileSync.mockReturnValue('claude\0' as never);
    expect(isClaudeProcess(100)).toBe(true);
  });
});
