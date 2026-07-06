using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AiEvaluator;
using AiEvaluator.Api;
using AiEvaluator.Config;

namespace AIEvaluator.VSIX.Services
{
    public class AIEvaluatorService
    {
        private static string? _cachedApiKey;
        private const string ApiKeyStorageKey = "aievaluator.apiKey";
        private const string EngineUrl = "https://api.aievaluator.dev";

        public static async Task<string?> GetApiKeyAsync()
        {
            if (!string.IsNullOrEmpty(_cachedApiKey))
                return _cachedApiKey;

            // Try VS Settings Store
            var settings = new SettingsManager();
            _cachedApiKey = await settings.LoadAsync(ApiKeyStorageKey);

            // Fallback to env
            if (string.IsNullOrEmpty(_cachedApiKey))
                _cachedApiKey = Environment.GetEnvironmentVariable("AIEVALUATOR_API_KEY");

            return _cachedApiKey;
        }

        public static async Task SetApiKeyAsync(string key)
        {
            _cachedApiKey = key;
            var settings = new SettingsManager();
            await settings.SaveAsync(ApiKeyStorageKey, key);
        }

        public static async Task<JsonDocument?> EvaluateSelectionAsync(string query, string agentUrl = "/chat",
            List<string>? metrics = null, Dictionary<string, double>? thresholds = null)
        {
            var apiKey = await GetApiKeyAsync();
            var client = new ApiClient(EngineUrl, apiKey, 30);

            var rows = new[]
            {
                new Dictionary<string, object>
                {
                    ["input"] = query
                }
            };

            try
            {
                if (!string.IsNullOrEmpty(apiKey))
                {
                    var result = await Task.Run(() =>
                        client.EvaluateSync(
                            rows.Select(r => JsonSerializer.SerializeToElement(r)).ToList(),
                            agentUrl,
                            "openai",
                            metrics ?? new List<string> { "faithfulness", "g_eval" },
                            null, null,
                            thresholds,
                            null
                        ));
                    return JsonDocument.Parse(result.ToString());
                }
                else
                {
                    var result = await Task.Run(() =>
                        client.PlaygroundEvaluate(
                            null,
                            rows.Select(r => JsonSerializer.SerializeToElement(r)).ToList(),
                            agentUrl,
                            metrics?.Select(m => (object)new { name = m, threshold = 0.7 }).ToList(),
                            null
                        ));
                    return JsonDocument.Parse(result.ToString());
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Evaluation failed: {ex.Message}", ex);
            }
        }

        public static async Task<JsonDocument?> EvaluateDatasetAsync(string filePath, string agentUrl = "/chat",
            List<string>? metrics = null, Dictionary<string, double>? thresholds = null)
        {
            var apiKey = await GetApiKeyAsync();
            var client = new ApiClient(EngineUrl, apiKey, 60);

            List<Dictionary<string, object>> rows;
            var raw = File.ReadAllText(filePath);
            if (filePath.EndsWith(".jsonl"))
            {
                rows = raw.Split('\n')
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .Select(l => JsonSerializer.Deserialize<Dictionary<string, object>>(l)!)
                    .ToList();
            }
            else
            {
                var parsed = JsonSerializer.Deserialize<JsonElement>(raw);
                rows = parsed.ValueKind == JsonValueKind.Array
                    ? JsonSerializer.Deserialize<List<Dictionary<string, object>>>(raw)!
                    : new List<Dictionary<string, object>> { JsonSerializer.Deserialize<Dictionary<string, object>>(raw)! };
            }

            try
            {
                if (!string.IsNullOrEmpty(apiKey))
                {
                    var result = await Task.Run(() =>
                        client.EvaluateSync(
                            rows.Select(r => JsonSerializer.SerializeToElement(r)).ToList(),
                            agentUrl,
                            "openai",
                            metrics ?? new List<string> { "faithfulness", "g_eval" },
                            null, null,
                            thresholds,
                            null
                        ));
                    return JsonDocument.Parse(result.ToString());
                }
                else
                {
                    var result = await Task.Run(() =>
                        client.PlaygroundEvaluate(
                            null,
                            rows.Select(r => JsonSerializer.SerializeToElement(r)).ToList(),
                            agentUrl,
                            metrics?.Select(m => (object)new { name = m, threshold = 0.7 }).ToList(),
                            null
                        ));
                    return JsonDocument.Parse(result.ToString());
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Dataset evaluation failed: {ex.Message}", ex);
            }
        }

        public static void InitProject(string projectDir)
        {
            var configPath = Path.Combine(projectDir, "aievaluator.config.json");
            if (!File.Exists(configPath))
            {
                var config = new Dictionary<string, object>
                {
                    ["engine_url"] = "https://api.aievaluator.dev",
                    ["default_metrics"] = "faithfulness,g_eval",
                    ["default_min_score"] = 0.80,
                };
                File.WriteAllText(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
            }

            var evalsDir = Path.Combine(projectDir, "evals");
            Directory.CreateDirectory(evalsDir);

            var smokePath = Path.Combine(evalsDir, "smoke-test.json");
            if (!File.Exists(smokePath))
            {
                var dataset = new[]
                {
                    new { input = "What is 2+2?", expected_output = "4" },
                    new { input = "What is the capital of France?", expected_output = "Paris" },
                    new { input = "Say hello in Spanish", expected_output = "Hola" },
                };
                File.WriteAllText(smokePath, JsonSerializer.Serialize(dataset, new JsonSerializerOptions { WriteIndented = true }));
            }

            var resultsDir = Path.Combine(projectDir, "results");
            Directory.CreateDirectory(resultsDir);
        }
    }
}
