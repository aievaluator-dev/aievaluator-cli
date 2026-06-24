using System.CommandLine;
using System.Text.Json;
using AiEvaluator;
using AiEvaluator.Formatters;

// ---- helpers ----

object[] ParseDatasetFile(string filePath)
{
    var text = File.ReadAllText(filePath);
    if (filePath.EndsWith(".jsonl", StringComparison.OrdinalIgnoreCase))
    {
        return text.Trim().Split('\n')
            .Select(line => line.Trim())
            .Where(line => !string.IsNullOrEmpty(line))
            .Select(line => JsonSerializer.Deserialize<JsonElement>(line)!)
            .Cast<object>()
            .ToArray();
    }
    var parsed = JsonSerializer.Deserialize<JsonElement>(text);
    if (parsed.ValueKind == JsonValueKind.Array)
        return parsed.EnumerateArray().Cast<object>().ToArray();
    return new object[] { parsed };
}

static readonly object[] SmokeTestDataset = new object[]
{
    new Dictionary<string, object?> { ["input"] = "What is 2+2?", ["expected_output"] = "4" },
    new Dictionary<string, object?> { ["input"] = "What is the capital of France?", ["expected_output"] = "Paris" },
    new Dictionary<string, object?> { ["input"] = "Say hello in Spanish", ["expected_output"] = "Hola" },
};

var apiKeyOption = new Option<string?>("--api-key", "API key");
var engineUrlOption = new Option<string?>("--engine-url", "Engine URL");
var agentOption = new Option<string?>("--agent", "Agent endpoint URL");
var datasetOption = new Option<string?>("--dataset", "JSON dataset file");
var rowsOption = new Option<string?>("--rows", "Inline JSON array");
var metricsOption = new Option<string?>("--metrics", "Metrics (comma-separated)");
var agentFormatOption = new Option<string?>("--agent-format", () => "openai", "Agent API format");
var minScoreOption = new Option<string?>("--min-score", "Minimum score threshold (0-1)");
var formatOption = new Option<string?>("--format", () => "table", "Output format: table, json, junit");
var ciOption = new Option<bool>("--ci", "CI mode");
var timeoutOption = new Option<string?>("--timeout", () => "300", "Timeout in seconds");
var judgeModelOption = new Option<string?>("--judge-model", "LLM judge model");
var nameOption = new Option<string?>("--name", "Human-readable name for this evaluation");
var judgeOption = new Option<string?>("--judge", "LLM judge model (for quick)");
var expectedOption = new Option<string?>("--expected", "Expected output");

var rootCommand = new RootCommand("AI Evaluator CLI — evaluate your LLM agents from the command line");

// ═══ login ═══
var loginCmd = new Command("login", "Authenticate with AI Evaluator");
var loginApiKey = new Option<string?>("--api-key", "API key (non-interactive)");
var loginEngineUrl = new Option<string?>("--engine-url", "Engine URL");
loginCmd.AddOption(loginApiKey);
loginCmd.AddOption(loginEngineUrl);
loginCmd.SetHandler(async (apiKey, engineUrl) =>
{
    var key = apiKey;
    if (string.IsNullOrEmpty(key))
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine("Enter your AI Evaluator API key:");
        Console.Error.WriteLine("(Get one at https://aievaluator.dev/settings)");
        Console.Error.Write("API key: ");
        key = Console.ReadLine()?.Trim();
    }
    if (string.IsNullOrEmpty(key)) { Console.Error.WriteLine("❌ API key cannot be empty."); Environment.Exit(2); }

    var url = Config.ResolveEngineUrl(engineUrl);
    var client = new ApiClient(url, key, 30);

    try
    {
        var usage = await client.GetUsage();
        var cfg = Config.Load();
        cfg.ApiKey = key;
        cfg.EngineUrl = url;
        Config.Save(cfg);

        var tenantName = usage.TryGetProperty("tenant_name", out var tn) ? tn.GetString() : "Unknown";
        var tier = usage.TryGetProperty("tier", out var t) ? t.GetString() : "unknown";
        var evalsUsed = usage.TryGetProperty("evaluations_this_cycle", out var eu) ? eu.GetDouble() : 0;
        var evalsLimit = usage.TryGetProperty("evaluations_limit", out var el) ? el.GetDouble() : double.PositiveInfinity;

        Console.WriteLine();
        Console.WriteLine($"✅ Logged in as {tenantName} ({tier})");
        Console.WriteLine($"   Evals: {evalsUsed}/{evalsLimit} this cycle");
        Console.WriteLine("   Config saved to ~/.config/aievaluator/config.json");
    }
    catch (ApiError e) { Console.Error.WriteLine($"❌ {e.Message}"); Environment.Exit(2); }
}, loginApiKey, loginEngineUrl);
rootCommand.AddCommand(loginCmd);

// ═══ whoami ═══
var whoamiCmd = new Command("whoami", "Show current tenant info");
whoamiCmd.AddOption(apiKeyOption);
whoamiCmd.SetHandler(async (apiKey) =>
{
    var key = Config.ResolveApiKey(apiKey);
    if (string.IsNullOrEmpty(key)) { Console.Error.WriteLine("❌ Not logged in. Run: aievaluator login"); Environment.Exit(2); }

    var url = Config.ResolveEngineUrl(null);
    var client = new ApiClient(url, key, 30);

    try
    {
        var usage = await client.GetUsage();
        var tenantName = usage.TryGetProperty("tenant_name", out var tn) ? tn.GetString() : "Unknown";
        var tier = usage.TryGetProperty("tier", out var t) ? t.GetString() : "unknown";
        var evalsUsed = usage.TryGetProperty("evaluations_this_cycle", out var eu) ? eu.GetDouble() : 0;
        var evalsLimit = usage.TryGetProperty("evaluations_limit", out var el) ? el.GetDouble() : double.PositiveInfinity;
        var tin = usage.TryGetProperty("input_tokens_this_cycle", out var ti) ? ti.GetDouble() : 0;
        var tout = usage.TryGetProperty("output_tokens_this_cycle", out var to) ? to.GetDouble() : 0;

        Console.WriteLine();
        Console.WriteLine($"Tenant:  {tenantName}");
        Console.WriteLine($"Tier:    {tier}");
        Console.WriteLine($"Evals:   {evalsUsed}/{evalsLimit} this cycle");
        Console.WriteLine($"Tokens:  ↓{tin} · ↑{tout} this cycle");
    }
    catch (ApiError e) { Console.Error.WriteLine($"❌ {e.Message}"); Environment.Exit(2); }
}, apiKeyOption);
rootCommand.AddCommand(whoamiCmd);

// ═══ quick ═══
var quickCmd = new Command("quick", "Quick eval via playground (no API key)");
var quickQueryArg = new Argument<string?>("query", () => null, "Query to evaluate");
quickCmd.AddArgument(quickQueryArg);
var quickDataset = new Option<string?>("--dataset", "JSON dataset file");
var quickAgent = new Option<string?>("--agent", () => "/chat", "Agent endpoint URL");
var quickExpected = new Option<string?>("--expected", "Expected output");
var quickMetrics = new Option<string?>("--metrics", "Metrics (comma-separated)");
var quickJudge = new Option<string?>("--judge", "LLM judge model");
var quickEngineUrl = new Option<string?>("--engine-url", "Engine URL");
quickCmd.AddOption(quickDataset);
quickCmd.AddOption(quickAgent);
quickCmd.AddOption(quickExpected);
quickCmd.AddOption(quickMetrics);
quickCmd.AddOption(quickJudge);
quickCmd.AddOption(quickEngineUrl);
quickCmd.SetHandler(async (query, dataset, agent, expected, metricsStr, minScoreStr, judge, engineUrl) =>
{
    if (string.IsNullOrEmpty(query) && string.IsNullOrEmpty(dataset)) { Console.Error.WriteLine("❌ Provide a query or --dataset"); Environment.Exit(2); }

    var url = Config.ResolveEngineUrl(engineUrl);
    var client = new ApiClient(url, null, 30);

    var status = await client.PlaygroundStatus();
    var remaining = status.TryGetValue("remaining", out var rem) ? rem.GetDouble() : 5;
    var limit = status.TryGetValue("limit", out var lim) ? lim.GetDouble() : 5;
    var resets = status.TryGetValue("resets_at", out var rst) ? rst.GetString() : "midnight UTC";
    Console.Error.WriteLine($"⚠️  Playground mode — {remaining}/{limit} remaining (resets at {resets})\n");

    if (remaining <= 0) { Console.Error.WriteLine("❌ Playground limit reached. Run `aievaluator login` for 100 free evals/month."); Environment.Exit(2); }

    object[] rows;
    if (!string.IsNullOrEmpty(query))
    {
        var row = new Dictionary<string, object?> { ["input"] = query };
        if (!string.IsNullOrEmpty(expected)) row["expected_output"] = expected;
        rows = new object[] { row };
    }
    else
    {
        try { rows = ParseDatasetFile(dataset!); }
        catch (Exception ex) { Console.Error.WriteLine($"❌ Cannot read dataset: {ex.Message}"); Environment.Exit(2); return; }
    }

    // Parse metrics: strings or dicts with thresholds
    var quickMinScoreVal = string.IsNullOrEmpty(minScoreStr) ? 0.0 : double.Parse(minScoreStr);
    List<object>? metricsList = null;
    if (!string.IsNullOrEmpty(metricsStr))
    {
        metricsList = new List<object>();
        foreach (var item in metricsStr.Split(',').Select(m => m.Trim()))
        {
            if (item.Contains(':'))
            {
                var parts = item.Split(':', 2);
                if (double.TryParse(parts[1].Trim(), out var tv))
                    metricsList.Add(new Dictionary<string, object?> { ["name"] = parts[0].Trim(), ["threshold"] = tv });
            }
            else if (quickMinScoreVal > 0)
                metricsList.Add(new Dictionary<string, object?> { ["name"] = item, ["threshold"] = quickMinScoreVal });
            else
                metricsList.Add(item);
        }
    }
    else if (quickMinScoreVal > 0)
    {
        metricsList = new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "faithfulness", ["threshold"] = quickMinScoreVal },
            new Dictionary<string, object?> { ["name"] = "g_eval", ["threshold"] = quickMinScoreVal },
        };
    }

    var agentUrl = string.IsNullOrEmpty(agent) ? "/chat" : agent;

    try
    {
        var result = await client.PlaygroundEvaluate(null, rows, agentUrl, metricsList?.ToArray(), judge);
        OutputFormatter.FormatTable(result, quickMinScoreVal, url);

        if (quickMinScoreVal > 0)
        {
            var results = result.TryGetProperty("results", out var r) ? r.EnumerateArray() : default;
            var allPassed = true;
            foreach (var res in results)
                if (res.TryGetProperty("passed", out var p) && !p.GetBoolean())
                    allPassed = false;
            if (!allPassed) Environment.Exit(1);
        }
    }
    catch (ApiError e) { Console.Error.WriteLine($"❌ {e.Message}"); Environment.Exit(2); }
}, quickQueryArg, quickDataset, quickAgent, quickExpected, quickMetrics, quickMinScore, quickJudge, quickEngineUrl);
rootCommand.AddCommand(quickCmd);

// ═══ eval ═══
var evalCmd = new Command("eval", "Full evaluation against an agent");
var evalAgent = new Option<string?>("--agent", "Agent endpoint URL");
var evalDataset = new Option<string?>("--dataset", "JSON dataset file");
var evalRows = new Option<string?>("--rows", "Inline JSON array");
var evalMetrics = new Option<string?>("--metrics", "Metrics (comma-separated)");
var evalAgentFormat = new Option<string?>("--agent-format", () => "openai", "Agent API format");
var evalMinScore = new Option<string?>("--min-score", "Minimum score threshold (0-1)");
var evalFormat = new Option<string?>("--format", () => "table", "Output format: table, json, junit");
var evalCi = new Option<bool>("--ci", "CI mode");
var evalTimeout = new Option<string?>("--timeout", () => "300", "Timeout in seconds");
var evalJudgeModel = new Option<string?>("--judge-model", "LLM judge model");
var evalName = new Option<string?>("--name", "Human-readable name for this evaluation");
var evalApiKey = new Option<string?>("--api-key", "API key (overrides config)");
var evalEngineUrl = new Option<string?>("--engine-url", "Engine URL");
evalCmd.AddOption(evalAgent);
evalCmd.AddOption(evalDataset);
evalCmd.AddOption(evalRows);
evalCmd.AddOption(evalMetrics);
evalCmd.AddOption(evalAgentFormat);
evalCmd.AddOption(evalMinScore);
evalCmd.AddOption(evalThresholds);
evalCmd.AddOption(evalCustom);
evalCmd.AddOption(evalFormat);
evalCmd.AddOption(evalCi);
evalCmd.AddOption(evalTimeout);
evalCmd.AddOption(evalJudgeModel);
evalCmd.AddOption(evalName);
evalCmd.AddOption(evalApiKey);
evalCmd.AddOption(evalEngineUrl);
evalCmd.SetHandler(async (agent, dataset, rowsStr, metricsStr, agentFormat, minScoreStr, thresholdsStr, customStr, format, ci, timeoutStr, judgeModel, name, apiKey, engineUrl) =>
{
    if (string.IsNullOrEmpty(agent)) { Console.Error.WriteLine("❌ --agent is required"); Environment.Exit(2); }
    if (string.IsNullOrEmpty(dataset) && string.IsNullOrEmpty(rowsStr)) { Console.Error.WriteLine("❌ Provide --dataset or --rows"); Environment.Exit(2); }

    var key = Config.ResolveApiKey(apiKey);
    if (string.IsNullOrEmpty(key)) { Console.Error.WriteLine("❌ API key required. Run: aievaluator login"); Environment.Exit(2); }

    var timeout = int.TryParse(timeoutStr, out var t) ? t : 300;
    var url = Config.ResolveEngineUrl(engineUrl);
    var client = new ApiClient(url, key, timeout);

    var metricsList = string.IsNullOrEmpty(metricsStr) ? Config.ResolveDefaultMetrics().Split(',') : metricsStr.Split(',').Select(m => m.Trim()).ToArray();
    var minScore = string.IsNullOrEmpty(minScoreStr) ? Config.ResolveDefaultMinScore() : double.Parse(minScoreStr);

    // Parse per-metric thresholds
    var thresholds = new Dictionary<string, double>();
    if (!string.IsNullOrEmpty(thresholdsStr))
        foreach (var pair in thresholdsStr.Split(','))
        {
            var parts = pair.Trim().Split(':', 2);
            if (parts.Length == 2 && double.TryParse(parts[1].Trim(), out var tv))
                thresholds[parts[0].Trim()] = tv;
        }

    // Parse inline custom evaluators (CU3)
    List<object>? customEvaluators = null;
    if (!string.IsNullOrEmpty(customStr))
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<JsonElement>(customStr);
            customEvaluators = parsed.ValueKind == JsonValueKind.Array
                ? parsed.EnumerateArray().Cast<object>().ToList()
                : new List<object> { parsed };
        }
        catch { Console.Error.WriteLine("❌ Invalid JSON in --custom"); Environment.Exit(2); }
    }

    JsonElement result;
    try
    {
        object[] rows;
        if (!string.IsNullOrEmpty(dataset))
        {
            try { rows = ParseDatasetFile(dataset); }
            catch (Exception ex) { Console.Error.WriteLine($"❌ Cannot read dataset: {ex.Message}"); Environment.Exit(2); return; }
        }
        else
        {
            rows = JsonSerializer.Deserialize<object[]>(rowsStr!) ?? Array.Empty<object>();
        }
        result = await client.EvaluateSync(rows, agent, agentFormat, metricsList, judgeModel, name, thresholds, customEvaluators);
    }
    catch (ApiError e)
    {
        Console.Error.WriteLine($"❌ {e.Message}");
        if (e.Detail != null) Console.Error.WriteLine(JsonSerializer.Serialize(e.Detail));
        Environment.Exit(e.StatusCode == 0 ? 3 : 2);
        return;
    }

    switch (format)
    {
        case "json": Console.WriteLine(OutputFormatter.FormatJson(result, minScore)); break;
        case "junit": Console.WriteLine(OutputFormatter.FormatJUnit(result, minScore)); break;
        default: OutputFormatter.FormatTable(result, minScore, url); break;
    }

    var score = result.TryGetProperty("overall_score", out var os) ? os.GetDouble() : 0;
    if (score < minScore) Environment.Exit(1);
}, evalAgent, evalDataset, evalRows, evalMetrics, evalAgentFormat, evalMinScore,
   evalThresholds, evalCustom, evalFormat, evalCi, evalTimeout, evalJudgeModel, evalName, evalApiKey, evalEngineUrl);
rootCommand.AddCommand(evalCmd);

// ═══ config ═══
var configCmd = new Command("config", "Manage CLI configuration");

var configShowCmd = new Command("show", "Show current configuration");
configShowCmd.SetHandler(() =>
{
    var g = Config.Load(true);
    var l = Config.Load(false);
    var merged = new Dictionary<string, object?>();
    if (!string.IsNullOrEmpty(g.ApiKey) || !string.IsNullOrEmpty(l.ApiKey)) merged["api_key"] = l.ApiKey ?? g.ApiKey;
    merged["engine_url"] = Config.ResolveEngineUrl(null);
    if (!string.IsNullOrEmpty(l.DefaultMetrics) || !string.IsNullOrEmpty(g.DefaultMetrics)) merged["default_metrics"] = l.DefaultMetrics ?? g.DefaultMetrics;
    if (l.DefaultMinScore > 0 || g.DefaultMinScore > 0) merged["default_min_score"] = l.DefaultMinScore > 0 ? l.DefaultMinScore : g.DefaultMinScore;
    Console.WriteLine(JsonSerializer.Serialize(merged, new JsonSerializerOptions { WriteIndented = true }));
});
configCmd.AddCommand(configShowCmd);

var configSetCmd = new Command("set", "Set a configuration value");
var setKeyArg = new Argument<string>("key");
var setValueArg = new Argument<string>("value");
configSetCmd.AddArgument(setKeyArg);
configSetCmd.AddArgument(setValueArg);
configSetCmd.SetHandler((key, value) =>
{
    var valid = new[] { "engine-url", "default-metrics", "default-min-score" };
    if (!valid.Contains(key)) { Console.Error.WriteLine($"❌ Invalid key: {key}"); Environment.Exit(2); }
    var cfgKey = key switch { "engine-url" => "EngineUrl", "default-metrics" => "DefaultMetrics", "default-min-score" => "DefaultMinScore", _ => key };
    var cfg = Config.Load();
    var prop = typeof(Config).GetProperty(cfgKey);
    if (prop != null)
    {
        if (prop.PropertyType == typeof(double))
            prop.SetValue(cfg, double.Parse(value));
        else
            prop.SetValue(cfg, value);
    }
    Config.Save(cfg);
    Console.WriteLine($"✅ {key} = {value}");
}, setKeyArg, setValueArg);
configCmd.AddCommand(configSetCmd);

var configUnsetCmd = new Command("unset", "Remove a configuration value");
var unsetKeyArg = new Argument<string>("key");
configUnsetCmd.AddArgument(unsetKeyArg);
configUnsetCmd.SetHandler((key) =>
{
    var cfgKey = key switch { "engine-url" => "EngineUrl", "default-metrics" => "DefaultMetrics", "default-min-score" => "DefaultMinScore", _ => key };
    var cfg = Config.Load();
    var prop = typeof(Config).GetProperty(cfgKey);
    if (prop != null)
    {
        if (prop.PropertyType == typeof(double)) prop.SetValue(cfg, 0.0);
        else prop.SetValue(cfg, null);
    }
    Config.Save(cfg);
    Console.WriteLine($"✅ {key} removed");
}, unsetKeyArg);
configCmd.AddCommand(configUnsetCmd);
rootCommand.AddCommand(configCmd);

// ═══ init ═══
var initCmd = new Command("init", "Initialize a new AI Evaluator project");
initCmd.SetHandler(() =>
{
    var cwd = Directory.GetCurrentDirectory();

    // 1. aievaluator.config.json
    var configPath = Path.Combine(cwd, "aievaluator.config.json");
    if (File.Exists(configPath))
    {
        Console.WriteLine("⏭️  aievaluator.config.json already exists, skipping");
    }
    else
    {
        var defaults = new Dictionary<string, object?>
        {
            ["engine_url"] = "https://api.aievaluator.dev",
            ["default_metrics"] = "faithfulness,g_eval",
            ["default_min_score"] = 0.80,
        };
        File.WriteAllText(configPath, JsonSerializer.Serialize(defaults, new JsonSerializerOptions { WriteIndented = true }) + "\n");
        Console.WriteLine("✅ Created aievaluator.config.json");
    }

    // 2. evals/ + smoke-test.json
    var evalsDir = Path.Combine(cwd, "evals");
    Directory.CreateDirectory(evalsDir);
    var smokePath = Path.Combine(evalsDir, "smoke-test.json");
    if (File.Exists(smokePath))
    {
        Console.WriteLine("⏭️  evals/smoke-test.json already exists, skipping");
    }
    else
    {
        File.WriteAllText(smokePath, JsonSerializer.Serialize(SmokeTestDataset, new JsonSerializerOptions { WriteIndented = true }) + "\n");
        Console.WriteLine("✅ Created evals/smoke-test.json (3 example queries)");
    }

    // 3. .gitignore
    var gitignorePath = Path.Combine(cwd, ".gitignore");
    var entry = "aievaluator.config.json";
    var existing = File.Exists(gitignorePath) ? File.ReadAllText(gitignorePath) : "";
    if (!existing.Contains(entry))
    {
        var content = (existing.Length > 0 && !existing.EndsWith("\n") ? "\n" : "") + entry + "\n";
        File.AppendAllText(gitignorePath, content);
        Console.WriteLine($"✅ Added {entry} to .gitignore");
    }

    Console.WriteLine();
    Console.WriteLine("Next steps:");
    Console.WriteLine("  aievaluator quick --dataset ./evals/smoke-test.json");
    Console.WriteLine("  aievaluator login    (for 100 free evals/month)");
    Console.WriteLine();
});
rootCommand.AddCommand(initCmd);

return await rootCommand.InvokeAsync(args);
