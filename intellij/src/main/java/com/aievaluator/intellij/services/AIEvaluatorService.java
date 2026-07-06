package com.aievaluator.intellij.services;

import com.google.gson.*;
import com.intellij.ide.util.PropertiesComponent;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

public class AIEvaluatorService {

    private static final String ENGINE_URL = "https://api.aievaluator.dev";
    private static final String API_KEY_SETTINGS_KEY = "aievaluator.apiKey";
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public static String getApiKey() {
        var key = PropertiesComponent.getInstance().getValue(API_KEY_SETTINGS_KEY);
        if (key == null || key.isEmpty()) {
            key = System.getenv("AIEVALUATOR_API_KEY");
        }
        return key != null ? key : "";
    }

    public static void setApiKey(String key) {
        PropertiesComponent.getInstance().setValue(API_KEY_SETTINGS_KEY, key);
    }

    public static void evaluateSelectionAsync(String query, String apiKey, Consumer<String> callback) {
        CompletableFuture.runAsync(() -> {
            try {
                var rows = new JsonArray();
                var row = new JsonObject();
                row.addProperty("input", query);
                rows.add(row);

                String result;
                if (!apiKey.isEmpty()) {
                    result = evaluateSync(apiKey, rows);
                } else {
                    result = playgroundEvaluate(rows);
                }

                var json = JsonParser.parseString(result).getAsJsonObject();
                var results = json.getAsJsonArray("results").get(0).getAsJsonObject();
                var passed = results.get("passed").getAsBoolean();
                var scores = results.getAsJsonObject("scores");

                var sb = new StringBuilder();
                sb.append(passed ? "✅ " : "❌ ");
                for (var entry : scores.entrySet()) {
                    var pct = (int)(entry.getValue().getAsDouble() * 100);
                    sb.append(entry.getKey()).append(": ").append(pct).append("% ");
                }
                callback.accept(sb.toString().trim());
            } catch (Exception e) {
                callback.accept("❌ " + e.getMessage());
            }
        });
    }

    public static void evaluateDatasetAsync(File file, String apiKey, Consumer<String> callback) {
        CompletableFuture.runAsync(() -> {
            try {
                var rows = parseDataset(file);
                String result;
                if (!apiKey.isEmpty()) {
                    result = evaluateSync(apiKey, rows);
                } else {
                    result = playgroundEvaluate(rows);
                }

                var json = JsonParser.parseString(result).getAsJsonObject();
                var overall = json.get("overall_score").getAsDouble();
                var passed = overall >= 0.80;
                var pct = (int)(overall * 100);
                callback.accept((passed ? "✅ " : "❌ ") + "Overall: " + pct + "%");
            } catch (Exception e) {
                callback.accept("❌ " + e.getMessage());
            }
        });
    }

    private static String evaluateSync(String apiKey, JsonArray rows) throws Exception {
        var body = new JsonObject();
        body.add("rows", rows);
        var agent = new JsonObject();
        agent.addProperty("url", "/chat");
        agent.addProperty("format", "openai");
        body.add("agent", agent);

        var metrics = new JsonArray();
        metrics.add("faithfulness");
        metrics.add("g_eval");
        body.add("metrics", metrics);

        return httpPost(ENGINE_URL + "/api/v1/evaluations/sync", body.toString(), apiKey);
    }

    private static String playgroundEvaluate(JsonArray rows) throws Exception {
        var body = new JsonObject();
        body.add("rows", rows);
        body.addProperty("agent_endpoint", "/chat");

        var metrics = new JsonArray();
        metrics.add("faithfulness");
        metrics.add("g_eval");
        body.add("metrics", metrics);

        return httpPost(ENGINE_URL + "/api/v1/playground/evaluate", body.toString(), null);
    }

    private static String httpPost(String url, String jsonBody, String apiKey) throws Exception {
        var client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();

        var builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(30));

        if (apiKey != null && !apiKey.isEmpty()) {
            builder.header("X-API-Key", apiKey);
        }

        var request = builder.POST(HttpRequest.BodyPublishers.ofString(jsonBody)).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            throw new IOException("Engine returned HTTP " + response.statusCode() + ": " + response.body());
        }

        return response.body();
    }

    private static JsonArray parseDataset(File file) throws IOException {
        var raw = Files.readString(file.toPath());
        if (file.getName().endsWith(".jsonl")) {
            var arr = new JsonArray();
            for (var line : raw.split("\n")) {
                if (!line.isBlank()) {
                    arr.add(JsonParser.parseString(line));
                }
            }
            return arr;
        }
        var el = JsonParser.parseString(raw);
        return el.isJsonArray() ? el.getAsJsonArray() : new JsonArray() {{ add(el); }};
    }

    public static void initProject(File projectDir) {
        try {
            var configPath = new File(projectDir, "aievaluator.config.json");
            if (!configPath.exists()) {
                var config = new JsonObject();
                config.addProperty("engine_url", "https://api.aievaluator.dev");
                config.addProperty("default_metrics", "faithfulness,g_eval");
                config.addProperty("default_min_score", 0.80);
                Files.writeString(configPath.toPath(), gson.toJson(config));
            }

            var evalsDir = new File(projectDir, "evals");
            evalsDir.mkdirs();

            var smokePath = new File(evalsDir, "smoke-test.json");
            if (!smokePath.exists()) {
                var dataset = new JsonArray();
                addRow(dataset, "What is 2+2?", "4");
                addRow(dataset, "What is the capital of France?", "Paris");
                addRow(dataset, "Say hello in Spanish", "Hola");
                Files.writeString(smokePath.toPath(), gson.toJson(dataset));
            }

            var resultsDir = new File(projectDir, "results");
            resultsDir.mkdirs();
        } catch (IOException e) {
            throw new RuntimeException("Failed to init project: " + e.getMessage(), e);
        }
    }

    private static void addRow(JsonArray arr, String input, String expected) {
        var row = new JsonObject();
        row.addProperty("input", input);
        row.addProperty("expected_output", expected);
        arr.add(row);
    }
}
