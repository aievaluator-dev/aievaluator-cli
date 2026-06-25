using System.CommandLine;
using AiEvaluator;

return await CliProgram.BuildRootCommand().InvokeAsync(args);
