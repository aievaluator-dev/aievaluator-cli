/// Configuration resolution tests (priority: flag > env > local > global)
/// NOTE: these tests rely on cwd and HOME isolation, so they MUST run serially.
/// Run with: cargo test config_tests -- --test-threads=1
use std::env;

#[path = "../src/api/config.rs"]
mod config;

use config::{load_config, save_config, Config};
use tempfile::TempDir;

/// Each test gets its own temp HOME and cwd to avoid cross-test pollution.
fn isolated_env() -> (TempDir, TempDir) {
    let home = TempDir::new().unwrap();
    let work = TempDir::new().unwrap();
    env::set_var("HOME", home.path());
    env::remove_var("XDG_CONFIG_HOME");
    env::set_current_dir(work.path()).unwrap();
    (home, work)
}

// ── resolve_api_key ──

#[test]
fn test_api_key_flag_priority() {
    let (_home, _work) = isolated_env();

    save_config(&Config {
        api_key: Some("local-key".into()),
        ..Default::default()
    }, false);

    env::set_var("AIEVALUATOR_API_KEY", "env-key");

    let result = config::resolve_api_key(Some("flag-key"));
    assert_eq!(result, Some("flag-key".to_string()));

    env::remove_var("AIEVALUATOR_API_KEY");
}

#[test]
fn test_api_key_env_priority() {
    let (_home, _work) = isolated_env();

    save_config(&Config {
        api_key: Some("local-key".into()),
        ..Default::default()
    }, false);

    env::set_var("AIEVALUATOR_API_KEY", "env-key");

    let result = config::resolve_api_key(None);
    assert_eq!(result, Some("env-key".to_string()));

    env::remove_var("AIEVALUATOR_API_KEY");
}

#[test]
fn test_api_key_local_config() {
    let (_home, _work) = isolated_env();

    save_config(&Config {
        api_key: Some("local-key".into()),
        ..Default::default()
    }, false);

    let result = config::resolve_api_key(None);
    assert_eq!(result, Some("local-key".to_string()));
}

#[test]
fn test_api_key_none() {
    let (_home, _work) = isolated_env();

    // No config, no env, no flag
    let result = config::resolve_api_key(None);
    assert_eq!(result, None);
}

#[test]
fn test_api_key_empty_flag_is_ignored() {
    let (_home, _work) = isolated_env();

    env::set_var("AIEVALUATOR_API_KEY", "env-key");

    // Empty string flag should fall through to env
    let result = config::resolve_api_key(Some(""));
    assert_eq!(result, Some("env-key".to_string()));

    env::remove_var("AIEVALUATOR_API_KEY");
}

// ── resolve_engine_url ──

#[test]
fn test_engine_url_flag_priority() {
    let (_home, _work) = isolated_env();

    env::set_var("AIEVALUATOR_ENGINE_URL", "https://env.example.com");

    let result = config::resolve_engine_url(Some("https://flag.example.com"));
    assert_eq!(result, "https://flag.example.com");

    env::remove_var("AIEVALUATOR_ENGINE_URL");
}

#[test]
fn test_engine_url_default() {
    let (_home, _work) = isolated_env();

    let result = config::resolve_engine_url(None);
    assert_eq!(result, "https://api.aievaluator.dev");
}

#[test]
fn test_engine_url_trailing_slash_stripped() {
    let (_home, _work) = isolated_env();

    let result = config::resolve_engine_url(Some("https://example.com/"));
    assert_eq!(result, "https://example.com");
}

#[test]
fn test_engine_url_env_priority() {
    let (_home, _work) = isolated_env();

    env::set_var("AIEVALUATOR_ENGINE_URL", "https://env.example.com");

    let result = config::resolve_engine_url(None);
    assert_eq!(result, "https://env.example.com");

    env::remove_var("AIEVALUATOR_ENGINE_URL");
}

// ── resolve_default_metrics ──

#[test]
fn test_default_metrics_resolution() {
    let (_home, _work) = isolated_env();

    let result = config::resolve_default_metrics();
    assert_eq!(result, "faithfulness,g_eval");
}

// ── resolve_default_min_score ──

#[test]
fn test_default_min_score_resolution() {
    let (_home, _work) = isolated_env();

    let result = config::resolve_default_min_score();
    assert_eq!(result, 0.0);
}

// ── config save/load round-trip ──

#[test]
fn test_save_and_load_config_roundtrip() {
    let (_home, work) = isolated_env();
    let cfg_path = work.path().join("aievaluator.config.json");

    let cfg = Config {
        api_key: Some("test-key".into()),
        engine_url: Some("https://engine.test".into()),
        default_metrics: Some("faithfulness,g_eval".into()),
        default_min_score: Some(0.80),
    };

    save_config(&cfg, false);
    assert!(cfg_path.exists());

    let loaded = load_config(false);
    assert_eq!(loaded.api_key, Some("test-key".into()));
    assert_eq!(loaded.engine_url, Some("https://engine.test".into()));
    assert_eq!(loaded.default_metrics, Some("faithfulness,g_eval".into()));
    assert_eq!(loaded.default_min_score, Some(0.80));
}

#[test]
fn test_load_nonexistent_config_returns_empty() {
    let (_home, _work) = isolated_env();

    let cfg = load_config(false);
    assert!(cfg.api_key.is_none());
    assert!(cfg.engine_url.is_none());
}

// ── get_all_config ──

#[test]
fn test_get_all_config_local_overrides_global() {
    let (_home, _work) = isolated_env();

    // Set up local config with engine_url
    let local = Config {
        engine_url: Some("https://local.example.com".into()),
        ..Default::default()
    };
    save_config(&local, false);

    let all = config::get_all_config();
    assert_eq!(all.engine_url, Some("https://local.example.com".into()));
}

#[test]
fn test_config_default_values_after_reset() {
    let (_home, _work) = isolated_env();

    // Save a config with non-default values
    save_config(&Config {
        api_key: Some("key".into()),
        engine_url: Some("https://custom.com".into()),
        default_metrics: Some("g_eval".into()),
        default_min_score: Some(0.5),
    }, false);

    // Then save empty config (simulating reset)
    save_config(&Config::default(), false);

    let cfg = load_config(false);
    assert!(cfg.api_key.is_none());
    assert!(cfg.engine_url.is_none());
    assert!(cfg.default_metrics.is_none());
    assert!(cfg.default_min_score.is_none());
}
