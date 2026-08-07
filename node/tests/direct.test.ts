import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

vi.mock('axios', () => {
  const m: any = { create: vi.fn(() => m), request: vi.fn(), post: vi.fn(), get: vi.fn(), defaults: {}, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };
  return { default: m, __esModule: true };
});
const ax = vi.mocked(axios);

import { program } from '../src/index';

async function run(args: string[]) {
  let ec = 0;
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(process, 'exit').mockImplementation((c?: number) => { ec = c ?? 0; throw new Error('x'); });
  vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { out.push(a.map(String).join(' ') + '\n'); });
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { err.push(a.map(String).join(' ') + '\n'); });
  program.exitOverride();
  try { await program.parseAsync(['node', 'aievaluator', ...args]); } catch (ex: any) { if (ex?.code === 'commander.exit') ec = ex.exitCode; }
  return { exitCode: ec, stdout: out.join(''), stderr: err.join('') };
}

const m200 = (d: any) => ax.request.mockResolvedValue({ status: 200, data: d, headers: {}, config: {} as any });

// ═══ Direct command tests ═══
// NOTE: Commander.js leaks options between parseAsync calls, so tests
// that use --dataset must run AFTER tests that don't.
describe('direct', () => {
  beforeEach(() => vi.restoreAllMocks());

  // ── Validation (no API calls) ──
  it('14.1 no args', async () => expect((await run(['direct'])).exitCode).toBe(2));
  it('14.2 query no response', async () => expect((await run(['direct', 'q'])).exitCode).toBe(2));

  // ── Inline happy paths ──
  it('14.4 ok inline', async () => {
    m200({ overall_score: 0.9, results: [{ passed: true, scores: { faithfulness: 0.9 } }], summary: { rows: 1, metrics_per_row: 2, passed: 1, failed: 0 } });
    expect((await run(['direct', 'q', '-r', 'R'])).exitCode).toBe(0);
  });

  it('14.6 context + expected', async () => {
    m200({ overall_score: 0.95, results: [{ passed: true }] });
    expect((await run(['direct', 'q', '-r', 'R', '-c', 'ctx', '-e', 'exp'])).exitCode).toBe(0);
  });

  it('14.7 min-score fail', async () => {
    m200({ overall_score: 0.5, results: [{ passed: false, scores: { f: 0.5 } }] });
    expect((await run(['direct', 'q', '-r', 'R', '-s', '0.80'])).exitCode).not.toBe(0);
  });

  it('14.8 json format', async () => {
    m200({ overall_score: 1, results: [{ passed: true, scores: { f: 1 } }] });
    const r = await run(['direct', 'q', '-r', 'R', '-f', 'json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  // ── Dataset-based tests (must run last — see NOTE above) ──
  it('14.5 dataset', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-'));
    fs.writeFileSync(path.join(d, 'd.json'), '[{"input":"Q1","response":"R1"},{"input":"Q2","response":"R2"}]');
    m200({ overall_score: 0.8, results: [{ passed: true }, { passed: true }] });
    expect((await run(['direct', '-d', path.join(d, 'd.json')])).exitCode).toBe(0);
    fs.rmSync(d, { recursive: true, force: true });
  });

  it('14.3 both query and dataset', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-'));
    fs.writeFileSync(path.join(d, 'd.json'), '[{"input":"Q"}]');
    expect((await run(['direct', 'q', '-r', 'R', '-d', path.join(d, 'd.json')])).exitCode).toBe(2);
    fs.rmSync(d, { recursive: true, force: true });
  });
});
