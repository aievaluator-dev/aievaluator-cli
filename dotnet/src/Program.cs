// AI Evaluator CLI — .NET
using System.CommandLine;

var rootCommand = new RootCommand("AI Evaluator CLI — evaluate your LLM agents from the command line");

var loginCommand = new Command("login", "Authenticate with AI Evaluator");
loginCommand.SetHandler(() => Console.WriteLine("login: coming soon\nGet your API key at https://aievaluator.dev/settings"));
rootCommand.AddCommand(loginCommand);

var whoamiCommand = new Command("whoami", "Show current tenant info");
whoamiCommand.SetHandler(() => Console.WriteLine("whoami: coming soon"));
rootCommand.AddCommand(whoamiCommand);

var quickCommand = new Command("quick", "Quick eval via playground (no API key)");
quickCommand.SetHandler(() => Console.WriteLine("quick: coming soon"));
rootCommand.AddCommand(quickCommand);

var evalCommand = new Command("eval", "Full evaluation against an agent");
evalCommand.SetHandler(() => Console.WriteLine("eval: coming soon"));
rootCommand.AddCommand(evalCommand);

var configCommand = new Command("config", "Manage CLI configuration");
configCommand.SetHandler(() => Console.WriteLine("config: coming soon"));
rootCommand.AddCommand(configCommand);

return await rootCommand.InvokeAsync(args);
