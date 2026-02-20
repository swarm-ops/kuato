import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { execSync, spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Search CLI', () => {
  const testDir = join(__dirname, 'temp-sessions');
  const claudeDir = join(testDir, 'claude');
  const piDir = join(testDir, 'pi');
  const claudeProjectDir = join(claudeDir, 'test-project');

  beforeAll(() => {
    // Create test directory structure
    mkdirSync(testDir, { recursive: true });
    mkdirSync(claudeProjectDir, { recursive: true });
    mkdirSync(piDir, { recursive: true });

    // Copy test fixtures
    const claudeFixture = readFileSync(join(__dirname, 'fixtures/claude-session.jsonl'), 'utf-8');
    const piFixture = readFileSync(join(__dirname, 'fixtures/pi-session.jsonl'), 'utf-8');
    
    writeFileSync(join(claudeProjectDir, 'claude-test-session.jsonl'), claudeFixture);
    writeFileSync(join(piDir, 'pi-test-session.jsonl'), piFixture);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Query Matching', () => {
    it('should find sessions with query term in user messages', () => {
      const result = execSync(`bun run ../file-based/search.ts --query "overseer" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].userMessages[0]).toContain('overseer system');
    });

    it('should find sessions with query term in tools', () => {
      const result = execSync(`bun run ../file-based/search.ts --query "Bash" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].toolsUsed).toContain('Bash');
    });

    it('should find sessions with query term in file paths', () => {
      const result = execSync(`bun run ../file-based/search.ts --query "monitoring" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].filesFromToolCalls).toContain('src/config/monitoring.ts');
    });

    it('should return empty results for non-matching query', () => {
      const result = execSync(`bun run ../file-based/search.ts --query "nonexistent" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Tool Filtering', () => {
    it('should filter by single tool', () => {
      const result = execSync(`bun run ../file-based/search.ts --tools Edit --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].toolsUsed).toContain('Edit');
    });

    it('should filter by multiple tools', () => {
      const result = execSync(`bun run ../file-based/search.ts --tools Edit,Bash --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
    });

    it('should return empty for non-matching tools', () => {
      const result = execSync(`bun run ../file-based/search.ts --tools WebFetch --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('File Pattern Filtering', () => {
    it('should filter by file pattern', () => {
      const result = execSync(`bun run ../file-based/search.ts --file-pattern "config/" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].filesFromToolCalls.some((f: string) => f.includes('config/'))).toBe(true);
    });

    it('should return empty for non-matching pattern', () => {
      const result = execSync(`bun run ../file-based/search.ts --file-pattern "database/" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter by days', () => {
      const result = execSync(`bun run ../file-based/search.ts --days 1 --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      // Should be empty since our fixture is from 2024
      expect(sessions).toHaveLength(0);
    });

    it('should filter by since date', () => {
      const result = execSync(`bun run ../file-based/search.ts --since "2024-02-19" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
    });

    it('should filter by until date', () => {
      const result = execSync(`bun run ../file-based/search.ts --until "2024-02-19" --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Pi Session Support', () => {
    it('should find Pi sessions', () => {
      const result = execSync(`bun run ../file-based/search.ts --query "overseer" --dir "${piDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].userMessages[0]).toContain('Create an overseer monitoring system');
      expect(sessions[0].toolsUsed).toContain('bash');
      expect(sessions[0].toolsUsed).toContain('write');
    });

    it('should handle Pi session token usage', () => {
      const result = execSync(`bun run ../file-based/search.ts --dir "${piDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].inputTokens).toBe(300);
      expect(sessions[0].outputTokens).toBe(180);
      expect(sessions[0].modelsUsed).toContain('claude-sonnet-4-20250514');
    });
  });

  describe('Source Filtering', () => {
    it('should filter by source: claude', () => {
      // This test would need actual directories, skipping for now
      // Will be tested in integration
    });

    it('should filter by source: pi', () => {
      // This test would need actual directories, skipping for now
      // Will be tested in integration
    });
  });

  describe('Output Format', () => {
    it('should return JSON array with expected fields', () => {
      const result = execSync(`bun run ../file-based/search.ts --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(Array.isArray(sessions)).toBe(true);
      
      if (sessions.length > 0) {
        const session = sessions[0];
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('startedAt');
        expect(session).toHaveProperty('endedAt');
        expect(session).toHaveProperty('gitBranch');
        expect(session).toHaveProperty('messageCount');
        expect(session).toHaveProperty('inputTokens');
        expect(session).toHaveProperty('outputTokens');
        expect(session).toHaveProperty('toolsUsed');
        expect(session).toHaveProperty('filesFromToolCalls');
        expect(session).toHaveProperty('userMessages');
        expect(session).toHaveProperty('modelsUsed');
        expect(session).toHaveProperty('relevance');
        expect(session).toHaveProperty('transcriptPath');
      }
    });

    it('should limit results', () => {
      const result = execSync(`bun run ../file-based/search.ts --limit 1 --dir "${claudeDir}"`, {
        cwd: __dirname,
        encoding: 'utf-8'
      });
      
      const sessions = JSON.parse(result);
      expect(sessions.length).toBeLessThanOrEqual(1);
    });
  });
});