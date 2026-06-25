package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestParseDatasetFile(t *testing.T) {
	tmpDir := t.TempDir()

	// 3.1: JSON array
	arrayFile := filepath.Join(tmpDir, "array.json")
	data := []map[string]interface{}{
		{"input": "Q1", "expected_output": "A1"},
		{"input": "Q2", "expected_output": "A2"},
	}
	b, _ := json.Marshal(data)
	os.WriteFile(arrayFile, b, 0644)
	rows, err := parseDatasetFile(arrayFile)
	if err != nil {
		t.Fatalf("3.1: unexpected error: %v", err)
	}
	if len(rows) != 2 || rows[0]["input"] != "Q1" {
		t.Error("3.1: JSON array parsing failed")
	}

	// 3.2: Single JSON object → wrapped in array
	singleFile := filepath.Join(tmpDir, "single.json")
	os.WriteFile(singleFile, []byte(`{"input": "Only one"}`), 0644)
	rows, err = parseDatasetFile(singleFile)
	if err != nil {
		t.Fatalf("3.2: unexpected error: %v", err)
	}
	if len(rows) != 1 || rows[0]["input"] != "Only one" {
		t.Error("3.2: single object not wrapped")
	}

	// 3.3: JSONL
	jsonlFile := filepath.Join(tmpDir, "test.jsonl")
	os.WriteFile(jsonlFile, []byte("{\"input\":\"Q1\"}\n\n{\"input\":\"Q2\"}\n"), 0644)
	rows, err = parseDatasetFile(jsonlFile)
	if err != nil {
		t.Fatalf("3.3: unexpected error: %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("3.3: expected 2 rows, got %d", len(rows))
	}

	// 3.4: Nonexistent file
	_, err = parseDatasetFile("/nonexistent/dataset.json")
	if err == nil {
		t.Error("3.4: expected error for missing file")
	}

	// 3.5: Invalid JSON
	badFile := filepath.Join(tmpDir, "bad.json")
	os.WriteFile(badFile, []byte("not valid {{{"), 0644)
	_, err = parseDatasetFile(badFile)
	if err == nil {
		t.Error("3.5: expected error for invalid JSON")
	}
}
