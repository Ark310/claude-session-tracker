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
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function decodeProjectPath(encoded: string): string {
  // e.g. "-home-abdul-Documents-foo" -> "/home/abdul/Documents/foo"
  // The encoded path starts with '-' representing the leading '/'
  return encoded.replace(/^-/, '/').replace(/-/g, '/');
}

export function getRepoName(projectPath: string): string {
  return path.basename(projectPath);
}

function readSessionFiles(): Map<string, SessionFile> {
  const map = new Map<string, SessionFile>();
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return map;
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8');
        const data = JSON.parse(content) as SessionFile;
        map.set(data.sessionId, data);
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // SESSIONS_DIR may not exist
  }
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
    return {
      status: idleMs < IDLE_THRESHOLD_MS ? 'LIVE' : 'IDLE',
      pid: sf.pid,
    };
  }

  return { status: 'ENDED', pid: null };
}

function getFileSizeBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

async function loadSession(
  encodedPath: string,
  sessionId: string,
  sessionFiles: Map<string, SessionFile>,
): Promise<Session | null> {
  const key = `session:${encodedPath}:${sessionId}`;
  return cachedFetch(key, async () => {
    const filePath = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const entries: JsonlEntry[] = parseJsonlFile(content);

      const tokens = aggregateTokenUsage(entries);
      const model = extractModel(entries);
      const toolCallCount = countToolCalls(entries);
      const cwd = extractCwd(entries);
      const branch = extractBranch(entries);
      const { first: startedAt, last: lastActivityAt } = extractTimestamps(entries);
      const projectPath = decodeProjectPath(encodedPath);
      const { status, pid } = determineStatus(sessionId, sessionFiles, lastActivityAt);

      const conversationCount = entries.filter(
        (e) => e.type === 'user' || e.type === 'assistant',
      ).length;

      return {
        id: sessionId,
        encodedPath,
        projectPath,
        repoName: getRepoName(cwd || projectPath),
        cwd: cwd || projectPath,
        branch,
        model,
        startedAt,
        lastActivityAt,
        status,
        pid,
        tokens,
        toolCallCount,
        messageCount: conversationCount,
        fileSizeBytes: getFileSizeBytes(filePath),
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

    const encodedPaths = fs.readdirSync(PROJECTS_DIR).filter((d) => {
      try {
        return fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory();
      } catch {
        return false;
      }
    });

    for (const encodedPath of encodedPaths) {
      const dir = path.join(PROJECTS_DIR, encodedPath);
      let files: string[];
      try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        const session = await loadSession(encodedPath, sessionId, sessionFiles);
        if (session) sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  });
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const all = await getAllSessions();
  return all.find((s) => s.id === sessionId) ?? null;
}

export async function getSessionEntries(sessionId: string, encodedPath: string): Promise<JsonlEntry[]> {
  const key = `entries:${encodedPath}:${sessionId}`;
  return cachedFetch(key, async () => {
    const filePath = path.join(PROJECTS_DIR, encodedPath, `${sessionId}.jsonl`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return parseJsonlFile(content);
    } catch {
      return [];
    }
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
      if (s.branch !== 'unknown' && !existing.branches.includes(s.branch)) {
        existing.branches.push(s.branch);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.sessionCount - a.sessionCount);
}

export async function getDiskUsage(): Promise<DiskUsage> {
  function dirSize(dir: string): number {
    let total = 0;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const p = path.join(dir, item);
        try {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) total += dirSize(p);
          else total += stat.size;
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
    return total;
  }

  const totalBytes = dirSize(PROJECTS_DIR);
  const byRepo: DiskUsage['byRepo'] = [];
  const largestSessions: DiskUsage['largestSessions'] = [];

  if (fs.existsSync(PROJECTS_DIR)) {
    for (const encodedPath of fs.readdirSync(PROJECTS_DIR)) {
      const dir = path.join(PROJECTS_DIR, encodedPath);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }

      const repoBytes = dirSize(dir);
      const projectPath = decodeProjectPath(encodedPath);
      byRepo.push({ repoName: getRepoName(projectPath), encodedPath, bytes: repoBytes });

      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
      for (const f of files) {
        const fPath = path.join(dir, f);
        try {
          const size = fs.statSync(fPath).size;
          largestSessions.push({
            sessionId: f.replace('.jsonl', ''),
            repoName: getRepoName(projectPath),
            bytes: size,
          });
        } catch {
          // skip
        }
      }
    }
  }

  largestSessions.sort((a, b) => b.bytes - a.bytes);

  return {
    totalBytes,
    byRepo: byRepo.sort((a, b) => b.bytes - a.bytes),
    largestSessions: largestSessions.slice(0, 10),
  };
}

export async function getStatsCache(): Promise<Record<string, unknown> | null> {
  const statsCacheFile = path.join(CLAUDE_DIR, 'stats-cache.json');
  try {
    if (!fs.existsSync(statsCacheFile)) return null;
    return JSON.parse(fs.readFileSync(statsCacheFile, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
