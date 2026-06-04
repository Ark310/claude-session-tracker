import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from 'fs';
import { appendAuditLog, readAuditLog } from '../lib/audit-log';
import type { AuditEntry } from '../lib/audit-log';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockAppendFileSync = vi.mocked(fs.appendFileSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

const sampleEntry: AuditEntry = {
  action: 'kill',
  timestamp: '2026-05-21T03:00:00.000Z',
  sessionId: 'test-session-1234',
  pid: 1234,
  outcome: 'success',
  message: 'Process 1234 terminated gracefully',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockMkdirSync.mockReturnValue(undefined as never);
  mockAppendFileSync.mockReturnValue(undefined);
});

describe('appendAuditLog', () => {
  it('appends a JSON line to the audit log', () => {
    appendAuditLog(sampleEntry);
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const [, content] = mockAppendFileSync.mock.calls[0]! as [string, string, string];
    const parsed = JSON.parse(content.trim());
    expect(parsed.action).toBe('kill');
    expect(parsed.sessionId).toBe('test-session-1234');
    expect(parsed.pid).toBe(1234);
    expect(content.endsWith('\n')).toBe(true);
  });

  it('creates directory if it does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    appendAuditLog(sampleEntry);
    expect(mockMkdirSync).toHaveBeenCalledOnce();
  });

  it('does not throw if appendFileSync fails', () => {
    mockAppendFileSync.mockImplementation(() => { throw new Error('disk full'); });
    expect(() => appendAuditLog(sampleEntry)).not.toThrow();
  });

  it('includes all required fields', () => {
    appendAuditLog({ ...sampleEntry, action: 'delete', outcome: 'failure' });
    const [, content] = mockAppendFileSync.mock.calls[0]! as [string, string, string];
    const parsed = JSON.parse(content.trim());
    expect(parsed.action).toBe('delete');
    expect(parsed.outcome).toBe('failure');
    expect(parsed.timestamp).toBeDefined();
  });
});

describe('readAuditLog', () => {
  it('returns parsed entries from audit log', () => {
    const lines = [
      JSON.stringify(sampleEntry),
      JSON.stringify({ ...sampleEntry, action: 'delete' }),
    ].join('\n');
    mockReadFileSync.mockReturnValue(lines as never);

    const entries = readAuditLog();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.action).toBe('kill');
    expect(entries[1]!.action).toBe('delete');
  });

  it('returns empty array when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const entries = readAuditLog();
    expect(entries).toEqual([]);
  });

  it('skips malformed lines', () => {
    mockReadFileSync.mockReturnValue([
      JSON.stringify(sampleEntry),
      'bad json',
      JSON.stringify({ ...sampleEntry, action: 'restore' }),
    ].join('\n') as never);

    const entries = readAuditLog();
    expect(entries).toHaveLength(2);
  });

  it('returns empty array on read error', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    expect(readAuditLog()).toEqual([]);
  });
});
