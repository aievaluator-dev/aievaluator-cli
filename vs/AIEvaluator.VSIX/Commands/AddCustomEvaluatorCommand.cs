using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class AddCustomEvaluatorCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.AddCustomEvaluator);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var name = Microsoft.VisualBasic.Interaction.InputBox(
                "Custom evaluator name (used as metric reference):",
                "AI Evaluator — Add Custom Evaluator",
                "",
                -1, -1);

            if (string.IsNullOrWhiteSpace(name)) return;

            var prompt = Microsoft.VisualBasic.Interaction.InputBox(
                "Describe what the judge should evaluate:",
                $"Custom Evaluator: {name}",
                "Is the response polite and professional? Answer YES/NO and explain why.",
                -1, -1);

            if (string.IsNullOrWhiteSpace(prompt)) return;

            VsShellUtilities.ShowMessageBox(
                ServiceProvider.GlobalProvider,
                $"Custom evaluator \"{name}\" added! Use it when running evaluations.",
                "AI Evaluator",
                OLEMSGICON.OLEMSGICON_INFO,
                OLEMSGBUTTON.OLEMSGBUTTON_OK,
                OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
