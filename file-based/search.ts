#!/usr/bin/env bun
/**
 * File-based session search - no database required
 *
 * Usage:
 *   bun run file-based/search.ts --query "email system" --days 7
 *   bun run file-based/search.ts --tools Edit,Bash --limit 10
 *   bun run file-based/search.ts --file-pattern "components/"
 *
 * Output: JSON array of matching sessions
 */

import { parseArgs } from 'util';
import { 
  searchSessions, 
  formatResults, 
  getDefaultDirectories,
  findSessionDirs,
  findSessionFiles 
} from './search-lib.js';
import { existsSync } from 'fs';
import type { SearchOptions } from '../shared/types.js';

// CLI entry point
async function main() {
  const { values } = parseArgs({
    options: {
      query: { type: 'string', short: 'q' },
      days: { type: 'string', short: 'd' },
      since: { type: 'string' },
      until: { type: 'string' },
      tools: { type: 'string', short: 't' },
      'file-pattern': { type: 'string', short: 'f' },
      limit: { type: 'string', short: 'l' },
      dir: { type: 'string' },
      source: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Claude Code & Pi Agent Session Search (File-based)

Usage:
  bun run search.ts [options]

Options:
  -q, --query <text>        Search sessions by text
  -d, --days <n>            Limit to last N days
  --since <date>            Sessions after this date (YYYY-MM-DD)
  --until <date>            Sessions before this date (YYYY-MM-DD)
  -t, --tools <list>        Filter by tools (comma-separated)
  -f, --file-pattern <pat>  Filter by file path pattern
  -l, --limit <n>           Max results (default: 20)
  --dir <path>              Sessions directory (overrides --source)
  -s, --source <type>       Session source: claude, pi, all (default: all)
  -h, --help                Show this help

Examples:
  bun run search.ts --query "email filtering" --days 7
  bun run search.ts --tools Edit,Bash --limit 10 --source pi
  bun run search.ts --file-pattern "components/" --source claude
  bun run search.ts --query "overseer" --days 7 --dir ~/.pi/agent/sessions
`);
    process.exit(0);
  }

  const source = (values.source as any) || 'all';
  
  // Validate source option
  if (!['claude', 'pi', 'all'].includes(source)) {
    console.error('Error: --source must be one of: claude, pi, all');
    process.exit(1);
  }

  // Parse and validate dates
  let since: Date | undefined;
  let until: Date | undefined;

  if (values.since) {
    since = new Date(values.since);
    if (isNaN(since.getTime())) {
      console.error(`Error: Invalid date format for --since: ${values.since}`);
      process.exit(1);
    }
  }

  if (values.until) {
    until = new Date(values.until);
    if (isNaN(until.getTime())) {
      console.error(`Error: Invalid date format for --until: ${values.until}`);
      process.exit(1);
    }
  }

  const options: SearchOptions = {
    query: values.query,
    days: values.days ? parseInt(values.days, 10) : undefined,
    since,
    until,
    tools: values.tools ? values.tools.split(',') : undefined,
    filePattern: values['file-pattern'],
    limit: values.limit ? parseInt(values.limit, 10) : 20,
    source: source as any,
  };

  // Determine directories to search
  const directories = values.dir ? [values.dir] : getDefaultDirectories(source);
  
  const results = searchSessions(directories, options);
  const formatted = formatResults(results);

  console.log(JSON.stringify(formatted, null, 2));
}

main().catch(console.error);