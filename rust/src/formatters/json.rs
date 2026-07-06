use serde_json::Value;

pub fn format_json(result: &Value, _min_score: f64) -> String {
    serde_json::to_string_pretty(result).unwrap_or_else(|_| "{}".to_string())
}
