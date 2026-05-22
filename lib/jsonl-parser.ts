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
