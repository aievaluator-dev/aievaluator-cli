using System.Text;
using System.Text.Json;

namespace AiEvaluator;

public class ApiError : Exception
{
    public int StatusCode { get; }
    public object? Detail { get; }

    public ApiError(int statusCode, string message, object? detail = null) : base(message)
    {
        StatusCode = statusCode;
        Detail = detail;
    }
}

public class ApiClient
{
    private readonly string _engineUrl;
    private readonly string? _apiKey;
    private readonly int _timeoutSec;
    private static readonly HttpClient _http = new();

    public ApiClient(string engineUrl, string? apiKey = null, int timeoutSec = 300)
    {
        _engineUrl = engineUrl.TrimEnd('/');
        _apiKey = apiKey;
        _timeoutSec = timeoutSec;
    }

    private async Task<JsonElement> Request(string method, string path, object? body = null)
    {
        var url = $"{_engineUrl}{path}";
        var req = new HttpRequestMessage(new HttpMethod(method), url);

        if (body != null)
        {
            var json = JsonSerializer.Serialize(body);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        if (!string.IsNullOrEmpty(_apiKey))
            req.Headers.Add("X-API-Key", _apiKey);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(_timeoutSec));
        var resp = await _http.SendAsync(req, cts.Token);
        var respBody = await resp.Content.ReadAsStringAsync();

        if ((int)resp.StatusCode >= 400)
        {
            object? detail = null;
            try { detail = JsonSerializer.Deserialize<object>(respBody); } catch { detail = respBody; }
            throw new ApiError((int)resp.StatusCode, $"Engine returned HTTP {(int)resp.StatusCode}", detail);
        }

        return JsonSerializer.Deserialize<JsonElement>(respBody);
    }

    public async Task<JsonElement> GetUsage()
    {
        return await Request("GET", "/api/v1/tenants/me/usage");
    }

    public async Task<JsonElement> EvaluateSync(object[] rows, string agentUrl, string agentFormat = "openai",
        string[]? metrics = null, string? judgeModel = null, string? name = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["rows"] = rows,
            ["agent"] = new { url = agentUrl, format = agentFormat },
            ["metrics"] = metrics ?? new[] { "faithfulness", "g_eval" },
            ["custom_evaluators"] = Array.Empty<object>(),
        };
        if (!string.IsNullOrEmpty(name)) body["name"] = name;
        if (!string.IsNullOrEmpty(judgeModel)) body["judge_model"] = judgeModel;
        return await Request("POST", "/api/v1/evaluations/sync", body);
    }

    public async Task<JsonElement> EvaluateUpload(string filePath, string agentUrl,
        string agentFormat = "openai", string? metrics = null)
    {
        var url = $"{_engineUrl}/api/v1/evaluations/sync/upload";
        using var form = new MultipartFormDataContent();
        form.Add(new StreamContent(File.OpenRead(filePath)), "file", Path.GetFileName(filePath));
        form.Add(new StringContent(agentUrl), "agent_endpoint");
        form.Add(new StringContent(agentFormat), "agent_format");
        form.Add(new StringContent(metrics ?? "faithfulness,g_eval"), "metrics");

        var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = form };
        if (!string.IsNullOrEmpty(_apiKey)) req.Headers.Add("X-API-Key", _apiKey);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(_timeoutSec));
        var resp = await _http.SendAsync(req, cts.Token);
        var respBody = await resp.Content.ReadAsStringAsync();

        if ((int)resp.StatusCode >= 400)
            throw new ApiError((int)resp.StatusCode, $"Engine returned HTTP {(int)resp.StatusCode}");
        return JsonSerializer.Deserialize<JsonElement>(respBody);
    }

    public async Task<JsonElement> PlaygroundEvaluate(string[]? queries = null, object[]? rows = null,
        string? agentEndpoint = null, string[]? metrics = null, string? judge = null)
    {
        var body = new Dictionary<string, object?> { ["metrics"] = metrics ?? new[] { "g_eval" } };
        if (queries != null) body["queries"] = queries;
        if (rows != null) body["rows"] = rows;
        if (!string.IsNullOrEmpty(agentEndpoint)) body["agent_endpoint"] = agentEndpoint;
        if (!string.IsNullOrEmpty(judge)) body["judge"] = judge;
        return await Request("POST", "/api/v1/playground/evaluate", body);
    }

    public async Task<Dictionary<string, JsonElement>> PlaygroundStatus()
    {
        try
        {
            var resp = await _http.GetAsync($"{_engineUrl}/api/v1/playground/status");
            var body = await resp.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(body) ?? new();
        }
        catch
        {
            return new() { ["remaining"] = JsonSerializer.SerializeToElement(5), ["limit"] = JsonSerializer.SerializeToElement(5) };
        }
    }
}
