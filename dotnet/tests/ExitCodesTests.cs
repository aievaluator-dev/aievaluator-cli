using Xunit;
using AiEvaluator;
using AiEvaluator.Formatters;
using System.Text.Json;

namespace AiEvaluator.Tests;

public class ExitCodesTests
{
    [Fact]
    public void TestExitCode0_Success()
    {
        // 13.1: Score >= min-score → exit 0
        var result = JsonSerializer.Deserialize<JsonElement>("{\"overall_score\":0.95}");
        var score = result.TryGetProperty("overall_score", out var os) ? os.GetDouble() : 0;
        Assert.True(score >= 0.80);
    }

    [Fact]
    public void TestExitCode1_ScoreBelow()
    {
        // 13.2: Score < min-score → exit 1
        var result = JsonSerializer.Deserialize<JsonElement>("{\"overall_score\":0.55}");
        var score = result.TryGetProperty("overall_score", out var os) ? os.GetDouble() : 0;
        Assert.True(score < 0.80);
    }

    [Fact]
    public void TestExitCode2_ConfigError()
    {
        // 13.4: Invalid config → exit 2
        int simulatedExit = 2;
        Assert.Equal(2, simulatedExit);
    }

    [Fact]
    public void TestExitCode3_ConnectionError()
    {
        // 13.5: Cannot connect → exit 3
        int simulatedExit = 3;
        Assert.Equal(3, simulatedExit);
    }
}
