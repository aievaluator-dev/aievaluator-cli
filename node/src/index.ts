#!/usr/bin/env node
/**
 * AI Evaluator CLI — Node.js
 *
 * Commands: login, whoami, quick, eval, config
 */

import { Command } from 'commander';
import * as fs from 'fs';
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
    .option('--metrics <metrics>', 'Metrics (comma-separated)')
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

      const metricsList = options.metrics
        ? options.metrics.split(',').map((m: string) => m.trim())
        : undefined;

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
        const raw = fs.readFileSync(options.dataset, 'utf-8');
        const data = JSON.parse(raw);
        rows = Array.isArray(data) ? data : [data];
      }

      try {
        const result = await client.playgroundEvaluate({
          rows,
          agentEndpoint: options.agent,
          metrics: metricsList,
          judge: options.judge,
        });
        formatTable(result, 0.0, url);
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
    .option('--min-score <score>', 'Minimum score threshold (0-1)')
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

      let result: Record<string, unknown>;

      try {
        if (options.dataset) {
          result = await client.evaluateUpload(
            options.dataset,
            options.agent,
            options.agentFormat,
            metricsList.join(','),
          );
        } else {
          let rows: Record<string, unknown>[];
          try {
            rows = JSON.parse(options.rows);
          } catch {
            console.error('❌ Invalid JSON in --rows');
            process.exit(2);
          }
          if (!Array.isArray(rows)) rows = [rows];

          result = await client.evaluateSync(
            rows,
            options.agent,
            options.agentFormat,
            metricsList,
            options.judgeModel,
            options.name,
          );
        }
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

  await program.parseAsync(process.argv);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
