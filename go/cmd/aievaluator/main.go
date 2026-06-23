// AI Evaluator CLI — Go
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "1.0.0"

func main() {
	rootCmd := &cobra.Command{
		Use:   "aievaluator",
		Short: "AI Evaluator CLI — evaluate your LLM agents from the command line",
		Run: func(cmd *cobra.Command, args []string) {
			cmd.Help()
		},
	}
	rootCmd.Version = version

	rootCmd.AddCommand(&cobra.Command{
		Use:   "login",
		Short: "Authenticate with AI Evaluator",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("login: coming soon")
			fmt.Println("Get your API key at https://aievaluator.dev/settings")
		},
	})

	rootCmd.AddCommand(&cobra.Command{
		Use:   "whoami",
		Short: "Show current tenant info",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("whoami: coming soon")
		},
	})

	quickCmd := &cobra.Command{
		Use:   "quick [query]",
		Short: "Quick eval via playground (no API key)",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("quick: coming soon")
		},
	}
	quickCmd.Flags().String("dataset", "", "JSON dataset file")
	quickCmd.Flags().String("expected", "", "Expected output")
	quickCmd.Flags().String("agent", "/chat", "Agent endpoint URL")
	quickCmd.Flags().String("metrics", "", "Metrics (comma-separated)")
	rootCmd.AddCommand(quickCmd)

	evalCmd := &cobra.Command{
		Use:   "eval",
		Short: "Full evaluation against an agent",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("eval: coming soon")
		},
	}
	evalCmd.Flags().String("agent", "", "Agent endpoint URL")
	evalCmd.MarkFlagRequired("agent")
	evalCmd.Flags().String("dataset", "", "JSON dataset file")
	evalCmd.Flags().String("rows", "", "Inline JSON array")
	evalCmd.Flags().String("metrics", "", "Metrics (comma-separated)")
	evalCmd.Flags().String("min-score", "0.0", "Minimum score threshold (0-1)")
	evalCmd.Flags().String("format", "table", "Output format: table, json, junit")
	evalCmd.Flags().Bool("ci", false, "CI mode (no colors)")
	rootCmd.AddCommand(evalCmd)

	configCmd := &cobra.Command{Use: "config", Short: "Manage CLI configuration"}
	configCmd.AddCommand(&cobra.Command{Use: "show", Run: func(cmd *cobra.Command, args []string) { fmt.Println("{}") }})
	rootCmd.AddCommand(configCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
