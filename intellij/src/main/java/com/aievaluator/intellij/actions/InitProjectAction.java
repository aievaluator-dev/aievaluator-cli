package com.aievaluator.intellij.actions;

import com.aievaluator.intellij.services.AIEvaluatorService;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.Messages;
import org.jetbrains.annotations.NotNull;

import java.io.File;

public class InitProjectAction extends AnAction {

    @Override
    public void actionPerformed(@NotNull AnActionEvent e) {
        var project = e.getProject();
        if (project == null || project.getBasePath() == null) {
            Messages.showInfoMessage("Open a project first.", "AI Evaluator");
            return;
        }

        AIEvaluatorService.initProject(new File(project.getBasePath()));
        Messages.showInfoMessage(
                "Project initialized! Created evals/smoke-test.json, results/, and aievaluator.config.json.",
                "AI Evaluator");
    }
}
