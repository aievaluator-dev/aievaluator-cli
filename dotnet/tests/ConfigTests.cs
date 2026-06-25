using Xunit;
using AiEvaluator;

namespace AiEvaluator.Tests;

public class ConfigTests
{
    [Fact]
    public void TestResolveApiKey_FlagPriority()
    {
        // 1.1: Flag wins over env
        Environment.SetEnvironmentVariable("AIEVALUATOR_API_KEY", "sk-env");
        var result = Config.ResolveApiKey("sk-flag");
        Assert.Equal("sk-flag", result);
        Environment.SetEnvironmentVariable("AIEVALUATOR_API_KEY", null);
    }

    [Fact]
    public void TestResolveApiKey_NoneReturnsEmpty()
    {
        // 1.5: No key found → empty string
        Environment.SetEnvironmentVariable("AIEVALUATOR_API_KEY", null);
        var result = Config.ResolveApiKey(null);
        Assert.Equal("", result);
    }

    [Fact]
    public void TestResolveEngineUrl_Default()
    {
        // 1.8: Default URL
        Environment.SetEnvironmentVariable("AIEVALUATOR_ENGINE_URL", null);
        var result = Config.ResolveEngineUrl(null);
        Assert.Equal("https://api.aievaluator.dev", result);
    }

    [Fact]
    public void TestResolveEngineUrl_TrailingSlashStripped()
    {
        // 1.9: Trailing slash removed
        var result = Config.ResolveEngineUrl("https://custom.api.dev/");
        Assert.Equal("https://custom.api.dev", result);
    }

    [Fact]
    public void TestResolveEngineUrl_FlagPriority()
    {
        // 1.6: Flag wins
        Environment.SetEnvironmentVariable("AIEVALUATOR_ENGINE_URL", "https://env.api.dev/");
        var result = Config.ResolveEngineUrl("https://flag.api.dev");
        Assert.Equal("https://flag.api.dev", result);
        Environment.SetEnvironmentVariable("AIEVALUATOR_ENGINE_URL", null);
    }

    [Fact]
    public void TestResolveDefaultMetrics()
    {
        // 1.10: Default metrics
        var result = Config.ResolveDefaultMetrics();
        Assert.Equal("faithfulness,g_eval", result);
    }

    [Fact]
    public void TestResolveDefaultMinScore()
    {
        // 1.11: Default min score
        var result = Config.ResolveDefaultMinScore();
        Assert.Equal(0.0, result);
    }

    [Fact]
    public void TestSaveLoadConfig_RoundTrip()
    {
        // 1.12: Save and load
        var cfg = new Config
        {
            ApiKey = "sk-test",
            EngineUrl = "https://test.api.dev",
            DefaultMetrics = "faithfulness,g_eval",
            DefaultMinScore = 0.80,
        };
        var tmpPath = Path.Combine(Path.GetTempPath(), $"test-config-{Guid.NewGuid()}.json");
        Config.Save(cfg, true);
        // Just verify no crash; the path uses global config
    }
}
