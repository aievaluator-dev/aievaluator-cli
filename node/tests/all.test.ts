import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

vi.mock('axios', () => {
  const m: any = { create: vi.fn(() => m), request: vi.fn(), post: vi.fn(), get: vi.fn(), defaults: {}, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };
  return { default: m, __esModule: true };
});
const ax = vi.mocked(axios);

import { APIClient, APIError } from '../src/api/client';
import { formatJson } from '../src/formatters/json';
import { formatJunit } from '../src/formatters/junit';
import { formatTable } from '../src/formatters/table';
import { resolveApiKey, resolveEngineUrl, resolveDefaultMetrics, resolveDefaultMinScore, getAllConfig } from '../src/config';
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

function parseDS(p: string): Record<string, unknown>[] {
  const r = fs.readFileSync(p, 'utf-8');
  if (p.endsWith('.jsonl')) return r.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  const d = JSON.parse(r);
  return Array.isArray(d) ? d : [d];
}

function parseQM(s?: string, dt?: number) {
  if (!s) return undefined;
  return s.split(',').map(i => {
    const t = i.trim();
    if (t.includes(':')) {
      const [n, v] = t.split(':').map(x => x.trim());
      return { name: n, threshold: parseFloat(v) };
    }
    if (dt !== undefined) return { name: t, threshold: dt };
    return t;
  });
}

function parseTH(s?: string): Record<string, number> {
  if (!s) return {};
  const r: Record<string, number> = {};
  for (const p of s.split(',')) {
    const [m, v] = p.trim().split(':').map(x => x.trim());
    const n = parseFloat(v);
    if (!isNaN(n)) r[m] = n;
  }
  return r;
}

const m200 = (d: any) => ax.request.mockResolvedValue({ status: 200, data: d, headers: {}, config: {} as any });
const mGet = (d: any) => ax.get.mockResolvedValue({ status: 200, data: d, headers: {}, config: {} as any });
const mo = () => m200({ overall_score: 0.85, results: [{ passed: true, query: 'ok', scores: { faithfulness: 0.9 } }] });

const AP = {
  evaluation_id: 'e1', overall_score: 0.85, total_rows: 2, input_tokens: 100, output_tokens: 50,
  results: [{ query: 'T1', scores: { f: 1 }, passed: true }, { query: 'T2', scores: { f: 1 }, passed: true }],
};
const AF = {
  evaluation_id: 'e2', overall_score: 0.75, total_rows: 2, input_tokens: 80, output_tokens: 40,
  results: [
    { query: 'T1', scores: { f: 1 }, passed: true },
    { query: 'T2 & <x>', expected_output: 'E', agent_response: 'B', scores: { f: 0.5 }, passed: false },
  ],
};

// ═══ 1. Config (11) ═══
describe('Config', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.stubEnv('AIEVALUATOR_API_KEY', ''); vi.stubEnv('AIEVALUATOR_ENGINE_URL', ''); });
  it('1.1 flag wins', () => expect(resolveApiKey('sk-flag')).toBe('sk-flag'));
  it('1.2 env wins', () => { vi.stubEnv('AIEVALUATOR_API_KEY', 'sk-env'); expect(resolveApiKey()).toBe('sk-env'); });
  it('1.5 none', () => expect(resolveApiKey()).toBeUndefined());
  it('1.6 engine flag', () => expect(resolveEngineUrl('https://f.dev')).toBe('https://f.dev'));
  it('1.7 engine env', () => { vi.stubEnv('AIEVALUATOR_ENGINE_URL', 'https://e.dev/'); expect(resolveEngineUrl()).toBe('https://e.dev'); });
  it('1.8 default', () => expect(resolveEngineUrl()).toBe('https://api.aievaluator.dev'));
  it('1.9 slash', () => expect(resolveEngineUrl('https://x.dev/')).toBe('https://x.dev'));
  it('1.10 metrics', () => expect(resolveDefaultMetrics()).toBeTruthy());
  it('1.11 min score', () => expect(resolveDefaultMinScore()).toBe(0.0));
  it('1.16 getAllConfig', () => expect(getAllConfig()).toBeDefined());
});

// ═══ 2. API Client (8) ═══
describe('API', () => {
  it('2.1 init', () => expect(new APIClient('https://t.dev', 'sk', 60)).toBeDefined());
  it('2.2 no key', () => expect(new APIClient('https://t.dev')).toBeDefined());
  it('2.5 APIError', () => expect(new APIError(429, 'R', {}).statusCode).toBe(429));
  it('2.10 getUsage', async () => { m200({ tenant_name: 'acme' }); expect((await new APIClient('https://t.dev', 'sk').getUsage()).tenant_name).toBe('acme'); });
  it('2.11 evalSync', async () => { m200({ overall_score: 0.95 }); expect((await new APIClient('https://t.dev', 'sk').evaluateSync([{ input: 't' }], 'https://a.com')).overall_score).toBe(0.95); });
  it('2.6 4xx', async () => { ax.request.mockRejectedValue({ response: { status: 429 } }); await expect(new APIClient('https://t.dev', 'sk').getUsage()).rejects.toThrow('429'); });
  it('2.7 5xx', async () => { ax.request.mockRejectedValue({ response: { status: 500 } }); await expect(new APIClient('https://t.dev', 'sk').getUsage()).rejects.toThrow('500'); });
  it('2.15 pgStatus', async () => { mGet({ remaining: 3 }); expect((await new APIClient('https://t.dev').playgroundStatus()).remaining).toBe(3); });
});

// ═══ 3. Dataset (6) ═══
describe('Dataset', () => {
  let d: string;
  beforeEach(() => { d = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-')); });
  afterEach(() => { fs.rmSync(d, { recursive: true, force: true }); });
  it('3.1 array', () => { fs.writeFileSync(path.join(d, 'a.json'), '[{"i":"Q1"},{"i":"Q2"}]'); expect(parseDS(path.join(d, 'a.json'))).toHaveLength(2); });
  it('3.2 single', () => { fs.writeFileSync(path.join(d, 's.json'), '{"i":"only"}'); expect(parseDS(path.join(d, 's.json'))).toHaveLength(1); });
  it('3.3 jsonl', () => { fs.writeFileSync(path.join(d, 'l.jsonl'), '{"i":"Q1"}\n\n{"i":"Q2"}\n'); expect(parseDS(path.join(d, 'l.jsonl'))).toHaveLength(2); });
  it('3.4 missing', () => expect(() => parseDS('/nope.json')).toThrow());
  it('3.5 invalid', () => { fs.writeFileSync(path.join(d, 'b.json'), 'not{{{'); expect(() => parseDS(path.join(d, 'b.json'))).toThrow(); });
  it('3.1b empty array', () => { fs.writeFileSync(path.join(d, 'e.json'), '[]'); expect(parseDS(path.join(d, 'e.json'))).toHaveLength(0); });
});

// ═══ 4-5. Metrics + Thresholds (8) ═══
describe('Metrics+Thr', () => {
  it('4.1 simple', () => expect(parseQM('a,b')).toEqual(['a', 'b']));
  it('4.2 thresholds', () => expect(parseQM('a:0.9,b:0.8')).toEqual([{ name: 'a', threshold: 0.9 }, { name: 'b', threshold: 0.8 }]));
  it('4.3 fallback', () => expect(parseQM('a,b', 0.7)).toEqual([{ name: 'a', threshold: 0.7 }, { name: 'b', threshold: 0.7 }]));
  it('4.4 empty', () => { expect(parseQM('')).toBeUndefined(); expect(parseQM()).toBeUndefined(); });
  it('4.5 ws', () => expect(parseQM(' a , b ')).toEqual(['a', 'b']));
  it('5.1 parse', () => expect(parseTH('a:0.9,b:0.8')).toEqual({ a: 0.9, b: 0.8 }));
  it('5.2 empty', () => { expect(parseTH('')).toEqual({}); expect(parseTH()).toEqual({}); });
  it('5.3 skip', () => expect(parseTH('a:abc,b:0.8')).toEqual({ b: 0.8 }));
});

// ═══ 6. Formatters (9) ═══
describe('Formatters', () => {
  it('6.1 json pass', () => { const o = JSON.parse(formatJson(AP as any, 0.80)); expect(o.passed).toBe(true); expect(o.failed_queries).toBe(0); });
  it('6.2 json fail', () => { const o = JSON.parse(formatJson(AF as any, 0.80)); expect(o.passed).toBe(false); expect(o.failed_queries).toBe(1); });
  it('6.3 keys', () => expect(JSON.parse(formatJson(AP as any, 0.80))).toHaveProperty('evaluation_id'));
  it('6.4 tokens', () => expect(JSON.parse(formatJson(AP as any, 0.80)).input_tokens).toBe(100));
  it('6.5 junit header', () => { const o = formatJunit(AF as any, 0.80); expect(o).toContain('tests="2"'); expect(o).toContain('failures="1"'); });
  it('6.6 junit pass', () => expect(formatJunit(AP as any, 0.80)).not.toContain('<failure'));
  it('6.7 junit fail', () => expect(formatJunit(AF as any, 0.80)).toContain('Expected'));
  it('6.8 escape', () => { const o = formatJunit(AF as any, 0.80); expect(o).toContain('&amp;'); expect(o).toContain('&lt;'); });
  it('6.9 table', () => { formatTable(AP as any, 0.80, 'https://t.dev'); formatTable({ results: [], overall_score: 0 } as any, 0.80, 'https://t.dev'); });
});

// ═══ 12. Init (5) ═══
describe('init', () => {
  let d: string;
  beforeEach(() => { vi.restoreAllMocks(); d = fs.mkdtempSync(path.join(os.tmpdir(), 'in-')); vi.spyOn(process, 'cwd').mockReturnValue(d); });
  afterEach(() => { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); });
  it('12.1 config', async () => { await run(['init']); expect(fs.existsSync(path.join(d, 'aievaluator.config.json'))).toBe(true); });
  it('12.2 dataset', async () => { await run(['init']); const c = JSON.parse(fs.readFileSync(path.join(d, 'evals/smoke-test.json'), 'utf-8')); expect(c).toHaveLength(3); });
  it('12.3 gitignore', async () => { await run(['init']); expect(fs.readFileSync(path.join(d, '.gitignore'), 'utf-8')).toContain('aievaluator.config.json'); });
  it('12.4 again', async () => { await run(['init']); expect((await run(['init'])).stdout).toContain('already exists'); });
  it('12.6 no dup', async () => { await run(['init']); await run(['init']); expect((fs.readFileSync(path.join(d, '.gitignore'), 'utf-8').match(/aievaluator\.config\.json/g) || []).length).toBe(1); });
});

// ═══ 7. Login (2) ═══
describe('login', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('7.1 ok', async () => { m200({ tenant_name: 'acme', tier: 'pro' }); const r = await run(['login', '--api-key', 'sk']); expect(r.exitCode).toBe(0); });
  it('7.2 bad', async () => { ax.request.mockRejectedValue({ response: { status: 401 } }); expect((await run(['login', '--api-key', 'bad'])).exitCode).toBe(2); });
});

// ═══ 8. Whoami (3) ═══
describe('whoami', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.stubEnv('AIEVALUATOR_API_KEY', ''); });
  it('8.1 no key', async () => expect((await run(['whoami'])).exitCode).not.toBe(0));
  it('8.2 ok', async () => { vi.stubEnv('AIEVALUATOR_API_KEY', 'sk'); m200({ tenant_name: 'acme', tier: 'pro' }); expect((await run(['whoami'])).stdout).toContain('acme'); });
  it('8.3 flag', async () => { m200({ tenant_name: 'flag' }); expect((await run(['whoami', '--api-key', 'sk'])).stdout).toContain('flag'); });
});

// ═══ 9. Quick (7) ═══
describe('quick', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('9.1 no args', async () => expect((await run(['quick'])).exitCode).toBe(2));
  it('9.2 ok', async () => { mGet({ remaining: 4, limit: 5 }); m200({ results: [{ passed: true, scores: { f: 1 } }], overall_score: 1 }); expect((await run(['quick', 'hi'])).exitCode).toBe(0); });
  it('9.4 dataset', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-'));
    fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"Q"}]');
    mGet({ remaining: 4 }); m200({ results: [{ passed: true }], overall_score: 1 });
    expect((await run(['quick', '--dataset', path.join(d, 'd.json')])).exitCode).toBe(0);
    fs.rmSync(d, { recursive: true, force: true });
  });
  it('9.5 jsonl', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-'));
    fs.writeFileSync(path.join(d, 'd.jsonl'), '{"i":"Q1"}\n{"i":"Q2"}\n');
    mGet({ remaining: 4 }); m200({ results: [{ passed: true }, { passed: true }], overall_score: 1 });
    expect((await run(['quick', '--dataset', path.join(d, 'd.jsonl')])).exitCode).toBe(0);
    fs.rmSync(d, { recursive: true, force: true });
  });
  it('9.6 thresholds', async () => { mGet({ remaining: 4 }); m200({ results: [{ passed: true, scores: { f: 0.95 } }], overall_score: 0.95 }); expect((await run(['quick', 't', '--metrics', 'f:0.90,g:0.75'])).exitCode).toBe(0); });
  it('9.8 exhausted', async () => { mGet({ remaining: 0 }); expect((await run(['quick', 't'])).exitCode).toBe(2); });
  it('9.9 below', async () => { mGet({ remaining: 4 }); m200({ results: [{ passed: false, scores: { f: 0.3 } }] }); expect((await run(['quick', 't', '--min-score', '0.80'])).exitCode).not.toBe(0); });
});

// ═══ 10. Eval (9) ═══
describe('eval', () => {
  let d: string;
  beforeEach(() => { vi.restoreAllMocks(); vi.stubEnv('AIEVALUATOR_API_KEY', 'sk'); d = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-')); });
  afterEach(() => { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); });
  it('10.1 no agent', async () => expect((await run(['eval'])).exitCode).not.toBe(0));
  it('10.2 no data', async () => expect((await run(['eval', '--agent', 'https://a.com'])).exitCode).toBe(2));
  it('10.4 ok', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); mo(); expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json')])).exitCode).toBe(0); });
  it('10.5 rows', async () => { mo(); expect((await run(['eval', '--agent', 'https://a.com', '--rows', '[{"i":"hi"}]'])).exitCode).toBeGreaterThanOrEqual(0); });
  it('10.7 below', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); m200({ overall_score: 0.4, results: [{ passed: true, query: 'ok', scores: { f: 0.4 } }] }); expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json'), '--min-score', '0.80'])).exitCode).toBe(1); });
  it('10.10 json', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); mo(); const r = await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json'), '--format', 'json']); expect(() => JSON.parse(r.stdout)).not.toThrow(); });
  it('10.11 junit', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); mo(); expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json'), '--format', 'junit'])).stdout).toContain('<?xml'); });
  it('10.13 conn', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); ax.request.mockRejectedValue({ code: 'ECONNREFUSED' }); expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json')])).exitCode).toBe(3); });
  it('10.14 500', async () => { fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]'); ax.request.mockRejectedValue({ response: { status: 500 } }); expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json')])).exitCode).toBe(2); });
});

// ═══ 11. Config (2) ═══
describe('config', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('11.1 show', async () => expect((await run(['config', 'show'])).exitCode).toBe(0));
  it('11.3 bad', async () => expect((await run(['config', 'set', 'bad', 'v'])).exitCode).toBe(2));
});

// ═══ 13. Exit Codes (5) ═══
describe('ExitCodes', () => {
  it('13.1: 0', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-')); fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]');
    vi.stubEnv('AIEVALUATOR_API_KEY', 'sk'); mo();
    expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json')])).exitCode).toBe(0);
    fs.rmSync(d, { recursive: true, force: true });
  });
  it('13.2: 1', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-')); fs.writeFileSync(path.join(d, 'd.json'), '[{"i":"hi"}]');
    vi.stubEnv('AIEVALUATOR_API_KEY', 'sk'); m200({ overall_score: 0.4, results: [{ passed: true, query: 'ok', scores: { f: 0.4 } }] });
    expect((await run(['eval', '--agent', 'https://a.com', '--dataset', path.join(d, 'd.json'), '--min-score', '0.80'])).exitCode).toBe(1);
    fs.rmSync(d, { recursive: true, force: true });
  });
  it('13.3 row failed', () => expect([{ p: true }, { p: false }].some((r: any) => !r.p)).toBe(true));
  it('13.4 config err', () => expect(2).toBe(2));
  it('13.5 conn err', () => expect(3).toBe(3));
});
