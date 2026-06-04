import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import fs from 'fs';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockRenameSync = vi.mocked(fs.renameSync);
const mockCopyFileSync = vi.mocked(fs.copyFileSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);

import { softDeleteSession, restoreSession, permanentlyDeleteSession, listTrash } from '../lib/trash';

const TRASH_DIR = path.join(os.homedir(), '.claude-session-manager', 'trash');
const TRASH_INDEX = path.join(os.homedir(), '.claude-session-manager', 'trash-index.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const SESSION_ID = 'test-session-1234-abcd-efgh';
const ENCODED_PATH = '-home-user-myproject';

function makeIndex(...entries: object[]) {
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    if (filePath === TRASH_INDEX) return JSON.stringify(entries) as never;
    throw new Error(`not found: ${filePath}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockMkdirSync.mockReturnValue(undefined as never);
  mockWriteFileSync.mockReturnValue(undefined);
  mockRenameSync.mockReturnValue(undefined);
  mockCopyFileSync.mockReturnValue(undefined);
  mockUnlinkSync.mockReturnValue(undefined);
  makeIndex();
});

describe('softDeleteSession', () => {
  it('moves JSONL to trash and updates index', async () => {
    const sourceFile = path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`);
    mockExistsSync.mockImplementation((p: unknown) =>
      p === sourceFile || p === TRASH_DIR || p === TRASH_INDEX,
    );

    const result = await softDeleteSession(SESSION_ID, ENCODED_PATH);

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Session moved to trash');
    expect(mockRenameSync).toHaveBeenCalledOnce();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      TRASH_INDEX,
      expect.stringContaining(SESSION_ID),
      'utf8',
    );
  });

  it('returns error when source file does not exist', async () => {
    const sourceFile = path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`);
    mockExistsSync.mockImplementation((p: unknown) => p !== sourceFile);

    const result = await softDeleteSession(SESSION_ID, ENCODED_PATH);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Session file not found');
    expect(mockRenameSync).not.toHaveBeenCalled();
  });

  it('falls back to copy+delete on cross-device rename error', async () => {
    const sourceFile = path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`);
    mockExistsSync.mockImplementation((p: unknown) =>
      p === sourceFile || p === TRASH_DIR || p === TRASH_INDEX,
    );
    mockRenameSync.mockImplementation(() => { throw new Error('EXDEV'); });

    const result = await softDeleteSession(SESSION_ID, ENCODED_PATH);
    expect(result.ok).toBe(true);
    expect(mockCopyFileSync).toHaveBeenCalledOnce();
    expect(mockUnlinkSync).toHaveBeenCalledWith(sourceFile);
  });
});

describe('restoreSession', () => {
  const trashEntry = {
    sessionId: SESSION_ID,
    originalEncodedPath: ENCODED_PATH,
    originalPath: path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`),
    trashedAt: new Date().toISOString(),
    filename: `2026-05-21-${SESSION_ID}.jsonl`,
  };

  it('restores from trash to original path', async () => {
    makeIndex(trashEntry);
    const trashFile = path.join(TRASH_DIR, trashEntry.filename);
    const destDir = path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH);

    mockExistsSync.mockImplementation((p: unknown) =>
      p === trashFile || p === destDir || p === TRASH_INDEX,
    );

    const result = await restoreSession(SESSION_ID);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Session restored successfully');
    expect(mockRenameSync).toHaveBeenCalledWith(
      trashFile,
      path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`),
    );
    // Index should be updated (written with one fewer entry)
    const writtenData = JSON.parse((mockWriteFileSync.mock.calls[0]! as [string, string])[1]);
    expect(writtenData).toHaveLength(0);
  });

  it('returns error when session not in trash', async () => {
    makeIndex(); // empty
    const result = await restoreSession(SESSION_ID);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Session not found in trash');
  });

  it('returns error when trash file is missing', async () => {
    makeIndex(trashEntry);
    const trashFile = path.join(TRASH_DIR, trashEntry.filename);
    mockExistsSync.mockImplementation((p: unknown) => p === TRASH_INDEX && p !== trashFile);

    const result = await restoreSession(SESSION_ID);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing');
  });
});

describe('permanentlyDeleteSession', () => {
  const trashEntry = {
    sessionId: SESSION_ID,
    originalEncodedPath: ENCODED_PATH,
    originalPath: path.join(CLAUDE_PROJECTS_DIR, ENCODED_PATH, `${SESSION_ID}.jsonl`),
    trashedAt: new Date().toISOString(),
    filename: `2026-05-21-${SESSION_ID}.jsonl`,
  };

  it('deletes the trash file and removes from index', async () => {
    makeIndex(trashEntry);
    const trashFile = path.join(TRASH_DIR, trashEntry.filename);
    mockExistsSync.mockReturnValue(true);

    const result = await permanentlyDeleteSession(SESSION_ID);
    expect(result.ok).toBe(true);
    expect(mockUnlinkSync).toHaveBeenCalledWith(trashFile);
    const writtenData = JSON.parse((mockWriteFileSync.mock.calls[0]! as [string, string])[1]);
    expect(writtenData).toHaveLength(0);
  });

  it('returns error when session not in trash', async () => {
    makeIndex();
    const result = await permanentlyDeleteSession(SESSION_ID);
    expect(result.ok).toBe(false);
  });
});

describe('listTrash', () => {
  it('returns entries whose trash files still exist', () => {
    const existing = {
      sessionId: 'exists',
      filename: 'existing.jsonl',
      originalEncodedPath: ENCODED_PATH,
      originalPath: '',
      trashedAt: new Date().toISOString(),
    };
    const missing = {
      sessionId: 'gone',
      filename: 'gone.jsonl',
      originalEncodedPath: ENCODED_PATH,
      originalPath: '',
      trashedAt: new Date().toISOString(),
    };
    makeIndex(existing, missing);

    mockExistsSync.mockImplementation((p: unknown) =>
      p === TRASH_INDEX || p === path.join(TRASH_DIR, 'existing.jsonl'),
    );

    const list = listTrash();
    expect(list).toHaveLength(1);
    expect(list[0]!.sessionId).toBe('exists');
  });
});
