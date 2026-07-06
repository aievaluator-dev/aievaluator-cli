package com.aievaluator.intellij.toolwindow;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.SimpleToolWindowPanel;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.components.JBLabel;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.util.ui.JBUI;
import org.jetbrains.annotations.NotNull;

import javax.swing.*;
import java.awt.*;
import java.awt.datatransfer.Clipboard;
import java.awt.datatransfer.StringSelection;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

public class AIEvaluatorToolWindowFactory implements ToolWindowFactory {

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        var panel = new SimpleToolWindowPanel(true, true);
        var content = new JPanel();
        content.setLayout(new BoxLayout(content, BoxLayout.Y_AXIS));
        content.setBorder(JBUI.Borders.empty(10));

        var apiKeyStatus = new JBLabel("API key: not set");

        // ── Setup section ──
        content.add(sectionTitle("SETUP"));
        content.add(actionButton("📁 Init eval project", () -> initProject(project, apiKeyStatus)));
        content.add(hintLabel("Creates config + example dataset in your project."));
        content.add(Box.createVerticalStrut(10));

        // ── Evaluate section ──
        content.add(sectionTitle("EVALUATE"));
        content.add(actionButton("▶ Quick eval (selection)", () -> evaluateSelection(project, apiKeyStatus)));
        content.add(actionButton("📋 Evaluate dataset file…", () -> evaluateDataset(project, apiKeyStatus)));
        content.add(hintLabel("Select text for quick eval, or pick a dataset file."));
        content.add(Box.createVerticalStrut(10));

        // ── Custom evaluators ──
        content.add(sectionTitle("CUSTOM EVALUATORS"));
        content.add(actionButton("+ Add Custom Evaluator", () -> addCustomEvaluator(project, apiKeyStatus)));
        content.add(hintLabel("Define your own evaluation criteria."));
        content.add(Box.createVerticalStrut(10));

        // ── Settings ──
        content.add(sectionTitle("SETTINGS"));
        content.add(actionButton("🔑 Set API Key", () -> setApiKey(apiKeyStatus)));
        content.add(actionButton("🌐 Open Dashboard", () -> openUrl("https://www.aievaluator.dev")));
        content.add(actionButton("📖 Tutorials", () -> openUrl("https://www.aievaluator.dev/tutorials")));
        content.add(apiKeyStatus);
        content.add(Box.createVerticalStrut(10));

        // ── CI/CD ──
        content.add(sectionTitle("CI/CD"));
        content.add(actionButton("📋 Generate CI/CD Snippet", AIEvaluatorToolWindowFactory::generateCISnippet));
        content.add(hintLabel("GitHub Actions / GitLab CI / Jenkins."));
        content.add(Box.createVerticalStrut(10));

        // ── Recent ──
        content.add(sectionTitle("RECENT"));
        content.add(new JBLabel("No evaluations yet."));

        toolWindow.getComponent().add(new JBScrollPane(content), BorderLayout.CENTER);
    }

    private static JComponent sectionTitle(String text) {
        var label = new JBLabel(text);
        label.setFont(JBUI.Fonts.label(11));
        label.setForeground(JBUI.CurrentTheme.Label.disabledForeground());
        label.setBorder(JBUI.Borders.emptyBottom(4));
        return label;
    }

    private static JComponent actionButton(String text, Runnable action) {
        var button = new JButton(text);
        button.setHorizontalAlignment(SwingConstants.LEFT);
        button.setMaximumSize(new Dimension(Integer.MAX_VALUE, button.getPreferredSize().height));
        button.addActionListener(e -> action.run());
        return button;
    }

    private static JComponent hintLabel(String text) {
        var label = new JBLabel(text);
        label.setFont(JBUI.Fonts.label(10));
        label.setForeground(JBUI.CurrentTheme.Label.disabledForeground());
        label.setBorder(JBUI.Borders.empty(0, 4, 0, 0));
        return label;
    }

    // ── Actions ──

    private void evaluateSelection(Project project, JBLabel statusLabel) {
        var editor = com.intellij.openapi.editor.EditorFactory.getInstance().getSelectedText();
        if (editor == null || editor.isEmpty()) {
            statusLabel.setText("⚠ Select text in the editor first.");
            return;
        }
        statusLabel.setText("Evaluating...");
        var apiKey = com.aievaluator.intellij.services.AIEvaluatorService.getApiKey();
        com.aievaluator.intellij.services.AIEvaluatorService.evaluateSelectionAsync(editor, apiKey, result -> {
            statusLabel.setText(result);
        });
    }

    private void evaluateDataset(Project project, JBLabel statusLabel) {
        var chooser = new JFileChooser();
        chooser.setDialogTitle("Select dataset file");
        if (chooser.showOpenDialog(null) == JFileChooser.APPROVE_OPTION) {
            var file = chooser.getSelectedFile();
            statusLabel.setText("Evaluating " + file.getName() + "...");
            var apiKey = com.aievaluator.intellij.services.AIEvaluatorService.getApiKey();
            com.aievaluator.intellij.services.AIEvaluatorService.evaluateDatasetAsync(file, apiKey, result -> {
                statusLabel.setText(result);
            });
        }
    }

    private void initProject(Project project, JBLabel statusLabel) {
        var basePath = project.getBasePath();
        if (basePath == null) {
            statusLabel.setText("⚠ Open a project first.");
            return;
        }
        var dir = new File(basePath);
        com.aievaluator.intellij.services.AIEvaluatorService.initProject(dir);
        statusLabel.setText("✅ Project initialized!");
    }

    private void setApiKey(JBLabel statusLabel) {
        var key = JOptionPane.showInputDialog(null,
                "Enter your AI Evaluator API key (from aievaluator.dev):",
                "AI Evaluator — Set API Key",
                JOptionPane.QUESTION_MESSAGE);
        if (key != null && !key.isBlank()) {
            com.aievaluator.intellij.services.AIEvaluatorService.setApiKey(key.trim());
            statusLabel.setText("API key: ✅ set");
        }
    }

    private void addCustomEvaluator(Project project, JBLabel statusLabel) {
        var name = JOptionPane.showInputDialog(null,
                "Custom evaluator name (used as metric reference):",
                "AI Evaluator — Add Custom Evaluator",
                JOptionPane.QUESTION_MESSAGE);
        if (name == null || name.isBlank()) return;

        var prompt = JOptionPane.showInputDialog(null,
                "Describe what the judge should evaluate:",
                "Custom Evaluator: " + name,
                JOptionPane.QUESTION_MESSAGE);
        if (prompt == null || prompt.isBlank()) return;

        statusLabel.setText("✅ Custom evaluator \"" + name + "\" added!");
    }

    private static void generateCISnippet() {
        var snippet = """
                # GitHub Actions — AI Quality Gate
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
                          aievaluator eval \\
                            --agent ${{ vars.STAGING_AGENT_URL }} \\
                            --dataset ./evals/regression.json \\
                            --metrics faithfulness,g_eval \\
                            --min-score 0.80 \\
                            --ci \\
                            --format junit > report.xml
                        env:
                          AIEVALUATOR_API_KEY: ${{ secrets.AI_EVALUATOR_API_KEY }}
                """;
        var clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
        clipboard.setContents(new StringSelection(snippet), null);
    }

    private static void openUrl(String url) {
        try {
            Desktop.getDesktop().browse(URI.create(url));
        } catch (IOException e) {
            // Ignore
        }
    }
}
