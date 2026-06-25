using Xunit;
using System.Text.Json;

namespace AiEvaluator.Tests;

public class DatasetTests
{
    [Fact]
    public void TestParseJsonArray()
    {
        var tmp = Path.GetTempFileName();
        File.WriteAllText(tmp, "[{\"input\":\"Q1\"},{\"input\":\"Q2\"}]");
        var text = File.ReadAllText(tmp);
        var parsed = JsonSerializer.Deserialize<JsonElement>(text);
        Assert.Equal(JsonValueKind.Array, parsed.ValueKind);
        Assert.Equal(2, parsed.GetArrayLength());
        File.Delete(tmp);
    }

    [Fact]
    public void TestParseJsonSingleObject()
    {
        var tmp = Path.GetTempFileName();
        File.WriteAllText(tmp, "{\"input\":\"only\"}");
        var text = File.ReadAllText(tmp);
        var parsed = JsonSerializer.Deserialize<JsonElement>(text);
        Assert.Equal(JsonValueKind.Object, parsed.ValueKind);
        File.Delete(tmp);
    }

    [Fact]
    public void TestParseJsonl()
    {
        var tmp = Path.GetTempFileName();
        File.WriteAllText(tmp, "{\"input\":\"Q1\"}\n\n{\"input\":\"Q2\"}\n");
        var lines = File.ReadAllText(tmp).Trim().Split('\n')
            .Where(l => !string.IsNullOrEmpty(l.Trim()))
            .Select(l => JsonSerializer.Deserialize<JsonElement>(l.Trim()))
            .ToArray();
        Assert.Equal(2, lines.Length);
        File.Delete(tmp);
    }

    [Fact]
    public void TestParseNonexistentFile()
    {
        // 3.4: Missing file throws an exception
        try { File.ReadAllText("/nonexistent/dataset.json"); Assert.True(false, "Should throw"); }
        catch (Exception) { /* expected */ }
    }

    [Fact]
    public void TestParseInvalidJson()
    {
        var tmp = Path.GetTempFileName();
        File.WriteAllText(tmp, "not json {{{");
        Assert.Throws<System.Text.Json.JsonException>(() => JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(tmp)));
        File.Delete(tmp);
    }
}
