package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"gitlab.com/aievaluator/aievaluator-cli/go/internal/api"
	"gitlab.com/aievaluator/aievaluator-cli/go/internal/config"
	"gitlab.com/aievaluator/aievaluator-cli/go/internal/formatters"

	"github.com/spf13/cobra"
)

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
				data, err := os.ReadFile(quickDataset)
				if err != nil {
					fmt.Fprintf(os.Stderr, "❌ Cannot read %s: %v\n", quickDataset, err)
					os.Exit(2)
				}
				json.Unmarshal(data, &rows)
			}

			agent := quickAgent
			if agent == "" {
				agent = "/chat"
			}

			var metricsList []string
			if quickMetrics != "" {
				metricsList = strings.Split(quickMetrics, ",")
				for i := range metricsList {
					metricsList[i] = strings.TrimSpace(metricsList[i])
				}
			}

			result, err := client.PlaygroundEvaluate(nil, rows, agent, metricsList, quickJudge)
			if err != nil {
				fmt.Fprintf(os.Stderr, "❌ %v\n", err)
				os.Exit(2)
			}

			formatters.FormatTable(result, 0.0, url)
		},
	}
	quickCmd.Flags().StringVar(&quickDataset, "dataset", "", "JSON dataset file")
	quickCmd.Flags().StringVar(&quickExpected, "expected", "", "Expected output")
	quickCmd.Flags().StringVar(&quickAgent, "agent", "/chat", "Agent endpoint URL")
	quickCmd.Flags().StringVar(&quickMetrics, "metrics", "", "Metrics (comma-separated)")
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
	var evalFormat string
	var evalCI bool
	var evalTimeout string
	var evalJudgeModel string
	var evalName string

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

			var result map[string]interface{}
			var err error

			if evalDataset != "" {
				result, err = client.EvaluateUpload(evalDataset, evalAgent, evalAgentFormat, strings.Join(metricsList, ","))
			} else {
				var rows []map[string]interface{}
				if err := json.Unmarshal([]byte(evalRows), &rows); err != nil {
					fmt.Fprintf(os.Stderr, "❌ Invalid JSON in --rows: %v\n", err)
					os.Exit(2)
				}
				result, err = client.EvaluateSync(rows, evalAgent, evalAgentFormat, metricsList, evalJudgeModel, evalName)
			}

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
	evalCmd.Flags().StringVar(&evalMinScore, "min-score", "", "Minimum score threshold (0-1)")
	evalCmd.Flags().StringVar(&evalFormat, "format", "table", "Output format: table, json, junit")
	evalCmd.Flags().BoolVar(&evalCI, "ci", false, "CI mode (no colors)")
	evalCmd.Flags().StringVar(&evalTimeout, "timeout", "300", "Timeout in seconds")
	evalCmd.Flags().StringVar(&evalJudgeModel, "judge-model", "", "LLM judge model")
	evalCmd.Flags().StringVar(&evalName, "name", "", "Human-readable name for this evaluation")
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

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
