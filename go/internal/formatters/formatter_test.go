package formatters

import (
	"encoding/json"
	"strings"
	"testing"
)

func mockResultAllPass() map[string]interface{} {
	return map[string]interface{}{
		"evaluation_id":  "eval-001",
		"overall_score":  0.85,
		"total_rows":     float64(2),
		"input_tokens":   float64(100),
		"output_tokens":  float64(50),
		"results": []interface{}{
			map[string]interface{}{"query": "Test 1", "scores": map[string]interface{}{"faithfulness": 1.0}, "passed": true},
			map[string]interface{}{"query": "Test 2", "scores": map[string]interface{}{"faithfulness": 0.9}, "passed": true},
		},
	}
}

func mockResultWithFailures() map[string]interface{} {
	return map[string]interface{}{
		"evaluation_id":  "eval-002",
		"overall_score":  0.75,
		"total_rows":     float64(2),
		"input_tokens":   float64(80),
		"output_tokens":  float64(40),
		"results": []interface{}{
			map[string]interface{}{"query": "Test 1", "scores": map[string]interface{}{"faithfulness": 1.0}, "passed": true},
			map[string]interface{}{"query": "Test 2 & <bad>", "expected_output": "Expected", "agent_response": "Bad", "scores": map[string]interface{}{"faithfulness": 0.5}, "passed": false},
		},
	}
}

func TestJSONOutput(t *testing.T) {
	// 6.1: Passed true
	output := FormatJSON(mockResultAllPass(), 0.80)
	var parsed map[string]interface{}
	json.Unmarshal([]byte(output), &parsed)
	if parsed["passed"] != true {
		t.Error("6.1: expected passed=true")
	}
	if parsed["failed_queries"].(float64) != 0 {
		t.Error("6.1: expected failed_queries=0")
	}

	// 6.2: Passed false
	output = FormatJSON(mockResultWithFailures(), 0.80)
	json.Unmarshal([]byte(output), &parsed)
	if parsed["passed"] != false {
		t.Error("6.2: expected passed=false")
	}
	if parsed["failed_queries"].(float64) != 1 {
		t.Error("6.2: expected failed_queries=1")
	}

	// 6.3: Structure
	if _, ok := parsed["evaluation_id"]; !ok {
		t.Error("6.3: missing evaluation_id")
	}
	if _, ok := parsed["results"]; !ok {
		t.Error("6.3: missing results")
	}

	// 6.4: Tokens
	if parsed["input_tokens"].(float64) != 80 {
		t.Error("6.4: input_tokens mismatch")
	}
}

func TestJUnitOutput(t *testing.T) {
	// 6.5: Header
	output := FormatJUnit(mockResultWithFailures(), 0.80)
	if !strings.Contains(output, `tests="2"`) {
		t.Error("6.5: missing tests count")
	}
	if !strings.Contains(output, `failures="1"`) {
		t.Error("6.5: missing failures count")
	}

	// 6.6: Passing testcase
	output = FormatJUnit(mockResultAllPass(), 0.80)
	if strings.Contains(output, "<failure") {
		t.Error("6.6: should not have failure elements")
	}

	// 6.7: Failing testcase
	output = FormatJUnit(mockResultWithFailures(), 0.80)
	if !strings.Contains(output, "<failure") {
		t.Error("6.7: should have failure element")
	}

	// 6.8: XML escaping
	if !strings.Contains(output, "&amp;") || !strings.Contains(output, "&lt;") {
		t.Error("6.8: XML special chars not escaped")
	}
}

func TestTableOutput(t *testing.T) {
	// 6.9/6.10: Table formatters run without panic
	FormatTable(mockResultAllPass(), 0.80, "https://api.aievaluator.dev")
	FormatTable(map[string]interface{}{"results": []interface{}{}}, 0.80, "https://api.aievaluator.dev")
}

func TestEscapeXML(t *testing.T) {
	if got := escapeXML("a & b < c > d \" e ' f"); got != "a &amp; b &lt; c &gt; d &quot; e &apos; f" {
		t.Errorf("escapeXML: got %q", got)
	}
}
