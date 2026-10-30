import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRunLine } from './reader.js';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

// Log lines per status for one night; null if the file is gone. Bad lines are not counted.
export function countNight(runsDir: string, night: string): StatusCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseRunLine(raw);
    if (line) counts[line.status]++;
  }
  return counts;
}
