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
