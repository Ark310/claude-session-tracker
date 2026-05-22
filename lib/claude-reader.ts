import fs from 'fs';
import path from 'path';
import os from 'os';
import { cachedFetch } from './cache';
import {
  parseJsonlFile,
  aggregateTokenUsage,
  extractModel,
  countToolCalls,
  extractCwd,
  extractBranch,
  extractTimestamps,
} from './jsonl-parser';
import { isPidAlive } from './process-utils';
import type { Session, SessionFile, SessionStatus, RepoSummary, DiskUsage, JsonlEntry } from './types';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

// Exported for testing. Uses cwd from JSONL as source of truth.
// Falls back to lossy encoded-path decode only when cwd is absent.
export function resolveProjectPath(encodedPath: string, cwdFromJsonl: string): string {
  if (cwdFromJsonl) return cwdFromJsonl;
  return encodedPath.replace(/^-/, '/').replace(/-/g, '/');
}

export function getRepoName(projectPath: string): string {
  return path.basename(projectPath);
}

function readSessionFiles(): Map<string, SessionFile> {
  const map = new Map<string, SessionFile>();
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return map;
    for (const file of fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'),
        ) as SessionFile;
        map.set(data.sessionId, data);
      } catch { /* skip malformed */ }
    }
  } catch { /* dir may not exist */ }
  return map;
}

function determineStatus(
  sessionId: string,
  sessionFiles: Map<string, SessionFile>,
  lastActivityAt: Date,
): { status: SessionStatus; pid: number | null } {
  const sf = sessionFiles.get(sessionId);
  if (!sf) return { status: 'ENDED', pid: null };
  if (isPidAlive(sf.pid)) {
    const idleMs = Date.now() - lastActivityAt.getTime();
    return { status: idleMs < IDLE_THRESHOLD_MS ? 'LIVE' : 'IDLE', pid: sf.pid };
  }
  return { status: 'ENDED', pid: null };
}

async function loadSession(
  encodedPath: string,
  sessionId: string,
  sessionFiles: Map<string, SessionFile>,
): Promise<Session | null> {
  return cachedFetch(`session:${encodedPath}:${sessionId}`, async () => {
    const filePath = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);
    try {
      const entries: JsonlEntry[] = parseJsonlFile(fs.readFileSync(filePath, 'utf8'));
      const cwdFromJsonl = extractCwd(entries);
      const projectPath = resolveProjectPath(encodedPath, cwdFromJsonl);
      const { first: startedAt, last: lastActivityAt } = extractTimestamps(entries);
      const { status, pid } = determineStatus(sessionId, sessionFiles, lastActivityAt);

      return {
        id: sessionId,
        encodedPath,
        projectPath,
        repoName: getRepoName(cwdFromJsonl || projectPath),
        cwd: cwdFromJsonl || projectPath,
        branch: extractBranch(entries),
        model: extractModel(entries),
        startedAt,
        lastActivityAt,
        status,
        pid,
        tokens: aggregateTokenUsage(entries),
        toolCallCount: countToolCalls(entries),
        messageCount: entries.filter((e) => e.type === 'user' || e.type === 'assistant').length,
        fileSizeBytes: (() => { try { return fs.statSync(filePath).size; } catch { return 0; } })(),
      } satisfies Session;
    } catch {
      return null;
    }
  });
}

export async function getAllSessions(): Promise<Session[]> {
  return cachedFetch('all-sessions', async () => {
    const sessionFiles = readSessionFiles();
    const sessions: Session[] = [];
    if (!fs.existsSync(PROJECTS_DIR)) return sessions;

    for (const encodedPath of fs.readdirSync(PROJECTS_DIR).filter((d) => {
      try { return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory(); } catch { return false; }
    })) {
      let files: string[];
      try { files = fs.readdirSync(path.join(PROJECTS_DIR, encodedPath)).filter((f) => f.endsWith('.jsonl')); }
      catch { continue; }
      for (const file of files) {
        const session = await loadSession(encodedPath, file.replace('.jsonl', ''), sessionFiles);
        if (session) sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  });
}

export async function getSession(sessionId: string): Promise<Session | null> {
  return (await getAllSessions()).find((s) => s.id === sessionId) ?? null;
}

export async function getSessionEntries(sessionId: string, encodedPath: string): Promise<JsonlEntry[]> {
  return cachedFetch(`entries:${encodedPath}:${sessionId}`, async () => {
    try {
      return parseJsonlFile(
        fs.readFileSync(path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`), 'utf8'),
      );
    } catch { return []; }
  });
}

export async function getRepoSummaries(): Promise<RepoSummary[]> {
  const sessions = await getAllSessions();
  const map = new Map<string, RepoSummary>();
  for (const s of sessions) {
    const existing = map.get(s.encodedPath);
    if (!existing) {
      map.set(s.encodedPath, {
        encodedPath: s.encodedPath,
        projectPath: s.projectPath,
        repoName: s.repoName,
        sessionCount: 1,
        liveSessions: s.status === 'LIVE' ? 1 : 0,
        branches: s.branch !== 'unknown' ? [s.branch] : [],
      });
    } else {
      existing.sessionCount++;
      if (s.status === 'LIVE') existing.liveSessions++;
      if (s.branch !== 'unknown' && !existing.branches.includes(s.branch))
        existing.branches.push(s.branch);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.sessionCount - a.sessionCount);
}

export async function getDiskUsage(): Promise<DiskUsage> {
  function dirSize(dir: string): number {
    let total = 0;
    try {
      for (const item of fs.readdirSync(dir)) {
        const p = path.join(dir, item);
        try {
          const stat = fs.statSync(p);
          total += stat.isDirectory() ? dirSize(p) : stat.size;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return total;
  }

  const byRepo: DiskUsage['byRepo'] = [];
  const largestSessions: DiskUsage['largestSessions'] = [];

  if (fs.existsSync(PROJECTS_DIR)) {
    for (const encodedPath of fs.readdirSync(PROJECTS_DIR)) {
      const dir = path.join(PROJECTS_DIR, encodedPath);
      try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
      const projectPath = encodedPath.replace(/^-/, '/').replace(/-/g, '/');
      byRepo.push({ repoName: path.basename(projectPath), encodedPath, bytes: dirSize(dir) });
      for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
        try {
          largestSessions.push({
            sessionId: f.replace('.jsonl', ''),
            repoName: path.basename(projectPath),
            bytes: fs.statSync(path.join(dir, f)).size,
          });
        } catch { /* skip */ }
      }
    }
  }

  return {
    totalBytes: dirSize(PROJECTS_DIR),
    byRepo: byRepo.sort((a, b) => b.bytes - a.bytes),
    largestSessions: largestSessions.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  };
}

export async function getStatsCache(): Promise<Record<string, unknown> | null> {
  try {
    const f = path.join(CLAUDE_DIR, 'stats-cache.json');
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
  } catch { return null; }
}
