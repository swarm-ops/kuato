import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('Integration Tests', () => {
  describe('Real Sessions', () => {
    it('should search Claude sessions if they exist', () => {
      const claudeDir = join(homedir(), '.claude', 'projects');
      if (existsSync(claudeDir)) {
        const result = execSync('bun run file-based/search.ts --source claude --limit 1', {
          encoding: 'utf-8'
        });
        
        const sessions = JSON.parse(result);
        expect(Array.isArray(sessions)).toBe(true);
        // May be empty if no Claude sessions exist
      }
    });

    it('should search Pi sessions if they exist', () => {
      const piDir = join(homedir(), '.pi', 'agent', 'sessions');
      if (existsSync(piDir)) {
        const result = execSync('bun run file-based/search.ts --source pi --limit 1', {
          encoding: 'utf-8'
        });
        
        const sessions = JSON.parse(result);
        expect(Array.isArray(sessions)).toBe(true);
        // May be empty if no Pi sessions exist
      }
    });

    it('should search all sources by default', () => {
      const result = execSync('bun run file-based/search.ts --limit 3', {
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeLessThanOrEqual(3);
    });

    it('should handle specific query terms', () => {
      // Test with "overseer" query as specified in task
      const result = execSync('bun run file-based/search.ts --query "overseer" --days 7', {
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(Array.isArray(sessions)).toBe(true);
      
      // If results found, they should contain the query term
      for (const session of sessions) {
        const searchableText = [
          ...session.userMessages,
          ...session.toolsUsed,
          ...session.filesFromToolCalls
        ].join(' ').toLowerCase();
        expect(searchableText).toContain('overseer');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid source option', () => {
      expect(() => {
        execSync('bun run file-based/search.ts --source invalid', {
          encoding: 'utf-8'
        });
      }).toThrow();
    });

    it('should handle non-existent directory', () => {
      const result = execSync('bun run file-based/search.ts --dir "/nonexistent/path"', {
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(0);
    });

    it('should handle invalid date formats', () => {
      expect(() => {
        execSync('bun run file-based/search.ts --since "not-a-date"', {
          encoding: 'utf-8'
        });
      }).toThrow();
    });
  });

  describe('Help Output', () => {
    it('should show help when requested', () => {
      const result = execSync('bun run file-based/search.ts --help', {
        encoding: 'utf-8'
      });
      
      expect(result).toContain('Claude Code & Pi Agent Session Search');
      expect(result).toContain('--source <type>');
      expect(result).toContain('claude, pi, all');
    });
  });
});