package config

import (
	"testing"
)

func TestParseMetrics(t *testing.T) {
	// We test the parsing logic used in the CLI (comma-separated metrics with optional thresholds)

	// 4.1: Simple metrics
	input := "faithfulness,g_eval"
	parts := splitAndTrim(input)
	if len(parts) != 2 || parts[0] != "faithfulness" || parts[1] != "g_eval" {
		t.Errorf("4.1: got %v", parts)
	}

	// 4.2: Metrics with thresholds
	parsed := parseMetricsWithThresholds("faithfulness:0.90,g_eval:0.75", 0.0)
	if len(parsed) != 2 {
		t.Errorf("4.2: expected 2 items, got %d", len(parsed))
	}

	// 4.4: Empty
	if parseMetricsWithThresholds("", 0.0) != nil {
		t.Error("4.4: expected nil for empty")
	}

	// 4.5: Whitespace
	input2 := " faithfulness , g_eval "
	parts2 := splitAndTrim(input2)
	if parts2[0] != "faithfulness" {
		t.Errorf("4.5: got %q", parts2[0])
	}
}

func splitAndTrim(s string) []string {
	parts := []string{}
	for _, p := range splitComma(s) {
		parts = append(parts, trim(p))
	}
	return parts
}

// Replicating the logic from main.go for testing
func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	result := []string{}
	current := ""
	for _, ch := range s {
		if ch == ',' {
			result = append(result, current)
			current = ""
		} else {
			current += string(ch)
		}
	}
	result = append(result, current)
	return result
}

func trim(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}

func parseMetricsWithThresholds(metricsStr string, defaultThreshold float64) []interface{} {
	if metricsStr == "" {
		return nil
	}
	parts := splitComma(metricsStr)
	result := []interface{}{}
	for _, item := range parts {
		item = trim(item)
		if item == "" {
			continue
		}
		if idx := indexOf(item, ':'); idx >= 0 {
			name := trim(item[:idx])
			valStr := trim(item[idx+1:])
			if val, err := ParseFloat(valStr); err == nil {
				result = append(result, map[string]interface{}{"name": name, "threshold": val})
			}
		} else if defaultThreshold > 0 {
			result = append(result, map[string]interface{}{"name": item, "threshold": defaultThreshold})
		} else {
			result = append(result, item)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func indexOf(s string, ch byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == ch {
			return i
		}
	}
	return -1
}

func TestParseThresholds(t *testing.T) {
	// 5.1: Parse thresholds string
	parsed := make(map[string]float64)
	for _, pair := range splitComma("faithfulness:0.90,g_eval:0.75") {
		idx := indexOf(pair, ':')
		if idx < 0 {
			continue
		}
		name := trim(pair[:idx])
		if val, err := ParseFloat(trim(pair[idx+1:])); err == nil {
			parsed[name] = val
		}
	}
	if parsed["faithfulness"] != 0.90 {
		t.Error("5.1: wrong faithfulness")
	}
	if parsed["g_eval"] != 0.75 {
		t.Error("5.1: wrong g_eval")
	}

	// 5.3: Invalid value skipped
	parsed2 := make(map[string]float64)
	for _, pair := range splitComma("faithfulness:abc,g_eval:0.80") {
		idx := indexOf(pair, ':')
		if idx < 0 {
			continue
		}
		name := trim(pair[:idx])
		if val, err := ParseFloat(trim(pair[idx+1:])); err == nil {
			parsed2[name] = val
		}
	}
	if _, ok := parsed2["faithfulness"]; ok {
		t.Error("5.3: faithfulness should be skipped")
	}
	if parsed2["g_eval"] != 0.80 {
		t.Error("5.3: wrong g_eval")
	}
}
