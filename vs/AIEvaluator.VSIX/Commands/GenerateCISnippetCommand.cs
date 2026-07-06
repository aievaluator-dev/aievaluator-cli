using System;
using System.ComponentModel.Design;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.VisualStudio.Shell;

namespace AIEvaluator.VSIX.Commands
{
    public static class GenerateCISnippetCommand
    {
        public static async Task InitializeAsync(AsyncPackage package)
        {
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as IMenuCommandService;
            if (commandService is null) return;

            var cmdId = new CommandID(PackageGuids.CommandSet, PackageGuids.GenerateCISnippet);
            var menuCmd = new OleMenuCommand(Execute, cmdId);
            commandService.AddCommand(menuCmd);
        }

        private static void Execute(object sender, EventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();

            var snippet = @"# GitHub Actions — AI Quality Gate
name: AI Quality Gate
on: [pull_request]
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install aievaluator
      - run: |
          aievaluator eval \
            --agent ${{ vars.STAGING_AGENT_URL }} \
            --dataset ./evals/regression.json \
            --metrics faithfulness,g_eval \
            --min-score 0.80 \
            --ci \
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: ${{ secrets.AI_EVALUATOR_API_KEY }}
";

            Clipboard.SetText(snippet);
            VsShellUtilities.ShowMessageBox(
                ServiceProvider.GlobalProvider,
                "GitHub Actions CI/CD snippet copied to clipboard!",
                "AI Evaluator",
                OLEMSGICON.OLEMSGICON_INFO,
                OLEMSGBUTTON.OLEMSGBUTTON_OK,
                OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
