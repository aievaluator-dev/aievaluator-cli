# Test Plan — AI Evaluator CLI (Go)

> Same test suite shared across all language implementations (Python, Node.js, Go, C#).
> Every test must pass identically across all targets.

---

## 1. Config Module (`internal/config_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 1.1 | `TestAPIKeyFlagPriority` | `--api-key` flag wins over env, local, and global config |
| 1.2 | `TestAPIKeyEnvPriority` | `AIEVALUATOR_API_KEY` env var wins over local/global config |
| 1.3 | `TestAPIKeyLocalConfig` | Project-local `aievaluator.config.json` wins over global |
| 1.4 | `TestAPIKeyGlobalConfig` | Falls back to `~/.config/aievaluator/config.json` |
| 1.5 | `TestAPIKeyNone` | Returns empty string when no key found anywhere |
| 1.6 | `TestEngineURLFlag` | `--engine-url` flag takes priority |
| 1.7 | `TestEngineURLEnv` | `AIEVALUATOR_ENGINE_URL` env var takes priority |
| 1.8 | `TestEngineURLDefault` | Returns `https://api.aievaluator.dev` when nothing configured |
| 1.9 | `TestEngineURLTrailingSlashStripped` | All resolved URLs strip trailing `/` |
| 1.10 | `TestDefaultMetricsResolution` | Returns `faithfulness,g_eval` from config or default |
| 1.11 | `TestDefaultMinScoreResolution` | Returns `0.0` when not set, config value when set |
| 1.12 | `TestSaveAndLoadGlobalConfig` | Write → read round-trip preserves all fields |
| 1.13 | `TestSaveAndLoadLocalConfig` | Project-local config round-trip |
| 1.14 | `TestLoadNonexistentConfigReturnsEmpty` | Missing files return empty/zero config, never crash |
| 1.15 | `TestLoadInvalidJSONReturnsEmpty` | Corrupt JSON returns empty/zero config, never crash |
| 1.16 | `TestGetAllConfigMergesLocalOverGlobal` | Local keys override global, non-overlapping keys merged |
| 1.17 | `TestGlobalConfigPathPlatform` | Path uses `XDG_CONFIG_HOME` on Linux, `APPDATA` on Windows |

## 2. API Client (`internal/api/client_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 2.1 | `TestClientInitWithKey` | Constructor sets `engine_url`, `api_key`, `timeout` correctly |
| 2.2 | `TestClientInitWithoutKey` | Constructor works without API key (playground mode) |
| 2.3 | `TestHeadersWithKey` | `X-API-Key` header present when key provided |
| 2.4 | `TestHeadersWithoutKey` | `X-API-Key` header absent when no key |
| 2.5 | `TestAPIErrorCreation` | `APIError` stores StatusCode, Message, Detail |
| 2.6 | `TestRequestHTTP4xx` | HTTP 400/429 → returns `APIError` with status code |
| 2.7 | `TestRequestHTTP5xx` | HTTP 500 → returns `APIError` with status code |
| 2.8 | `TestRequestConnectionRefused` | Cannot connect → returns `APIError` with status 0 |
| 2.9 | `TestRequestTimeout` | Timeout → returns `APIError` with status 0 |
| 2.10 | `TestGetUsageEndpoint` | Calls `GET /api/v1/tenants/me/usage` |
| 2.11 | `TestEvaluateSyncEndpoint` | Calls `POST /api/v1/evaluations/sync` with correct body |
| 2.12 | `TestEvaluateSyncDefaultMetrics` | `metrics` defaults to `["faithfulness", "g_eval"]` when not provided |
| 2.13 | `TestEvaluateSyncCustomEvaluators` | `custom_evaluators` defaults to `[]` when not provided |
| 2.14 | `TestPlaygroundEvaluateEndpoint` | Calls `POST /api/v1/playground/evaluate` with correct body |
| 2.15 | `TestPlaygroundStatusEndpoint` | Calls `GET /api/v1/playground/status`, returns fallback on error |
| 2.16 | `TestEvaluateUploadEndpoint` | Calls `POST /api/v1/evaluations/sync/upload` multipart |

## 3. Dataset Parsing (`internal/dataset_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 3.1 | `TestParseJSONArray` | Parses JSON array of objects correctly |
| 3.2 | `TestParseJSONSingleObject` | Single JSON object → wrapped in array |
| 3.3 | `TestParseJSONL` | Parses `.jsonl` line-by-line, skips empty lines |
| 3.4 | `TestParseNonexistentFile` | Graceful error for missing file |
| 3.5 | `TestParseInvalidJSON` | Graceful error for malformed JSON |

## 4. Metrics Parsing (`internal/metrics_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 4.1 | `TestParseSimpleMetrics` | `"faithfulness,g_eval"` → `["faithfulness", "g_eval"]` |
| 4.2 | `TestParseMetricsWithThresholds` | `"faithfulness:0.90,g_eval:0.75"` → `[{name: "faithfulness", threshold: 0.9}, ...]` |
| 4.3 | `TestParseMetricsWithMinScoreFallback` | `"faithfulness,g_eval"` + min_score=0.8 → all get threshold 0.8 |
| 4.4 | `TestParseEmptyMetrics` | Empty/null → default `["faithfulness", "g_eval"]` |
| 4.5 | `TestParseWhitespaceHandling` | Trims whitespace around metric names |

## 5. Per-Metric Thresholds (`internal/thresholds_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 5.1 | `TestParseThresholdsString` | `"faithfulness:0.90,g_eval:0.75"` → parsed dict |
| 5.2 | `TestParseEmptyThresholds` | Empty string → empty dict |
| 5.3 | `TestParseInvalidThresholdValue` | `"faithfulness:abc"` → skipped, doesn't crash |
| 5.4 | `TestMinScoreAndThresholdsCombined` | Both `--min-score` and `--thresholds` coexist |

## 6. Output Formatters (`internal/formatters/formatter_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 6.1 | `TestJSONOutputPassedTrue` | `passed: true` and `failed_queries` count correct when all pass |
| 6.2 | `TestJSONOutputPassedFalse` | `passed: false` when some queries fail |
| 6.3 | `TestJSONOutputStructure` | All expected keys present in JSON output |
| 6.4 | `TestJSONOutputTokens` | `input_tokens`/`output_tokens` correctly propagated |
| 6.5 | `TestJUnitOutputHeader` | XML tag with correct `tests`, `failures`, `errors` counts |
| 6.6 | `TestJUnitOutputPassingTestcase` | Passing query → `<testcase>` with no `<failure>` |
| 6.7 | `TestJUnitOutputFailingTestcase` | Failing query → `<testcase>` with `<failure>` containing details |
| 6.8 | `TestJUnitOutputXMLEscaping` | Special chars in queries escaped (`&`, `<`, `>`, `"`, `'`) |
| 6.9 | `TestTableOutputDoesNotThrow` | Table formatter runs without errors |
| 6.10 | `TestTableOutputEmptyResults` | Empty results array handled gracefully |

## 7. CLI Commands — `login` (`cmd/aievaluator/login_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 7.1 | `TestLoginWithAPIKeyFlag` | Non-interactive login with `--api-key` |
| 7.2 | `TestLoginWithInvalidKey` | Bad API key → exit code 2, error message |
| 7.3 | `TestLoginWithEmptyKey` | Empty key → exit code 2, error message |
| 7.4 | `TestLoginSavesGlobalConfig` | Key + engine URL persisted to global config file |

## 8. CLI Commands — `whoami` (`cmd/aievaluator/whoami_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 8.1 | `TestWhoamiNotLoggedIn` | No key → exit code 2, "Not logged in" message |
| 8.2 | `TestWhoamiWithValidKey` | Shows tenant name, tier, evals, tokens |
| 8.3 | `TestWhoamiWithAPIKeyFlag` | `--api-key` flag overrides config |

## 9. CLI Commands — `quick` (`cmd/aievaluator/quick_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 9.1 | `TestQuickNoQueryNoDataset` | Neither provided → exit code 2, error message |
| 9.2 | `TestQuickSingleQuery` | Query argument → calls playground with single row |
| 9.3 | `TestQuickWithExpectedOutput` | `--expected` flag adds `expected_output` to row |
| 9.4 | `TestQuickWithDatasetJSON` | `--dataset` flag → reads and sends rows |
| 9.5 | `TestQuickWithDatasetJSONL` | `--dataset` with `.jsonl` → reads line-by-line |
| 9.6 | `TestQuickWithMetricsThresholds` | `--metrics faithfulness:0.90,g_eval:0.75` parsed correctly |
| 9.7 | `TestQuickWithMinScore` | `--min-score 0.80` applied as threshold to all metrics |
| 9.8 | `TestQuickPlaygroundExhausted` | Remaining=0 → exit code 2, "limit reached" message |
| 9.9 | `TestQuickMinScoreExitCode` | Score below min-score → exit code 1 |

## 10. CLI Commands — `eval` (`cmd/aievaluator/eval_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 10.1 | `TestEvalMissingAgent` | No `--agent` → exit code 2, error message |
| 10.2 | `TestEvalMissingDataSource` | No `--dataset` or `--rows` → exit code 2 |
| 10.3 | `TestEvalMissingAPIKey` | Not logged in → exit code 2, "API key required" |
| 10.4 | `TestEvalWithDataset` | `--dataset` flag → reads and evaluates |
| 10.5 | `TestEvalWithInlineRows` | `--rows '[{"input":"hi"}]'` → parses and evaluates |
| 10.6 | `TestEvalWithThresholds` | `--thresholds faithfulness:0.90,g_eval:0.75` → sent in body |
| 10.7 | `TestEvalWithMinScore` | `--min-score` → exit code 1 if overall_score < threshold |
| 10.8 | `TestEvalWithCustomEvaluator` | `--custom '{"name":"polite","prompt":"...","threshold":0.8}'` |
| 10.9 | `TestEvalWithCustomEvaluatorArray` | `--custom '[{...},{...}]'` array of custom evaluators |
| 10.10 | `TestEvalJSONFormat` | `--format json` → valid JSON on stdout |
| 10.11 | `TestEvalJUnitFormat` | `--format junit` → valid XML on stdout |
| 10.12 | `TestEvalCIMode` | `--ci` flag suppresses colors/prompts |
| 10.13 | `TestEvalConnectionErrorExitCode` | Cannot connect → exit code 3 |
| 10.14 | `TestEvalAPIErrorExitCode` | API returns 4xx/5xx → exit code 2 |
| 10.15 | `TestEvalAgentFormat` | `--agent-format claude` sent in request body |
| 10.16 | `TestEvalJudgeModel` | `--judge-model` sent in request body |
| 10.17 | `TestEvalEvalName` | `--name "My eval"` sent in request body |
| 10.18 | `TestEvalAPIKeyFlagOverride` | `--api-key` flag overrides config |
| 10.19 | `TestEvalEngineURLFlagOverride` | `--engine-url` flag overrides config |

## 11. CLI Commands — `config` (`cmd/aievaluator/config_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 11.1 | `TestConfigShow` | `config show` prints valid JSON with current config |
| 11.2 | `TestConfigSetValidKey` | `config set engine-url https://x.com` → "✅ engine-url = ..." |
| 11.3 | `TestConfigSetInvalidKey` | `config set bad-key val` → exit code 2, error message |
| 11.4 | `TestConfigSetMinScoreNumber` | `config set default-min-score 0.80` → stores as number |
| 11.5 | `TestConfigSetMinScoreInvalid` | `config set default-min-score abc` → exit code 2 |
| 11.6 | `TestConfigUnset` | `config unset engine-url` → removes key |
| 11.7 | `TestConfigUnsetMissingKey` | `config unset missing-key` → "was not set" (no error) |

## 12. CLI Commands — `init` (`cmd/aievaluator/init_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 12.1 | `TestInitCreatesConfig` | Creates `aievaluator.config.json` with defaults |
| 12.2 | `TestInitCreatesEvalsDirAndDataset` | Creates `evals/smoke-test.json` with 3 example queries |
| 12.3 | `TestInitUpdatesGitignore` | Adds `aievaluator.config.json` to `.gitignore` |
| 12.4 | `TestInitIdempotentConfig` | Second run → "already exists, skipping" for config |
| 12.5 | `TestInitIdempotentDataset` | Second run → "already exists, skipping" for dataset |
| 12.6 | `TestInitNoDuplicateGitignore` | Second run → doesn't add duplicate `.gitignore` entry |

## 13. Exit Codes (`cmd/aievaluator/exit_codes_test.go`)

| # | Test | What it verifies |
|---|------|-----------------|
| 13.1 | `TestExitCode0` | Successful eval → exit code 0 |
| 13.2 | `TestExitCode1ScoreBelow` | Score below min-score → exit code 1 |
| 13.3 | `TestExitCode1AnyRowFailed` | Any row failed → exit code 1 |
| 13.4 | `TestExitCode2ConfigError` | Invalid config/args → exit code 2 |
| 13.5 | `TestExitCode3ConnectionError` | Cannot connect → exit code 3 |

---

**Total: 85 tests** (same across Python, Node.js, Go, C#)

**Test framework:** `testing` stdlib + `net/http/httptest`
