#!/usr/bin/env node
/**
 * AI Evaluator CLI — Node.js
 *
 * Commands: login, whoami, quick, eval, config
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('aievaluator')
  .description('AI Evaluator CLI — evaluate your LLM agents from the command line')
  .version('1.0.0');

program
  .command('login')
  .description('Authenticate with AI Evaluator')
  .option('--api-key <key>', 'API key (non-interactive)')
  .option('--engine-url <url>', 'Engine URL', 'https://api.aievaluator.dev')
  .action((options) => {
    console.log('login: coming soon');
    console.log('Get your API key at https://aievaluator.dev/settings');
  });

program
  .command('whoami')
  .description('Show current tenant info')
  .action(() => console.log('whoami: coming soon'));

program
  .command('quick')
  .description('Quick eval via playground (no API key)')
  .argument('[query]', 'Query to evaluate')
  .option('--dataset <path>', 'JSON dataset file')
  .option('--expected <text>', 'Expected output')
  .option('--agent <url>', 'Agent endpoint URL', '/chat')
  .option('--metrics <metrics>', 'Metrics (comma-separated)')
  .action((query, options) => console.log('quick: coming soon'));

program
  .command('eval')
  .description('Full evaluation against an agent')
  .requiredOption('--agent <url>', 'Agent endpoint URL')
  .option('--dataset <path>', 'JSON dataset file')
  .option('--rows <json>', 'Inline JSON array')
  .option('--metrics <metrics>', 'Metrics (comma-separated)')
  .option('--min-score <score>', 'Minimum score threshold (0-1)', '0.0')
  .option('--format <format>', 'Output format: table, json, junit', 'table')
  .option('--ci', 'CI mode (no colors)')
  .option('--timeout <seconds>', 'Timeout in seconds', '300')
  .action((options) => console.log('eval: coming soon'));

program
  .command('config')
  .description('Manage CLI configuration')
  .command('show').description('Show current config').action(() => console.log('{}'))
  .command('set <key> <value>').action(() => console.log('OK'))
  .command('unset <key>').action(() => console.log('OK'));

program.parse();
