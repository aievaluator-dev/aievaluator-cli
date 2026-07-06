package com.aievaluator.intellij.actions;

import com.aievaluator.intellij.services.AIEvaluatorService;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CommonDataKeys;
import com.intellij.openapi.ui.Messages;
import com.intellij.openapi.vfs.VirtualFile;
import org.jetbrains.annotations.NotNull;

import java.io.File;

public class EvaluateDatasetAction extends AnAction {

    @Override
    public void update(@NotNull AnActionEvent e) {
        var file = e.getData(CommonDataKeys.VIRTUAL_FILE);
        boolean visible = false;
        if (file != null) {
            var name = file.getName();
            visible = name.endsWith(".json") || name.endsWith(".jsonl");
        }
        e.getPresentation().setEnabledAndVisible(visible);
    }

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        var file = e.getData(CommonDataKeys.VIRTUAL_FILE);
        if (file == null) return;

        var ioFile = new File(file.getPath());
        Messages.showInfoMessage("Evaluating " + file.getName() + "...", "AI Evaluator");
        var apiKey = AIEvaluatorService.getApiKey();
        AIEvaluatorService.evaluateDatasetAsync(ioFile, apiKey, result -> {
            Messages.showInfoMessage(result, "AI Evaluator — Result");
        });
    }
}
