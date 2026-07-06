using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using AIEvaluator.VSIX.Services;
using AIEvaluator.VSIX.ViewModels;
using MessageBox = System.Windows.MessageBox;

namespace AIEvaluator.VSIX.Controls
{
    public partial class AIEvaluatorControl : UserControl
    {
        private readonly AIEvaluatorViewModel _vm = new();
        private ObservableCollection<HistoryItem> _history = new();

        public AIEvaluatorControl()
        {
            InitializeComponent();
            DataContext = _vm;
            HistoryList.ItemsSource = _history;
            _ = RefreshApiKeyStatusAsync();
        }

        private async Task RefreshApiKeyStatusAsync()
        {
            var key = await AIEvaluatorService.GetApiKeyAsync();
            Dispatcher.Invoke(() =>
            {
                ApiKeyStatusText.Text = string.IsNullOrEmpty(key)
                    ? "API key: not set"
                    : "API key: ✅ set";
            });
        }

        private async void OnEvaluateSelection(object sender, RoutedEventArgs e)
        {
            try
            {
                var dte = (EnvDTE.DTE)Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(EnvDTE.DTE));
                var selection = ((EnvDTE.TextSelection)dte.ActiveDocument?.Selection)?.Text;

                if (string.IsNullOrEmpty(selection))
                {
                    MessageBox.Show("Select text in the editor first.", "AI Evaluator", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                StatusText.Text = "Evaluating...";
                var result = await AIEvaluatorService.EvaluateSelectionAsync(selection);

                if (result == null)
                {
                    StatusText.Text = "❌ Evaluation failed";
                    return;
                }

                var root = result.RootElement;
                var results = root.GetProperty("results")[0];
                var passed = results.GetProperty("passed").GetBoolean();
                var scores = results.GetProperty("scores");

                var scoreList = new System.Text.StringBuilder();
                foreach (var s in scores.EnumerateObject())
                {
                    var pct = (s.Value.GetDouble() * 100).ToString("F0");
                    scoreList.Append($"{s.Name}: {pct}% ");
                }

                _history.Insert(0, new HistoryItem
                {
                    Query = selection.Length > 60 ? selection[..60] + "..." : selection,
                    Scores = scoreList.ToString().Trim(),
                    Passed = passed,
                });
                HistoryList.ItemsSource = null;
                HistoryList.ItemsSource = _history;
                NoHistoryText.Visibility = Visibility.Collapsed;

                StatusText.Text = $"{(passed ? "✅" : "❌")} {scoreList}";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"❌ {ex.Message}";
            }
        }

        private async void OnEvaluateDataset(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog
            {
                Title = "Select dataset file",
                Filter = "Dataset files (*.json;*.jsonl)|*.json;*.jsonl|All files (*.*)|*.*"
            };

            if (dialog.ShowDialog() != true) return;

            try
            {
                StatusText.Text = $"Evaluating {System.IO.Path.GetFileName(dialog.FileName)}...";
                var result = await AIEvaluatorService.EvaluateDatasetAsync(dialog.FileName);

                if (result == null)
                {
                    StatusText.Text = "❌ Evaluation failed";
                    return;
                }

                var root = result.RootElement;
                var overall = root.GetProperty("overall_score").GetDouble();
                var passed = overall >= 0.80;
                var resultsArr = root.GetProperty("results");

                foreach (var r in resultsArr.EnumerateArray())
                {
                    var query = r.GetProperty("query").GetString() ?? "";
                    var scores = r.GetProperty("scores");
                    var scoreList = new System.Text.StringBuilder();
                    foreach (var s in scores.EnumerateObject())
                    {
                        var pct = (s.Value.GetDouble() * 100).ToString("F0");
                        scoreList.Append($"{s.Name}: {pct}% ");
                    }

                    _history.Insert(0, new HistoryItem
                    {
                        Query = query.Length > 60 ? query[..60] + "..." : query,
                        Scores = scoreList.ToString().Trim(),
                        Passed = r.GetProperty("passed").GetBoolean(),
                    });
                }

                HistoryList.ItemsSource = null;
                HistoryList.ItemsSource = _history;
                NoHistoryText.Visibility = Visibility.Collapsed;

                var pctOverall = (overall * 100).ToString("F0");
                StatusText.Text = $"{(passed ? "✅" : "❌")} Overall: {pctOverall}%";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"❌ {ex.Message}";
            }
        }

        private void OnInitProject(object sender, RoutedEventArgs e)
        {
            try
            {
                var dte = (EnvDTE.DTE)Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(EnvDTE.DTE));
                var solution = dte.Solution;
                if (solution?.FullName is null)
                {
                    MessageBox.Show("Open a solution or folder first.", "AI Evaluator", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                var projectDir = System.IO.Path.GetDirectoryName(solution.FullName)!;
                AIEvaluatorService.InitProject(projectDir);
                StatusText.Text = "✅ Project initialized!";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"❌ {ex.Message}";
            }
        }

        private async void OnSetApiKey(object sender, RoutedEventArgs e)
        {
            var dialog = new InputDialog("Enter your AI Evaluator API key:", "Set API Key")
            {
                IsPassword = true
            };

            if (dialog.ShowDialog() == true && !string.IsNullOrWhiteSpace(dialog.Input))
            {
                await AIEvaluatorService.SetApiKeyAsync(dialog.Input.Trim());
                await RefreshApiKeyStatusAsync();
                StatusText.Text = "✅ API key saved";
            }
        }

        private void OnOpenDashboard(object sender, RoutedEventArgs e)
        {
            Process.Start(new ProcessStartInfo("https://www.aievaluator.dev") { UseShellExecute = true });
        }

        private void OnOpenDocs(object sender, RoutedEventArgs e)
        {
            Process.Start(new ProcessStartInfo("https://www.aievaluator.dev/tutorials") { UseShellExecute = true });
        }

        private async void OnAddCustomEvaluator(object sender, RoutedEventArgs e)
        {
            var dialog = new CustomEvalDialog();
            if (dialog.ShowDialog() == true)
            {
                // Custom evaluators are sent inline during evaluation
                StatusText.Text = $"✅ Custom evaluator \"{dialog.EvaluatorName}\" ready";
            }
        }

        private void OnGenerateCISnippet(object sender, RoutedEventArgs e)
        {
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
            StatusText.Text = "✅ CI/CD snippet copied to clipboard!";
        }
    }

    /// <summary>
    /// Simple input dialog for API key and other text input.
    /// </summary>
    public class InputDialog : Window
    {
        public string Input { get; private set; } = "";
        public bool IsPassword { get; set; }

        private readonly TextBox _textBox;

        public InputDialog(string prompt, string title)
        {
            Title = title;
            Width = 400;
            Height = 180;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;

            var panel = new StackPanel { Margin = new Thickness(15) };

            panel.Children.Add(new TextBlock
            {
                Text = prompt,
                Margin = new Thickness(0, 0, 0, 10),
                TextWrapping = TextWrapping.Wrap
            });

            _textBox = new TextBox
            {
                Margin = new Thickness(0, 0, 0, 15),
                Height = 25
            };
            panel.Children.Add(_textBox);

            var btnPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            var okBtn = new Button { Content = "OK", Width = 80, Height = 25, Margin = new Thickness(0, 0, 10, 0) };
            okBtn.Click += (s, e) => { Input = _textBox.Text; DialogResult = true; Close(); };
            var cancelBtn = new Button { Content = "Cancel", Width = 80, Height = 25 };
            cancelBtn.Click += (s, e) => { DialogResult = false; Close(); };

            btnPanel.Children.Add(okBtn);
            btnPanel.Children.Add(cancelBtn);
            panel.Children.Add(btnPanel);

            Content = panel;
            _textBox.Focus();
        }
    }

    /// <summary>
    /// Dialog for adding a custom evaluator (name + prompt).
    /// </summary>
    public class CustomEvalDialog : Window
    {
        public string EvaluatorName { get; private set; } = "";
        public string Prompt { get; private set; } = "";

        private readonly TextBox _nameBox;
        private readonly TextBox _promptBox;

        public CustomEvalDialog()
        {
            Title = "Add Custom Evaluator";
            Width = 500;
            Height = 400;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;

            var panel = new StackPanel { Margin = new Thickness(15) };

            panel.Children.Add(new TextBlock { Text = "Evaluator name:", Margin = new Thickness(0, 0, 0, 4) });
            _nameBox = new TextBox { Height = 25, Margin = new Thickness(0, 0, 0, 12) };
            panel.Children.Add(_nameBox);

            panel.Children.Add(new TextBlock { Text = "Evaluation prompt:", Margin = new Thickness(0, 0, 0, 4) });
            _promptBox = new TextBox
            {
                Height = 200,
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Margin = new Thickness(0, 0, 0, 12),
                Text = "Is the response polite and professional? Answer YES/NO and explain why."
            };
            panel.Children.Add(_promptBox);

            var btnPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            var okBtn = new Button { Content = "Save", Width = 80, Height = 25, Margin = new Thickness(0, 0, 10, 0) };
            okBtn.Click += (s, e) =>
            {
                if (string.IsNullOrWhiteSpace(_nameBox.Text))
                {
                    MessageBox.Show("Name is required.", "AI Evaluator", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                EvaluatorName = _nameBox.Text.Trim();
                Prompt = _promptBox.Text.Trim();
                DialogResult = true;
                Close();
            };
            var cancelBtn = new Button { Content = "Cancel", Width = 80, Height = 25 };
            cancelBtn.Click += (s, e) => { DialogResult = false; Close(); };

            btnPanel.Children.Add(okBtn);
            btnPanel.Children.Add(cancelBtn);
            panel.Children.Add(btnPanel);

            Content = panel;
            _nameBox.Focus();
        }
    }
}
