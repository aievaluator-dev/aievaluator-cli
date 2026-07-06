use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_metrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_min_score: Option<f64>,
}

fn global_config_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap().join(".config"));
    base.join("aievaluator").join("config.json")
}

fn load_json(path: &PathBuf) -> serde_json::Value {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or(serde_json::Value::Object(Default::default())),
        Err(_) => serde_json::Value::Object(Default::default()),
    }
}

fn save_json(path: &PathBuf, data: &serde_json::Value) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(path, serde_json::to_string_pretty(data).unwrap() + "\n").ok();
}

fn load_config_from(path: &PathBuf) -> Config {
    let v = load_json(path);
    serde_json::from_value(v).unwrap_or_default()
}

pub fn resolve_api_key(flag_value: Option<&str>) -> Option<String> {
    if let Some(v) = flag_value {
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    if let Ok(env) = std::env::var("AIEVALUATOR_API_KEY") {
        if !env.is_empty() {
            return Some(env);
        }
    }
    let local = load_config_from(&PathBuf::from("aievaluator.config.json"));
    if let Some(k) = local.api_key {
        if !k.is_empty() {
            return Some(k);
        }
    }
    let global = load_config_from(&global_config_path());
    global.api_key
}

pub fn resolve_engine_url(flag_value: Option<&str>) -> String {
    let default = "https://api.aievaluator.dev".to_string();
    if let Some(v) = flag_value {
        if !v.is_empty() {
            return v.trim_end_matches('/').to_string();
        }
    }
    if let Ok(env) = std::env::var("AIEVALUATOR_ENGINE_URL") {
        if !env.is_empty() {
            return env.trim_end_matches('/').to_string();
        }
    }
    let local = load_config_from(&PathBuf::from("aievaluator.config.json"));
    if let Some(u) = local.engine_url {
        if !u.is_empty() {
            return u.trim_end_matches('/').to_string();
        }
    }
    let global = load_config_from(&global_config_path());
    if let Some(u) = global.engine_url {
        if !u.is_empty() {
            return u.trim_end_matches('/').to_string();
        }
    }
    default
}

pub fn resolve_default_metrics() -> String {
    let local = load_config_from(&PathBuf::from("aievaluator.config.json"));
    if let Some(m) = local.default_metrics {
        return m;
    }
    let global = load_config_from(&global_config_path());
    global.default_metrics.unwrap_or_else(|| "faithfulness,g_eval".to_string())
}

pub fn resolve_default_min_score() -> f64 {
    let local = load_config_from(&PathBuf::from("aievaluator.config.json"));
    if let Some(s) = local.default_min_score {
        return s;
    }
    let global = load_config_from(&global_config_path());
    global.default_min_score.unwrap_or(0.0)
}

pub fn save_config(cfg: &Config, is_global: bool) {
    let path = if is_global {
        global_config_path()
    } else {
        PathBuf::from("aievaluator.config.json")
    };
    let json = serde_json::to_value(cfg).unwrap();
    save_json(&path, &json);
}

pub fn load_config(is_global: bool) -> Config {
    let path = if is_global {
        global_config_path()
    } else {
        PathBuf::from("aievaluator.config.json")
    };
    load_config_from(&path)
}

pub fn get_all_config() -> Config {
    let global = load_config(true);
    let local = load_config(false);
    Config {
        api_key: local.api_key.or(global.api_key),
        engine_url: local.engine_url.or(global.engine_url),
        default_metrics: local.default_metrics.or(global.default_metrics),
        default_min_score: local.default_min_score.or(global.default_min_score),
    }
}
