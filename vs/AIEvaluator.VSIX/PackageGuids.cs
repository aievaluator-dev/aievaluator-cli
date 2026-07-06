using System;

namespace AIEvaluator.VSIX
{
    public static class PackageGuids
    {
        public const string AIEvaluatorPackageString = "6a5cd8e1-9f3b-4a2c-b1d7-e8f0a3c5b9d2";

        public static readonly Guid AIEvaluatorPackage = new(AIEvaluatorPackageString);

        // Command set
        public const string CommandSetString = "7b6de9f2-0a4c-5d3e-c2f8-1a9b0d4e6f7a";
        public static readonly Guid CommandSet = new(CommandSetString);

        // Command IDs
        public const int EvaluateSelection = 0x0100;
        public const int EvaluateDataset = 0x0101;
        public const int InitProject = 0x0102;
        public const int SetApiKey = 0x0103;
        public const int AddCustomEvaluator = 0x0104;
        public const int GenerateCISnippet = 0x0105;
        public const int ToolWindowToolbar = 0x1000;
        public const int ToolWindowToolbarGroup = 0x1001;
    }

    public static class ToolWindowGuids
    {
        public const string AIEvaluatorToolWindowString = "8c7ef0a3-1b5d-4e6f-9d3a-2c0b5f7e8a1d";
        public static readonly Guid AIEvaluatorToolWindow = new(AIEvaluatorToolWindowString);

        // Standard VS tool windows for docking
        public const string SolutionExplorer = "3ae79031-e1bc-11d0-8f78-00a0c9110057";
    }
}
