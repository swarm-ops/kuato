/**
 * Types for Claude Code and Pi Agent session JSONL formats
 */

export interface SessionMessage {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: 'external' | 'internal';
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch: string;
  type: 'user' | 'assistant';
  message: UserMessage | AssistantMessage;
  uuid: string;
  timestamp: string;
  requestId?: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  id: string;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  type: 'message';
  usage: TokenUsage;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
  service_tier?: string;
}

/**
 * Parsed session data extracted from JSONL
 */
export interface ParsedSession {
  id: string;
  startedAt: Date;
  endedAt: Date;
  gitBranch: string;
  cwd: string;
  version: string;
  messageCount: number;

  // Token totals
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;

  // Extracted data
  userMessages: string[];
  toolsUsed: string[];
  filesFromToolCalls: string[];
  modelsUsed: string[];

  // Per-model token breakdown
  modelTokens: Record<string, {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  }>;
}

/**
 * Search result with relevance scoring
 */
export interface SearchResult extends ParsedSession {
  relevance?: number;
  matchedOn?: string[];
  transcriptPath: string;
}

/**
 * Pi Agent session message formats
 */
export interface PiSessionMessage {
  type: 'session' | 'message' | 'model_change' | 'thinking_level_change' | 'toolResult';
  id: string;
  parentId?: string | null;
  timestamp: string;
  message?: PiMessage;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  api?: string;
  model?: string;
  usage?: PiTokenUsage;
  stopReason?: string;
  cwd?: string;
  version?: number;
  toolCallId?: string;
  toolName?: string;
  content?: any[];
  isError?: boolean;
}

export interface PiMessage {
  role: 'user' | 'assistant' | 'toolResult';
  content: PiContentBlock[];
  timestamp?: number;
}

export interface PiContentBlock {
  type: 'text' | 'toolCall';
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface PiTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/**
 * Session source type
 */
export type SessionSource = 'claude' | 'pi' | 'all';

/**
 * Search options
 */
export interface SearchOptions {
  query?: string;
  days?: number;
  since?: Date;
  until?: Date;
  tools?: string[];
  filePattern?: string;
  limit?: number;
  source?: SessionSource;
  directories?: string[];
}
