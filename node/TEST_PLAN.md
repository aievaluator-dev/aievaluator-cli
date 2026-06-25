# Test Plan — AI Evaluator CLI (Node.js)

> Same test suite shared across all language implementations (Python, Node.js, Go, C#).
> Every test must pass identically across all targets.

---

## 1. Config Module (`test_config.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 1.1 | `test_api_key_flag_priority` | `--api-key` flag wins over env, local, and global config |
| 1.2 | `test_api_key_env_priority` | `AIEVALUATOR_API_KEY` env var wins over local/global config |
| 1.3 | `test_api_key_local_config` | Project-local `aievaluator.config.json` wins over global |
| 1.4 | `test_api_key_global_config` | Falls back to `~/.config/aievaluator/config.json` |
| 1.5 | `test_api_key_none` | Returns `null`/empty when no key found anywhere |
| 1.6 | `test_engine_url_flag` | `--engine-url` flag takes priority |
| 1.7 | `test_engine_url_env` | `AIEVALUATOR_ENGINE_URL` env var takes priority |
| 1.8 | `test_engine_url_default` | Returns `https://api.aievaluator.dev` when nothing configured |
| 1.9 | `test_engine_url_trailing_slash_stripped` | All resolved URLs strip trailing `/` |
| 1.10 | `test_default_metrics_resolution` | Returns `faithfulness,g_eval` from config or default |
| 1.11 | `test_default_min_score_resolution` | Returns `0.0` when not set, config value when set |
| 1.12 | `test_save_and_load_global_config` | Write → read round-trip preserves all fields |
| 1.13 | `test_save_and_load_local_config` | Project-local config round-trip |
| 1.14 | `test_load_nonexistent_config_returns_empty` | Missing files return empty/zero config, never crash |
| 1.15 | `test_load_invalid_json_returns_empty` | Corrupt JSON returns empty/zero config, never crash |
| 1.16 | `test_get_all_config_merges_local_over_global` | Local keys override global, non-overlapping keys merged |
| 1.17 | `test_global_config_path_platform` | Path uses `XDG_CONFIG_HOME` on Linux, `APPDATA` on Windows |

## 2. API Client (`test_api_client.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 2.1 | `test_client_init_with_key` | Constructor sets `engine_url`, `api_key`, `timeout` correctly |
| 2.2 | `test_client_init_without_key` | Constructor works without API key (playground mode) |
| 2.3 | `test_headers_with_key` | `X-API-Key` header present when key provided |
| 2.4 | `test_headers_without_key` | `X-API-Key` header absent when no key |
| 2.5 | `test_api_error_creation` | `APIError` stores statusCode, message, detail |
| 2.6 | `test_request_http_4xx` | HTTP 400/429 → raises `APIError` with status code |
| 2.7 | `test_request_http_5xx` | HTTP 500 → raises `APIError` with status code |
| 2.8 | `test_request_connection_refused` | Cannot connect → raises `APIError` with status 0 |
| 2.9 | `test_request_timeout` | Timeout → raises `APIError` with status 0 |
| 2.10 | `test_get_usage_endpoint` | Calls `GET /api/v1/tenants/me/usage` |
| 2.11 | `test_evaluate_sync_endpoint` | Calls `POST /api/v1/evaluations/sync` with correct body |
| 2.12 | `test_evaluate_sync_default_metrics` | `metrics` defaults to `["faithfulness", "g_eval"]` when not provided |
| 2.13 | `test_evaluate_sync_custom_evaluators` | `custom_evaluators` defaults to `[]` when not provided |
| 2.14 | `test_playground_evaluate_endpoint` | Calls `POST /api/v1/playground/evaluate` with correct body |
| 2.15 | `test_playground_status_endpoint` | Calls `GET /api/v1/playground/status`, returns fallback on error |
| 2.16 | `test_evaluate_upload_endpoint` | Calls `POST /api/v1/evaluations/sync/upload` multipart |

## 3. Dataset Parsing (`test_dataset.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 3.1 | `test_parse_json_array` | Parses JSON array of objects correctly |
| 3.2 | `test_parse_json_single_object` | Single JSON object → wrapped in array |
| 3.3 | `test_parse_jsonl` | Parses `.jsonl` line-by-line, skips empty lines |
| 3.4 | `test_parse_nonexistent_file` | Graceful error for missing file |
| 3.5 | `test_parse_invalid_json` | Graceful error for malformed JSON |

## 4. Metrics Parsing (`test_metrics.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 4.1 | `test_parse_simple_metrics` | `"faithfulness,g_eval"` → `["faithfulness", "g_eval"]` |
| 4.2 | `test_parse_metrics_with_thresholds` | `"faithfulness:0.90,g_eval:0.75"` → `[{name: "faithfulness", threshold: 0.9}, ...]` |
| 4.3 | `test_parse_metrics_with_min_score_fallback` | `"faithfulness,g_eval"` + min_score=0.8 → all get threshold 0.8 |
| 4.4 | `test_parse_empty_metrics` | Empty/null → default `["faithfulness", "g_eval"]` |
| 4.5 | `test_parse_whitespace_handling` | Trims whitespace around metric names |

## 5. Per-Metric Thresholds (`test_thresholds.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 5.1 | `test_parse_thresholds_string` | `"faithfulness:0.90,g_eval:0.75"` → parsed dict |
| 5.2 | `test_parse_empty_thresholds` | Empty string → empty dict |
| 5.3 | `test_parse_invalid_threshold_value` | `"faithfulness:abc"` → skipped, doesn't crash |
| 5.4 | `test_min_score_and_thresholds_combined` | Both `--min-score` and `--thresholds` coexist |

## 6. Output Formatters (`test_formatters.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 6.1 | `test_json_output_passed_true` | `passed: true` and `failed_queries` count correct when all pass |
| 6.2 | `test_json_output_passed_false` | `passed: false` when some queries fail |
| 6.3 | `test_json_output_structure` | All expected keys present in JSON output |
| 6.4 | `test_json_output_tokens` | `input_tokens`/`output_tokens` correctly propagated |
| 6.5 | `test_junit_output_header` | XML tag with correct `tests`, `failures`, `errors` counts |
| 6.6 | `test_junit_output_passing_testcase` | Passing query → `<testcase>` with no `<failure>` |
| 6.7 | `test_junit_output_failing_testcase` | Failing query → `<testcase>` with `<failure>` containing details |
| 6.8 | `test_junit_output_xml_escaping` | Special chars in queries escaped (`&`, `<`, `>`, `"`, `'`) |
| 6.9 | `test_table_output_does_not_throw` | Table formatter runs without errors |
| 6.10 | `test_table_output_empty_results` | Empty results array handled gracefully |

## 7. CLI Commands — `login` (`test_cli_login.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 7.1 | `test_login_with_api_key_flag` | Non-interactive login with `--api-key` |
| 7.2 | `test_login_with_invalid_key` | Bad API key → exit code 2, error message |
| 7.3 | `test_login_with_empty_key` | Empty key → exit code 2, error message |
| 7.4 | `test_login_saves_global_config` | Key + engine URL persisted to global config file |

## 8. CLI Commands — `whoami` (`test_cli_whoami.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 8.1 | `test_whoami_not_logged_in` | No key → exit code 2, "Not logged in" message |
| 8.2 | `test_whoami_with_valid_key` | Shows tenant name, tier, evals, tokens |
| 8.3 | `test_whoami_with_api_key_flag` | `--api-key` flag overrides config |

## 9. CLI Commands — `quick` (`test_cli_quick.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 9.1 | `test_quick_no_query_no_dataset` | Neither provided → exit code 2, error message |
| 9.2 | `test_quick_single_query` | Query argument → calls playground with single row |
| 9.3 | `test_quick_with_expected_output` | `--expected` flag adds `expected_output` to row |
| 9.4 | `test_quick_with_dataset_json` | `--dataset` flag → reads and sends rows |
| 9.5 | `test_quick_with_dataset_jsonl` | `--dataset` with `.jsonl` → reads line-by-line |
| 9.6 | `test_quick_with_metrics_thresholds` | `--metrics faithfulness:0.90,g_eval:0.75` parsed correctly |
| 9.7 | `test_quick_with_min_score` | `--min-score 0.80` applied as threshold to all metrics |
| 9.8 | `test_quick_playground_exhausted` | Remaining=0 → exit code 2, "limit reached" message |
| 9.9 | `test_quick_min_score_exit_code` | Score below min-score → exit code 1 |

## 10. CLI Commands — `eval` (`test_cli_eval.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 10.1 | `test_eval_missing_agent` | No `--agent` → exit code 2, error message |
| 10.2 | `test_eval_missing_data_source` | No `--dataset` or `--rows` → exit code 2 |
| 10.3 | `test_eval_missing_api_key` | Not logged in → exit code 2, "API key required" |
| 10.4 | `test_eval_with_dataset` | `--dataset` flag → reads and evaluates |
| 10.5 | `test_eval_with_inline_rows` | `--rows '[{"input":"hi"}]'` → parses and evaluates |
| 10.6 | `test_eval_with_thresholds` | `--thresholds faithfulness:0.90,g_eval:0.75` → sent in body |
| 10.7 | `test_eval_with_min_score` | `--min-score` → exit code 1 if overall_score < threshold |
| 10.8 | `test_eval_with_custom_evaluator` | `--custom '{"name":"polite","prompt":"...","threshold":0.8}'` |
| 10.9 | `test_eval_with_custom_evaluator_array` | `--custom '[{...},{...}]'` array of custom evaluators |
| 10.10 | `test_eval_json_format` | `--format json` → valid JSON on stdout |
| 10.11 | `test_eval_junit_format` | `--format junit` → valid XML on stdout |
| 10.12 | `test_eval_ci_mode` | `--ci` flag suppresses colors/prompts |
| 10.13 | `test_eval_connection_error_exit_code` | Cannot connect → exit code 3 |
| 10.14 | `test_eval_api_error_exit_code` | API returns 4xx/5xx → exit code 2 |
| 10.15 | `test_eval_agent_format` | `--agent-format claude` sent in request body |
| 10.16 | `test_eval_judge_model` | `--judge-model` sent in request body |
| 10.17 | `test_eval_eval_name` | `--name "My eval"` sent in request body |
| 10.18 | `test_eval_api_key_flag_override` | `--api-key` flag overrides config |
| 10.19 | `test_eval_engine_url_flag_override` | `--engine-url` flag overrides config |

## 11. CLI Commands — `config` (`test_cli_config.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 11.1 | `test_config_show` | `config show` prints valid JSON with current config |
| 11.2 | `test_config_set_valid_key` | `config set engine-url https://x.com` → "✅ engine-url = ..." |
| 11.3 | `test_config_set_invalid_key` | `config set bad-key val` → exit code 2, error message |
| 11.4 | `test_config_set_min_score_number` | `config set default-min-score 0.80` → stores as number |
| 11.5 | `test_config_set_min_score_invalid` | `config set default-min-score abc` → exit code 2 |
| 11.6 | `test_config_unset` | `config unset engine-url` → removes key |
| 11.7 | `test_config_unset_missing_key` | `config unset missing-key` → "was not set" (no error) |

## 12. CLI Commands — `init` (`test_cli_init.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 12.1 | `test_init_creates_config` | Creates `aievaluator.config.json` with defaults |
| 12.2 | `test_init_creates_evals_dir_and_dataset` | Creates `evals/smoke-test.json` with 3 example queries |
| 12.3 | `test_init_updates_gitignore` | Adds `aievaluator.config.json` to `.gitignore` |
| 12.4 | `test_init_idempotent_config` | Second run → "already exists, skipping" for config |
| 12.5 | `test_init_idempotent_dataset` | Second run → "already exists, skipping" for dataset |
| 12.6 | `test_init_no_duplicate_gitignore` | Second run → doesn't add duplicate `.gitignore` entry |

## 13. Exit Codes (`test_exit_codes.test.ts`)

| # | Test | What it verifies |
|---|------|-----------------|
| 13.1 | `test_exit_code_0` | Successful eval → exit code 0 |
| 13.2 | `test_exit_code_1_score_below` | Score below min-score → exit code 1 |
| 13.3 | `test_exit_code_1_any_row_failed` | Any row failed → exit code 1 |
| 13.4 | `test_exit_code_2_config_error` | Invalid config/args → exit code 2 |
| 13.5 | `test_exit_code_3_connection_error` | Cannot connect → exit code 3 |

---

**Total: 85 tests** (same across Python, Node.js, Go, C#)

**Test framework:** `vitest` + `msw` (for HTTP mocking)
