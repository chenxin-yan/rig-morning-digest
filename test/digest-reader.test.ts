import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs sorted by job and 1 bad line', () => {
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last error and the offsets', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a fail with its error', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));

  it('empty file is a night with no rows', () => {
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('missing file is null', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('a night that is not YYYY-MM-DD is null', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
  });

  it('counts invalid fields as bad lines and skips blank lines', () => {
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"weird","owner":"x"}',
        '{"job":"a","status":"ok","owner":"x"}',
        '[]',
        '',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-01-03')).toMatchObject({ badLines: 3, rows: [{ job: 'a', runs: 1 }] });
  });
});
