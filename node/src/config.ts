/**
 * Config manager for AI Evaluator CLI.
 *
 * API key resolution priority:
 * 1. --api-key flag
 * 2. AIEVALUATOR_API_KEY env var
 * 3. ./aievaluator.config.json (project-local)
 * 4. ~/.config/aievaluator/config.json (global)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  api_key?: string;
  engine_url?: string;
  default_metrics?: string;
  default_min_score?: number;
}

function globalConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || path.join(os.homedir(), '.config');
  return path.join(base, 'aievaluator', 'config.json');
}

function loadJson(filePath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveJson(filePath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function resolveApiKey(flagValue?: string): string | undefined {
  if (flagValue) return flagValue;
  const env = process.env.AIEVALUATOR_API_KEY;
  if (env) return env;
  const local = loadJson('aievaluator.config.json') as Config;
  if (local.api_key) return local.api_key;
  const global = loadJson(globalConfigPath()) as Config;
  return global.api_key;
}

export function resolveEngineUrl(flagValue?: string): string {
  const defaultUrl = 'https://api.aievaluator.dev';
  if (flagValue) return flagValue.replace(/\/$/, '');
  const env = process.env.AIEVALUATOR_ENGINE_URL;
  if (env) return env.replace(/\/$/, '');
  const local = loadJson('aievaluator.config.json') as Config;
  if (local.engine_url) return local.engine_url.replace(/\/$/, '');
  const global = loadJson(globalConfigPath()) as Config;
  if (global.engine_url) return global.engine_url.replace(/\/$/, '');
  return defaultUrl;
}

export function resolveDefaultMetrics(): string {
  const local = loadJson('aievaluator.config.json') as Config;
  if (local.default_metrics) return local.default_metrics;
  const global = loadJson(globalConfigPath()) as Config;
  return global.default_metrics || 'faithfulness,g_eval';
}

export function resolveDefaultMinScore(): number {
  const local = loadJson('aievaluator.config.json') as Config;
  if (local.default_min_score !== undefined) return local.default_min_score;
  const global = loadJson(globalConfigPath()) as Config;
  return global.default_min_score ?? 0.0;
}

export function saveConfig(data: Config, isGlobal = true): void {
  const p = isGlobal ? globalConfigPath() : 'aievaluator.config.json';
  saveJson(p, data as Record<string, unknown>);
}

export function loadConfig(isGlobal = true): Config {
  const p = isGlobal ? globalConfigPath() : 'aievaluator.config.json';
  return loadJson(p) as Config;
}

export function getAllConfig(): Config {
  const global = loadConfig(true);
  const local = loadConfig(false);
  return { ...global, ...local };
}
