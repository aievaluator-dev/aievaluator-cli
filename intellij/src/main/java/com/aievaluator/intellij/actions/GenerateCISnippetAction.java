package com.aievaluator.intellij.actions;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.ui.Messages;
import org.jetbrains.annotations.NotNull;

import java.awt.datatransfer.StringSelection;

public class GenerateCISnippetAction extends AnAction {

    private static final String SNIPPET = """
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

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        CopyPasteManager.getInstance().setContents(new StringSelection(SNIPPET));
        Messages.showInfoMessage(
                e.getProject(),
                "GitHub Actions CI/CD snippet copied to clipboard!",
                "AI Evaluator");
    }
}
