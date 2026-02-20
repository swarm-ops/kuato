/**
 * Parse Claude Code and Pi Agent session JSONL files
 *
 * Extracts structured data from raw session transcripts including:
 * - Token usage (total and per-model)
 * - User messages
 * - Tools used
 * - Files touched (from tool calls)
 * - Timestamps
 */

import { readFileSync } from 'fs';
import type {
  SessionMessage,
  AssistantMessage,
  ParsedSession,
  ContentBlock,
  PiSessionMessage,
  PiMessage,
  PiContentBlock,
} from './types.js';

/**
 * Parse a single JSONL file into structured session data
 */
export function parseSessionFile(filePath: string): ParsedSession | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseSessionContent(content, filePath);
  } catch {
    return null;
  }
}

/**
 * Detect session format from first line
 */
function detectSessionFormat(firstLine: string): 'claude' | 'pi' | 'unknown' {
  try {
    const parsed = JSON.parse(firstLine);
    
    // Pi sessions start with {"type":"session","version":3,...}
    if (parsed.type === 'session' && parsed.version === 3) {
      return 'pi';
    }
    
    // Claude sessions have messages with specific structure
    if (parsed.type === 'user' || parsed.type === 'assistant') {
      return 'claude';
    }
    
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Parse JSONL content string into structured session data
 */
export function parseSessionContent(
  content: string,
  sessionId?: string
): ParsedSession | null {
  const lines = content.trim().split('\n').filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  // Detect session format from first line
  const format = detectSessionFormat(lines[0]);
  
  if (format === 'pi') {
    return parsePiSessionContent(lines, sessionId);
  } else if (format === 'claude') {
    return parseClaudeSessionContent(lines, sessionId);
  }
  
  return null;
}

/**
 * Parse Claude Code JSONL content
 */
function parseClaudeSessionContent(
  lines: string[],
  sessionId?: string
): ParsedSession | null {
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      // Only include user/assistant messages (skip summary, system, etc.)
      if (parsed.type === 'user' || parsed.type === 'assistant') {
        messages.push(parsed as SessionMessage);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  if (messages.length === 0) {
    return null;
  }

  // Extract session metadata from first and last conversation messages
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  // Initialize accumulators
  const userMessages: string[] = [];
  const toolsUsed = new Set<string>();
  const filesFromToolCalls = new Set<string>();
  const modelsUsed = new Set<string>();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  const modelTokens: Record<
    string,
    { input: number; output: number; cacheCreation: number; cacheRead: number }
  > = {};

  for (const msg of messages) {
    if (msg.type === 'user') {
      // Extract user message text
      const userMsg = msg.message as { role: string; content: string };
      if (typeof userMsg.content === 'string' && userMsg.content.trim()) {
        userMessages.push(userMsg.content);
      }
    } else if (msg.type === 'assistant') {
      const assistantMsg = msg.message as AssistantMessage;

      // Track model
      if (assistantMsg.model) {
        modelsUsed.add(assistantMsg.model);

        // Initialize model token tracking
        if (!modelTokens[assistantMsg.model]) {
          modelTokens[assistantMsg.model] = {
            input: 0,
            output: 0,
            cacheCreation: 0,
            cacheRead: 0,
          };
        }
      }

      // Accumulate token usage
      if (assistantMsg.usage) {
        const usage = assistantMsg.usage;
        inputTokens += usage.input_tokens || 0;
        outputTokens += usage.output_tokens || 0;
        cacheCreationTokens += usage.cache_creation_input_tokens || 0;
        cacheReadTokens += usage.cache_read_input_tokens || 0;

        // Per-model tracking
        if (assistantMsg.model && modelTokens[assistantMsg.model]) {
          modelTokens[assistantMsg.model].input += usage.input_tokens || 0;
          modelTokens[assistantMsg.model].output += usage.output_tokens || 0;
          modelTokens[assistantMsg.model].cacheCreation +=
            usage.cache_creation_input_tokens || 0;
          modelTokens[assistantMsg.model].cacheRead +=
            usage.cache_read_input_tokens || 0;
        }
      }

      // Extract tools and files from content blocks
      if (Array.isArray(assistantMsg.content)) {
        for (const block of assistantMsg.content) {
          extractFromContentBlock(block, toolsUsed, filesFromToolCalls);
        }
      }
    }
  }

  // Derive session ID from file path or first message
  const id =
    sessionId?.match(/([a-f0-9-]{36})\.jsonl$/)?.[1] ||
    firstMessage.sessionId ||
    'unknown';

  return {
    id,
    startedAt: new Date(firstMessage.timestamp),
    endedAt: new Date(lastMessage.timestamp),
    gitBranch: firstMessage.gitBranch || 'unknown',
    cwd: firstMessage.cwd || '',
    version: firstMessage.version || '',
    messageCount: messages.length,

    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,

    userMessages,
    toolsUsed: Array.from(toolsUsed),
    filesFromToolCalls: Array.from(filesFromToolCalls),
    modelsUsed: Array.from(modelsUsed),
    modelTokens,
  };
}

/**
 * Extract tool names and file paths from a content block
 */
function extractFromContentBlock(
  block: ContentBlock,
  toolsUsed: Set<string>,
  filesFromToolCalls: Set<string>
): void {
  if (block.type === 'tool_use' && block.name) {
    toolsUsed.add(block.name);

    // Extract file paths from tool inputs
    if (block.input) {
      extractFilePaths(block.input, filesFromToolCalls);
    }
  }
}

/**
 * Recursively extract file paths from tool input
 */
function extractFilePaths(
  input: Record<string, unknown>,
  files: Set<string>
): void {
  for (const [key, value] of Object.entries(input)) {
    // Common file path parameter names
    if (
      ['file_path', 'path', 'file', 'filename', 'filePath'].includes(key) &&
      typeof value === 'string'
    ) {
      // Only add if it looks like a path
      if (value.includes('/') || value.includes('\\')) {
        files.add(value);
      }
    }

    // Recurse into nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      extractFilePaths(value as Record<string, unknown>, files);
    }
  }
}

/**
 * Parse Pi Agent session JSONL content
 */
function parsePiSessionContent(
  lines: string[],
  sessionId?: string
): ParsedSession | null {
  const allMessages: PiSessionMessage[] = [];
  
  // Parse all lines
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      allMessages.push(parsed as PiSessionMessage);
    } catch {
      continue;
    }
  }

  if (allMessages.length === 0) {
    return null;
  }

  // Find session metadata and conversation messages
  const sessionMessage = allMessages.find(m => m.type === 'session');
  const conversationMessages = allMessages.filter(m => 
    m.type === 'message' && m.message && 
    (m.message.role === 'user' || m.message.role === 'assistant')
  );

  if (!sessionMessage || conversationMessages.length === 0) {
    return null;
  }

  // Initialize accumulators
  const userMessages: string[] = [];
  const toolsUsed = new Set<string>();
  const filesFromToolCalls = new Set<string>();
  const modelsUsed = new Set<string>();

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  const modelTokens: Record<
    string,
    { input: number; output: number; cacheCreation: number; cacheRead: number }
  > = {};

  // Extract model changes
  const modelChanges = allMessages.filter(m => m.type === 'model_change');
  for (const change of modelChanges) {
    if (change.modelId) {
      modelsUsed.add(change.modelId);
    }
  }

  // Process conversation messages
  for (const msg of conversationMessages) {
    if (msg.message?.role === 'user') {
      // Extract user message content
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            userMessages.push(block.text);
          }
        }
      }
    } else if (msg.message?.role === 'assistant') {
      // Track model and token usage - check both top level and message level
      const model = msg.model || (msg.message as any).model;
      const usage = msg.usage || (msg.message as any).usage;
      
      if (model) {
        modelsUsed.add(model);

        if (!modelTokens[model]) {
          modelTokens[model] = {
            input: 0,
            output: 0,
            cacheCreation: 0,
            cacheRead: 0,
          };
        }
      }

      if (usage) {
        inputTokens += usage.input || 0;
        outputTokens += usage.output || 0;
        cacheReadTokens += usage.cacheRead || 0;
        cacheCreationTokens += usage.cacheWrite || 0; // Pi calls it cacheWrite

        if (model && modelTokens[model]) {
          modelTokens[model].input += usage.input || 0;
          modelTokens[model].output += usage.output || 0;
          modelTokens[model].cacheRead += usage.cacheRead || 0;
          modelTokens[model].cacheCreation += usage.cacheWrite || 0;
        }
      }

      // Extract tools from content blocks
      if (Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          extractFromPiContentBlock(block, toolsUsed, filesFromToolCalls);
        }
      }
    }
  }

  // Process tool results to extract file paths
  const toolResults = allMessages.filter(m => m.type === 'message' && m.message?.role === 'toolResult');
  for (const result of toolResults) {
    if (result.toolName) {
      toolsUsed.add(result.toolName);
    }
  }

  const id = sessionId?.match(/([a-f0-9-]{36})\.jsonl$/)?.[1] || 
             sessionMessage.id || 
             'unknown';

  const firstMsg = conversationMessages[0];
  const lastMsg = conversationMessages[conversationMessages.length - 1];

  return {
    id,
    startedAt: new Date(firstMsg.timestamp),
    endedAt: new Date(lastMsg.timestamp),
    gitBranch: 'unknown', // Pi sessions don't track git branch
    cwd: sessionMessage.cwd || '',
    version: sessionMessage.version?.toString() || '',
    messageCount: conversationMessages.length,

    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,

    userMessages,
    toolsUsed: Array.from(toolsUsed),
    filesFromToolCalls: Array.from(filesFromToolCalls),
    modelsUsed: Array.from(modelsUsed),
    modelTokens,
  };
}

/**
 * Extract tool names and file paths from a Pi content block
 */
function extractFromPiContentBlock(
  block: PiContentBlock,
  toolsUsed: Set<string>,
  filesFromToolCalls: Set<string>
): void {
  if (block.type === 'toolCall' && block.name) {
    toolsUsed.add(block.name);

    // Extract file paths from tool arguments
    if (block.arguments) {
      extractFilePaths(block.arguments, filesFromToolCalls);
    }
  }
}

/**
 * Get a simple text summary suitable for search indexing
 */
export function getSearchableText(session: ParsedSession): string {
  const parts: string[] = [];

  // User messages are highest signal
  parts.push(...session.userMessages);

  // Tools and files provide context
  parts.push(...session.toolsUsed);
  parts.push(...session.filesFromToolCalls);

  return parts.join(' ');
}
