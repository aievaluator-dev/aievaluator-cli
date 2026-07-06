use chrono::Utc;

pub fn format_junit(result: &serde_json::Value, min_score: f64) -> String {
    let results = result["results"].as_array().map(|a| a.as_slice()).unwrap_or(&[]);
    let overall_score = result["overall_score"].as_f64().unwrap_or(0.0);
    let name = result["name"].as_str().unwrap_or("AI Evaluator");
    let agent = result["agent_url"].as_str().unwrap_or("unknown");

    let mut xml = String::new();
    xml.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    xml.push('\n');

    let failures = results.iter().filter(|r| !r["passed"].as_bool().unwrap_or(false)).count();
    let tests = results.len();
    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    xml.push_str(&format!(
        r#"<testsuite name="{}" tests="{}" failures="{}" time="0" timestamp="{}" hostname="{}">"#,
        name, tests, failures, timestamp, agent
    ));
    xml.push('\n');

    for (i, r) in results.iter().enumerate() {
        let query = r["query"].as_str().unwrap_or("");
        let passed = r["passed"].as_bool().unwrap_or(false);
        let scores = r["scores"].as_object();

        let score_str = scores
            .map(|s| {
                s.iter()
                    .map(|(k, v)| {
                        let pct = (v.as_f64().unwrap_or(0.0) * 100.0) as u32;
                        format!("{}: {}%", k, pct)
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();

        let short_query = if query.len() > 100 {
            format!("{}...", &query[..100])
        } else {
            query.to_string()
        };

        xml.push_str(&format!(
            r#"  <testcase classname="aievaluator" name="[{}] {}" time="0">"#,
            i + 1,
            short_query.replace('"', "&quot;")
        ));
        xml.push('\n');

        if !passed {
            xml.push_str(&format!(
                r#"    <failure message="Scores: {}" type="quality-gate-failure"></failure>"#,
                score_str
            ));
            xml.push('\n');
        }

        xml.push_str("  </testcase>\n");
    }

    xml.push_str(&format!(
        r#"  <testcase classname="aievaluator.overall" name="Overall Score {}% (threshold {}%)" time="0">"#,
        (overall_score * 100.0) as u32,
        (min_score * 100.0) as u32
    ));
    if overall_score < min_score {
        xml.push_str(r#"    <failure message="Overall score below threshold"></failure>"#);
    }
    xml.push_str("\n  </testcase>\n");

    xml.push_str("</testsuite>\n");
    xml
}
