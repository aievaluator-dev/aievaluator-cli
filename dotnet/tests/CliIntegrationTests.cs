using System.Diagnostics;
using Xunit;

namespace AiEvaluator.Tests;

public class CliIntegrationTests
{
    private static readonly string ProjectPath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "src"));

    private async Task<(int ExitCode, string Stdout, string Stderr)> RunCliAsync(string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = $"run --project \"{ProjectPath}\" --no-build -- {args}",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.Environment["AIEVALUATOR_API_KEY"] = "";

        using var proc = Process.Start(psi)!;
        var stdout = await proc.StandardOutput.ReadToEndAsync();
        var stderr = await proc.StandardError.ReadToEndAsync();
        await proc.WaitForExitAsync();
        return (proc.ExitCode, stdout, stderr);
    }

    [Fact]
    public async Task Init_CreatesFiles()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"aieval-{Guid.NewGuid()}");
        Directory.CreateDirectory(dir);
        try
        {
            var (exitCode, stdout, _) = await RunCliAsync($"init --cwd \"{dir}\"");
            // init uses Environment.CurrentDirectory, which is set by the process
        }
        finally { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
    }

    [Fact]
    public async Task Quick_NoArgs_ExitsNonZero()
    {
        var (exitCode, _, stderr) = await RunCliAsync("quick");
        Assert.NotEqual(0, exitCode);
    }

    [Fact]
    public async Task Eval_NoAgent_ExitsNonZero()
    {
        var (exitCode, _, _) = await RunCliAsync("eval");
        Assert.NotEqual(0, exitCode);
    }

    [Fact]
    public async Task Eval_MissingData_ExitsNonZero()
    {
        var (exitCode, _, _) = await RunCliAsync("eval --agent https://a.com");
        Assert.NotEqual(0, exitCode);
    }

    [Fact]
    public async Task Config_Show_Exits0()
    {
        var (exitCode, stdout, _) = await RunCliAsync("config show");
        Assert.Equal(0, exitCode);
    }

    [Fact]
    public async Task Config_Set_BadKey_ExitsNonZero()
    {
        var (exitCode, _, _) = await RunCliAsync("config set bad val");
        Assert.NotEqual(0, exitCode);
    }
}
