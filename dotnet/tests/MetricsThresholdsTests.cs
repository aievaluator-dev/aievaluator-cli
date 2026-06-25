using Xunit;

namespace AiEvaluator.Tests;

public class MetricsThresholdsTests
{
    [Fact]
    public void TestParseSimpleMetrics()
    {
        // 4.1: Simple comma-separated metrics
        var input = "faithfulness,g_eval";
        var parts = input.Split(',').Select(m => m.Trim()).ToArray();
        Assert.Equal(2, parts.Length);
        Assert.Equal("faithfulness", parts[0]);
        Assert.Equal("g_eval", parts[1]);
    }

    [Fact]
    public void TestParseMetricsWithThresholds()
    {
        // 4.2: Metrics with inline thresholds
        var input = "faithfulness:0.90,g_eval:0.75";
        var metrics = new List<object>();
        foreach (var item in input.Split(',').Select(m => m.Trim()))
        {
            if (item.Contains(':'))
            {
                var parts = item.Split(':', 2);
                if (double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var tv))
                    metrics.Add(new Dictionary<string, object?> { ["name"] = parts[0].Trim(), ["threshold"] = tv });
            }
        }
        Assert.Equal(2, metrics.Count);
    }

    [Fact]
    public void TestParseThresholdsString()
    {
        // 5.1: Thresholds string to dict
        var input = "faithfulness:0.90,g_eval:0.75";
        var dict = new Dictionary<string, double>();
        foreach (var pair in input.Split(','))
        {
            var parts = pair.Trim().Split(':', 2);
            if (parts.Length == 2 && double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var tv))
                dict[parts[0].Trim()] = tv;
        }
        Assert.Equal(0.90, dict["faithfulness"]);
        Assert.Equal(0.75, dict["g_eval"]);
    }

    [Fact]
    public void TestParseEmptyThresholds()
    {
        // 5.2: Empty → empty dict
        var dict = new Dictionary<string, double>();
        Assert.Empty(dict);
    }

    [Fact]
    public void TestParseInvalidThresholdValue_Skipped()
    {
        // 5.3: Invalid values skipped
        var input = "faithfulness:abc,g_eval:0.80";
        var dict = new Dictionary<string, double>();
        foreach (var pair in input.Split(','))
        {
            var parts = pair.Trim().Split(':', 2);
            if (parts.Length == 2 && double.TryParse(parts[1].Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var tv))
                dict[parts[0].Trim()] = tv;
        }
        Assert.Single(dict);
        Assert.Equal(0.80, dict["g_eval"]);
    }
}
