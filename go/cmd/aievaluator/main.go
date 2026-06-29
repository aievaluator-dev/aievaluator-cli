package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"example.com/aievaluator/internal/api"
	"example.com/aievaluator/internal/config"
	"example.com/aievaluator/internal/formatters"

	"github.com/spf13/cobra"
)

var smokeTestDataset = []map[string]interface{}{
	{"input": "What is 2+2?", "expected_output": "4"},
	{"input": "What is the capital of France?", "expected_output": "Paris"},
	{"input": "Say hello in Spanish", "expected_output": "Hola"},
}

func parseDatasetFile(filePath string) ([]map[string]interface{}, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	if strings.HasSuffix(filePath, ".jsonl") {
		var rows []map[string]interface{}
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var row map[string]interface{}
			if err := json.Unmarshal([]byte(line), &row); err != nil {
				return nil, err
			}
			rows = append(rows, row)
		}
		return rows, scanner.Err()
	}
	var rows []map[string]interface{}
	if err := json.Unmarshal(data, &rows); err != nil {
		var row map[string]interface{}
		if err2 := json.Unmarshal(data, &row); err2 != nil {
			return nil, err
		}
		return []map[string]interface{}{row}, nil
	}
	return rows, nil
}

var version = "1.0.0"

func main() {
	var apiKeyFlag string
	var engineURLFlag string

	rootCmd := &cobra.Command{
		Use:   "aievaluator",
		Short: "AI Evaluator CLI — evaluate your LLM agents from the command line",
		Run: func(cmd *cobra.Command, args []string) {
			cmd.Help()
		},
	}
	rootCmd.Version = version

	// login
	loginCmd := &cobra.Command{
		Use:   "login",
		Short: "Authenticate with AI Evaluator",
		Run: func(cmd *cobra.Command, args []string) {
			key := apiKeyFlag
			if key == "" {
				fmt.Fprintln(os.Stderr)
				fmt.Fprintln(os.Stderr, "Enter your AI Evaluator API key:")
				fmt.Fprintln(os.Stderr, "(Get one at https://aievaluator.dev/settings)")
				fmt.Fprint(os.Stderr, "API key: ")
				fmt.Scanln(&key)
			}
			if key == "" {
				fmt.Fprintln(os.Stderr, "❌ API key cannot be empty.")
				os.Exit(2)
			}

			url := config.ResolveEngineURL(engineURLFlag)
			client := api.NewClient(url, key, 30)

			usage, err := client.GetUsage()
			if err != nil {
				fmt.Fprintf(os.Stderr, "❌ %v\n", err)
				os.Exit(2)
			}

			cfg := config.LoadConfig(true)
			cfg.APIKey = key
			cfg.EngineURL = url
			config.SaveConfig(cfg, true)

			tenantName, _ := usage["tenant_name"].(string)
			tier, _ := usage["tier"].(string)
			evalsUsed, _ := usage["evaluations_this_cycle"].(float64)
			evalsLimit, _ := usage["evaluations_limit"].(float64)

			fmt.Println()
			fmt.Printf("✅ Logged in as %s (%s)\n", tenantName, tier)
			fmt.Printf("   Evals: %.0f/%.0f this cycle\n", evalsUsed, evalsLimit)
			fmt.Println("   Config saved to ~/.config/aievaluator/config.json")
		},
	}
	loginCmd.Flags().StringVar(&apiKeyFlag, "api-key", "", "API key (non-interactive)")
	loginCmd.Flags().StringVar(&engineURLFlag, "engine-url", "", "Engine URL")
	rootCmd.AddCommand(loginCmd)

	// whoami
	whoamiCmd := &cobra.Command{
		Use:   "whoami",
		Short: "Show current tenant info",
		Run: func(cmd *cobra.Command, args []string) {
			key := config.ResolveAPIKey(apiKeyFlag)
			if key == "" {
				fmt.Fprintln(os.Stderr, "❌ Not logged in. Run: aievaluator login")
				os.Exit(2)
			}
			url := config.ResolveEngineURL(engineURLFlag)
			client := api.NewClient(url, key, 30)

			usage, err := client.GetUsage()
			if err != nil {
				fmt.Fprintf(os.Stderr, "❌ %v\n", err)
				os.Exit(2)
			}

			tenantName, _ := usage["tenant_name"].(string)
			tier, _ := usage["tier"].(string)
			evalsUsed, _ := usage["evaluations_this_cycle"].(float64)
			evalsLimit, _ := usage["evaluations_limit"].(float64)
			tin, _ := usage["input_tokens_this_cycle"].(float64)
			tout, _ := usage["output_tokens_this_cycle"].(float64)

			fmt.Println()
			fmt.Printf("Tenant:  %s\n", tenantName)
			fmt.Printf("Tier:    %s\n", tier)
			fmt.Printf("Evals:   %.0f/%.0f this cycle\n", evalsUsed, evalsLimit)
			fmt.Printf("Tokens:  ↓%.0f · ↑%.0f this cycle\n", tin, tout)
		},
	}
	whoamiCmd.Flags().StringVar(&apiKeyFlag, "api-key", "", "API key (overrides config)")
	rootCmd.AddCommand(whoamiCmd)

	// quick
	var quickDataset string
	var quickExpected string
	var quickAgent string
	var quickMetrics string
	var quickMinScoreStr string
	var quickJudge string

	quickCmd := &cobra.Command{
		Use:   "quick [query]",
		Short: "Quick eval via playground (no API key)",
		Run: func(cmd *cobra.Command, args []string) {
			query := ""
			if len(args) > 0 {
				query = args[0]
			}
			if query == "" && quickDataset == "" {
				fmt.Fprintln(os.Stderr, "❌ Provide a query or --dataset")
				os.Exit(2)
			}

			url := config.ResolveEngineURL(engineURLFlag)
			client := api.NewClient(url, "", 30)

			status, _ := client.PlaygroundStatus()
			remaining, _ := status["remaining"].(float64)
			limit, _ := status["limit"].(float64)
			resetsAt, _ := status["resets_at"].(string)

			fmt.Fprintf(os.Stderr, "⚠️  Playground mode — %.0f/%.0f remaining (resets at %s)\n\n", remaining, limit, resetsAt)

			if remaining <= 0 {
				fmt.Fprintln(os.Stderr, "❌ Playground limit reached. Run `aievaluator login` for 100 free evals/month.")
				os.Exit(2)
			}

			var rows []map[string]interface{}
			if query != "" {
				row := map[string]interface{}{"input": query}
				if quickExpected != "" {
					row["expected_output"] = quickExpected
				}
				rows = []map[string]interface{}{row}
			} else {
				var err error
				rows, err = parseDatasetFile(quickDataset)
				if err != nil {
					fmt.Fprintf(os.Stderr, "❌ Cannot read %s: %v\n", quickDataset, err)
					os.Exit(2)
				}
			}

			agent := quickAgent
			if agent == "" {
				agent = "/chat"
			}

			var quickMinScore float64
			if quickMinScoreStr != "" {
				if v, err := config.ParseFloat(quickMinScoreStr); err == nil {
					quickMinScore = v
				}
			}

			// Parse metrics: strings or dicts with thresholds
			var metricsList []interface{}
			if quickMetrics != "" {
				for _, item := range strings.Split(quickMetrics, ",") {
					item = strings.TrimSpace(item)
					if strings.Contains(item, ":") {
						parts := strings.SplitN(item, ":", 2)
						if v, err := config.ParseFloat(strings.TrimSpace(parts[1])); err == nil {
							metricsList = append(metricsList, map[string]interface{}{
								"name":      strings.TrimSpace(parts[0]),
								"threshold": v,
							})
						}
					} else if quickMinScore > 0 {
						metricsList = append(metricsList, map[string]interface{}{
							"name":      item,
							"threshold": quickMinScore,
						})
					} else {
						metricsList = append(metricsList, item)
					}
				}
			} else if quickMinScore > 0 {
				metricsList = append(metricsList, map[string]interface{}{
					"name":      "faithfulness",
					"threshold": quickMinScore,
				}, map[string]interface{}{
					"name":      "g_eval",
					"threshold": quickMinScore,
				})
			}

			result, err := client.PlaygroundEvaluate(nil, rows, agent, metricsList, quickJudge)
			if err != nil {
				fmt.Fprintf(os.Stderr, "❌ %v\n", err)
				os.Exit(2)
			}

			formatters.FormatTable(result, quickMinScore, url)

			// CU2: exit code based on --min-score
			if quickMinScore > 0 {
				allPassed := true
				if results, ok := result["results"].([]interface{}); ok {
					for _, r := range results {
						if m, ok := r.(map[string]interface{}); ok {
							if passed, ok := m["passed"].(bool); ok && !passed {
								allPassed = false
							}
						}
					}
				}
				if !allPassed {
					os.Exit(1)
				}
			}
		},
	}
	quickCmd.Flags().StringVar(&quickDataset, "dataset", "", "JSON dataset file")
	quickCmd.Flags().StringVar(&quickExpected, "expected", "", "Expected output")
	quickCmd.Flags().StringVar(&quickAgent, "agent", "/chat", "Agent endpoint URL")
	quickCmd.Flags().StringVar(&quickMetrics, "metrics", "", "Metrics: faithfulness,g_eval or faithfulness:0.90,g_eval:0.75")
	quickCmd.Flags().StringVar(&quickMinScoreStr, "min-score", "", "Apply threshold to all metrics and enforce exit code")
	quickCmd.Flags().StringVar(&quickJudge, "judge", "", "LLM judge model")
	quickCmd.Flags().StringVar(&engineURLFlag, "engine-url", "", "Engine URL")
	rootCmd.AddCommand(quickCmd)

	// eval
	var evalAgent string
	var evalDataset string
	var evalRows string
	var evalMetrics string
	var evalAgentFormat string
	var evalMinScore string
	var evalThresholds string
	var evalFormat string
	var evalCI bool
	var evalTimeout string
	var evalJudgeModel string
	var evalName string
	var evalCustomStr string

	evalCmd := &cobra.Command{
		Use:   "eval",
		Short: "Full evaluation against an agent",
		Run: func(cmd *cobra.Command, args []string) {
			if evalAgent == "" {
				fmt.Fprintln(os.Stderr, "❌ --agent is required")
				os.Exit(2)
			}
			if evalDataset == "" && evalRows == "" {
				fmt.Fprintln(os.Stderr, "❌ Provide --dataset or --rows")
				os.Exit(2)
			}

			key := config.ResolveAPIKey(apiKeyFlag)
			if key == "" {
				fmt.Fprintln(os.Stderr, "❌ API key required. Run: aievaluator login")
				os.Exit(2)
			}

			timeoutSec := 300
			if evalTimeout != "" {
				if t, err := config.ParseFloat(evalTimeout); err == nil {
					timeoutSec = int(t)
				}
			}

			url := config.ResolveEngineURL(engineURLFlag)
			client := api.NewClient(url, key, timeoutSec)

			var metricsList []string
			if evalMetrics != "" {
				metricsList = strings.Split(evalMetrics, ",")
				for i := range metricsList {
					metricsList[i] = strings.TrimSpace(metricsList[i])
				}
			} else {
				metricsList = strings.Split(config.ResolveDefaultMetrics(), ",")
			}

			minScore := config.ResolveDefaultMinScore()
			if evalMinScore != "" {
				if v, err := config.ParseFloat(evalMinScore); err == nil {
					minScore = v
				}
			}

			// Parse per-metric thresholds
			thresholds := make(map[string]float64)
			if evalThresholds != "" {
				for _, pair := range strings.Split(evalThresholds, ",") {
					pair = strings.TrimSpace(pair)
					parts := strings.SplitN(pair, ":", 2)
					if len(parts) == 2 {
						if v, err := config.ParseFloat(strings.TrimSpace(parts[1])); err == nil {
							thresholds[strings.TrimSpace(parts[0])] = v
						}
					}
				}
			}

			var result map[string]interface{}
			var err error

			var rows []map[string]interface{}
			if evalDataset != "" {
				rows, err = parseDatasetFile(evalDataset)
				if err != nil {
					fmt.Fprintf(os.Stderr, "❌ Cannot read dataset: %v\n", err)
					os.Exit(2)
				}
			} else {
				if err := json.Unmarshal([]byte(evalRows), &rows); err != nil {
					fmt.Fprintf(os.Stderr, "❌ Invalid JSON in --rows: %v\n", err)
					os.Exit(2)
				}
			}
			// CU3: parse inline custom evaluators
			var customEvaluators []map[string]interface{}
			if evalCustomStr != "" {
				if err := json.Unmarshal([]byte(evalCustomStr), &customEvaluators); err != nil {
					var single map[string]interface{}
					if err2 := json.Unmarshal([]byte(evalCustomStr), &single); err2 == nil {
						customEvaluators = []map[string]interface{}{single}
					} else {
						fmt.Fprintf(os.Stderr, "❌ Invalid JSON in --custom\n")
						os.Exit(2)
					}
				}
			}

			result, err = client.EvaluateSync(rows, evalAgent, evalAgentFormat, metricsList, evalJudgeModel, evalName, thresholds, customEvaluators)

			if err != nil {
				fmt.Fprintf(os.Stderr, "❌ %v\n", err)
				if apiErr, ok := err.(*api.APIError); ok && apiErr.Detail != nil {
					b, _ := json.MarshalIndent(apiErr.Detail, "", "  ")
					fmt.Fprintln(os.Stderr, string(b))
				}
				if apiErr, ok := err.(*api.APIError); ok && apiErr.StatusCode == 0 {
					os.Exit(3)
				}
				os.Exit(2)
			}

			switch evalFormat {
			case "json":
				fmt.Println(formatters.FormatJSON(result, minScore))
			case "junit":
				fmt.Println(formatters.FormatJUnit(result, minScore))
			default:
				formatters.FormatTable(result, minScore, url)
			}

			overallScore, _ := result["overall_score"].(float64)
			if overallScore < minScore {
				os.Exit(1)
			}
		},
	}
	evalCmd.Flags().StringVar(&evalAgent, "agent", "", "Agent endpoint URL")
	evalCmd.MarkFlagRequired("agent")
	evalCmd.Flags().StringVar(&evalDataset, "dataset", "", "JSON dataset file")
	evalCmd.Flags().StringVar(&evalRows, "rows", "", "Inline JSON array")
	evalCmd.Flags().StringVar(&evalMetrics, "metrics", "", "Metrics (comma-separated)")
	evalCmd.Flags().StringVar(&evalAgentFormat, "agent-format", "openai", "Agent API format")
	evalCmd.Flags().StringVar(&evalMinScore, "min-score", "", "Minimum overall score threshold (0-1)")
	evalCmd.Flags().StringVar(&evalThresholds, "thresholds", "", "Per-metric thresholds: faithfulness:0.90,g_eval:0.75")
	evalCmd.Flags().StringVar(&evalFormat, "format", "table", "Output format: table, json, junit")
	evalCmd.Flags().BoolVar(&evalCI, "ci", false, "CI mode (no colors)")
	evalCmd.Flags().StringVar(&evalTimeout, "timeout", "300", "Timeout in seconds")
	evalCmd.Flags().StringVar(&evalJudgeModel, "judge-model", "", "LLM judge model")
	evalCmd.Flags().StringVar(&evalName, "name", "", "Human-readable name for this evaluation")
	evalCmd.Flags().StringVar(&evalCustomStr, "custom", "", "Inline custom evaluator JSON")
	evalCmd.Flags().StringVar(&apiKeyFlag, "api-key", "", "API key (overrides config)")
	evalCmd.Flags().StringVar(&engineURLFlag, "engine-url", "", "Engine URL")
	rootCmd.AddCommand(evalCmd)

	// config
	var configCmd = &cobra.Command{Use: "config", Short: "Manage CLI configuration"}

	configCmd.AddCommand(&cobra.Command{
		Use:   "show",
		Short: "Show current configuration",
		Run: func(cmd *cobra.Command, args []string) {
			cfg := config.GetAllConfig()
			b, _ := json.MarshalIndent(cfg, "", "  ")
			if len(b) > 2 {
				fmt.Println(string(b))
			} else {
				fmt.Println("No configuration found. Run: aievaluator login")
			}
		},
	})

	configCmd.AddCommand(&cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			validKeys := map[string]bool{"engine-url": true, "default-metrics": true, "default-min-score": true}
			key := args[0]
			value := args[1]
			if !validKeys[key] {
				fmt.Fprintf(os.Stderr, "❌ Invalid key: %s\n", key)
				os.Exit(2)
			}
			cfgKey := config.CLIKeyToConfigKey(key)
			cfg := config.LoadConfig(true)
			cfgMap := map[string]interface{}{}
			// load into map
			b, _ := json.Marshal(cfg)
			json.Unmarshal(b, &cfgMap)

			if key == "default-min-score" {
				v, err := config.ParseFloat(value)
				if err != nil {
					fmt.Fprintln(os.Stderr, "❌ default-min-score must be a number (0-1)")
					os.Exit(2)
				}
				cfgMap[cfgKey] = v
			} else {
				cfgMap[cfgKey] = value
			}
			b, _ = json.Marshal(cfgMap)
			json.Unmarshal(b, &cfg)
			config.SaveConfig(cfg, true)
			fmt.Printf("✅ %s = %s\n", key, value)
		},
	})

	configCmd.AddCommand(&cobra.Command{
		Use:   "unset <key>",
		Short: "Remove a configuration value",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			key := args[0]
			cfgKey := config.CLIKeyToConfigKey(key)
			cfg := config.LoadConfig(true)
			cfgMap := map[string]interface{}{}
			b, _ := json.Marshal(cfg)
			json.Unmarshal(b, &cfgMap)

			if _, ok := cfgMap[cfgKey]; ok {
				delete(cfgMap, cfgKey)
				b, _ = json.Marshal(cfgMap)
				json.Unmarshal(b, &cfg)
				config.SaveConfig(cfg, true)
				fmt.Printf("✅ %s removed\n", key)
			} else {
				fmt.Printf("%s was not set\n", key)
			}
		},
	})

	rootCmd.AddCommand(configCmd)

	// init
	initCmd := &cobra.Command{
		Use:   "init",
		Short: "Initialize a new AI Evaluator project",
		Long:  "Creates aievaluator.config.json, evals/smoke-test.json, and updates .gitignore",
		Run: func(cmd *cobra.Command, args []string) {
			cwd, _ := os.Getwd()

			// 1. Create aievaluator.config.json
			configPath := filepath.Join(cwd, "aievaluator.config.json")
			if _, err := os.Stat(configPath); err == nil {
				fmt.Println("⏭️  aievaluator.config.json already exists, skipping")
			} else {
				defaults := map[string]interface{}{
					"engine_url":        "https://api.aievaluator.dev",
					"default_metrics":   "faithfulness,g_eval",
					"default_min_score": 0.80,
				}
				b, _ := json.MarshalIndent(defaults, "", "  ")
				os.WriteFile(configPath, append(b, '\n'), 0644)
				fmt.Println("✅ Created aievaluator.config.json")
			}

			// 2. Create evals/ + smoke-test.json
			evalsDir := filepath.Join(cwd, "evals")
			os.MkdirAll(evalsDir, 0755)
			smokePath := filepath.Join(evalsDir, "smoke-test.json")
			if _, err := os.Stat(smokePath); err == nil {
				fmt.Println("⏭️  evals/smoke-test.json already exists, skipping")
			} else {
				b, _ := json.MarshalIndent(smokeTestDataset, "", "  ")
				os.WriteFile(smokePath, append(b, '\n'), 0644)
				fmt.Println("✅ Created evals/smoke-test.json (3 example queries)")
			}

			// 3. Update .gitignore
			gitignorePath := filepath.Join(cwd, ".gitignore")
			entry := "aievaluator.config.json"
			data, err := os.ReadFile(gitignorePath)
			lines := ""
			if err == nil {
				lines = string(data)
			}
			if !strings.Contains(lines, entry) {
				f, err := os.OpenFile(gitignorePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
				if err == nil {
					if lines != "" && !strings.HasSuffix(lines, "\n") {
						f.WriteString("\n")
					}
					f.WriteString(entry + "\n")
					f.Close()
					fmt.Printf("✅ Added %s to .gitignore\n", entry)
				}
			}

			fmt.Println()
			fmt.Println("Next steps:")
			fmt.Println("  aievaluator quick --dataset ./evals/smoke-test.json")
			fmt.Println("  aievaluator login    (for 100 free evals/month)")
			fmt.Println()
		},
	}
	rootCmd.AddCommand(initCmd)

	var generateCiCmd = &cobra.Command{
		Use:   "generate-ci",
		Short: "Generate CI/CD workflow file for GitHub Actions or GitLab CI",
		Run: func(cmd *cobra.Command, args []string) {
			platform, _ := cmd.Flags().GetString("platform")
			dataset, _ := cmd.Flags().GetString("dataset")
			output, _ := cmd.Flags().GetString("output")

			var snippet string
			if platform == "gitlab" {
				snippet = fmt.Sprintf(`# GitLab CI — AI Quality Gate
ai-quality-gate:
  stage: test
  image: python:3.12
  before_script:
    - pip install aievaluator
  script:
    - |
      aievaluator eval \
        --agent ${STAGING_AGENT_URL} \
        --dataset %s \
        --metrics faithfulness,g_eval \
        --min-score 0.80 \
        --ci \
        --format junit > report.xml
  artifacts:
    reports:
      junit: report.xml
    when: always
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
`, dataset)
			} else if platform == "kubernetes" {
				snippet = fmt.Sprintf(`apiVersion: batch/v1
kind: Job
metadata:
  name: ai-evaluator-quality-gate
  labels:
    app: ai-evaluator
spec:
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      containers:
      - name: evaluator
        image: python:3.12
        command:
        - sh
        - -c
        - |
          pip install aievaluator
          aievaluator eval \
            --agent ${STAGING_AGENT_URL} \
            --dataset /data/%s \
            --metrics faithfulness,g_eval \
            --min-score 0.80 \
            --ci \
            --format junit > /data/report.xml
          cat /data/report.xml
        env:
        - name: AIEVALUATOR_API_KEY
          valueFrom:
            secretKeyRef:
              name: aievaluator-secrets
              key: api-key
        - name: STAGING_AGENT_URL
          value: "http://agent-service.default.svc.cluster.local/chat"
        volumeMounts:
        - name: datasets
          mountPath: /data
      volumes:
      - name: datasets
        configMap:
          name: eval-datasets
      restartPolicy: Never
  backoffLimit: 1
`, dataset)
			} else {
				snippet = fmt.Sprintf(`# GitHub Actions — AI Quality Gate
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
            --dataset %s \
            --metrics faithfulness,g_eval \
            --min-score 0.80 \
            --ci \
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: ${{ secrets.AI_EVALUATOR_API_KEY }}
      - name: Deploy
        if: success()
        run: ./deploy.sh
`, dataset)
			}

			if output != "" {
				err := os.WriteFile(output, []byte(snippet), 0644)
				if err != nil {
					fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
					os.Exit(1)
				}
				fmt.Printf("✅ Workflow written to %s\n", output)
			} else {
				fmt.Print(snippet)
			}
		},
	}
	generateCiCmd.Flags().StringP("platform", "p", "github", "CI/CD platform (github or gitlab)")
	generateCiCmd.Flags().StringP("dataset", "d", "./evals/regression.json", "Dataset file path")
	generateCiCmd.Flags().StringP("output", "o", "", "Output file (default: stdout)")
	rootCmd.AddCommand(generateCiCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
