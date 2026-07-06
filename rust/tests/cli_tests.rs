/// CLI integration tests — launch the binary and verify behavior
use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::TempDir;

fn binary() -> Command {
    Command::cargo_bin("aievaluator").unwrap()
}

// ── help / version ──

#[test]
fn test_help_flag() {
    binary()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("AI Evaluator CLI"));
}

#[test]
fn test_version_flag() {
    binary()
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("1.1.0"));
}

// ── login ──

#[test]
fn test_login_empty_key() {
    binary()
        .arg("login")
        .arg("--api-key")
        .arg("")
        .assert()
        .failure()
        .stderr(predicate::str::contains("cannot be empty"));
}

#[test]
fn test_login_with_invalid_key_triggers_error() {
    binary()
        .arg("login")
        .arg("--api-key")
        .arg("bad-key")
        .assert()
        .failure();
}

// ── whoami ──

#[test]
fn test_whoami_not_logged_in() {
    binary()
        .arg("whoami")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Not logged in"));
}

// ── quick ──

#[test]
fn test_quick_no_query_no_dataset() {
    binary()
        .arg("quick")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Provide a query or --dataset"));
}

#[test]
fn test_quick_with_query_connects() {
    // Should attempt connection (will fail with network error in CI, but not argument error)
    let result = binary()
        .arg("quick")
        .arg("test query")
        .assert();
    // It should NOT fail with "Provide a query" — it progresses to connection
    let stderr = String::from_utf8_lossy(&result.get_output().stderr);
    assert!(!stderr.contains("Provide a query"));
}

#[test]
fn test_quick_with_dataset_file() {
    let dir = TempDir::new().unwrap();
    let dataset_path = dir.path().join("test.json");
    fs::write(&dataset_path, r#"[{"input": "hi"}]"#).unwrap();

    let result = binary()
        .arg("quick")
        .arg("--dataset")
        .arg(dataset_path.to_str().unwrap())
        .assert();

    let stderr = String::from_utf8_lossy(&result.get_output().stderr);
    assert!(!stderr.contains("Provide a query"));
}

#[test]
fn test_quick_with_dataset_jsonl() {
    let dir = TempDir::new().unwrap();
    let dataset_path = dir.path().join("test.jsonl");
    fs::write(&dataset_path, r#"{"input": "hi"}
{"input": "hello"}"#).unwrap();

    let result = binary()
        .arg("quick")
        .arg("--dataset")
        .arg(dataset_path.to_str().unwrap())
        .assert();

    let stderr = String::from_utf8_lossy(&result.get_output().stderr);
    assert!(!stderr.contains("Provide a query"));
}

#[test]
fn test_quick_dataset_not_found() {
    binary()
        .arg("quick")
        .arg("--dataset")
        .arg("/tmp/nonexistent-file-924812.json")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot read"));
}

// ── eval ──

#[test]
fn test_eval_missing_agent() {
    binary()
        .arg("eval")
        .args(["--dataset", "./evals/smoke-test.json"])
        .assert()
        .failure()
        .stderr(
            predicate::str::contains("error: the following required arguments were not provided")
                .or(predicate::str::contains("--agent")),
        );
}

#[test]
fn test_eval_missing_data_source() {
    binary()
        .arg("eval")
        .arg("--agent")
        .arg("https://example.com")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Provide --dataset or --rows"));
}

#[test]
fn test_eval_not_logged_in() {
    binary()
        .arg("eval")
        .args(["--agent", "https://example.com"])
        .args(["--rows", r#"[{"input":"hi"}]"#])
        .assert()
        .failure()
        .stderr(predicate::str::contains("API key required"));
}

// ── config ──

#[test]
fn test_config_show() {
    binary()
        .arg("config")
        .arg("show")
        .assert()
        .success();
}

#[test]
fn test_config_set_valid_key() {
    let dir = TempDir::new().unwrap();
    binary()
        .arg("config")
        .arg("set")
        .arg("engine-url")
        .arg("https://custom.example.com")
        .current_dir(dir.path())
        .env("HOME", dir.path())
        .env_remove("XDG_CONFIG_HOME")
        .assert()
        .success()
        .stdout(predicate::str::contains("https://custom.example.com"));
}

#[test]
fn test_config_set_invalid_key() {
    binary()
        .arg("config")
        .arg("set")
        .arg("bad-key")
        .arg("value")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Invalid key"));
}

#[test]
fn test_config_set_default_min_score() {
    let dir = TempDir::new().unwrap();
    binary()
        .arg("config")
        .arg("set")
        .arg("default-min-score")
        .arg("0.80")
        .current_dir(dir.path())
        .env("HOME", dir.path())
        .env_remove("XDG_CONFIG_HOME")
        .assert()
        .success();
}

#[test]
fn test_config_set_default_min_score_invalid() {
    binary()
        .arg("config")
        .arg("set")
        .arg("default-min-score")
        .arg("abc")
        .assert()
        .failure();
}

#[test]
fn test_config_unset() {
    let dir = TempDir::new().unwrap();
    binary()
        .arg("config")
        .arg("set")
        .arg("engine-url")
        .arg("https://x.com")
        .current_dir(dir.path())
        .env("HOME", dir.path())
        .env_remove("XDG_CONFIG_HOME")
        .assert()
        .success();

    binary()
        .arg("config")
        .arg("unset")
        .arg("engine-url")
        .current_dir(dir.path())
        .env("HOME", dir.path())
        .env_remove("XDG_CONFIG_HOME")
        .assert()
        .success()
        .stdout(predicate::str::contains("removed"));
}

// ── init ──

#[test]
fn test_init_creates_files() {
    let dir = TempDir::new().unwrap();

    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success();

    assert!(dir.path().join("aievaluator.config.json").exists());
    assert!(dir.path().join("evals").join("smoke-test.json").exists());
}

#[test]
fn test_init_idempotent() {
    let dir = TempDir::new().unwrap();

    // First run
    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success();

    // Second run — should skip existing files
    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success()
        .stdout(predicate::str::contains("already exists"));
}

#[test]
fn test_init_creates_gitignore_entry() {
    let dir = TempDir::new().unwrap();

    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success();

    let gitignore = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
    assert!(gitignore.contains("aievaluator.config.json"));
}

#[test]
fn test_init_no_duplicate_gitignore() {
    let dir = TempDir::new().unwrap();

    // First run
    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success();

    // Second run
    binary()
        .arg("init")
        .current_dir(dir.path())
        .assert()
        .success();

    let gitignore = fs::read_to_string(dir.path().join(".gitignore")).unwrap();
    // Should only appear once
    assert_eq!(
        gitignore.matches("aievaluator.config.json").count(),
        1
    );
}

// ── generate-ci ──

#[test]
fn test_generate_ci_github() {
    binary()
        .arg("generate-ci")
        .arg("--platform")
        .arg("github")
        .assert()
        .success()
        .stdout(predicate::str::contains("GitHub Actions"));
}

#[test]
fn test_generate_ci_gitlab() {
    binary()
        .arg("generate-ci")
        .arg("--platform")
        .arg("gitlab")
        .assert()
        .success()
        .stdout(predicate::str::contains("GitLab CI"));
}

#[test]
fn test_generate_ci_to_file() {
    let dir = TempDir::new().unwrap();
    let output = dir.path().join("ci.yml");

    binary()
        .arg("generate-ci")
        .arg("--output")
        .arg(output.to_str().unwrap())
        .current_dir(dir.path())
        .assert()
        .success();

    assert!(output.exists());
    let content = fs::read_to_string(&output).unwrap();
    assert!(content.contains("GitHub Actions"));
}

// ── dataset parsing edge cases ──

#[test]
fn test_quick_invalid_json_dataset() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("bad.json");
    fs::write(&path, "not json {{{").unwrap();

    binary()
        .arg("quick")
        .arg("--dataset")
        .arg(path.to_str().unwrap())
        .assert()
        .failure()
        .stderr(predicate::str::contains("Invalid"));
}

#[test]
fn test_quick_single_object_dataset() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("single.json");
    fs::write(&path, r#"{"input": "hi"}"#).unwrap();

    let result = binary()
        .arg("quick")
        .arg("--dataset")
        .arg(path.to_str().unwrap())
        .assert();

    let stderr = String::from_utf8_lossy(&result.get_output().stderr);
    assert!(!stderr.contains("Invalid"));
    assert!(!stderr.contains("Provide a query"));
}
