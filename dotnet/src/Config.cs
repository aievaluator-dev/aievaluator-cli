using System.Text.Json;

namespace AiEvaluator;

public class Config
{
    public string? ApiKey { get; set; }
    public string? EngineUrl { get; set; }
    public string? DefaultMetrics { get; set; }
    public double DefaultMinScore { get; set; }

    private static string GlobalPath()
    {
        var xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var baseDir = string.IsNullOrEmpty(xdg) ? Path.Combine(home, ".config") : xdg;
        return Path.Combine(baseDir, "aievaluator", "config.json");
    }

    private static Dictionary<string, JsonElement>? LoadJson(string path)
    {
        if (!File.Exists(path)) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(File.ReadAllText(path)); }
        catch { return null; }
    }

    private static void SaveJson(string path, object data)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true }));
    }

    public static Config Load(bool global = true)
    {
        var path = global ? GlobalPath() : "aievaluator.config.json";
        var dict = LoadJson(path);
        var cfg = new Config();
        if (dict == null) return cfg;
        if (dict.TryGetValue("api_key", out var ak)) cfg.ApiKey = ak.GetString();
        if (dict.TryGetValue("engine_url", out var eu)) cfg.EngineUrl = eu.GetString();
        if (dict.TryGetValue("default_metrics", out var dm)) cfg.DefaultMetrics = dm.GetString();
        if (dict.TryGetValue("default_min_score", out var ds) && ds.TryGetDouble(out var d)) cfg.DefaultMinScore = d;
        return cfg;
    }

    public static void Save(Config cfg, bool global = true)
    {
        var path = global ? GlobalPath() : "aievaluator.config.json";
        SaveJson(path, cfg);
    }

    public static string ResolveApiKey(string? flagValue)
    {
        if (!string.IsNullOrEmpty(flagValue)) return flagValue;
        var env = Environment.GetEnvironmentVariable("AIEVALUATOR_API_KEY");
        if (!string.IsNullOrEmpty(env)) return env;
        var local = Load(false).ApiKey;
        if (!string.IsNullOrEmpty(local)) return local;
        return Load(true).ApiKey ?? "";
    }

    public static string ResolveEngineUrl(string? flagValue)
    {
        const string def = "https://api.aievaluator.dev";
        if (!string.IsNullOrEmpty(flagValue)) return flagValue.TrimEnd('/');
        var env = Environment.GetEnvironmentVariable("AIEVALUATOR_ENGINE_URL");
        if (!string.IsNullOrEmpty(env)) return env.TrimEnd('/');
        var local = Load(false).EngineUrl;
        if (!string.IsNullOrEmpty(local)) return local.TrimEnd('/');
        var global = Load(true).EngineUrl;
        if (!string.IsNullOrEmpty(global)) return global.TrimEnd('/');
        return def;
    }

    public static string ResolveDefaultMetrics()
    {
        var local = Load(false).DefaultMetrics;
        if (!string.IsNullOrEmpty(local)) return local;
        var global = Load(true).DefaultMetrics;
        return !string.IsNullOrEmpty(global) ? global : "faithfulness,g_eval";
    }

    public static double ResolveDefaultMinScore()
    {
        var local = Load(false).DefaultMinScore;
        if (local > 0) return local;
        var global = Load(true).DefaultMinScore;
        return global > 0 ? global : 0.0;
    }
}
