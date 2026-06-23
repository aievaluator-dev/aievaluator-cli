using System.CommandLine;
using System.Text.Json;

// ═══════════════════════════════════════════════════════════════
//  AI Evaluator CLI — .NET global tool
// ═══════════════════════════════════════════════════════════════

var apiKeyOption = new Option<string?>("--api-key", "API key");
var engineUrlOption = new Option<string?>("--engine-url", "Engine URL");
var agentOption = new Option<string>("--agent", "Agent endpoint URL");
var datasetOption = new Option<string?>("--dataset", "JSON dataset file");
var rowsOption = new Option<string?>("--rows", "Inline JSON array");
var metricsOption = new Option<string?>("--metrics", "Metrics (comma-separated)");
var agentFormatOption = new Option<string?>("--agent-format", () => "openai", "Agent API format");
var minScoreOption = new Option<string?>("--min-score", "Minimum score threshold (0-1)");
var formatOption = new Option<string?>("--format", () => "table", "Output format: table, json, junit");
var ciOption = new Option<bool>("--ci", "CI mode");
var timeoutOption = new Option<string?>("--timeout", () => "300", "Timeout in seconds");
var judgeModelOption = new Option<string?>("--judge-model", "LLM judge model");
var nameOption = new Option<string?>("--name", "Human-readable name for this evaluation");
var judgeOption = new Option<string?>("--judge", "LLM judge model (for quick)");
var expectedOption = new Option<string?>("--expected", "Expected output");

var rootCommand = new RootCommand("AI Evaluator CLI — evaluate your LLM agents from the command line");

// login
var loginCmd = new Command("login", "Authenticate with AI Evaluator");
loginCmd.AddOption(apiKeyOption);
loginCmd.AddOption(engineUrlOption);
loginCmd.SetHandler((apiKey, engineUrl) =>
{
    Console.WriteLine("login: coming soon — get your key at https://aievaluator.dev/settings");
}, apiKeyOption, engineUrlOption);
rootCommand.AddCommand(loginCmd);

// whoami
var whoamiCmd = new Command("whoami", "Show current tenant info");
whoamiCmd.SetHandler(() => Console.WriteLine("whoami: coming soon"));
rootCommand.AddCommand(whoamiCmd);

// quick
var quickCmd = new Command("quick", "Quick eval via playground (no API key)");
var quickQueryArg = new Argument<string?>("query", () => null, "Query to evaluate");
quickCmd.AddArgument(quickQueryArg);
quickCmd.AddOption(datasetOption);
quickCmd.AddOption(agentOption);
quickCmd.AddOption(expectedOption);
quickCmd.AddOption(metricsOption);
quickCmd.AddOption(judgeOption);
quickCmd.AddOption(engineUrlOption);
quickCmd.SetHandler((query, dataset, agent, expected, metrics, judge, engineUrl) =>
{
    Console.WriteLine("quick: coming soon");
}, quickQueryArg, datasetOption, agentOption, expectedOption, metricsOption, judgeOption, engineUrlOption);
rootCommand.AddCommand(quickCmd);

// eval
var evalCmd = new Command("eval", "Full evaluation against an agent");
evalCmd.AddOption(agentOption);
evalCmd.AddOption(datasetOption);
evalCmd.AddOption(rowsOption);
evalCmd.AddOption(metricsOption);
evalCmd.AddOption(agentFormatOption);
evalCmd.AddOption(minScoreOption);
evalCmd.AddOption(formatOption);
evalCmd.AddOption(ciOption);
evalCmd.AddOption(timeoutOption);
evalCmd.AddOption(judgeModelOption);
evalCmd.AddOption(nameOption);
evalCmd.AddOption(apiKeyOption);
evalCmd.AddOption(engineUrlOption);
evalCmd.SetHandler((agent, dataset, rows, metrics, agentFormat, minScore, format, ci, timeout, judgeModel, name, apiKey, engineUrl) =>
{
    Console.WriteLine("eval: coming soon");
}, agentOption, datasetOption, rowsOption, metricsOption, agentFormatOption,
   minScoreOption, formatOption, ciOption, timeoutOption, judgeModelOption,
   nameOption, apiKeyOption, engineUrlOption);
rootCommand.AddCommand(evalCmd);

// config
var configCmd = new Command("config", "Manage CLI configuration");
var configShowCmd = new Command("show", "Show current configuration");
configShowCmd.SetHandler(() => Console.WriteLine("{}"));
configCmd.AddCommand(configShowCmd);
var configSetCmd = new Command("set", "Set a configuration value");
var setKeyArg = new Argument<string>("key");
var setValueArg = new Argument<string>("value");
configSetCmd.AddArgument(setKeyArg);
configSetCmd.AddArgument(setValueArg);
configSetCmd.SetHandler((key, value) => Console.WriteLine($"✅ {key} = {value}"), setKeyArg, setValueArg);
configCmd.AddCommand(configSetCmd);
var configUnsetCmd = new Command("unset", "Remove a configuration value");
var unsetKeyArg = new Argument<string>("key");
configUnsetCmd.AddArgument(unsetKeyArg);
configUnsetCmd.SetHandler((key) => Console.WriteLine($"✅ {key} removed"), unsetKeyArg);
configCmd.AddCommand(configUnsetCmd);
rootCommand.AddCommand(configCmd);

return await rootCommand.InvokeAsync(args);
