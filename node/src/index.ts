#!/usr/bin/env node
/**
 * AI Evaluator CLI — Node.js
 *
 * Commands: login, whoami, quick, eval, config
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { APIClient, APIError } from './api/client';
import {
  resolveApiKey,
  resolveEngineUrl,
  resolveDefaultMetrics,
  resolveDefaultMinScore,
  saveConfig,
  loadConfig,
  getAllConfig,
} from './config';
import { formatTable } from './formatters/table';
import { formatJson } from './formatters/json';
import { formatJunit } from './formatters/junit';

const VERSION = '1.0.0';

const SMOKE_TEST_DATASET = [
  { input: 'What is 2+2?', expected_output: '4' },
  { input: 'What is the capital of France?', expected_output: 'Paris' },
  { input: 'Say hello in Spanish', expected_output: 'Hola' },
];

function parseQuickMetrics(
  metricsStr?: string,
  defaultThreshold?: number,
): (string | Record<string, unknown>)[] | undefined {
  if (!metricsStr) return undefined;
  return metricsStr.split(',').map((item) => {
    const trimmed = item.trim();
    if (trimmed.includes(':')) {
      const [name, val] = trimmed.split(':').map((s) => s.trim());
      return { name, threshold: parseFloat(val) };
    }
    if (defaultThreshold !== undefined) {
      return { name: trimmed, threshold: defaultThreshold };
    }
    return trimmed;
  });
}

function parseDatasetFile(filePath: string): Record<string, unknown>[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.jsonl')) {
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [data];
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const program = new Command();

  program
    .name('aievaluator')
    .description('AI Evaluator CLI — evaluate your LLM agents from the command line')
    .version(VERSION);

  // ═════════════════════════════════════════════════════════════════
  //  login
  // ═════════════════════════════════════════════════════════════════
  program
    .command('login')
    .description('Authenticate with AI Evaluator')
    .option('--api-key <key>', 'API key (non-interactive)')
    .option('--engine-url <url>', 'Engine URL')
    .action(async (options) => {
      let key = options.apiKey;
      if (!key) {
        console.error();
        console.error('Enter your AI Evaluator API key:');
        console.error('(Get one at https://aievaluator.dev/settings)');
        key = await prompt('API key: ');
      }
      if (!key) {
        console.error('❌ API key cannot be empty.');
        process.exit(2);
      }

      const url = resolveEngineUrl(options.engineUrl);
      const client = new APIClient(url, key);

      try {
        const usage = await client.getUsage();
        const cfg = loadConfig();
        cfg.api_key = key;
        cfg.engine_url = url;
        saveConfig(cfg);

        console.log();
        console.log(`✅ Logged in as ${usage.tenant_name || 'Unknown'} (${usage.tier || 'unknown'})`);
        console.log(`   Evals: ${usage.evaluations_this_cycle || 0}/${usage.evaluations_limit || '∞'} this cycle`);
        console.log(`   Config saved to ~/.config/aievaluator/config.json`);
      } catch (e) {
        const err = e as APIError;
        console.error(`❌ ${err.message}`);
        process.exit(2);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  //  whoami
  // ═════════════════════════════════════════════════════════════════
  program
    .command('whoami')
    .description('Show current tenant info')
    .option('--api-key <key>', 'API key (overrides config)')
    .action(async (options) => {
      const key = resolveApiKey(options.apiKey);
      if (!key) {
        console.error('❌ Not logged in. Run: aievaluator login');
        process.exit(2);
      }

      const url = resolveEngineUrl();
      const client = new APIClient(url, key);

      try {
        const usage = await client.getUsage();
        console.log();
        console.log(`Tenant:  ${usage.tenant_name || 'Unknown'}`);
        console.log(`Tier:    ${usage.tier || 'unknown'}`);
        console.log(`Evals:   ${usage.evaluations_this_cycle || 0}/${usage.evaluations_limit || '∞'} this cycle`);
        const tin = (usage.input_tokens_this_cycle as number) || 0;
        const tout = (usage.output_tokens_this_cycle as number) || 0;
        console.log(`Tokens:  ↓${tin.toLocaleString()} · ↑${tout.toLocaleString()} this cycle`);
      } catch (e) {
        const err = e as APIError;
        console.error(`❌ ${err.message}`);
        process.exit(2);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  //  quick
  // ═════════════════════════════════════════════════════════════════
  program
    .command('quick')
    .description('Quick eval via playground (no API key)')
    .argument('[query]', 'Query to evaluate')
    .option('--dataset <path>', 'JSON dataset file')
    .option('--agent <url>', 'Agent endpoint URL', '/chat')
    .option('--expected <text>', 'Expected output')
    .option('--metrics <metrics>', 'Metrics: faithfulness,g_eval or faithfulness:0.90,g_eval:0.75')
    .option('--min-score <score>', 'Apply threshold to all metrics and enforce exit code')
    .option('--judge <model>', 'LLM judge model')
    .option('--engine-url <url>', 'Engine URL')
    .action(async (query, options) => {
      if (!query && !options.dataset) {
        console.error('❌ Provide a query or --dataset');
        process.exit(2);
      }
      if (query && options.dataset) {
        console.error('❌ Use query OR --dataset, not both');
        process.exit(2);
      }

      const url = resolveEngineUrl(options.engineUrl);
      const client = new APIClient(url);

      const metricsList = parseQuickMetrics(
        options.metrics as string | undefined,
        options.minScore !== undefined ? parseFloat(options.minScore) : undefined,
      );

      // Check playground status
      let status = { used: 0, limit: 5 as number, remaining: 5, resets_at: 'midnight UTC' };
      try {
        status = (await client.playgroundStatus()) as typeof status;
      } catch { /* ok */ }

      console.error(`⚠️  Playground mode — ${status.remaining}/${status.limit} remaining (resets at ${status.resets_at})`);
      console.error();

      if (status.remaining <= 0) {
        console.error('❌ Playground limit reached. Run `aievaluator login` for 100 free evals/month.');
        process.exit(2);
      }

      let rows: Record<string, unknown>[];
      if (query) {
        rows = [{ input: query }];
        if (options.expected) rows[0].expected_output = options.expected;
      } else {
        rows = parseDatasetFile(options.dataset);
      }

      try {
        const result = await client.playgroundEvaluate({
          rows,
          agentEndpoint: options.agent,
          metrics: metricsList,
          judge: options.judge,
        });
        const overallPassed = ((result.results as Array<Record<string, unknown>>) || []).every(
          (r) => r.passed !== false,
        );
        formatTable(result, options.minScore ? parseFloat(options.minScore) : 0.0, url);
        if (options.minScore !== undefined && !overallPassed) process.exit(1);
      } catch (e) {
        const err = e as APIError;
        console.error(`❌ ${err.message}`);
        if (err.detail) console.error(JSON.stringify(err.detail, null, 2));
        process.exit(2);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  //  eval
  // ═════════════════════════════════════════════════════════════════
  program
    .command('eval')
    .description('Evaluate an AI agent against a dataset')
    .requiredOption('--agent <url>', 'Agent endpoint URL')
    .option('--dataset <path>', 'JSON dataset file')
    .option('--rows <json>', 'Inline JSON array of test cases')
    .option('--metrics <metrics>', 'Metrics (comma-separated)')
    .option('--agent-format <format>', 'Agent API format', 'openai')
    .option('--min-score <score>', 'Minimum overall score threshold (0-1)')
    .option('--thresholds <thresholds>', 'Per-metric thresholds: faithfulness:0.90,g_eval:0.75')
    .option('--custom <json>', 'Inline custom evaluator JSON')
    .option('--format <format>', 'Output format: table, json, junit', 'table')
    .option('--ci', 'CI mode (no colors, no prompts)')
    .option('--timeout <seconds>', 'Timeout in seconds', '300')
    .option('--judge-model <model>', 'LLM judge model')
    .option('--name <name>', 'Human-readable name for this evaluation')
    .option('--api-key <key>', 'API key (overrides config)')
    .option('--engine-url <url>', 'Engine URL')
    .action(async (options) => {
      if (!options.dataset && !options.rows) {
        console.error('❌ Provide --dataset or --rows');
        process.exit(2);
      }
      if (options.dataset && options.rows) {
        console.error('❌ Use --dataset OR --rows, not both');
        process.exit(2);
      }

      const key = resolveApiKey(options.apiKey);
      if (!key) {
        console.error('❌ API key required. Run: aievaluator login');
        process.exit(2);
      }

      const url = resolveEngineUrl(options.engineUrl);
      const client = new APIClient(url, key, parseInt(options.timeout));

      const metricsList = options.metrics
        ? options.metrics.split(',').map((m: string) => m.trim())
        : resolveDefaultMetrics().split(',');

      const minScore = options.minScore !== undefined
        ? parseFloat(options.minScore)
        : resolveDefaultMinScore();

      // Parse per-metric thresholds
      let thresholds: Record<string, number> | undefined;
      if (options.thresholds) {
        thresholds = {};
        for (const pair of (options.thresholds as string).split(',')) {
          const [metric, val] = pair.split(':').map((s) => s.trim());
          if (metric && val) {
            thresholds[metric] = parseFloat(val);
          }
        }
      }

      let result: Record<string, unknown>;

      try {
        let rows: Record<string, unknown>[];
        if (options.dataset) {
          try {
            rows = parseDatasetFile(options.dataset);
          } catch (e) {
            console.error(`❌ Cannot read dataset: ${e}`);
            process.exit(2);
          }
        } else {
          try {
            rows = JSON.parse(options.rows);
          } catch {
            console.error('❌ Invalid JSON in --rows');
            process.exit(2);
          }
          if (!Array.isArray(rows)) rows = [rows];
        }

        // Parse inline custom evaluators
        let customEvaluators: Record<string, unknown>[] | undefined;
        if (options.custom) {
          try {
            const parsed = JSON.parse(options.custom);
            customEvaluators = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            console.error('❌ Invalid JSON in --custom');
            process.exit(2);
          }
        }

        result = await client.evaluateSync(
          rows,
          options.agent,
          options.agentFormat,
          metricsList,
          options.judgeModel,
          options.name,
          thresholds,
          customEvaluators,
        );
      } catch (e) {
        const err = e as APIError;
        console.error(`❌ ${err.message}`);
        if (err.detail) {
          if (typeof err.detail === 'object') {
            console.error(JSON.stringify(err.detail, null, 2));
          } else {
            console.error(String(err.detail).substring(0, 500));
          }
        }
        process.exit(err.statusCode === 0 ? 3 : 2);
      }

      // Output
      if (options.format === 'json') {
        console.log(formatJson(result, minScore));
      } else if (options.format === 'junit') {
        console.log(formatJunit(result, minScore));
      } else {
        formatTable(result, minScore, url);
      }

      const overallScore = (result.overall_score as number) || 0;
      if (overallScore < minScore) process.exit(1);
    });

  // ═════════════════════════════════════════════════════════════════
  //  config
  // ═════════════════════════════════════════════════════════════════
  const configCmd = program.command('config').description('Manage CLI configuration');

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const cfg = getAllConfig();
      if (Object.keys(cfg).length > 0) {
        console.log(JSON.stringify(cfg, null, 2));
      } else {
        console.log('No configuration found. Run: aievaluator login');
      }
    });

  function cliKeyToConfigKey(key: string): string {
    const map: Record<string, string> = {
      'engine-url': 'engine_url',
      'default-metrics': 'default_metrics',
      'default-min-score': 'default_min_score',
    };
    return map[key] || key;
  }

  configCmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>')
    .argument('<value>')
    .action((key: string, value: string) => {
      const validKeys = ['engine-url', 'default-metrics', 'default-min-score'];
      if (!validKeys.includes(key)) {
        console.error(`❌ Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`);
        process.exit(2);
      }
      const cfgKey = cliKeyToConfigKey(key);
      const cfg = loadConfig() as Record<string, unknown>;
      if (key === 'default-min-score') {
        cfg[cfgKey] = parseFloat(value);
        if (isNaN(cfg[cfgKey] as number)) {
          console.error('❌ default-min-score must be a number (0-1)');
          process.exit(2);
        }
      } else {
        cfg[cfgKey] = value;
      }
      saveConfig(cfg as unknown as import('./config').Config);
      console.log(`✅ ${key} = ${value}`);
    });

  configCmd
    .command('unset')
    .description('Remove a configuration value')
    .argument('<key>')
    .action((key: string) => {
      const cfgKey = cliKeyToConfigKey(key);
      const cfg = loadConfig() as Record<string, unknown>;
      if (cfgKey in cfg) {
        delete cfg[cfgKey];
        saveConfig(cfg as unknown as import('./config').Config);
        console.log(`✅ ${key} removed`);
      } else {
        console.log(`${key} was not set`);
      }
    });

  // ═════════════════════════════════════════════════════════════════
  //  init
  // ═════════════════════════════════════════════════════════════════
  program
    .command('init')
    .description('Initialize a new AI Evaluator project in the current directory')
    .action(() => {
      const cwd = process.cwd();

      // 1. Create aievaluator.config.json
      const configPath = path.join(cwd, 'aievaluator.config.json');
      if (fs.existsSync(configPath)) {
        console.log('⏭️  aievaluator.config.json already exists, skipping');
      } else {
        fs.writeFileSync(
          configPath,
          JSON.stringify(
            {
              engine_url: 'https://api.aievaluator.dev',
              default_metrics: 'faithfulness,g_eval',
              default_min_score: 0.8,
            },
            null,
            2,
          ) + '\n',
        );
        console.log('✅ Created aievaluator.config.json');
      }

      // 2. Create evals/ directory + smoke-test.json
      const evalsDir = path.join(cwd, 'evals');
      if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir);
      const smokePath = path.join(evalsDir, 'smoke-test.json');
      if (fs.existsSync(smokePath)) {
        console.log('⏭️  evals/smoke-test.json already exists, skipping');
      } else {
        fs.writeFileSync(smokePath, JSON.stringify(SMOKE_TEST_DATASET, null, 2) + '\n');
        console.log('✅ Created evals/smoke-test.json (3 example queries)');
      }

      // 3. Update .gitignore
      const gitignorePath = path.join(cwd, '.gitignore');
      const entry = 'aievaluator.config.json';
      let gitignoreLines: string[] = [];
      if (fs.existsSync(gitignorePath)) {
        gitignoreLines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
      }
      if (!gitignoreLines.includes(entry)) {
        const content = gitignoreLines.length > 0 && gitignoreLines[gitignoreLines.length - 1].trim() !== ''
          ? '\n' + entry + '\n'
          : entry + '\n';
        fs.appendFileSync(gitignorePath, content);
        console.log(`✅ Added ${entry} to .gitignore`);
      }

      console.log();
      console.log('Next steps:');
      console.log('  aievaluator quick --dataset ./evals/smoke-test.json');
      console.log('  aievaluator login    (for 100 free evals/month)');
      console.log();
    });

  await program.parseAsync(process.argv);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
