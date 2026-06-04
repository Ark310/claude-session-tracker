export type SessionStatus = 'LIVE' | 'IDLE' | 'ENDED';

export interface SessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart?: string;
  version?: string;
  kind?: string;
  entrypoint?: string;
  status?: string;
  updatedAt?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface Session {
  id: string;
  encodedPath: string;
  projectPath: string;
  repoName: string;
  cwd: string;
  branch: string;
  model: string;
  startedAt: Date;
  lastActivityAt: Date;
  status: SessionStatus;
  pid: number | null;
  tokens: TokenUsage;
  toolCallCount: number;
  messageCount: number;
  fileSizeBytes: number;
}

export interface ConversationEntry {
  uuid: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  sessionId: string;
  cwd?: string;
  gitBranch?: string;
  message: UserMessage | AssistantMessage;
  isSidechain?: boolean;
  parentUuid?: string | null;
}

export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

export interface AssistantMessage {
  role: 'assistant';
  model?: string;
  id?: string;
  content: ContentBlock[];
  stop_reason?: string;
  usage?: RawUsage;
}

export interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface JsonlEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  message?: UserMessage | AssistantMessage;
  permissionMode?: string;
}

export interface RepoSummary {
  encodedPath: string;
  projectPath: string;
  repoName: string;
  sessionCount: number;
  liveSessions: number;
  branches: string[];
}

export interface DiskUsage {
  totalBytes: number;
  byRepo: Array<{ repoName: string; encodedPath: string; bytes: number }>;
  largestSessions: Array<{ sessionId: string; repoName: string; bytes: number }>;
}

export interface TrashEntry {
  sessionId: string;
  originalEncodedPath: string;
  originalPath: string;
  trashedAt: string;
  filename: string;
}

export interface KillResult {
  ok: boolean;
  message: string;
}

export interface DeleteResult {
  ok: boolean;
  message: string;
}

export interface RestoreResult {
  ok: boolean;
  message: string;
}

export interface ProcessInfo {
  pid: number;
  cmdline: string;
  ppid?: number;
  workingDir?: string;
}
