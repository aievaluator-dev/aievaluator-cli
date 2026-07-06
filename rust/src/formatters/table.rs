use colored::*;

pub fn format_table(result: &serde_json::Value, min_score: f64, engine_url: &str) {
    let results = result["results"].as_array().map(|a| a.as_slice()).unwrap_or(&[]);
    let overall_score = result["overall_score"].as_f64().unwrap_or(0.0);

    if results.is_empty() {
        println!("No results.");
        return;
    }

    for (i, r) in results.iter().enumerate() {
        if i > 0 {
            println!();
        }
        let query = r["query"].as_str().unwrap_or("");
        let passed = r["passed"].as_bool().unwrap_or(false);
        let icon = if passed { "✅" } else { "❌" };
        let scores = r["scores"].as_object();

        println!(
            "{} {}",
            icon,
            if query.len() > 80 {
                format!("{}...", &query[..80])
            } else {
                query.to_string()
            }
            .bold()
        );

        if let Some(s) = scores {
            for (metric, score) in s {
                let val = score.as_f64().unwrap_or(0.0);
                let pct = (val * 100.0) as u32;
                let color = if val >= 0.7 { "green" } else { "red" };
                println!(
                    "   {}: {}",
                    metric,
                    format!("{}%", pct).color(color)
                );
            }
        }

        let reasons = r["reasons"].as_object();
        if let Some(rc) = reasons {
            for (_metric, reason) in rc {
                let reason_str = reason.as_str().unwrap_or("");
                if !reason_str.is_empty() {
                    println!("     {}", reason_str.dimmed());
                }
            }
        }
    }

    println!();
    let pct = (overall_score * 100.0) as u32;
    let overall_icon = if overall_score >= min_score { "✅" } else { "❌" };
    println!(
        "{} Overall: {}  (threshold: {}%)",
        overall_icon,
        format!("{}%", pct).bold(),
        (min_score * 100.0) as u32
    );
    println!("⚙️  Engine: {}", engine_url.dimmed());
}
