using System.Text;
using System.Text.Json;
using System.Xml.Linq;

namespace AiEvaluator.Formatters;

public static class OutputFormatter
{
    public static void FormatTable(JsonElement data, double minScore, string engineUrl)
    {
        var results = data.TryGetProperty("results", out var r) ? r.EnumerateArray().ToArray() : Array.Empty<JsonElement>();
        var overallScore = data.TryGetProperty("overall_score", out var os) ? os.GetDouble() : 0;
        var totalRows = data.TryGetProperty("total_rows", out var tr) ? tr.GetInt32() : results.Length;
        var inputTokens = data.TryGetProperty("input_tokens", out var it) ? it.GetInt32() : 0;
        var outputTokens = data.TryGetProperty("output_tokens", out var ot) ? ot.GetInt32() : 0;
        var evalId = data.TryGetProperty("evaluation_id", out var ei) ? ei.GetString() ?? "" : "";

        var failed = results.Count(r => !r.TryGetProperty("passed", out var p) || !p.GetBoolean());
        var scorePct = (overallScore * 100).ToString("F1");
        var passed = overallScore >= minScore;
        var icon = passed ? "✅" : "❌";
        var thresholdPct = (minScore * 100).ToString("F0");

        Console.WriteLine();
        Console.WriteLine($"  AI Evaluator — Results");
        Console.WriteLine($"  Overall Score:  {scorePct}%  {icon} {(passed ? "above" : "below")} threshold ({thresholdPct}%)");
        Console.WriteLine($"  Total rows:     {totalRows}");
        Console.WriteLine($"  Failed:         {failed}");
        Console.WriteLine($"  Tokens:         ↓{inputTokens} · ↑{outputTokens}");
        if (!string.IsNullOrEmpty(evalId))
            Console.WriteLine($"  Dashboard:      {engineUrl}/evaluations/{evalId}/report");
        Console.WriteLine();

        var sep = new string('─', 46);
        Console.WriteLine($"┌────┬{sep}┬──────────┬──────┐");
        Console.WriteLine($"│  # │ Query{"".PadRight(42)}│ Score    │ Pass │");
        Console.WriteLine($"├────┼{sep}┼──────────┼──────┤");

        for (int i = 0; i < results.Length; i++)
        {
            var row = results[i];
            var query = (row.TryGetProperty("query", out var q) ? q.GetString() ?? "" : "").PadRight(46)[..46];
            var scores = row.TryGetProperty("scores", out var sc) ? sc : default;
            double firstScore = 0;
            if (scores.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in scores.EnumerateObject())
                {
                    firstScore = prop.Value.GetDouble();
                    break;
                }
            }
            var scoreStr = $"{firstScore * 100:F0}%".PadRight(9);
            var passIcon = row.TryGetProperty("passed", out var pa) && pa.GetBoolean() ? "✅" : "❌";
            Console.WriteLine($"│ {i + 1,-3}│ {query}│ {scoreStr}│ {passIcon}   │");
        }

        Console.WriteLine($"└────┴{sep}┴──────────┴──────┘");
        Console.WriteLine();
        Console.WriteLine(passed
            ? $"✅ Score {scorePct}% meets threshold {minScore}"
            : $"❌ Score {scorePct}% below threshold {minScore}");
        Console.WriteLine();
    }

    public static string FormatJson(JsonElement data, double minScore)
    {
        var results = data.TryGetProperty("results", out var r) ? r.EnumerateArray().ToArray() : Array.Empty<JsonElement>();
        var overallScore = data.TryGetProperty("overall_score", out var os) ? os.GetDouble() : 0;
        var totalRows = data.TryGetProperty("total_rows", out var tr) ? tr.GetInt32() : results.Length;
        var inputTokens = data.TryGetProperty("input_tokens", out var it) ? it.GetInt32() : 0;
        var outputTokens = data.TryGetProperty("output_tokens", out var ot) ? ot.GetInt32() : 0;
        var evalId = data.TryGetProperty("evaluation_id", out var ei) ? ei.GetString() ?? "" : "";
        var failed = results.Count(r => !r.TryGetProperty("passed", out var p) || !p.GetBoolean());

        var output = new
        {
            evaluation_id = evalId,
            overall_score = overallScore,
            passed = overallScore >= minScore,
            min_score = minScore,
            total_rows = totalRows,
            failed_queries = failed,
            input_tokens = inputTokens,
            output_tokens = outputTokens,
            results,
        };
        return JsonSerializer.Serialize(output, new JsonSerializerOptions { WriteIndented = true });
    }

    public static string FormatJUnit(JsonElement data, double minScore)
    {
        var results = data.TryGetProperty("results", out var r) ? r.EnumerateArray().ToArray() : Array.Empty<JsonElement>();
        var failures = results.Count(r => !r.TryGetProperty("passed", out var p) || !p.GetBoolean());

        var sb = new StringBuilder();
        sb.AppendLine("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.AppendLine($"<testsuite name=\"AI Evaluator\" tests=\"{results.Length}\" failures=\"{failures}\" errors=\"0\" time=\"0\">");

        for (int i = 0; i < results.Length; i++)
        {
            var row = results[i];
            var query = EscapeXml(row.TryGetProperty("query", out var q) ? q.GetString() ?? "" : "");
            if (query.Length > 80) query = query[..80];
            var passed = row.TryGetProperty("passed", out var p) && p.GetBoolean();

            if (passed)
            {
                sb.AppendLine($"  <testcase classname=\"AI Evaluator\" name=\"Query {i + 1}: {query}\" time=\"0\">");
                sb.AppendLine("  </testcase>");
            }
            else
            {
                var expected = row.TryGetProperty("expected_output", out var eo) ? eo.GetString() ?? "" : "";
                var got = row.TryGetProperty("agent_response", out var ar) ? ar.GetString() ?? "" : "";
                sb.AppendLine($"  <testcase classname=\"AI Evaluator\" name=\"Query {i + 1}: {query}\" time=\"0\">");
                sb.AppendLine($"    <failure message=\"Score below threshold {minScore}\">");
                sb.AppendLine($"      Query: {EscapeXml(query)}");
                sb.AppendLine($"      Expected: {EscapeXml(expected)}");
                sb.AppendLine($"      Got: {EscapeXml(got)}");
                sb.AppendLine("    </failure>");
                sb.AppendLine("  </testcase>");
            }
        }

        sb.AppendLine("</testsuite>");
        return sb.ToString();
    }

    private static string EscapeXml(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
         .Replace("\"", "&quot;").Replace("'", "&apos;");
}
