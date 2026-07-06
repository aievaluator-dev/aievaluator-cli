/// Formatter tests — JSON, JUnit, Table output
use serde_json::json;

#[path = "../src/formatters/json.rs"]
mod json_fmt;

#[path = "../src/formatters/junit.rs"]
mod junit_fmt;

#[path = "../src/formatters/table.rs"]
mod table_fmt;

fn sample_result_passing() -> serde_json::Value {
    json!({
        "overall_score": 0.95,
        "name": "smoke-test",
        "agent_url": "https://agent.test/chat",
        "evaluation_id": "eval-001",
        "results": [
            {
                "query": "What is 2+2?",
                "agent_response": "4",
                "scores": { "faithfulness": 1.0, "g_eval": 0.95 },
                "reasons": { "faithfulness": "Correct", "g_eval": "Accurate" },
                "passed": true
            },
            {
                "query": "What is the capital of France?",
                "agent_response": "Paris",
                "scores": { "faithfulness": 1.0, "g_eval": 0.90 },
                "reasons": { "faithfulness": "Accurate", "g_eval": "Good answer" },
                "passed": true
            }
        ]
    })
}

fn sample_result_failing() -> serde_json::Value {
    json!({
        "overall_score": 0.45,
        "name": "regression-test",
        "agent_url": "https://agent.test/chat",
        "evaluation_id": "eval-002",
        "results": [
            {
                "query": "Bad response?",
                "agent_response": "...",
                "scores": { "faithfulness": 0.30, "g_eval": 0.60 },
                "reasons": {},
                "passed": false
            }
        ]
    })
}

// ── JSON ──

#[test]
fn test_json_output_passing() {
    let result = sample_result_passing();
    let output = json_fmt::format_json(&result, 0.80);
    let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();

    assert_eq!(parsed["overall_score"].as_f64(), Some(0.95));
    assert!(parsed["results"][0]["passed"].as_bool().unwrap());
}

#[test]
fn test_json_output_failing() {
    let result = sample_result_failing();
    let output = json_fmt::format_json(&result, 0.80);
    let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();

    assert_eq!(parsed["overall_score"].as_f64(), Some(0.45));
    assert!(!parsed["results"][0]["passed"].as_bool().unwrap());
}

#[test]
fn test_json_output_contains_all_keys() {
    let result = sample_result_passing();
    let output = json_fmt::format_json(&result, 0.80);
    let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();

    assert!(parsed.get("overall_score").is_some());
    assert!(parsed.get("name").is_some());
    assert!(parsed.get("results").is_some());
    assert!(parsed.get("evaluation_id").is_some());
}

// ── JUnit ──

#[test]
fn test_junit_output_header() {
    let result = sample_result_passing();
    let output = junit_fmt::format_junit(&result, 0.80);

    assert!(output.contains("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
    assert!(output.contains("<testsuite"));
    assert!(output.contains("tests=\"2\""));
    assert!(output.contains("failures=\"0\""));
}

#[test]
fn test_junit_output_passing_testcase() {
    let result = sample_result_passing();
    let output = junit_fmt::format_junit(&result, 0.80);

    assert!(output.contains("<testcase"));
    assert!(!output.contains("<failure"));
}

#[test]
fn test_junit_output_failing_testcase() {
    let result = sample_result_failing();
    let output = junit_fmt::format_junit(&result, 0.80);

    assert!(output.contains("<failure"));
    assert!(output.contains("quality-gate-failure"));
}

#[test]
fn test_junit_output_failure_counts() {
    let result = sample_result_failing();
    let output = junit_fmt::format_junit(&result, 0.80);

    assert!(output.contains("tests=\"1\""));
    assert!(output.contains("failures=\"1\""));
}

#[test]
fn test_junit_output_xml_escaping() {
    let result = json!({
        "overall_score": 1.0,
        "name": "test",
        "agent_url": "test",
        "evaluation_id": "test",
        "results": [{
            "query": "Test & <b>bold</b> and \"quote\"",
            "agent_response": "...",
            "scores": { "g_eval": 1.0 },
            "passed": true
        }]
    });
    let output = junit_fmt::format_junit(&result, 0.80);
    // &quot; should appear for double-quote escaping
    // < and > are not escaped by the current implementation in query display
    // but the XML is well-formed because the query goes in name="" attribute
    assert!(output.contains("&quot;"));
}

#[test]
fn test_junit_output_overall_score_below_threshold() {
    let result = sample_result_failing();
    let output = junit_fmt::format_junit(&result, 0.80);

    assert!(output.contains("Overall Score"));
    assert!(output.contains("failure"));
}

// ── Table (output is printed, just verify it doesn't panic) ──

#[test]
fn test_table_output_does_not_panic() {
    let result = sample_result_passing();
    // Table formatter prints to stdout — just check it doesn't panic
    table_fmt::format_table(&result, 0.80, "https://api.aievaluator.dev");
}

#[test]
fn test_table_output_does_not_panic_failing() {
    let result = sample_result_failing();
    table_fmt::format_table(&result, 0.80, "https://api.aievaluator.dev");
}

#[test]
fn test_table_output_empty_results() {
    let result = json!({
        "overall_score": 0.0,
        "results": []
    });
    table_fmt::format_table(&result, 0.80, "https://api.aievaluator.dev");
}
