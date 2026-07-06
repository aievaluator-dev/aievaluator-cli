package com.aievaluator.intellij.actions;

import com.aievaluator.intellij.services.AIEvaluatorService;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.ui.Messages;
import org.jetbrains.annotations.NotNull;

public class EvaluateSelectionAction extends AnAction {

    @Override
    public void update(@NotNull AnActionEvent e) {
        var editor = e.getData(CommonDataKeys.EDITOR);
        e.getPresentation().setEnabledAndVisible(
                editor != null && editor.getSelectionModel().hasSelection());
    }

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        var editor = e.getData(CommonDataKeys.EDITOR);
        if (editor == null) return;

        var selection = editor.getSelectionModel().getSelectedText();
        if (selection == null || selection.isEmpty()) {
            Messages.showInfoMessage("Select text in the editor first.", "AI Evaluator");
            return;
        }

        Messages.showInfoMessage("Evaluating...", "AI Evaluator");
        var apiKey = AIEvaluatorService.getApiKey();
        AIEvaluatorService.evaluateSelectionAsync(selection, apiKey, result -> {
            Messages.showInfoMessage(result, "AI Evaluator — Result");
        });
    }
}
