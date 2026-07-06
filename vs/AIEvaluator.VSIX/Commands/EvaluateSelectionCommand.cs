using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class EvaluateSelectionCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.EvaluateSelection);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            menuCmd.BeforeQueryStatus += (s, e) =>
            {
                var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
                menuCmd.Visible = dte?.ActiveDocument?.Selection is EnvDTE.TextSelection sel && !string.IsNullOrEmpty(sel?.Text);
            };
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
            var selection = (dte?.ActiveDocument?.Selection as EnvDTE.TextSelection)?.Text;
            if (string.IsNullOrEmpty(selection)) return;

            _ = Services.AIEvaluatorService.EvaluateSelectionAsync(selection).ContinueWith(t =>
            {
                if (t.IsFaulted)
                    VsShellUtilities.ShowMessageBox(
                        ServiceProvider.GlobalProvider,
                        t.Exception?.InnerException?.Message ?? "Evaluation failed",
                        "AI Evaluator",
                        OLEMSGICON.OLEMSGICON_CRITICAL,
                        OLEMSGBUTTON.OLEMSGBUTTON_OK,
                        OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
            }, TaskScheduler.Default);
        }
    }
}
