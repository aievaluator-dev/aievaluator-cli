using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class EvaluateDatasetCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.EvaluateDataset);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            menuCmd.BeforeQueryStatus += (s, e) =>
            {
                // Visible when a .json or .jsonl file is selected in Solution Explorer
                var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
                var items = dte?.SelectedItems;
                if (items?.Count == 1)
                {
                    var path = items.Item(1)?.ProjectItem?.FileNames[0] as string ?? "";
                    menuCmd.Visible = path.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                                  || path.EndsWith(".jsonl", StringComparison.OrdinalIgnoreCase);
                }
                else
                {
                    menuCmd.Visible = false;
                }
            };
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
            var items = dte?.SelectedItems;
            if (items?.Count != 1) return;

            var filePath = items.Item(1)?.ProjectItem?.FileNames[0] as string;
            if (string.IsNullOrEmpty(filePath)) return;

            _ = Services.AIEvaluatorService.EvaluateDatasetAsync(filePath).ContinueWith(t =>
            {
                if (t.IsFaulted)
                    VsShellUtilities.ShowMessageBox(
                        ServiceProvider.GlobalProvider,
                        t.Exception?.InnerException?.Message ?? "Dataset evaluation failed",
                        "AI Evaluator",
                        OLEMSGICON.OLEMSGICON_CRITICAL,
                        OLEMSGBUTTON.OLEMSGBUTTON_OK,
                        OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
            }, TaskScheduler.Default);
        }
    }
}
