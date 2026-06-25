using Xunit;
using AiEvaluator;

namespace AiEvaluator.Tests;

public class ApiClientTests
{
    [Fact]
    public void TestApiError_Creation()
    {
        // 2.5: APIError stores data correctly
        var err = new ApiError(429, "Rate limited", new { retry_after = 60 });
        Assert.Equal(429, err.StatusCode);
        Assert.Equal("Rate limited", err.Message);
        Assert.NotNull(err.Detail);
    }

    [Fact]
    public void TestApiError_NoDetail()
    {
        // 2.5: Works without detail
        var err = new ApiError(500, "Internal error");
        Assert.Equal(500, err.StatusCode);
        Assert.Null(err.Detail);
    }

    [Fact]
    public void TestClientInit_WithKey()
    {
        // 2.1: Constructor works
        var client = new ApiClient("https://api.aievaluator.dev", "sk-test", 60);
        Assert.NotNull(client);
    }

    [Fact]
    public void TestClientInit_WithoutKey()
    {
        // 2.2: Works without key
        var client = new ApiClient("https://api.aievaluator.dev");
        Assert.NotNull(client);
    }
}
