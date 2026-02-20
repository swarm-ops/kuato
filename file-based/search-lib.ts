/**
 * Reusable search library functions
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parseSessionFile } from '../shared/parser.js';
import type { ParsedSession, SearchResult, SearchOptions } from '../shared/types.js';

// Default session directories
export const DEFAULT_CLAUDE_SESSIONS_DIR =
  process.env.CLAUDE_SESSIONS_DIR ||
  join(process.env.HOME || '', '.claude', 'projects');

export const DEFAULT_PI_SESSIONS_DIR =
  process.env.PI_SESSIONS_DIR ||
  join(process.env.HOME || '', '.pi', 'agent', 'sessions');

/**
 * Find all session directories
 */
export function findSessionDirs(baseDir: string): string[] {
  try {
    return readdirSync(baseDir)
      .map((name) => join(baseDir, name))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Get default directories based on source filter
 */
export function getDefaultDirectories(source: string): string[] {
  switch (source) {
    case 'claude':
      return [DEFAULT_CLAUDE_SESSIONS_DIR];
    case 'pi':
      return [DEFAULT_PI_SESSIONS_DIR];
    case 'all':
    default:
      return [DEFAULT_CLAUDE_SESSIONS_DIR, DEFAULT_PI_SESSIONS_DIR];
  }
}

/**
 * Find all JSONL files in a directory
 */
export function findSessionFiles(dir: string, options: SearchOptions): string[] {
  const files: string[] = [];

  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsonl')) continue;

      const filePath = join(dir, file);
      files.push(filePath);
    }
  } catch {
    // Directory not readable
  }

  return files;
}

/**
 * Score relevance of a session against search query
 */
export function scoreRelevance(session: ParsedSession, query: string): number {
  if (!query) return 1;

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);
  let score = 0;
  const matchedOn: string[] = [];

  // User messages have highest weight
  for (const msg of session.userMessages) {
    const msgLower = msg.toLowerCase();
    for (const term of queryTerms) {
      if (msgLower.includes(term)) {
        score += 10;
        if (!matchedOn.includes('userMessages')) {
          matchedOn.push('userMessages');
        }
      }
    }
  }

  // Tools used have medium weight
  for (const tool of session.toolsUsed) {
    const toolLower = tool.toLowerCase();
    for (const term of queryTerms) {
      if (toolLower.includes(term)) {
        score += 3;
        if (!matchedOn.includes('toolsUsed')) {
          matchedOn.push('toolsUsed');
        }
      }
    }
  }

  // Files touched have medium weight
  for (const file of session.filesFromToolCalls) {
    const fileLower = file.toLowerCase();
    for (const term of queryTerms) {
      if (fileLower.includes(term)) {
        score += 3;
        if (!matchedOn.includes('filesFromToolCalls')) {
          matchedOn.push('filesFromToolCalls');
        }
      }
    }
  }

  return score;
}

/**
 * Check if session matches filter criteria
 */
export function matchesFilters(session: ParsedSession, options: SearchOptions): boolean {
  // Filter by date range
  const now = new Date();
  let since: Date | undefined = options.since;
  if (options.days && !since) {
    since = new Date(now.getTime() - options.days * 24 * 60 * 60 * 1000);
  }

  if (since && session.endedAt < since) return false;
  if (options.until && session.endedAt > options.until) return false;

  // Filter by tools
  if (options.tools && options.tools.length > 0) {
    const hasMatchingTool = options.tools.some((tool) =>
      session.toolsUsed.some((t) => t.toLowerCase().includes(tool.toLowerCase()))
    );
    if (!hasMatchingTool) return false;
  }

  // Filter by file pattern
  if (options.filePattern) {
    const pattern = options.filePattern.toLowerCase();
    const hasMatchingFile = session.filesFromToolCalls.some((f) =>
      f.toLowerCase().includes(pattern)
    );
    if (!hasMatchingFile) return false;
  }

  return true;
}

/**
 * Search sessions across multiple directories
 */
export function searchSessions(
  directories: string[],
  options: SearchOptions
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const baseDir of directories) {
    // Both Claude and Pi sessions can have subdirectories
    // For Claude sessions, search in project subdirectories
    if (baseDir === DEFAULT_CLAUDE_SESSIONS_DIR || baseDir.endsWith('.claude/projects')) {
      const sessionDirs = findSessionDirs(baseDir);
      
      for (const dir of sessionDirs) {
        const files = findSessionFiles(dir, options);
        results.push(...processSessionFiles(files, options));
      }
    } 
    // For Pi sessions, also check subdirectories (they organize by working directory)
    else if (baseDir === DEFAULT_PI_SESSIONS_DIR || baseDir.endsWith('.pi/agent/sessions')) {
      const sessionDirs = findSessionDirs(baseDir);
      
      // Search in subdirectories if they exist
      if (sessionDirs.length > 0) {
        for (const dir of sessionDirs) {
          const files = findSessionFiles(dir, options);
          results.push(...processSessionFiles(files, options));
        }
      } else {
        // Also check the base directory directly
        const files = findSessionFiles(baseDir, options);
        results.push(...processSessionFiles(files, options));
      }
    }
    // For custom directories, search both subdirectories and the directory itself
    else {
      const sessionDirs = findSessionDirs(baseDir);
      
      if (sessionDirs.length > 0) {
        for (const dir of sessionDirs) {
          const files = findSessionFiles(dir, options);
          results.push(...processSessionFiles(files, options));
        }
      }
      
      // Also check the base directory directly
      const files = findSessionFiles(baseDir, options);
      results.push(...processSessionFiles(files, options));
    }
  }

  // Sort by relevance (desc), then by date (desc)
  results.sort((a, b) => {
    if (a.relevance !== b.relevance) {
      return (b.relevance || 0) - (a.relevance || 0);
    }
    return b.endedAt.getTime() - a.endedAt.getTime();
  });

  // Apply limit
  const limit = options.limit || 20;
  return results.slice(0, limit);
}

/**
 * Process a list of session files into search results
 */
export function processSessionFiles(
  filePaths: string[],
  options: SearchOptions
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const filePath of filePaths) {
    try {
      const session = parseSessionFile(filePath);
      if (!session) continue;

      // Skip empty sessions
      if (session.userMessages.length === 0) continue;

      // Apply filters
      if (!matchesFilters(session, options)) continue;

      // Score relevance if query provided
      const relevance = options.query
        ? scoreRelevance(session, options.query)
        : 1;

      // Skip zero-relevance matches when searching
      if (options.query && relevance === 0) continue;

      results.push({
        ...session,
        relevance,
        transcriptPath: filePath,
      });
    } catch {
      // Skip unparseable files
    }
  }

  return results;
}

/**
 * Format results for output
 */
export function formatResults(results: SearchResult[]): object[] {
  return results.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt.toISOString(),
    gitBranch: r.gitBranch,
    messageCount: r.messageCount,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    toolsUsed: r.toolsUsed,
    filesFromToolCalls: r.filesFromToolCalls,
    userMessages: r.userMessages,
    modelsUsed: r.modelsUsed,
    relevance: r.relevance,
    transcriptPath: r.transcriptPath,
  }));
}