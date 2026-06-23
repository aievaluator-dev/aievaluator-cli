package formatters

import (
	"encoding/json"
	"fmt"
	"strings"
)

func FormatTable(data map[string]interface{}, minScore float64, engineURL string) {
	results, _ := data["results"].([]interface{})
	overallScore, _ := data["overall_score"].(float64)
	totalRows, _ := data["total_rows"].(float64)
	if totalRows == 0 {
		totalRows = float64(len(results))
	}
	inputTokens, _ := data["input_tokens"].(float64)
	outputTokens, _ := data["output_tokens"].(float64)
	evalID, _ := data["evaluation_id"].(string)

	failed := 0
	for _, r := range results {
		m, _ := r.(map[string]interface{})
		if passed, _ := m["passed"].(bool); !passed {
			failed++
		}
	}

	scorePct := overallScore * 100
	passed := overallScore >= minScore
	icon := "✅"
	if !passed {
		icon = "❌"
	}
	thresholdPct := minScore * 100

	fmt.Println()
	fmt.Printf("  AI Evaluator — Results\n")
	fmt.Printf("  Overall Score:  %.1f%%  %s %s threshold (%.0f%%)\n", scorePct, icon, map[bool]string{true: "above", false: "below"}[passed], thresholdPct)
	fmt.Printf("  Total rows:     %.0f\n", totalRows)
	fmt.Printf("  Failed:         %d\n", failed)
	fmt.Printf("  Tokens:         ↓%.0f · ↑%.0f\n", inputTokens, outputTokens)
	if evalID != "" {
		fmt.Printf("  Dashboard:      %s/evaluations/%s/report\n", engineURL, evalID)
	}
	fmt.Println()

	sep := strings.Repeat("─", 46)
	fmt.Printf("┌────┬%s┬──────────┬──────┐\n", sep)
	fmt.Printf("│  # │ Query%-42s│ Score    │ Pass │\n", "")
	fmt.Printf("├────┼%s┼──────────┼──────┤\n", sep)

	for i, r := range results {
		m, _ := r.(map[string]interface{})
		query, _ := m["query"].(string)
		if len(query) > 46 {
			query = query[:46]
		}
		scores, _ := m["scores"].(map[string]interface{})
		firstScore := 0.0
		for _, v := range scores {
			if s, ok := v.(float64); ok {
				firstScore = s
				break
			}
		}
		scoreStr := fmt.Sprintf("%.0f%%", firstScore*100)
		passIcon := "✅"
		if p, _ := m["passed"].(bool); !p {
			passIcon = "❌"
		}
		fmt.Printf("│ %-3d│ %-46s│ %-9s│ %s   │\n", i+1, query, scoreStr, passIcon)
	}

	fmt.Printf("└────┴%s┴──────────┴──────┘\n", sep)
	fmt.Println()

	if passed {
		fmt.Printf("✅ Score %.1f%% meets threshold %.2f\n", scorePct, minScore)
	} else {
		fmt.Printf("❌ Score %.1f%% below threshold %.2f\n", scorePct, minScore)
	}
	fmt.Println()
}

func FormatJSON(data map[string]interface{}, minScore float64) string {
	results, _ := data["results"].([]interface{})
	overallScore, _ := data["overall_score"].(float64)
	totalRows, _ := data["total_rows"].(float64)
	if totalRows == 0 {
		totalRows = float64(len(results))
	}
	inputTokens, _ := data["input_tokens"].(float64)
	outputTokens, _ := data["output_tokens"].(float64)
	evalID, _ := data["evaluation_id"].(string)

	failed := 0
	for _, r := range results {
		m, _ := r.(map[string]interface{})
		if passed, _ := m["passed"].(bool); !passed {
			failed++
		}
	}

	out := map[string]interface{}{
		"evaluation_id":  evalID,
		"overall_score":  overallScore,
		"passed":         overallScore >= minScore,
		"min_score":      minScore,
		"total_rows":     int(totalRows),
		"failed_queries": failed,
		"input_tokens":   int(inputTokens),
		"output_tokens":  int(outputTokens),
		"results":        results,
	}
	b, _ := json.MarshalIndent(out, "", "  ")
	return string(b)
}

func FormatJUnit(data map[string]interface{}, minScore float64) string {
	results, _ := data["results"].([]interface{})
	failures := 0
	for _, r := range results {
		m, _ := r.(map[string]interface{})
		if passed, _ := m["passed"].(bool); !passed {
			failures++
		}
	}

	var sb strings.Builder
	sb.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
	sb.WriteString(fmt.Sprintf("<testsuite name=\"AI Evaluator\" tests=\"%d\" failures=\"%d\" errors=\"0\" time=\"0\">\n", len(results), failures))

	for i, r := range results {
		m, _ := r.(map[string]interface{})
		query, _ := m["query"].(string)
		if len(query) > 80 {
			query = query[:80]
		}
		query = escapeXML(query)

		if passed, _ := m["passed"].(bool); passed {
			sb.WriteString(fmt.Sprintf("  <testcase classname=\"AI Evaluator\" name=\"Query %d: %s\" time=\"0\">\n", i+1, query))
			sb.WriteString("  </testcase>\n")
		} else {
			scores, _ := m["scores"].(map[string]interface{})
			expected, _ := m["expected_output"].(string)
			got, _ := m["agent_response"].(string)

			sb.WriteString(fmt.Sprintf("  <testcase classname=\"AI Evaluator\" name=\"Query %d: %s\" time=\"0\">\n", i+1, query))
			sb.WriteString(fmt.Sprintf("    <failure message=\"Score below threshold %v\">\n", minScore))
			sb.WriteString(fmt.Sprintf("      Query: %s\n", escapeXML(query)))
			sb.WriteString(fmt.Sprintf("      Expected: %s\n", escapeXML(expected)))
			sb.WriteString(fmt.Sprintf("      Got: %s\n", escapeXML(got)))
			sb.WriteString(fmt.Sprintf("      Scores: %v\n", scores))
			sb.WriteString("    </failure>\n")
			sb.WriteString("  </testcase>\n")
		}
	}

	sb.WriteString("</testsuite>\n")
	return sb.String()
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}
