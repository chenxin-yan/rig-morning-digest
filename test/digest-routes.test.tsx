import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
const app = createApp(config);

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';

// Job order in the file is deliberately not sorted: both routes must sort the same way.
const normalLines = [
  '{"at":"2026-01-10T01:00:00+01:00","job":"rig/rotate-logs","status":"ok","owner":"rook"}',
  '{"at":"2026-01-10T01:10:00+01:00","job":"notes/backup","status":"retry","owner":"lane-07","error":"quota"}',
  '{"at":"2026-01-10T01:20:00+01:00","job":"lane/sync","status":"ok","owner":null}',
  '{"at":"2026-01-10T01:30:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
];

beforeAll(() => {
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    ['{"at":"2026-01-12T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}', 'not json'].join('\n'),
  );
});

// Job names in the order the page's table shows them.
function pageJobs(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return [...tbody.matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]);
}

describe('GET /digest/:night', () => {
  it('renders one row per job', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${NORMAL}`);
    expect(pageJobs(html)).toEqual(['lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/digest/2026-02-01')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('shows the bad line count', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/1 line didn(&#39;|')t parse/);
    expect(pageJobs(html)).toEqual(['lane/sync']);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns one row per job', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ night: NORMAL, badLines: 0 });
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('404s for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-02-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts the bad line', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ badLines: 1, rows: [{ job: 'lane/sync' }] });
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for one night', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = await (await app.request(`/api/digest/${NORMAL}`)).json();
    expect(pageJobs(html)).toEqual(body.rows.map((r: { job: string }) => r.job));
  });
});
