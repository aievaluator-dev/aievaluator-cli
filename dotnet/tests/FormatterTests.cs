using Xunit;
using System.Text.Json;
using AiEvaluator.Formatters;

namespace AiEvaluator.Tests;

public class FormatterTests
{
    private static JsonElement MakeResult(bool allPass)
    {
        var results = allPass
            ? new[]
            {
                new { query = "Test 1", expected_output = "OK", agent_response = "OK", scores = new { faithfulness = 1.0 }, passed = true },
                new { query = "Test 2", expected_output = "OK", agent_response = "OK", scores = new { faithfulness = 1.0 }, passed = true },
            }
            : new object[]
            {
                new { query = "Test 1", expected_output = "OK", agent_response = "OK", scores = new { faithfulness = 1.0 }, passed = true },
                new { query = "Test 2 & <bad>", expected_output = "Expected", agent_response = "Bad", scores = new { faithfulness = 0.5 }, passed = false },
            };

        var data = new
        {
            evaluation_id = "eval-001",
            overall_score = allPass ? 0.85 : 0.75,
            total_rows = 2,
            input_tokens = 100,
            output_tokens = 50,
            results,
        };

        var json = JsonSerializer.Serialize(data);
        return JsonSerializer.Deserialize<JsonElement>(json);
    }

    [Fact]
    public void TestJsonOutput_PassedTrue()
    {
        // 6.1: Passed true when all pass
        var result = MakeResult(true);
        var output = OutputFormatter.FormatJson(result, 0.80);
        Assert.Contains("\"passed\": true", output);
        Assert.Contains("\"failed_queries\": 0", output);
    }

    [Fact]
    public void TestJsonOutput_PassedFalse()
    {
        // 6.2: Passed false when some fail
        var result = MakeResult(false);
        var output = OutputFormatter.FormatJson(result, 0.80);
        Assert.Contains("\"passed\": false", output);
        Assert.Contains("\"failed_queries\": 1", output);
    }

    [Fact]
    public void TestJsonOutput_Structure()
    {
        // 6.3: All expected keys present
        var result = MakeResult(true);
        var output = OutputFormatter.FormatJson(result, 0.80);
        Assert.Contains("evaluation_id", output);
        Assert.Contains("overall_score", output);
        Assert.Contains("results", output);
    }

    [Fact]
    public void TestJUnitOutput_Header()
    {
        // 6.5: Correct test counts
        var result = MakeResult(false);
        var output = OutputFormatter.FormatJUnit(result, 0.80);
        Assert.Contains("tests=\"2\"", output);
        Assert.Contains("failures=\"1\"", output);
    }

    [Fact]
    public void TestJUnitOutput_PassingTestCase()
    {
        // 6.6: No failure for passing tests
        var result = MakeResult(true);
        var output = OutputFormatter.FormatJUnit(result, 0.80);
        Assert.DoesNotContain("<failure", output);
    }

    [Fact]
    public void TestJUnitOutput_FailingTestCase()
    {
        // 6.7: Failure contains details
        var result = MakeResult(false);
        var output = OutputFormatter.FormatJUnit(result, 0.80);
        Assert.Contains("<failure", output);
        Assert.Contains("Expected", output);
    }

    [Fact]
    public void TestJUnitOutput_XmlEscaping()
    {
        // 6.8: Special chars escaped
        var result = MakeResult(false);
        var output = OutputFormatter.FormatJUnit(result, 0.80);
        Assert.Contains("&amp;", output);
        Assert.Contains("&lt;", output);
    }

    [Fact]
    public void TestTableOutput_DoesNotThrow()
    {
        // 6.9/6.10: No crash on valid or empty results
        var result = MakeResult(true);
        OutputFormatter.FormatTable(result, 0.80, "https://api.aievaluator.dev");
    }
}
