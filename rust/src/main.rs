mod api {
    pub mod config;
    pub mod client;
}
mod formatters {
    pub mod json;
    pub mod junit;
    pub mod table;
}

use api::client::ApiClient;
use api::config;
use clap::{Parser, Subcommand};
use formatters::{json, junit, table};
use std::fs;
use std::io::{self, Write};

const VERSION: &str = "1.1.0";

const SMOKE_TEST_DATASET: &str = r#"[
  { "input": "What is 2+2?", "expected_output": "4" },
  { "input": "What is the capital of France?", "expected_output": "Paris" },
  { "input": "Say hello in Spanish", "expected_output": "Hola" }
]"#;

#[derive(Parser)]
#[command(name = "aievaluator", about = "AI Evaluator CLI — evaluate your LLM agents from the command line", version = VERSION)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with AI Evaluator
    Login {
        #[arg(long = "api-key")]
        api_key: Option<String>,
        #[arg(long = "engine-url")]
        engine_url: Option<String>,
    },
    /// Show current tenant info
    Whoami {
        #[arg(long = "api-key")]
        api_key: Option<String>,
    },
    /// Quick eval via playground (no API key required)
    Quick {
        /// Query to evaluate
        query: Option<String>,
        #[arg(long = "dataset")]
        dataset: Option<String>,
        #[arg(long = "agent", default_value = "/chat")]
        agent: String,
        #[arg(long = "expected")]
        expected: Option<String>,
        #[arg(long = "metrics")]
        metrics: Option<String>,
        #[arg(long = "min-score")]
        min_score: Option<f64>,
        #[arg(long = "judge")]
        judge: Option<String>,
        #[arg(long = "engine-url")]
        engine_url: Option<String>,
    },
    /// Evaluate an AI agent against a dataset
    Eval {
        #[arg(long = "agent", required = true)]
        agent: String,
        #[arg(long = "dataset")]
        dataset: Option<String>,
        #[arg(long = "rows")]
        rows: Option<String>,
        #[arg(long = "metrics")]
        metrics: Option<String>,
        #[arg(long = "agent-format", default_value = "openai")]
        agent_format: String,
        #[arg(long = "min-score")]
        min_score: Option<f64>,
        #[arg(long = "thresholds")]
        thresholds: Option<String>,
        #[arg(long = "custom")]
        custom: Option<String>,
        #[arg(long = "format", default_value = "table")]
        format: String,
        #[arg(long = "ci")]
        ci: bool,
        #[arg(long = "timeout", default_value = "300")]
        timeout: u64,
        #[arg(long = "judge-model")]
        judge_model: Option<String>,
        #[arg(long = "name")]
        name: Option<String>,
        #[arg(long = "api-key")]
        api_key: Option<String>,
        #[arg(long = "engine-url")]
        engine_url: Option<String>,
    },
    /// Manage CLI configuration
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    /// Initialize a new AI Evaluator project
    Init,
    /// Generate CI/CD workflow file
    GenerateCi {
        #[arg(short = 'p', long = "platform", default_value = "github")]
        platform: String,
        #[arg(short = 'd', long = "dataset", default_value = "./evals/regression.json")]
        dataset: String,
        #[arg(short = 'o', long = "output")]
        output: Option<String>,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    /// Show current configuration
    Show,
    /// Set a configuration value
    Set {
        key: String,
        value: String,
    },
    /// Remove a configuration value
    Unset { key: String },
}

fn main() {
    let cli = Cli::parse();

    let result = run(cli);
    if let Err(code) = result {
        std::process::exit(code);
    }
}

fn run(cli: Cli) -> Result<(), i32> {
    match cli.command {
        Commands::Login { api_key, engine_url } => cmd_login(api_key, engine_url),
        Commands::Whoami { api_key } => cmd_whoami(api_key),
        Commands::Quick {
            query,
            dataset,
            agent,
            expected,
            metrics,
            min_score,
            judge,
            engine_url,
        } => cmd_quick(query, dataset, agent, expected, metrics, min_score, judge, engine_url),
        Commands::Eval {
            agent,
            dataset,
            rows,
            metrics,
            agent_format,
            min_score,
            thresholds,
            custom,
            format,
            ci: _,
            timeout,
            judge_model,
            name,
            api_key,
            engine_url,
        } => cmd_eval(
            agent, dataset, rows, metrics, agent_format, min_score, thresholds, custom, format,
            timeout, judge_model, name, api_key, engine_url,
        ),
        Commands::Config { action } => cmd_config(action),
        Commands::Init => cmd_init(),
        Commands::GenerateCi { platform, dataset, output } => cmd_generate_ci(platform, dataset, output),
    }
}

// ═══════════════════════════════════════════════════════════════════
//  login
// ═══════════════════════════════════════════════════════════════════

fn cmd_login(api_key: Option<String>, engine_url: Option<String>) -> Result<(), i32> {
    let key = match api_key {
        Some(k) => k,
        None => {
            eprintln!();
            eprintln!("Enter your AI Evaluator API key:");
            eprintln!("(Get one at https://aievaluator.dev/settings)");
            eprint!("API key: ");
            io::stderr().flush().ok();
            let mut input = String::new();
            io::stdin().read_line(&mut input).map_err(|_| 2)?;
            input.trim().to_string()
        }
    };

    if key.is_empty() {
        eprintln!("❌ API key cannot be empty.");
        return Err(2);
    }

    let url = config::resolve_engine_url(engine_url.as_deref());
    let client = ApiClient::new(&url, Some(&key), 30);

    match client.get_usage() {
        Ok(usage) => {
            let mut cfg = config::load_config(true);
            cfg.api_key = Some(key);
            cfg.engine_url = Some(url);
            config::save_config(&cfg, true);

            let tenant = usage["tenant_name"].as_str().unwrap_or("Unknown");
            let tier = usage["tier"].as_str().unwrap_or("unknown");
            let used = usage["evaluations_this_cycle"].as_u64().unwrap_or(0);
            let limit = usage["evaluations_limit"].as_u64().unwrap_or(0);

            println!();
            println!("✅ Logged in as {} ({})", tenant, tier);
            println!("   Evals: {}/{} this cycle", used, limit);
            println!("   Config saved to ~/.config/aievaluator/config.json");
            Ok(())
        }
        Err(e) => {
            eprintln!("❌ {}", e);
            Err(2)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  whoami
// ═══════════════════════════════════════════════════════════════════

fn cmd_whoami(api_key: Option<String>) -> Result<(), i32> {
    let key = config::resolve_api_key(api_key.as_deref());
    let key = match key {
        Some(k) => k,
        None => {
            eprintln!("❌ Not logged in. Run: aievaluator login");
            return Err(2);
        }
    };

    let url = config::resolve_engine_url(None);
    let client = ApiClient::new(&url, Some(&key), 30);

    match client.get_usage() {
        Ok(usage) => {
            let tenant = usage["tenant_name"].as_str().unwrap_or("Unknown");
            let tier = usage["tier"].as_str().unwrap_or("unknown");
            let used = usage["evaluations_this_cycle"].as_u64().unwrap_or(0);
            let limit = usage["evaluations_limit"].as_u64().unwrap_or(0);
            let tin = usage["input_tokens_this_cycle"].as_u64().unwrap_or(0);
            let tout = usage["output_tokens_this_cycle"].as_u64().unwrap_or(0);

            println!();
            println!("Tenant:  {}", tenant);
            println!("Tier:    {}", tier);
            println!("Evals:   {}/{} this cycle", used, limit);
            println!("Tokens:  ↓{} · ↑{} this cycle", tin, tout);
            Ok(())
        }
        Err(e) => {
            eprintln!("❌ {}", e);
            Err(2)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  quick
// ═══════════════════════════════════════════════════════════════════

fn cmd_quick(
    query: Option<String>,
    dataset: Option<String>,
    agent: String,
    expected: Option<String>,
    metrics_str: Option<String>,
    min_score: Option<f64>,
    judge: Option<String>,
    engine_url: Option<String>,
) -> Result<(), i32> {
    if query.is_none() && dataset.is_none() {
        eprintln!("❌ Provide a query or --dataset");
        return Err(2);
    }

    let url = config::resolve_engine_url(engine_url.as_deref());
    let client = ApiClient::new(&url, None, 30);

    let metrics = parse_quick_metrics(metrics_str.as_deref(), min_score);

    let status = client.playground_status().unwrap_or(serde_json::json!({
        "used": 0, "limit": 5, "remaining": 5, "resets_at": "midnight UTC"
    }));
    let remaining = status["remaining"].as_u64().unwrap_or(5);
    let limit = status["limit"].as_u64().unwrap_or(5);
    let resets = status["resets_at"].as_str().unwrap_or("midnight UTC");

    eprintln!("⚠️  Playground mode — {}/{} remaining (resets at {})", remaining, limit, resets);
    eprintln!();

    if remaining == 0 {
        eprintln!("❌ Playground limit reached. Run `aievaluator login` for 100 free evals/month.");
        return Err(2);
    }

    let rows = if let Some(q) = query {
        let mut r = vec![serde_json::json!({ "input": q })];
        if let Some(exp) = expected {
            r[0]["expected_output"] = serde_json::Value::String(exp);
        }
        r
    } else {
        parse_dataset_file(dataset.unwrap().as_str())?
    };

    let result = client.playground_evaluate(
        None,
        Some(&rows),
        Some(&agent),
        metrics.as_deref(),
        judge.as_deref(),
    );

    match result {
        Ok(data) => {
            let min = min_score.unwrap_or(0.0);
            table::format_table(&data, min, &url);

            let all_passed = data["results"]
                .as_array()
                .map(|a| a.iter().all(|r| r["passed"].as_bool().unwrap_or(false)))
                .unwrap_or(true);

            if min_score.is_some() && !all_passed {
                return Err(1);
            }
            Ok(())
        }
        Err(e) => {
            eprintln!("❌ {}", e);
            if let Some(detail) = e.detail {
                eprintln!("{}", serde_json::to_string_pretty(&detail).unwrap_or_default());
            }
            Err(2)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  eval
// ═══════════════════════════════════════════════════════════════════

#[allow(clippy::too_many_arguments)]
fn cmd_eval(
    agent: String,
    dataset: Option<String>,
    rows_str: Option<String>,
    metrics_str: Option<String>,
    agent_format: String,
    min_score: Option<f64>,
    thresholds_str: Option<String>,
    custom_str: Option<String>,
    format: String,
    timeout: u64,
    judge_model: Option<String>,
    name: Option<String>,
    api_key: Option<String>,
    engine_url: Option<String>,
) -> Result<(), i32> {
    if dataset.is_none() && rows_str.is_none() {
        eprintln!("❌ Provide --dataset or --rows");
        return Err(2);
    }

    let key = config::resolve_api_key(api_key.as_deref());
    let key = match key {
        Some(k) => k,
        None => {
            eprintln!("❌ API key required. Run: aievaluator login");
            return Err(2);
        }
    };

    let url = config::resolve_engine_url(engine_url.as_deref());
    let client = ApiClient::new(&url, Some(&key), timeout);

    let metrics_list: Vec<String> = metrics_str
        .map(|m| m.split(',').map(|s| s.trim().to_string()).collect())
        .unwrap_or_else(|| config::resolve_default_metrics().split(',').map(|s| s.to_string()).collect());

    let min_score_val = min_score.unwrap_or_else(|| config::resolve_default_min_score());

    let thresholds = parse_thresholds(thresholds_str.as_deref());

    let custom_evaluators: Option<Vec<serde_json::Value>> = custom_str.as_deref().map(|c| {
        let parsed: serde_json::Value = serde_json::from_str(c).unwrap_or(serde_json::Value::Null);
        if parsed.is_array() {
            parsed.as_array().unwrap().clone()
        } else {
            vec![parsed]
        }
    });

    let rows = if let Some(d) = dataset {
        parse_dataset_file(&d)?
    } else {
        let parsed: serde_json::Value =
            serde_json::from_str(&rows_str.unwrap()).map_err(|e| {
                eprintln!("❌ Invalid JSON: {}", e);
                2
            })?;
        if parsed.is_array() {
            parsed.as_array().unwrap().clone()
        } else {
            vec![parsed]
        }
    };

    match client.evaluate_sync(
        &rows,
        &agent,
        &agent_format,
        &metrics_list,
        judge_model.as_deref(),
        name.as_deref(),
        thresholds.as_ref(),
        custom_evaluators.as_deref(),
    ) {
        Ok(result) => {
            match format.as_str() {
                "json" => println!("{}", json::format_json(&result, min_score_val)),
                "junit" => println!("{}", junit::format_junit(&result, min_score_val)),
                _ => table::format_table(&result, min_score_val, &url),
            }

            let overall_score = result["overall_score"].as_f64().unwrap_or(0.0);
            if overall_score < min_score_val {
                return Err(1);
            }
            Ok(())
        }
        Err(e) => {
            eprintln!("❌ {}", e);
            if let Some(detail) = e.detail {
                eprintln!("{}", serde_json::to_string_pretty(&detail).unwrap_or_default());
            }
            Err(if e.status_code == 0 { 3 } else { 2 })
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  config
// ═══════════════════════════════════════════════════════════════════

fn cmd_config(action: ConfigAction) -> Result<(), i32> {
    match action {
        ConfigAction::Show => {
            let cfg = config::get_all_config();
            let json = serde_json::to_value(&cfg).unwrap();
            if json.as_object().map(|o| o.is_empty()).unwrap_or(true) {
                println!("No configuration found. Run: aievaluator login");
            } else {
                println!("{}", serde_json::to_string_pretty(&json).unwrap());
            }
            Ok(())
        }
        ConfigAction::Set { key, value } => {
            let valid_keys = ["engine-url", "default-metrics", "default-min-score"];
            if !valid_keys.contains(&key.as_str()) {
                eprintln!("❌ Invalid key: {}. Valid keys: {}", key, valid_keys.join(", "));
                return Err(2);
            }
            let mut cfg = config::load_config(true);

            if key == "default-min-score" {
                cfg.default_min_score = Some(value.parse::<f64>().map_err(|_| {
                    eprintln!("❌ default-min-score must be a number (0-1)");
                    2
                })?);
            } else if key == "default-metrics" {
                cfg.default_metrics = Some(value.clone());
            } else if key == "engine-url" {
                cfg.engine_url = Some(value.clone());
            }
            config::save_config(&cfg, true);
            println!("✅ {} = {}", key, value);
            Ok(())
        }
        ConfigAction::Unset { key } => {
            let valid_keys = ["engine-url", "default-metrics", "default-min-score"];
            if !valid_keys.contains(&key.as_str()) {
                eprintln!("❌ Invalid key: {}. Valid keys: {}", key, valid_keys.join(", "));
                return Err(2);
            }
            let mut cfg = config::load_config(true);
            let found = match key.as_str() {
                "engine-url" => { let was = cfg.engine_url.is_some(); cfg.engine_url = None; was }
                "default-metrics" => { let was = cfg.default_metrics.is_some(); cfg.default_metrics = None; was }
                "default-min-score" => { let was = cfg.default_min_score.is_some(); cfg.default_min_score = None; was }
                _ => false,
            };
            if found {
                config::save_config(&cfg, true);
                println!("✅ {} removed", key);
            } else {
                println!("{} was not set", key);
            }
            Ok(())
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  init
// ═══════════════════════════════════════════════════════════════════

fn cmd_init() -> Result<(), i32> {
    let cwd = std::env::current_dir().map_err(|_| 2)?;

    let config_path = cwd.join("aievaluator.config.json");
    if config_path.exists() {
        println!("⏭️  aievaluator.config.json already exists, skipping");
    } else {
        let content = serde_json::json!({
            "engine_url": "https://api.aievaluator.dev",
            "default_metrics": "faithfulness,g_eval",
            "default_min_score": 0.80,
        });
        fs::write(&config_path, serde_json::to_string_pretty(&content).unwrap() + "\n").map_err(|_| 2)?;
        println!("✅ Created aievaluator.config.json");
    }

    let evals_dir = cwd.join("evals");
    fs::create_dir_all(&evals_dir).ok();
    let smoke_path = evals_dir.join("smoke-test.json");
    if smoke_path.exists() {
        println!("⏭️  evals/smoke-test.json already exists, skipping");
    } else {
        fs::write(&smoke_path, SMOKE_TEST_DATASET).map_err(|_| 2)?;
        println!("✅ Created evals/smoke-test.json (3 example queries)");
    }

    let gitignore_path = cwd.join(".gitignore");
    let entry = "aievaluator.config.json";
    let gitignore_content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path).unwrap_or_default()
    } else {
        String::new()
    };

    if !gitignore_content.lines().any(|l| l.trim() == entry) {
        let suffix = if gitignore_content.ends_with('\n') { "" } else { "\n" };
        fs::write(&gitignore_path, format!("{}{}{}\n", gitignore_content, suffix, entry)).map_err(|_| 2)?;
        println!("✅ Added {} to .gitignore", entry);
    }

    println!();
    println!("Next steps:");
    println!("  aievaluator quick --dataset ./evals/smoke-test.json");
    println!("  aievaluator login    (for 100 free evals/month)");
    println!();
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  generate-ci
// ═══════════════════════════════════════════════════════════════════

fn cmd_generate_ci(platform: String, dataset: String, output: Option<String>) -> Result<(), i32> {
    let snippet = match platform.as_str() {
        "gitlab" => format!(
            r#"# GitLab CI — AI Quality Gate
ai-quality-gate:
  stage: test
  image: python:3.12
  before_script:
    - pip install aievaluator
  script:
    - |
      aievaluator eval \\
        --agent ${{STAGING_AGENT_URL}} \\
        --dataset {} \\
        --metrics faithfulness,g_eval \\
        --min-score 0.80 \\
        --ci \\
        --format junit > report.xml
  artifacts:
    reports:
      junit: report.xml
    when: always
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
"#,
            dataset
        ),
        "kubernetes" => format!(
            r#"apiVersion: batch/v1
kind: Job
metadata:
  name: ai-evaluator-quality-gate
  labels:
    app: ai-evaluator
spec:
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      containers:
      - name: evaluator
        image: python:3.12
        command:
        - sh
        - -c
        - |
          pip install aievaluator
          aievaluator eval \\
            --agent ${{STAGING_AGENT_URL}} \\
            --dataset /data/{} \\
            --metrics faithfulness,g_eval \\
            --min-score 0.80 \\
            --ci \\
            --format junit > /data/report.xml
          cat /data/report.xml
        env:
        - name: AIEVALUATOR_API_KEY
          valueFrom:
            secretKeyRef:
              name: aievaluator-secrets
              key: api-key
        - name: STAGING_AGENT_URL
          value: "http://agent-service.default.svc.cluster.local/chat"
        volumeMounts:
        - name: datasets
          mountPath: /data
      volumes:
      - name: datasets
        configMap:
          name: eval-datasets
      restartPolicy: Never
  backoffLimit: 1
"#,
            dataset
        ),
        _ => format!(
            r#"# GitHub Actions — AI Quality Gate
name: AI Quality Gate
on: [pull_request]
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install aievaluator
      - run: |
          aievaluator eval \\
            --agent ${{{{ vars.STAGING_AGENT_URL }}}} \\
            --dataset {} \\
            --metrics faithfulness,g_eval \\
            --min-score 0.80 \\
            --ci \\
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: ${{{{ secrets.AI_EVALUATOR_API_KEY }}}}
      - name: Deploy
        if: success()
        run: ./deploy.sh
"#,
            dataset
        ),
    };

    if let Some(o) = output {
        fs::write(&o, &snippet).map_err(|_| 2)?;
        println!("✅ Workflow written to {}", o);
    } else {
        print!("{}", snippet);
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

fn parse_quick_metrics(
    metrics_str: Option<&str>,
    default_threshold: Option<f64>,
) -> Option<Vec<serde_json::Value>> {
    metrics_str.map(|s| {
        s.split(',')
            .map(|item| {
                let trimmed = item.trim();
                if let Some((name, val)) = trimmed.split_once(':') {
                    serde_json::json!({
                        "name": name.trim(),
                        "threshold": val.trim().parse::<f64>().unwrap_or(0.7),
                    })
                } else if let Some(t) = default_threshold {
                    serde_json::json!({
                        "name": trimmed,
                        "threshold": t,
                    })
                } else {
                    serde_json::Value::String(trimmed.to_string())
                }
            })
            .collect()
    })
}

fn parse_thresholds(thresholds_str: Option<&str>) -> Option<std::collections::HashMap<String, f64>> {
    thresholds_str.map(|s| {
        s.split(',')
            .filter_map(|pair| {
                let (metric, val) = pair.split_once(':')?;
                Some((metric.trim().to_string(), val.trim().parse::<f64>().ok()?))
            })
            .collect()
    })
}

fn parse_dataset_file(file_path: &str) -> Result<Vec<serde_json::Value>, i32> {
    let raw = fs::read_to_string(file_path).map_err(|e| {
        eprintln!("❌ Cannot read {}: {}", file_path, e);
        2
    })?;

    if file_path.ends_with(".jsonl") {
        Ok(raw
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect())
    } else {
        let data: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
            eprintln!("❌ Invalid JSON in {}: {}", file_path, e);
            2
        })?;
        if data.is_array() {
            Ok(data.as_array().unwrap().clone())
        } else {
            Ok(vec![data])
        }
    }
}
