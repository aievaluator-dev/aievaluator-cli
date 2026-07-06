using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class SetApiKeyCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.SetApiKey);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            // Show a simple input dialog using VS API
            var text = Microsoft.VisualBasic.Interaction.InputBox(
                "Enter your AI Evaluator API key (from aievaluator.dev):",
                "AI Evaluator — Set API Key",
                "",
                -1, -1);

            if (string.IsNullOrWhiteSpace(text)) return;

            _ = Services.AIEvaluatorService.SetApiKeyAsync(text.Trim()).ContinueWith(t =>
            {
                VsShellUtilities.ShowMessageBox(
                    ServiceProvider.GlobalProvider,
                    "API key saved!",
                    "AI Evaluator",
                    OLEMSGICON.OLEMSGICON_INFO,
                    OLEMSGBUTTON.OLEMSGBUTTON_OK,
                    OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
            }, TaskScheduler.Default);
        }
    }
}
