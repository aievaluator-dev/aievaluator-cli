package com.aievaluator.intellij.actions;

import com.aievaluator.intellij.services.AIEvaluatorService;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.ui.Messages;
import org.jetbrains.annotations.NotNull;

public class SetApiKeyAction extends AnAction {

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        var key = Messages.showPasswordDialog(
                e.getProject(),
                "Enter your AI Evaluator API key (from aievaluator.dev):",
                "AI Evaluator — Set API Key",
                Messages.getQuestionIcon());

        if (key != null && !key.isBlank()) {
            AIEvaluatorService.setApiKey(key.trim());
            Messages.showInfoMessage(e.getProject(), "API key saved!", "AI Evaluator");
        }
    }
}
