import fs from 'fs';
import path from 'path';
import os from 'os';
import type { TrashEntry, DeleteResult, RestoreResult } from './types';

const TRASH_DIR = path.join(os.homedir(), '.claude-session-manager', 'trash');
const TRASH_INDEX = path.join(os.homedir(), '.claude-session-manager', 'trash-index.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CLAUDE_SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');
const TRASH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function ensureTrashDir(): void {
  if (!fs.existsSync(TRASH_DIR)) {
    fs.mkdirSync(TRASH_DIR, { recursive: true });
  }
}

function readIndex(): TrashEntry[] {
  try {
    if (!fs.existsSync(TRASH_INDEX)) return [];
    return JSON.parse(fs.readFileSync(TRASH_INDEX, 'utf8')) as TrashEntry[];
  } catch {
    return [];
  }
}

function writeIndex(entries: TrashEntry[]): void {
  fs.writeFileSync(TRASH_INDEX, JSON.stringify(entries, null, 2), 'utf8');
}

export function listTrash(): TrashEntry[] {
  return readIndex().filter((e) => {
    const trashPath = path.join(TRASH_DIR, e.filename);
    return fs.existsSync(trashPath);
  });
}

export async function softDeleteSession(
  sessionId: string,
  encodedPath: string,
): Promise<DeleteResult> {
  ensureTrashDir();

  const sourceDir = path.join(CLAUDE_PROJECTS_DIR, encodedPath);
  const sourceFile = path.join(sourceDir, `${sessionId}.jsonl`);

  if (!fs.existsSync(sourceFile)) {
    return { ok: false, message: 'Session file not found' };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${sessionId}.jsonl`;
  const destFile = path.join(TRASH_DIR, filename);

  try {
    fs.renameSync(sourceFile, destFile);
  } catch (err) {
    // Cross-device move: copy then delete
    try {
      fs.copyFileSync(sourceFile, destFile);
      fs.unlinkSync(sourceFile);
    } catch (err2) {
      return { ok: false, message: 'Failed to move session to trash' };
    }
  }

  const entry: TrashEntry = {
    sessionId,
    originalEncodedPath: encodedPath,
    originalPath: sourceFile,
    trashedAt: new Date().toISOString(),
    filename,
  };

  const index = readIndex();
  index.push(entry);
  writeIndex(index);

  return { ok: true, message: 'Session moved to trash' };
}

export async function restoreSession(sessionId: string): Promise<RestoreResult> {
  const index = readIndex();
  const entryIdx = index.findIndex((e) => e.sessionId === sessionId);
  if (entryIdx === -1) {
    return { ok: false, message: 'Session not found in trash' };
  }

  const entry = index[entryIdx]!;
  const trashFile = path.join(TRASH_DIR, entry.filename);

  if (!fs.existsSync(trashFile)) {
    return { ok: false, message: 'Trash file missing — may have been permanently deleted' };
  }

  const destDir = path.join(CLAUDE_PROJECTS_DIR, entry.originalEncodedPath);
  const destFile = path.join(destDir, `${sessionId}.jsonl`);

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    fs.renameSync(trashFile, destFile);
  } catch {
    try {
      fs.copyFileSync(trashFile, destFile);
      fs.unlinkSync(trashFile);
    } catch {
      return { ok: false, message: 'Failed to restore session from trash' };
    }
  }

  index.splice(entryIdx, 1);
  writeIndex(index);

  return { ok: true, message: 'Session restored successfully' };
}

export async function permanentlyDeleteSession(sessionId: string): Promise<DeleteResult> {
  const index = readIndex();
  const entryIdx = index.findIndex((e) => e.sessionId === sessionId);
  if (entryIdx === -1) {
    return { ok: false, message: 'Session not found in trash' };
  }

  const entry = index[entryIdx]!;
  const trashFile = path.join(TRASH_DIR, entry.filename);

  try {
    if (fs.existsSync(trashFile)) {
      fs.unlinkSync(trashFile);
    }
  } catch {
    return { ok: false, message: 'Failed to permanently delete session' };
  }

  index.splice(entryIdx, 1);
  writeIndex(index);

  return { ok: true, message: 'Session permanently deleted' };
}

export function autopurgeTrash(): void {
  const index = readIndex();
  const now = Date.now();
  const toKeep: TrashEntry[] = [];

  for (const entry of index) {
    const age = now - new Date(entry.trashedAt).getTime();
    const trashFile = path.join(TRASH_DIR, entry.filename);
    if (age > TRASH_MAX_AGE_MS) {
      try {
        if (fs.existsSync(trashFile)) fs.unlinkSync(trashFile);
      } catch {
        // best-effort
      }
    } else {
      toKeep.push(entry);
    }
  }

  if (toKeep.length !== index.length) {
    writeIndex(toKeep);
  }
}
