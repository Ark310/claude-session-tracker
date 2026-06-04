# Claude Session Manager — Full Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the data layer and UI components of `claude-session-manager` to fix all correctness bugs, add SSE real-time updates, and replace the session grid with cards.

**Architecture:** Three layers — data (`lib/`), app (Next.js pages + Server Actions), browser (React client components). The data layer is pure Node.js with no Next.js imports. Session identity uses `cwd` from JSONL as source of truth, with encoded-path decode as fallback only. SSE pushes file-watch events to the browser, which triggers a `router.refresh()`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v4, Vitest, Node.js `fs.watch`

---

## File Map

### Created
| File | Responsibility |
|------|---------------|
| `lib/claude-reader.ts` | Replaces `claude-data.ts` — `cwd`-first path resolution, all session queries |
| `lib/stats-utils.ts` | Pure activity bucket calculation (extracted for testability) |
| `lib/session-watcher.ts` | `fs.watch` wrapper used exclusively by SSE route |
| `app/api/events/route.ts` | SSE streaming route handler |
| `hooks/use-session-events.ts` | Client hook — subscribes to SSE, calls `router.refresh()` |
| `components/session-card.tsx` | Single session card (replaces `session-row.tsx`) |
| `components/session-grid.tsx` | Card grid + SSE hook (replaces `session-list.tsx`) |
| `__tests__/claude-reader.test.ts` | Tests for path resolution and repo name extraction |
| `__tests__/stats-utils.test.ts` | Tests for activity bucket math |
| `__tests__/session-watcher.test.ts` | Tests for watcher callback and teardown |

### Rebuilt (significant changes)
| File | Change |
|------|--------|
| `lib/jsonl-parser.ts` | More defensive token/model extraction, expanded tests |
| `components/kill-button.tsx` | Simple confirm dialog replaces hash-typing dialog |
| `app/page.tsx` | Import `claude-reader`, use `SessionGrid` |
| `app/stats/page.tsx` | Import `claude-reader` + `stats-utils`, fix chart |
| `__tests__/jsonl-parser.test.ts` | New edge-case tests for missing fields |

### Updated (import path only)
| File | Change |
|------|--------|
| `app/sessions/[id]/page.tsx` | `@/lib/claude-data` → `@/lib/claude-reader` |
| `app/manager/page.tsx` | `@/lib/claude-data` → `@/lib/claude-reader` |
| `README.md` | Clarify `cd claude-session-manager` as first step |
| `CLAUDE.md` | Update file map, document ADRs |

### Deleted
| File | Reason |
|------|--------|
| `lib/claude-data.ts` | Replaced by `claude-reader.ts` |
| `components/session-row.tsx` | Replaced by `session-card.tsx` |
| `components/session-list.tsx` | Replaced by `session-grid.tsx` |

### Unchanged
`lib/types.ts`, `lib/cache.ts`, `lib/process-utils.ts`, `lib/trash.ts`, `lib/audit-log.ts`, `app/actions/*`, `app/trash/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/live-indicator.tsx`, `components/bulk-actions-bar.tsx`, `components/conversation-entry.tsx`, `components/sidebar.tsx`, `__tests__/process-utils.test.ts`, `__tests__/trash.test.ts`, `__tests__/audit-log.test.ts`, `vitest.config.ts`

---

## Task 1: Fix Setup Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update README — make `cd` the first visible instruction**

Replace the entire "Install & run" section in `README.md`:

```markdown
## Install & run

> The app lives in the `claude-session-manager/` subdirectory. You **must** `cd` into it first.

```bash
cd claude-session-manager
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### LAN access

```bash
npm run dev:lan
```

### Read-only mode (disables all kill/delete actions)

```bash
READ_ONLY=1 npm run dev
```
```

- [ ] **Step 2: Update CLAUDE.md — add ADRs and corrected file map**

Replace the content of `CLAUDE.md` (keep the `@AGENTS.md` line at the top):

```markdown
@AGENTS.md

# claude-session-manager — Architecture Reference

## Quick start (always run from inside this directory)
```bash
cd claude-session-manager
npm install && npm run dev
```

## Stack
- **Next.js 16** App Router — Server Components by default, Server Actions for mutations
- **TypeScript strict** — no implicit any
- **Tailwind CSS v4** — `@import "tailwindcss"` in globals.css, no config file
- **Vitest** — unit tests in `__tests__/`, run with `npm test`
- **No database** — reads `~/.claude/` directly; 30s in-memory TTL cache in `lib/cache.ts`

## Architecture Decision Records

**ADR-1: `cwd`-first project path resolution**
The encoded path in `~/.claude/projects/` (e.g. `-home-user-my-project`) replaces `/` with `-`, which is lossy — it cannot distinguish `/home/user/my-project` from `/home/user/my/project`. All interactive Claude Code sessions write a `cwd` field in their JSONL entries. `lib/claude-reader.ts` uses that as the source of truth; the encoded path is a last-resort fallback.

**ADR-2: SSE over polling for live updates**
`~/.claude/sessions/` changes only when sessions start/stop. `app/api/events/route.ts` opens `fs.watch` on that directory and streams `data: refresh` events. The client hook (`hooks/use-session-events.ts`) calls `router.refresh()` on each event — no data travels in the stream.

**ADR-3: Card layout**
Cards degrade gracefully when fields are missing (0 tokens, unknown model). Grid rows break alignment. Cards omit zero-value rows rather than displaying meaningless zeroes.

## Data flow
```
~/.claude/projects/<encoded>/<id>.jsonl
  → lib/jsonl-parser.ts   parse + aggregate tokens/model/cwd/branch
  → lib/claude-reader.ts  build Session objects, resolve paths, detect status
  → app/page.tsx          filter + render via <SessionGrid>

~/.claude/sessions/<pid>.json
  → lib/claude-reader.ts  cross-check PID liveness via lib/process-utils.ts
  → lib/session-watcher.ts  watch dir for changes → SSE → browser refresh
```

## Key files
| File | Responsibility |
|------|---------------|
| `lib/types.ts` | All TypeScript types |
| `lib/cache.ts` | 30s TTL cache, `cachedFetch` wrapper |
| `lib/jsonl-parser.ts` | Parse JSONL, aggregate tokens, extract cwd/branch/model |
| `lib/claude-reader.ts` | All session queries — `cwd`-first path resolution |
| `lib/stats-utils.ts` | Pure activity bucket calculation |
| `lib/session-watcher.ts` | `fs.watch` wrapper used by SSE route only |
| `lib/process-utils.ts` | PID liveness + safe kill |
| `lib/trash.ts` | Soft-delete, restore, autopurge |
| `lib/audit-log.ts` | Append-only JSON-lines audit log |

## Safety invariants (never break)
1. `~/.claude/projects/` is read-only — never written or deleted from
2. Kill requires PID ≥ 100 AND cmdline contains `claude`
3. Delete refuses LIVE sessions
4. All mutations go through Server Actions in `app/actions/`
5. `READ_ONLY=1` disables all Server Actions at the action level
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: clarify setup — cd into claude-session-manager first"
```

---

## Task 2: Rebuild `lib/jsonl-parser.ts`

**Files:**
- Modify: `lib/jsonl-parser.ts`
- Modify: `__tests__/jsonl-parser.test.ts`

- [ ] **Step 1: Add edge-case tests that expose current weaknesses**

Replace the entire content of `__tests__/jsonl-parser.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseJsonlLine,
  parseJsonlFile,
  aggregateTokenUsage,
  extractModel,
  countToolCalls,
  extractCwd,
  extractBranch,
  extractTimestamps,
  extractConversationEntries,
} from '../lib/jsonl-parser';
import type { JsonlEntry } from '../lib/types';

// ─── fixtures ────────────────────────────────────────────────────────────────

const permEntry: JsonlEntry = {
  type: 'permission-mode',
  permissionMode: 'default',
  sessionId: 'sess-1',
};

const userEntry: JsonlEntry = {
  type: 'user',
  uuid: 'aaa-111',
  timestamp: '2026-05-21T03:00:00.000Z',
  sessionId: 'sess-1',
  cwd: '/home/user/myrepo',
  gitBranch: 'main',
  message: { role: 'user', content: 'Hello Claude!' },
};

const assistantEntry: JsonlEntry = {
  type: 'assistant',
  uuid: 'bbb-222',
  timestamp: '2026-05-21T03:00:05.000Z',
  sessionId: 'sess-1',
  cwd: '/home/user/myrepo',
  gitBranch: 'main',
  message: {
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      { type: 'text', text: 'Hello!' },
      { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    },
  } as JsonlEntry['message'],
};

const assistantNoUsage: JsonlEntry = {
  type: 'assistant',
  uuid: 'ccc-333',
  timestamp: '2026-05-21T03:00:10.000Z',
  sessionId: 'sess-1',
  message: {
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'hi' }],
    // no usage field
  } as JsonlEntry['message'],
};

const assistantPartialUsage: JsonlEntry = {
  type: 'assistant',
  uuid: 'ddd-444',
  timestamp: '2026-05-21T03:00:15.000Z',
  sessionId: 'sess-1',
  message: {
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'hi' }],
    usage: { output_tokens: 25 }, // only output_tokens, rest missing
  } as JsonlEntry['message'],
};

const assistantNoModel: JsonlEntry = {
  type: 'assistant',
  uuid: 'eee-555',
  timestamp: '2026-05-21T03:00:20.000Z',
  sessionId: 'sess-1',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'hi' }],
    usage: { input_tokens: 10, output_tokens: 5 },
    // no model field
  } as JsonlEntry['message'],
};

// ─── parseJsonlLine ───────────────────────────────────────────────────────────

describe('parseJsonlLine', () => {
  it('parses valid JSON', () => {
    expect(parseJsonlLine(JSON.stringify(userEntry))).toEqual(userEntry);
  });
  it('returns null for empty string', () => {
    expect(parseJsonlLine('')).toBeNull();
  });
  it('returns null for whitespace', () => {
    expect(parseJsonlLine('   ')).toBeNull();
  });
  it('returns null for invalid JSON', () => {
    expect(parseJsonlLine('{broken')).toBeNull();
  });
});

// ─── parseJsonlFile ───────────────────────────────────────────────────────────

describe('parseJsonlFile', () => {
  it('parses multiple lines', () => {
    const content = [userEntry, assistantEntry, permEntry].map((e) => JSON.stringify(e)).join('\n');
    expect(parseJsonlFile(content)).toHaveLength(3);
  });
  it('skips malformed lines', () => {
    const content = [JSON.stringify(userEntry), 'bad json', JSON.stringify(assistantEntry)].join('\n');
    expect(parseJsonlFile(content)).toHaveLength(2);
  });
  it('handles empty content', () => {
    expect(parseJsonlFile('')).toEqual([]);
    expect(parseJsonlFile('\n\n')).toEqual([]);
  });
});

// ─── aggregateTokenUsage ──────────────────────────────────────────────────────

describe('aggregateTokenUsage', () => {
  it('sums tokens from assistant entries', () => {
    const tokens = aggregateTokenUsage([userEntry, assistantEntry]);
    expect(tokens.inputTokens).toBe(100);
    expect(tokens.outputTokens).toBe(50);
    expect(tokens.cacheCreationTokens).toBe(200);
    expect(tokens.cacheReadTokens).toBe(300);
  });

  it('returns zeros when no assistant entries', () => {
    const tokens = aggregateTokenUsage([userEntry, permEntry]);
    expect(tokens).toEqual({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
  });

  it('treats missing usage field as zero — does not throw', () => {
    const tokens = aggregateTokenUsage([assistantNoUsage]);
    expect(tokens).toEqual({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
  });

  it('treats missing individual usage fields as zero', () => {
    const tokens = aggregateTokenUsage([assistantPartialUsage]);
    expect(tokens.inputTokens).toBe(0);
    expect(tokens.outputTokens).toBe(25);
    expect(tokens.cacheCreationTokens).toBe(0);
    expect(tokens.cacheReadTokens).toBe(0);
  });

  it('accumulates across multiple assistant entries', () => {
    const second: JsonlEntry = {
      ...assistantEntry,
      uuid: 'fff-666',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [],
        usage: { input_tokens: 50, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 },
      } as JsonlEntry['message'],
    };
    const tokens = aggregateTokenUsage([assistantEntry, second]);
    expect(tokens.inputTokens).toBe(150);
    expect(tokens.outputTokens).toBe(75);
    expect(tokens.cacheReadTokens).toBe(400);
  });
});

// ─── extractModel ─────────────────────────────────────────────────────────────

describe('extractModel', () => {
  it('returns model from first assistant entry', () => {
    expect(extractModel([userEntry, assistantEntry])).toBe('claude-sonnet-4-6');
  });

  it('skips entries without model field and finds next', () => {
    expect(extractModel([assistantNoModel, assistantEntry])).toBe('claude-sonnet-4-6');
  });

  it('returns "unknown" when no assistant entries have model', () => {
    expect(extractModel([userEntry, permEntry])).toBe('unknown');
    expect(extractModel([assistantNoModel])).toBe('unknown');
  });
});

// ─── countToolCalls ───────────────────────────────────────────────────────────

describe('countToolCalls', () => {
  it('counts tool_use blocks in assistant messages', () => {
    expect(countToolCalls([userEntry, assistantEntry])).toBe(1);
  });
  it('returns 0 when no tool calls', () => {
    expect(countToolCalls([assistantNoUsage])).toBe(0);
  });
  it('returns 0 for user-only entries', () => {
    expect(countToolCalls([userEntry])).toBe(0);
  });
});

// ─── extractCwd ───────────────────────────────────────────────────────────────

describe('extractCwd', () => {
  it('returns cwd from first entry that has it', () => {
    expect(extractCwd([permEntry, userEntry])).toBe('/home/user/myrepo');
  });
  it('returns empty string when no entry has cwd', () => {
    expect(extractCwd([permEntry])).toBe('');
  });
  it('finds cwd in assistant entry when user entry has none', () => {
    const noOwdUser: JsonlEntry = { ...userEntry, cwd: undefined };
    expect(extractCwd([noOwdUser, assistantEntry])).toBe('/home/user/myrepo');
  });
});

// ─── extractBranch ────────────────────────────────────────────────────────────

describe('extractBranch', () => {
  it('returns non-HEAD branch', () => {
    expect(extractBranch([userEntry])).toBe('main');
  });
  it('returns HEAD when only HEAD entries exist', () => {
    const headEntry: JsonlEntry = { ...userEntry, gitBranch: 'HEAD' };
    expect(extractBranch([headEntry])).toBe('HEAD');
  });
  it('prefers non-HEAD over HEAD', () => {
    const headEntry: JsonlEntry = { ...userEntry, gitBranch: 'HEAD' };
    const mainEntry: JsonlEntry = { ...assistantEntry, gitBranch: 'main' };
    expect(extractBranch([headEntry, mainEntry])).toBe('main');
  });
  it('returns "unknown" when no entries have gitBranch', () => {
    expect(extractBranch([permEntry])).toBe('unknown');
  });
});

// ─── extractTimestamps ────────────────────────────────────────────────────────

describe('extractTimestamps', () => {
  it('returns first and last timestamps', () => {
    const { first, last } = extractTimestamps([userEntry, assistantEntry]);
    expect(first.toISOString()).toBe('2026-05-21T03:00:00.000Z');
    expect(last.toISOString()).toBe('2026-05-21T03:00:05.000Z');
  });
  it('returns now for both when no valid timestamps', () => {
    const before = Date.now();
    const { first, last } = extractTimestamps([permEntry]);
    const after = Date.now();
    expect(first.getTime()).toBeGreaterThanOrEqual(before);
    expect(last.getTime()).toBeLessThanOrEqual(after);
  });
  it('ignores entries with invalid timestamp strings', () => {
    const bad: JsonlEntry = { ...userEntry, timestamp: 'not-a-date' };
    const { first, last } = extractTimestamps([bad, assistantEntry]);
    expect(first.toISOString()).toBe('2026-05-21T03:00:05.000Z');
    expect(last.toISOString()).toBe('2026-05-21T03:00:05.000Z');
  });
});

// ─── extractConversationEntries ───────────────────────────────────────────────

describe('extractConversationEntries', () => {
  it('returns only user and assistant entries with uuid+timestamp+message', () => {
    const entries = extractConversationEntries([userEntry, assistantEntry, permEntry]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('user');
    expect(entries[1]!.type).toBe('assistant');
  });
  it('skips entries missing uuid or timestamp', () => {
    const partial: JsonlEntry = { type: 'user', sessionId: 'x' };
    expect(extractConversationEntries([partial])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm new edge-case tests fail**

```bash
npm test -- __tests__/jsonl-parser.test.ts
```

Expected: some tests fail (specifically the `assistantNoModel` and `assistantPartialUsage` cases may surface gaps).

- [ ] **Step 3: Rewrite `lib/jsonl-parser.ts` with defensive extraction**

Replace the entire file:

```typescript
import type { JsonlEntry, ConversationEntry, TokenUsage } from './types';

export function parseJsonlLine(line: string): JsonlEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as JsonlEntry;
  } catch {
    return null;
  }
}

export function parseJsonlFile(content: string): JsonlEntry[] {
  return content
    .split('\n')
    .map(parseJsonlLine)
    .filter((e): e is JsonlEntry => e !== null);
}

export function extractConversationEntries(entries: JsonlEntry[]): ConversationEntry[] {
  return entries
    .filter(
      (e): e is JsonlEntry & Required<Pick<JsonlEntry, 'uuid' | 'timestamp' | 'message'>> =>
        (e.type === 'user' || e.type === 'assistant') &&
        Boolean(e.uuid) &&
        Boolean(e.timestamp) &&
        Boolean(e.message),
    )
    .map((e) => ({
      uuid: e.uuid!,
      type: e.type as 'user' | 'assistant',
      timestamp: e.timestamp!,
      sessionId: e.sessionId ?? '',
      cwd: e.cwd,
      gitBranch: e.gitBranch,
      message: e.message!,
      isSidechain: e.isSidechain,
      parentUuid: e.parentUuid,
    }));
}

export function aggregateTokenUsage(entries: JsonlEntry[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const msg = entry.message as { role?: string; usage?: Record<string, number | undefined> };
    if (msg.role !== 'assistant' || !msg.usage) continue;
    inputTokens += msg.usage['input_tokens'] ?? 0;
    outputTokens += msg.usage['output_tokens'] ?? 0;
    cacheCreationTokens += msg.usage['cache_creation_input_tokens'] ?? 0;
    cacheReadTokens += msg.usage['cache_read_input_tokens'] ?? 0;
  }

  return { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens };
}

export function extractModel(entries: JsonlEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const msg = entry.message as { role?: string; model?: string };
    if (msg.role === 'assistant' && msg.model) return msg.model;
  }
  return 'unknown';
}

export function countToolCalls(entries: JsonlEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message) continue;
    const msg = entry.message as { content?: unknown[] };
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if ((block as { type?: string })?.type === 'tool_use') count++;
    }
  }
  return count;
}

export function extractCwd(entries: JsonlEntry[]): string {
  for (const entry of entries) {
    if (entry.cwd) return entry.cwd;
  }
  return '';
}

export function extractBranch(entries: JsonlEntry[]): string {
  for (const entry of entries) {
    if (entry.gitBranch && entry.gitBranch !== 'HEAD') return entry.gitBranch;
  }
  for (const entry of entries) {
    if (entry.gitBranch) return entry.gitBranch;
  }
  return 'unknown';
}

export function extractTimestamps(entries: JsonlEntry[]): { first: Date; last: Date } {
  const timestamps = entries
    .filter((e) => Boolean(e.timestamp))
    .map((e) => new Date(e.timestamp!).getTime())
    .filter((t) => !isNaN(t));

  if (timestamps.length === 0) {
    const now = new Date();
    return { first: now, last: now };
  }

  return {
    first: new Date(Math.min(...timestamps)),
    last: new Date(Math.max(...timestamps)),
  };
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npm test -- __tests__/jsonl-parser.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/jsonl-parser.ts __tests__/jsonl-parser.test.ts
git commit -m "fix(parser): defensive token/model extraction, expanded test coverage"
```

---

## Task 3: Create `lib/claude-reader.ts`

**Files:**
- Create: `lib/claude-reader.ts`
- Create: `__tests__/claude-reader.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/claude-reader.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — confirm they fail (file doesn't exist yet)**

```bash
npm test -- __tests__/claude-reader.test.ts
```

Expected: FAIL — `Cannot find module '../lib/claude-reader'`

- [ ] **Step 3: Create `lib/claude-reader.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npm test -- __tests__/claude-reader.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npm test
```

Expected: all 49 + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/claude-reader.ts __tests__/claude-reader.test.ts
git commit -m "feat(data): add claude-reader with cwd-first path resolution"
```

---

## Task 4: Create `lib/stats-utils.ts`

**Files:**
- Create: `lib/stats-utils.ts`
- Create: `__tests__/stats-utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/stats-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildActivityBuckets } from '../lib/stats-utils';
import type { Session } from '../lib/types';

function session(lastActivityAt: Date): Session {
  return { lastActivityAt } as Session;
}

describe('buildActivityBuckets', () => {
  it('places a session from today in the last bucket (index 13)', () => {
    const now = Date.now();
    const buckets = buildActivityBuckets([session(new Date(now - 1_000))], now);
    expect(buckets[13]).toBe(1);
    expect(buckets.slice(0, 13).every((b) => b === 0)).toBe(true);
  });

  it('places a session from 25 hours ago in the second-to-last bucket (index 12)', () => {
    const now = Date.now();
    const buckets = buildActivityBuckets([session(new Date(now - 25 * 60 * 60 * 1_000))], now);
    expect(buckets[12]).toBe(1);
    expect(buckets[13]).toBe(0);
  });

  it('ignores sessions older than the window', () => {
    const now = Date.now();
    const old = new Date(now - 20 * 24 * 60 * 60 * 1_000); // 20 days ago
    const buckets = buildActivityBuckets([session(old)], now);
    expect(buckets.every((b) => b === 0)).toBe(true);
  });

  it('accumulates multiple sessions on the same day', () => {
    const now = Date.now();
    const s = [
      session(new Date(now - 1_000)),
      session(new Date(now - 2_000)),
      session(new Date(now - 3_000)),
    ];
    const buckets = buildActivityBuckets(s, now);
    expect(buckets[13]).toBe(3);
  });

  it('returns 14 zeros for empty session list', () => {
    const buckets = buildActivityBuckets([], Date.now());
    expect(buckets).toHaveLength(14);
    expect(buckets.every((b) => b === 0)).toBe(true);
  });

  it('does not mutate the original array via reverse', () => {
    const now = Date.now();
    const original = [session(new Date(now - 1_000))];
    buildActivityBuckets(original, now);
    expect(original).toHaveLength(1); // sessions array untouched
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- __tests__/stats-utils.test.ts
```

Expected: FAIL — `Cannot find module '../lib/stats-utils'`

- [ ] **Step 3: Create `lib/stats-utils.ts`**

```typescript
import type { Session } from './types';

// Returns an array of length `days` — oldest day first, most recent last.
// Counts how many sessions had their last activity in each day bucket.
export function buildActivityBuckets(sessions: Session[], now: number, days = 14): number[] {
  const buckets: number[] = Array(days).fill(0);
  for (const s of sessions) {
    const dayIdx = Math.floor((now - s.lastActivityAt.getTime()) / (24 * 60 * 60 * 1_000));
    if (dayIdx >= 0 && dayIdx < days) {
      buckets[dayIdx]!++;
    }
  }
  return [...buckets].reverse(); // copy before reversing — do not mutate
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npm test -- __tests__/stats-utils.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/stats-utils.ts __tests__/stats-utils.test.ts
git commit -m "feat(stats): extract buildActivityBuckets as pure testable function"
```

---

## Task 5: Create `lib/session-watcher.ts`

**Files:**
- Create: `lib/session-watcher.ts`
- Create: `__tests__/session-watcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/session-watcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    watch: vi.fn(),
  },
}));

import fs from 'fs';
import { watchSessions } from '../lib/session-watcher';

const mockWatch = vi.mocked(fs.watch);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockWatch.mockReturnValue({ close: mockClose } as unknown as fs.FSWatcher);
});

describe('watchSessions', () => {
  it('calls callback when a file change is detected', () => {
    let capturedCallback: (() => void) | null = null;
    mockWatch.mockImplementation((_p, cb) => {
      capturedCallback = cb as () => void;
      return { close: mockClose } as unknown as fs.FSWatcher;
    });

    const onChanged = vi.fn();
    watchSessions(onChanged);

    expect(capturedCallback).not.toBeNull();
    capturedCallback!();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('teardown function closes the watcher', () => {
    const teardown = watchSessions(vi.fn());
    teardown();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('creates the sessions directory if it does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    watchSessions(vi.fn());
    expect(mockMkdirSync).toHaveBeenCalledOnce();
  });

  it('does not call mkdirSync when directory already exists', () => {
    mockExistsSync.mockReturnValue(true);
    watchSessions(vi.fn());
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- __tests__/session-watcher.test.ts
```

Expected: FAIL — `Cannot find module '../lib/session-watcher'`

- [ ] **Step 3: Create `lib/session-watcher.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

// Opens fs.watch on ~/.claude/sessions/.
// Calls callback on any file event (add / change / delete).
// Returns a teardown function — call it to close the watcher.
export function watchSessions(callback: () => void): () => void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const watcher = fs.watch(SESSIONS_DIR, () => callback());
  return () => watcher.close();
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npm test -- __tests__/session-watcher.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/session-watcher.ts __tests__/session-watcher.test.ts
git commit -m "feat(watcher): add fs.watch wrapper for SSE route"
```

---

## Task 6: SSE Route Handler + Client Hook

**Files:**
- Create: `app/api/events/route.ts`
- Create: `hooks/use-session-events.ts`

- [ ] **Step 1: Create the `hooks/` directory and the client hook**

Create `hooks/use-session-events.ts`:

```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useSessionEvents(): void {
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource('/api/events');

      es.onmessage = (evt) => {
        if (evt.data === 'refresh') router.refresh();
      };

      es.onerror = () => {
        es?.close();
        retryTimer = setTimeout(connect, 5_000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, [router]);
}
```

- [ ] **Step 2: Create the SSE route handler**

Create directory `app/api/events/` then create `app/api/events/route.ts`:

```typescript
import { watchSessions } from '@/lib/session-watcher';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function enqueue(data: string) {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // client already disconnected
        }
      }

      const teardown = watchSessions(() => enqueue('data: refresh\n\n'));
      const heartbeat = setInterval(() => enqueue('data: heartbeat\n\n'), 25_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        teardown();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 3: Verify SSE route responds correctly**

Start the dev server (if not already running):
```bash
npm run dev &
sleep 4
```

Test the SSE endpoint:
```bash
curl -N http://127.0.0.1:3000/api/events
```

Expected output (within 25 seconds):
```
data: heartbeat
```
Press Ctrl+C to stop curl.

- [ ] **Step 4: Commit**

```bash
git add app/api/events/route.ts hooks/use-session-events.ts
git commit -m "feat(sse): add real-time session update stream via fs.watch"
```

---

## Task 7: Rebuild `components/kill-button.tsx`

**Files:**
- Modify: `components/kill-button.tsx`

- [ ] **Step 1: Replace with simple confirm dialog**

Replace the entire file:

```typescript
'use client';
import { useState, useTransition } from 'react';
import { killSession } from '@/app/actions/kill-session';

interface KillButtonProps {
  pid: number;
  sessionId: string;
}

export function KillButton({ pid, sessionId }: KillButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!showConfirm) {
    return (
      <button
        onClick={() => { setShowConfirm(true); setError(null); }}
        className="px-2 py-0.5 text-xs font-mono text-red-400 border border-red-800 hover:bg-red-950 hover:text-red-300 transition-colors"
      >
        [kill]
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={() => setShowConfirm(false)}
    >
      <div
        className="terminal-box p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="terminal-box-title text-red-400">CONFIRM KILL</div>
        <p className="mt-3 text-sm font-mono text-green-400">
          Kill PID <span className="text-red-400 font-bold">{pid}</span>?
          <br />
          This will SIGTERM the claude process.
        </p>
        {error && (
          <p className="mt-2 text-xs font-mono text-red-400">{error}</p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setShowConfirm(false)}
            className="px-3 py-1 text-sm font-mono text-green-600 border border-green-800 rounded hover:bg-green-950 transition-colors"
          >
            [Cancel]
          </button>
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await killSession(pid, sessionId);
                if (result.ok) {
                  setShowConfirm(false);
                } else {
                  setError(result.message);
                }
              })
            }
            className="px-3 py-1 text-sm font-mono text-red-400 border border-red-800 rounded hover:bg-red-950 disabled:opacity-40 transition-colors"
          >
            {isPending ? 'Killing…' : '[Kill]'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/kill-button.tsx
git commit -m "fix(ui): replace hash-typing kill dialog with simple confirm"
```

---

## Task 8: Create `components/session-card.tsx`

**Files:**
- Create: `components/session-card.tsx`

- [ ] **Step 1: Create the card component**

Create `components/session-card.tsx`:

```typescript
'use client';
import Link from 'next/link';
import { deleteSession } from '@/app/actions/delete-session';
import { KillButton } from './kill-button';
import { LiveIndicator } from './live-indicator';
import type { Session } from '@/lib/types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1_000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function SessionCard({ session }: { session: Session }) {
  const shortId = session.id.slice(0, 8);
  const totalTokens = session.tokens.inputTokens + session.tokens.outputTokens;
  const hasTokens = totalTokens > 0;

  return (
    <div className="border border-green-900 p-3 hover:border-green-700 transition-colors font-mono text-sm">
      {/* Row 1: status indicator + repo name + age */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <LiveIndicator status={session.status} showLabel />
          <span className="text-green-300 font-bold truncate" title={session.repoName}>
            {session.repoName}
          </span>
        </div>
        <span className="text-green-700 text-xs shrink-0 ml-2">
          {relativeTime(session.lastActivityAt)}
        </span>
      </div>

      {/* Row 2: short ID + branch + model */}
      <div className="flex items-center gap-3 text-xs text-green-600 mb-2">
        <span>{shortId}</span>
        {session.branch !== 'unknown' && (
          <span className="text-green-700">⎇ {session.branch}</span>
        )}
        {session.model !== 'unknown' && (
          <span className="text-purple-600">
            {session.model.replace('claude-', '').replace(/-\d{8}$/, '')}
          </span>
        )}
      </div>

      {/* Row 3: token/tool stats — omitted entirely when all zero */}
      {(hasTokens || session.toolCallCount > 0) && (
        <div className="flex items-center gap-3 text-xs text-green-700 mb-2">
          {hasTokens && (
            <span>{formatTokens(session.tokens.outputTokens)} out</span>
          )}
          {session.tokens.cacheReadTokens > 0 && (
            <span className="text-purple-700">
              {formatTokens(session.tokens.cacheReadTokens)} cache
            </span>
          )}
          {session.toolCallCount > 0 && (
            <span>{session.toolCallCount} tools</span>
          )}
        </div>
      )}

      {/* Row 4: action buttons */}
      <div className="flex items-center justify-end gap-2">
        <Link
          href={`/sessions/${session.id}`}
          className="px-2 py-0.5 text-xs border border-green-800 text-green-500 hover:text-green-300 hover:border-green-600 transition-colors"
        >
          [open]
        </Link>
        {session.status === 'LIVE' && session.pid !== null && (
          <KillButton pid={session.pid} sessionId={session.id} />
        )}
        {session.status !== 'LIVE' && (
          <form action={deleteSession.bind(null, session.id)}>
            <button
              type="submit"
              className="px-2 py-0.5 text-xs border border-red-900 text-red-500 hover:text-red-300 hover:border-red-700 transition-colors"
            >
              [delete]
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/session-card.tsx
git commit -m "feat(ui): add session-card component with graceful zero-value handling"
```

---

## Task 9: Create `components/session-grid.tsx`

**Files:**
- Create: `components/session-grid.tsx`

- [ ] **Step 1: Create the grid component**

Create `components/session-grid.tsx`:

```typescript
'use client';
import { useState, useEffect } from 'react';
import { useSessionEvents } from '@/hooks/use-session-events';
import { SessionCard } from './session-card';
import type { Session } from '@/lib/types';

export function SessionGrid({ sessions }: { sessions: Session[] }) {
  const [showHelp, setShowHelp] = useState(false);
  useSessionEvents();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === '?') setShowHelp((h) => !h);
      if (e.key === 'Escape') setShowHelp(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="py-12 text-center font-mono text-green-700">
        no sessions found
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="p-4 grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setShowHelp(false)}
        >
          <div className="terminal-box p-6 w-64" onClick={(e) => e.stopPropagation()}>
            <div className="terminal-box-title">SHORTCUTS</div>
            <dl className="mt-4 font-mono text-xs space-y-2">
              <div className="flex gap-4">
                <dt className="text-amber-400 w-16 shrink-0">?</dt>
                <dd className="text-green-400">toggle this help</dd>
              </div>
              <div className="flex gap-4">
                <dt className="text-amber-400 w-16 shrink-0">Esc</dt>
                <dd className="text-green-400">close overlays</dd>
              </div>
            </dl>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 text-xs text-green-600 hover:text-green-400 font-mono"
            >
              [close]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/session-grid.tsx
git commit -m "feat(ui): add session-grid with SSE subscription and ? help overlay"
```

---

## Task 10: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace imports and swap `SessionList` for `SessionGrid`**

Replace the entire file:

```typescript
import { getAllSessions, getRepoSummaries } from '@/lib/claude-reader';
import { Sidebar } from '@/components/sidebar';
import { SessionGrid } from '@/components/session-grid';
import type { Session } from '@/lib/types';

interface HomePageProps {
  searchParams: Promise<{
    repo?: string;
    branch?: string;
    status?: string;
    q?: string;
  }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [allSessions, repos] = await Promise.all([getAllSessions(), getRepoSummaries()]);

  let sessions: Session[] = allSessions;

  if (params.repo) {
    sessions = sessions.filter((s) => s.encodedPath === params.repo);
  }
  if (params.branch) {
    sessions = sessions.filter((s) => s.branch === params.branch);
  }
  if (params.status) {
    sessions = sessions.filter((s) => s.status === params.status!.toUpperCase());
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.repoName.toLowerCase().includes(q) ||
        s.id.includes(q) ||
        s.branch.toLowerCase().includes(q),
    );
  }

  const liveSessions = allSessions.filter((s) => s.status === 'LIVE').length;
  const idleSessions = allSessions.filter((s) => s.status === 'IDLE').length;

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} currentRepo={params.repo} currentBranch={params.branch} />

      <main className="flex-1 overflow-hidden">
        <div className="border-b border-green-900 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-green-400 font-bold text-sm tracking-widest cursor-blink">
                CLAUDE SESSION MANAGER
              </h1>
              <p className="text-green-700 text-xs mt-0.5">
                {allSessions.length} sessions · {liveSessions} live · {idleSessions} idle
                {params.repo && (
                  <span className="ml-2 text-amber-600">
                    filtered: {repos.find((r) => r.encodedPath === params.repo)?.repoName ?? params.repo}
                  </span>
                )}
              </p>
            </div>

            <form className="flex gap-2" method="GET">
              {params.repo && <input type="hidden" name="repo" value={params.repo} />}
              <input
                type="text"
                name="q"
                defaultValue={params.q}
                placeholder="search…"
                className="bg-black border border-green-800 text-green-300 text-xs px-2 py-1 font-mono focus:outline-none focus:border-green-500 w-32"
              />
              <select
                name="status"
                defaultValue={params.status ?? ''}
                className="bg-black border border-green-800 text-green-300 text-xs px-2 py-1 font-mono focus:outline-none"
              >
                <option value="">all</option>
                <option value="live">LIVE</option>
                <option value="idle">IDLE</option>
                <option value="ended">ENDED</option>
              </select>
              <button
                type="submit"
                className="px-2 py-1 text-xs border border-green-800 text-green-600 hover:text-green-300 transition-colors"
              >
                [filter]
              </button>
              {(params.q || params.status) && (
                <a
                  href={params.repo ? `/?repo=${params.repo}` : '/'}
                  className="px-2 py-1 text-xs border border-green-900 text-green-700 hover:text-green-400 transition-colors"
                >
                  [×]
                </a>
              )}
            </form>
          </div>
        </div>

        <SessionGrid sessions={sessions} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): use claude-reader + SessionGrid with SSE live updates"
```

---

## Task 11: Update Remaining Pages

**Files:**
- Modify: `app/sessions/[id]/page.tsx`
- Modify: `app/manager/page.tsx`
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Update `app/sessions/[id]/page.tsx` — import path only**

Change the two import lines at the top of the file:

```typescript
// Replace this:
import { getAllSessions, getSessionEntries } from '@/lib/claude-data';
import { getRepoSummaries } from '@/lib/claude-data';

// With this (can be one line):
import { getAllSessions, getSessionEntries, getRepoSummaries } from '@/lib/claude-reader';
```

All other content in the file stays exactly the same.

- [ ] **Step 2: Update `app/manager/page.tsx` — import path only**

Change:
```typescript
// Replace this:
import { getAllSessions, getRepoSummaries, getDiskUsage } from '@/lib/claude-data';

// With this:
import { getAllSessions, getRepoSummaries, getDiskUsage } from '@/lib/claude-reader';
```

All other content stays the same.

- [ ] **Step 3: Rebuild `app/stats/page.tsx` — fix the activity chart**

Replace the entire file:

```typescript
import { getAllSessions, getRepoSummaries } from '@/lib/claude-reader';
import { buildActivityBuckets } from '@/lib/stats-utils';
import { Sidebar } from '@/components/sidebar';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
};

function getCost(model: string, input: number, output: number): number {
  const key = Object.keys(MODEL_COSTS).find((k) => model.includes(k.replace('claude-', '')));
  if (!key) return 0;
  const costs = MODEL_COSTS[key]!;
  return (input / 1_000_000) * costs.input + (output / 1_000_000) * costs.output;
}

function asciiBar(value: number, max: number, width = 36): string {
  if (max === 0 || value === 0) return '░'.repeat(width);
  const filled = Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function StatsPage() {
  const [sessions, repos] = await Promise.all([getAllSessions(), getRepoSummaries()]);

  const totalInput = sessions.reduce((s, x) => s + x.tokens.inputTokens, 0);
  const totalOutput = sessions.reduce((s, x) => s + x.tokens.outputTokens, 0);
  const totalCache = sessions.reduce((s, x) => s + x.tokens.cacheReadTokens, 0);
  const totalToolCalls = sessions.reduce((s, x) => s + x.toolCallCount, 0);

  const byModel = new Map<string, { sessions: number; input: number; output: number }>();
  for (const s of sessions) {
    const m = s.model || 'unknown';
    const e = byModel.get(m) ?? { sessions: 0, input: 0, output: 0 };
    byModel.set(m, { sessions: e.sessions + 1, input: e.input + s.tokens.inputTokens, output: e.output + s.tokens.outputTokens });
  }

  let totalCost = 0;
  for (const [model, data] of byModel) totalCost += getCost(model, data.input, data.output);

  const now = Date.now();
  const dayBuckets = buildActivityBuckets(sessions, now);
  const maxBucket = Math.max(...dayBuckets, 1);
  const dayLabels = Array.from({ length: 14 }, (_, i) =>
    new Date(now - (13 - i) * 24 * 60 * 60 * 1_000)
      .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
  );

  return (
    <div className="flex min-h-screen font-mono">
      <Sidebar repos={repos} />

      <main className="flex-1 p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-green-700 hover:text-green-400 text-xs">← back</Link>
          <h1 className="text-green-400 font-bold text-sm tracking-widest">USAGE STATISTICS</h1>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'SESSIONS', value: String(sessions.length), color: 'text-green-400' },
            { label: 'LIVE NOW', value: String(sessions.filter((s) => s.status === 'LIVE').length), color: 'text-green-400' },
            { label: 'TOTAL TOKENS', value: formatTokens(totalInput + totalOutput), color: 'text-cyan-400' },
            { label: 'EST. COST', value: `~$${totalCost.toFixed(2)}`, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="terminal-box text-center">
              <div className="terminal-box-title">{label}</div>
              <div className={`${color} text-xl font-bold mt-2`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Token breakdown */}
        <div className="terminal-box mb-6">
          <div className="terminal-box-title">TOKEN BREAKDOWN</div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              { label: 'INPUT', value: formatTokens(totalInput), color: 'text-cyan-400' },
              { label: 'OUTPUT', value: formatTokens(totalOutput), color: 'text-cyan-400' },
              { label: 'CACHE READS', value: formatTokens(totalCache), color: 'text-purple-400' },
              { label: 'TOOL CALLS', value: String(totalToolCalls), color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-green-700">{label}</div>
                <div className={`${color} text-lg`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* By model */}
        <div className="terminal-box mb-6">
          <div className="terminal-box-title">BY MODEL</div>
          <div className="mt-3 space-y-2 text-xs">
            {Array.from(byModel.entries())
              .sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
              .map(([model, data]) => (
                <div key={model} className="grid grid-cols-[12rem_1fr_6rem_6rem_5rem] gap-3 items-center">
                  <span className="text-green-500 truncate" title={model}>
                    {model.replace('claude-', '').replace(/-\d{8}$/, '')}
                  </span>
                  <span className="text-green-700">{data.sessions} sessions</span>
                  <span className="text-cyan-600">{formatTokens(data.input)}in</span>
                  <span className="text-cyan-500">{formatTokens(data.output)}out</span>
                  <span className="text-amber-600">~${getCost(model, data.input, data.output).toFixed(3)}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Activity chart */}
        <div className="terminal-box">
          <div className="terminal-box-title">ACTIVITY (LAST 14 DAYS)</div>
          <div className="mt-4 text-xs">
            {dayBuckets.map((count, i) => (
              <div key={i} className="flex items-center gap-2 mb-0.5">
                <span className="text-green-800 w-10 text-right shrink-0">{dayLabels[i]}</span>
                <span className="text-green-500">{asciiBar(count, maxBucket)}</span>
                <span className="text-green-600 w-4">{count > 0 ? count : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/sessions/[id]/page.tsx app/manager/page.tsx app/stats/page.tsx
git commit -m "fix(pages): switch to claude-reader, fix stats chart with buildActivityBuckets"
```

---

## Task 12: Delete Obsolete Files + Final Verification

**Files:**
- Delete: `lib/claude-data.ts`
- Delete: `components/session-row.tsx`
- Delete: `components/session-list.tsx`

- [ ] **Step 1: Delete the three obsolete files**

```bash
rm lib/claude-data.ts components/session-row.tsx components/session-list.tsx
```

- [ ] **Step 2: TypeScript check — confirm no dangling imports**

```bash
npx tsc --noEmit
```

Expected: no errors. If any appear, they will be import references to the deleted files — fix them in the page or component that references them.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected output:
```
Test Files  6 passed (6)
     Tests  XX passed (XX)
```

All test files must pass: `jsonl-parser`, `claude-reader`, `stats-utils`, `session-watcher`, `process-utils`, `trash`, `audit-log`.

- [ ] **Step 4: Start dev server and verify all pages**

```bash
npm run dev &
sleep 5
```

Check each route:
```bash
curl -s http://127.0.0.1:3000/ -o /dev/null -w "/ → %{http_code}\n"
curl -s http://127.0.0.1:3000/stats -o /dev/null -w "/stats → %{http_code}\n"
curl -s http://127.0.0.1:3000/manager -o /dev/null -w "/manager → %{http_code}\n"
curl -s http://127.0.0.1:3000/trash -o /dev/null -w "/trash → %{http_code}\n"
curl -s http://127.0.0.1:3000/api/events -o /dev/null -w "/api/events → %{http_code}\n" --max-time 3
```

Expected: all return `200`.

- [ ] **Step 5: Spot-check path resolution in the home page output**

```bash
curl -s http://127.0.0.1:3000/ | grep -o '"projectPath":"[^"]*"' | head -5
```

Expected: paths like `"projectPath":"/home/abdul/Documents/claude-session-tracker"` — NOT garbled paths like `/home/abdul/Documents/claude/session/tracker`.

- [ ] **Step 6: Spot-check stats chart is non-empty**

```bash
curl -s http://127.0.0.1:3000/stats | grep -o '█' | wc -l
```

Expected: a number greater than 0 (filled bars in the chart).

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: remove obsolete claude-data, session-row, session-list files"
```

- [ ] **Step 8: Stop dev server**

```bash
kill $(lsof -t -i:3000) 2>/dev/null || true
```
