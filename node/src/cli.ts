#!/usr/bin/env node
/**
 * AI Evaluator CLI entry point.
 * Separate from index.ts so that tests can import { program } without triggering main().
 */
import { main } from './index';

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
