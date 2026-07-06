using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class InitProjectCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.InitProject);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var dte = Package.GetGlobalService(typeof(EnvDTE.DTE)) as EnvDTE.DTE;
            var solution = dte?.Solution;
            var projectDir = System.IO.Path.GetDirectoryName(solution?.FullName);

            if (string.IsNullOrEmpty(projectDir))
            {
                VsShellUtilities.ShowMessageBox(
                    ServiceProvider.GlobalProvider,
                    "Open a solution or folder first.",
                    "AI Evaluator",
                    OLEMSGICON.OLEMSGICON_INFO,
                    OLEMSGBUTTON.OLEMSGBUTTON_OK,
                    OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
                return;
            }

            Services.AIEvaluatorService.InitProject(projectDir);
            VsShellUtilities.ShowMessageBox(
                ServiceProvider.GlobalProvider,
                "Project initialized! Created evals/smoke-test.json, results/, and aievaluator.config.json.",
                "AI Evaluator",
                OLEMSGICON.OLEMSGICON_INFO,
                OLEMSGBUTTON.OLEMSGBUTTON_OK,
                OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
