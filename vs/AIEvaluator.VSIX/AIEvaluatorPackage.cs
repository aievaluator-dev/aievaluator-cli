using System;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace AIEvaluator.VSIX
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [Guid(PackageGuids.AIEvaluatorPackageString)]
    [ProvideToolWindow(typeof(ToolWindows.AIEvaluatorToolWindow), Style = VsDockStyle.Linked, Window = ToolWindowGuids.SolutionExplorer)]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    public sealed class AIEvaluatorPackage : AsyncPackage
    {
        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);

            // Register tool window
            var toolWindow = await ShowToolWindowAsync(typeof(ToolWindows.AIEvaluatorToolWindow), 0, true, DisposalToken);
            if (toolWindow is null) return;

            // Register commands
            await Commands.EvaluateSelectionCommand.InitializeAsync(this);
            await Commands.EvaluateDatasetCommand.InitializeAsync(this);
            await Commands.InitProjectCommand.InitializeAsync(this);
            await Commands.SetApiKeyCommand.InitializeAsync(this);
            await Commands.AddCustomEvaluatorCommand.InitializeAsync(this);
            await Commands.GenerateCISnippetCommand.InitializeAsync(this);
        }
    }
}
