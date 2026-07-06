use reqwest::blocking::{Client, Response};

use std::time::Duration;

#[derive(Debug)]
pub struct ApiError {
    pub status_code: u16,
    pub message: String,
    pub detail: Option<serde_json::Value>,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

pub struct ApiClient {
    engine_url: String,
    api_key: Option<String>,
    #[allow(dead_code)]
    timeout_secs: u64,
    http: Client,
}

impl ApiClient {
    pub fn new(engine_url: &str, api_key: Option<&str>, timeout_secs: u64) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .danger_accept_invalid_certs(false)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            engine_url: engine_url.trim_end_matches('/').to_string(),
            api_key: api_key.map(String::from),
            timeout_secs,
            http: client,
        }
    }

    fn headers(&self) -> Vec<(&str, String)> {
        let mut h = vec![("Content-Type", "application/json".to_string())];
        if let Some(ref key) = self.api_key {
            h.push(("X-API-Key", key.clone()));
        }
        h
    }

    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value, ApiError> {
        let url = format!("{}{}", self.engine_url, path);
        let mut req = match method {
            "GET" => self.http.get(&url),
            "POST" => {
                let mut r = self.http.post(&url);
                if let Some(b) = body {
                    r = r.json(b);
                }
                r
            }
            _ => unreachable!(),
        };

        for (k, v) in self.headers() {
            req = req.header(k, v);
        }

        let resp: Response = req.send().map_err(|e| ApiError {
            status_code: 0,
            message: format!("Cannot connect to {}: {}", self.engine_url, e),
            detail: None,
        })?;

        let status = resp.status().as_u16();
        let body: serde_json::Value = resp.json().unwrap_or(serde_json::Value::Null);

        if status >= 400 {
            return Err(ApiError {
                status_code: status,
                message: format!("Engine returned HTTP {}", status),
                detail: Some(body.clone()),
            });
        }

        Ok(body)
    }

    pub fn get_usage(&self) -> Result<serde_json::Value, ApiError> {
        self.request("GET", "/api/v1/tenants/me/usage", None)
    }

    pub fn evaluate_sync(
        &self,
        rows: &[serde_json::Value],
        agent_url: &str,
        agent_format: &str,
        metrics: &[String],
        judge_model: Option<&str>,
        name: Option<&str>,
        thresholds: Option<&std::collections::HashMap<String, f64>>,
        custom_evaluators: Option<&[serde_json::Value]>,
    ) -> Result<serde_json::Value, ApiError> {
        let mut body = serde_json::json!({
            "rows": rows,
            "agent": { "url": agent_url, "format": agent_format },
            "metrics": metrics,
            "custom_evaluators": custom_evaluators.unwrap_or(&[]),
        });

        if let Some(n) = name {
            body["name"] = serde_json::Value::String(n.to_string());
        }
        if let Some(jm) = judge_model {
            body["judge_model"] = serde_json::Value::String(jm.to_string());
        }
        if let Some(t) = thresholds {
            let map: serde_json::Map<String, serde_json::Value> = t
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::Number(serde_json::Number::from_f64(*v).unwrap())))
                .collect();
            body["thresholds"] = serde_json::Value::Object(map);
        }

        self.request("POST", "/api/v1/evaluations/sync", Some(&body))
    }

    pub fn playground_evaluate(
        &self,
        queries: Option<&[String]>,
        rows: Option<&[serde_json::Value]>,
        agent_endpoint: Option<&str>,
        metrics: Option<&[serde_json::Value]>,
        judge: Option<&str>,
    ) -> Result<serde_json::Value, ApiError> {
        let mut body = serde_json::json!({
            "metrics": metrics.unwrap_or(&[serde_json::json!("faithfulness"), serde_json::json!("g_eval")]),
        });

        if let Some(q) = queries {
            body["queries"] = serde_json::json!(q);
        }
        if let Some(r) = rows {
            body["rows"] = serde_json::json!(r);
        }
        if let Some(ae) = agent_endpoint {
            body["agent_endpoint"] = serde_json::Value::String(ae.to_string());
        }
        if let Some(j) = judge {
            body["judge"] = serde_json::Value::String(j.to_string());
        }

        self.request("POST", "/api/v1/playground/evaluate", Some(&body))
    }

    pub fn playground_status(&self) -> Result<serde_json::Value, ApiError> {
        match self.request("GET", "/api/v1/playground/status", None) {
            Ok(v) => Ok(v),
            Err(_) => Ok(serde_json::json!({
                "used": 0, "limit": 5, "remaining": 5, "resets_at": "midnight UTC"
            })),
        }
    }
}
