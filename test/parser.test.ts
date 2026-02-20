import { describe, it, expect, beforeAll } from 'bun:test';
import { parseSessionFile, parseSessionContent } from '../shared/parser.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Session Parser', () => {
  let claudeSessionContent: string;
  let piSessionContent: string;
  let emptySessionContent: string;

  beforeAll(() => {
    claudeSessionContent = readFileSync(join(__dirname, 'fixtures/claude-session.jsonl'), 'utf-8');
    piSessionContent = readFileSync(join(__dirname, 'fixtures/pi-session.jsonl'), 'utf-8');
    emptySessionContent = readFileSync(join(__dirname, 'fixtures/empty-session.jsonl'), 'utf-8');
  });

  describe('Claude Code Sessions', () => {
    it('should parse Claude session correctly', () => {
      const session = parseSessionContent(claudeSessionContent, 'test-claude.jsonl');
      
      expect(session).toBeDefined();
      expect(session!.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(session!.gitBranch).toBe('main');
      expect(session!.cwd).toBe('/Users/test/project');
      expect(session!.version).toBe('0.1.0');
      expect(session!.messageCount).toBe(3); // 1 user + 2 assistant messages
      
      expect(session!.userMessages).toHaveLength(1);
      expect(session!.userMessages[0]).toContain('overseer system');
      
      expect(session!.toolsUsed).toContain('Bash');
      expect(session!.toolsUsed).toContain('Edit');
      
      expect(session!.filesFromToolCalls).toContain('src/config/monitoring.ts');
      
      expect(session!.modelsUsed).toContain('claude-3-5-sonnet-20241022');
      expect(session!.inputTokens).toBe(250); // 100 + 150
      expect(session!.outputTokens).toBe(125); // 50 + 75
    });
  });

  describe('Pi Agent Sessions', () => {
    it('should parse Pi session correctly', () => {
      const session = parseSessionContent(piSessionContent, 'test-pi.jsonl');
      
      expect(session).toBeDefined();
      expect(session!.id).toBe('b486ac6d-83d4-46b2-bb53-73e37171aa76');
      expect(session!.cwd).toBe('/Users/test/pi-project');
      expect(session!.version).toBe('3');
      expect(session!.messageCount).toBe(3); // user + 2 assistant messages
      
      expect(session!.userMessages).toHaveLength(1);
      expect(session!.userMessages[0]).toContain('overseer monitoring system');
      
      expect(session!.toolsUsed).toContain('bash');
      expect(session!.toolsUsed).toContain('write');
      
      expect(session!.filesFromToolCalls).toContain('src/overseer.ts');
      
      expect(session!.modelsUsed).toContain('claude-sonnet-4-20250514');
      expect(session!.inputTokens).toBe(300); // 120 + 180
      expect(session!.outputTokens).toBe(180); // 85 + 95  
      expect(session!.cacheCreationTokens).toBe(300); // Actual parsed value from fixture
    });
  });

  describe('Edge Cases', () => {
    it('should return null for empty sessions', () => {
      const session = parseSessionContent(emptySessionContent);
      expect(session).toBeNull();
    });

    it('should return null for malformed content', () => {
      const session = parseSessionContent('invalid json\n{"malformed": json}');
      expect(session).toBeNull();
    });

    it('should return null for empty content', () => {
      const session = parseSessionContent('');
      expect(session).toBeNull();
    });
  });

  describe('File Parsing', () => {
    it('should parse Claude session file', () => {
      const session = parseSessionFile(join(__dirname, 'fixtures/claude-session.jsonl'));
      expect(session).toBeDefined();
      expect(session!.toolsUsed).toContain('Bash');
    });

    it('should parse Pi session file', () => {
      const session = parseSessionFile(join(__dirname, 'fixtures/pi-session.jsonl'));
      expect(session).toBeDefined();
      expect(session!.toolsUsed).toContain('bash');
    });

    it('should return null for non-existent file', () => {
      const session = parseSessionFile('/path/that/does/not/exist.jsonl');
      expect(session).toBeNull();
    });
  });
});