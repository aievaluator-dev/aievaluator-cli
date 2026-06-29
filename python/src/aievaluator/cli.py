"""AI Evaluator CLI — main entry point.

Commands:
    aievaluator login      Authenticate with AI Evaluator
    aievaluator whoami     Show current tenant info
    aievaluator quick      Quick eval via playground (no API key)
    aievaluator eval       Full evaluation against an agent
    aievaluator config     Manage CLI configuration
"""

import asyncio
import json as json_mod
import os
import sys
from pathlib import Path
from typing import Optional

import click

from . import __version__
from .api.client import APIClient, APIError
from .config import (
    resolve_api_key,
    resolve_engine_url,
    resolve_default_metrics,
    resolve_default_min_score,
    save_config,
    load_config,
    get_all_config,
)
from .formatters import format_table, format_json_output, format_junit


def _parse_dataset_file(file_path: str) -> list[dict]:
    """Parse a dataset file (JSON or JSONL) into a list of rows."""
    with open(file_path, "r", encoding="utf-8") as f:
        raw = f.read()

    if file_path.endswith(".jsonl"):
        rows = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if line:
                rows.append(json_mod.loads(line))
        return rows
    else:
        data = json_mod.loads(raw)
        return data if isinstance(data, list) else [data]


def _run_async(coro):
    """Helper to run async coroutines from Click commands."""
    return asyncio.run(coro)


def _parse_quick_metrics(metrics_str: str | None, default_threshold: float | None = None) -> list | None:
    """Parse --metrics for quick command.

    CU1: "faithfulness:0.90,g_eval:0.75" → [{"name":"faithfulness","threshold":0.9}, ...]
    CU2: "faithfulness,g_eval" with default_threshold=0.8 → [{"name":"faithfulness","threshold":0.8}, ...]
    Simple: "faithfulness,g_eval" → ["faithfulness", "g_eval"]
    """
    if not metrics_str:
        return None
    result = []
    for item in metrics_str.split(","):
        item = item.strip()
        if ":" in item:
            name, val = item.split(":", 1)
            result.append({"name": name.strip(), "threshold": float(val.strip())})
        elif default_threshold is not None:
            result.append({"name": item, "threshold": default_threshold})
        else:
            result.append(item)
    return result


# ═══════════════════════════════════════════════════════════════════
#  CLI Group
# ═══════════════════════════════════════════════════════════════════

@click.group()
@click.version_option(version=__version__, prog_name="AI Evaluator CLI")
def main():
    """AI Evaluator CLI — evaluate your LLM agents from the command line.

    \b
    Quick start:
        aievaluator quick "What is 2+2?" --expected "4"
        aievaluator login
        aievaluator eval --agent https://my-agent.com/chat --dataset ./tests.json
    """
    pass


# ═══════════════════════════════════════════════════════════════════
#  login
# ═══════════════════════════════════════════════════════════════════

@main.command()
@click.option("--api-key", help="API key (non-interactive mode)", default=None)
@click.option("--engine-url", help="Engine URL", default=None)
def login(api_key: Optional[str], engine_url: Optional[str]):
    """Authenticate with AI Evaluator.

    Saves your API key to ~/.config/aievaluator/config.json.
    Get your key at https://aievaluator.dev/settings
    """
    if not api_key:
        click.echo()
        click.echo("Enter your AI Evaluator API key:")
        click.echo("(Get one at https://aievaluator.dev/settings)")
        api_key = click.prompt("API key", hide_input=False).strip()

    if not api_key:
        click.echo("❌ API key cannot be empty.", err=True)
        sys.exit(2)

    resolved_url = resolve_engine_url(engine_url)
    client = APIClient(resolved_url, api_key)

    async def _login():
        try:
            usage = await client.get_usage()
        except APIError as e:
            click.echo(f"❌ Invalid API key or engine unreachable: {e.message}", err=True)
            sys.exit(2)

        # Save to global config
        config = load_config()
        config["api_key"] = api_key
        config["engine_url"] = resolved_url
        save_config(config)

        tenant_name = usage.get("tenant_name", "Unknown")
        tier = usage.get("tier", "unknown")
        evals_used = usage.get("evaluations_this_cycle", 0)
        evals_limit = usage.get("evaluations_limit", "∞")

        click.echo()
        click.echo(f"✅ Logged in as {tenant_name} ({tier})")
        click.echo(f"   Evals: {evals_used}/{evals_limit} this cycle")
        click.echo(f"   Config saved to ~/.config/aievaluator/config.json")

    _run_async(_login())


# ═══════════════════════════════════════════════════════════════════
#  whoami
# ═══════════════════════════════════════════════════════════════════

@main.command()
@click.option("--api-key", help="API key (overrides config)", default=None)
def whoami(api_key: Optional[str]):
    """Show current tenant info and usage."""
    key = resolve_api_key(api_key)
    if not key:
        click.echo("❌ Not logged in. Run: aievaluator login", err=True)
        sys.exit(2)

    engine_url = resolve_engine_url()
    client = APIClient(engine_url, key)

    async def _whoami():
        try:
            usage = await client.get_usage()
        except APIError as e:
            click.echo(f"❌ {e.message}", err=True)
            sys.exit(2)

        tenant_name = usage.get("tenant_name", "Unknown")
        tier = usage.get("tier", "unknown")
        evals_used = usage.get("evaluations_this_cycle", 0)
        evals_limit = usage.get("evaluations_limit", "∞")
        tokens_in = usage.get("input_tokens_this_cycle", 0)
        tokens_out = usage.get("output_tokens_this_cycle", 0)

        click.echo()
        click.echo(f"Tenant:  {tenant_name}")
        click.echo(f"Tier:    {tier}")
        click.echo(f"Evals:   {evals_used}/{evals_limit} this cycle")
        click.echo(f"Tokens:  ↓{tokens_in:,} · ↑{tokens_out:,} this cycle")

    _run_async(_whoami())


# ═══════════════════════════════════════════════════════════════════
#  quick
# ═══════════════════════════════════════════════════════════════════

@main.command()
@click.argument("query", required=False)
@click.option("--dataset", "dataset_file", help="JSON dataset file", type=click.Path(exists=True), default=None)
@click.option("--agent", "agent_url", help="Agent endpoint URL (default: internal chat agent)", default="/chat")
@click.option("--expected", help="Expected output for query", default=None)
@click.option("--metrics", help="Metrics: faithfulness,g_eval or faithfulness:0.90,g_eval:0.75", default=None)
@click.option("--min-score", help="Apply threshold to all metrics and enforce exit code", type=float, default=None)
@click.option("--judge", help="LLM judge model", default=None)
@click.option("--engine-url", help="Engine URL", default=None)
def quick(query, dataset_file, agent_url, expected, metrics, min_score, judge, engine_url):
    """Quick evaluation via playground (no API key required).

    \b
    Examples:
        aievaluator quick "What is 2+2?" --expected "4"
        aievaluator quick --dataset ./smoke-tests.json --agent https://my-agent.com/chat
    """
    if not query and not dataset_file:
        click.echo("❌ Provide a query or --dataset", err=True)
        sys.exit(2)
    if query and dataset_file:
        click.echo("❌ Use query OR --dataset, not both", err=True)
        sys.exit(2)

    resolved_url = resolve_engine_url(engine_url)
    client = APIClient(resolved_url)

    # Parse metrics: CU1 (metric:threshold), CU2 (--min-score applies to all)
    metrics_list = _parse_quick_metrics(metrics, min_score)

    async def _quick():
        # Check playground status first
        try:
            status = await client.playground_status()
        except Exception:
            status = {"used": 0, "limit": 5, "remaining": 5, "resets_at": "midnight UTC"}

        remaining = status.get("remaining", 5)
        limit = status.get("limit", 5)
        click.echo(f"⚠️  Playground mode — {remaining}/{limit} remaining (resets at {status.get('resets_at', 'midnight UTC')})")
        click.echo()

        if remaining <= 0:
            click.echo("❌ Playground limit reached. Run `aievaluator login` for 100 free evals/month.")
            sys.exit(2)

        if query:
            rows = [{"input": query}]
            if expected:
                rows[0]["expected_output"] = expected
        else:
            rows = _parse_dataset_file(dataset_file)

        try:
            result = await client.playground_evaluate(
                rows=rows,
                agent_endpoint=agent_url,
                metrics=metrics_list,
                judge=judge,
            )
        except APIError as e:
            click.echo(f"❌ {e.message}", err=True)
            if e.detail:
                click.echo(json_mod.dumps(e.detail, indent=2), err=True)
            sys.exit(2)

        overall_passed = all(r.get("passed", True) for r in result.get("results", []))
        format_table(result, min_score or 0.0, resolved_url)

        # CU2: exit code based on --min-score
        if min_score is not None:
            sys.exit(0 if overall_passed else 1)

    _run_async(_quick())


# ═══════════════════════════════════════════════════════════════════
#  eval
# ═══════════════════════════════════════════════════════════════════

@main.command()
@click.option("--agent", required=True, help="Agent endpoint URL")
@click.option("--dataset", "dataset_file", help="JSON dataset file", type=click.Path(exists=True), default=None)
@click.option("--rows", help="Inline JSON array of test cases", default=None)
@click.option("--metrics", help="Metrics (comma-separated)", default=None)
@click.option("--agent-format", help="Agent API format", type=click.Choice(["openai", "claude", "custom"]), default="openai")
@click.option("--min-score", help="Minimum overall score threshold (0-1)", type=float, default=None)
@click.option("--thresholds", "thresholds_str", help="Per-metric thresholds: faithfulness:0.90,g_eval:0.75", default=None)
@click.option("--custom", "custom_str", help="Inline custom evaluator: {\"name\":\"polite\",\"prompt\":\"Check...\",\"threshold\":0.8}", default=None)
@click.option("--format", "output_format", help="Output format", type=click.Choice(["table", "json", "junit"]), default="table")
@click.option("--ci", is_flag=True, help="CI mode (no colors, no prompts)")
@click.option("--timeout", help="Timeout in seconds", type=int, default=300)
@click.option("--judge-model", help="LLM judge model", default=None)
@click.option("--name", "eval_name", help="Human-readable name for this evaluation", default=None)
@click.option("--api-key", help="API key (overrides config)", default=None)
@click.option("--engine-url", help="Engine URL", default=None)
def eval_cmd(agent, dataset_file, rows, metrics, agent_format, min_score, thresholds_str, custom_str, output_format, ci, timeout, judge_model, eval_name, api_key, engine_url):
    """Evaluate an AI agent against a dataset.

    \b
    Examples:
        aievaluator eval --agent https://my-agent.com/chat --dataset ./tests.json
        aievaluator eval --agent https://my-agent.com/chat --rows '[{"input":"Hi","expected_output":"Hello"}]'
        aievaluator eval --agent $AGENT_URL --dataset ./evals.json --ci --format junit
    """
    # Validate data source
    if not dataset_file and not rows:
        click.echo("❌ Provide --dataset or --rows", err=True)
        sys.exit(2)
    if dataset_file and rows:
        click.echo("❌ Use --dataset OR --rows, not both", err=True)
        sys.exit(2)

    key = resolve_api_key(api_key)
    if not key:
        click.echo("❌ API key required. Run: aievaluator login", err=True)
        sys.exit(2)

    resolved_url = resolve_engine_url(engine_url)
    client = APIClient(resolved_url, key, timeout=timeout)

    # Resolve metrics
    if metrics:
        metrics_list = [m.strip() for m in metrics.split(",")]
    else:
        metrics_list = resolve_default_metrics().split(",")

    # Resolve min_score
    if min_score is None:
        min_score = resolve_default_min_score()

    # Parse per-metric thresholds: "faithfulness:0.90,g_eval:0.75" -> {"faithfulness": 0.90, "g_eval": 0.75}
    thresholds_dict = {}
    if thresholds_str:
        for pair in thresholds_str.split(","):
            pair = pair.strip()
            if ":" in pair:
                metric_name, val = pair.split(":", 1)
                try:
                    thresholds_dict[metric_name.strip()] = float(val.strip())
                except ValueError:
                    click.echo(f"❌ Invalid threshold value in: {pair}", err=True)
                    sys.exit(2)

    # CU3: parse inline custom evaluator
    custom_evaluators = None
    if custom_str:
        try:
            custom_evaluators = json_mod.loads(custom_str)
            if isinstance(custom_evaluators, dict):
                custom_evaluators = [custom_evaluators]
        except json_mod.JSONDecodeError:
            click.echo(f"❌ Invalid JSON in --custom", err=True)
            sys.exit(2)

    async def _eval():
        if dataset_file:
            try:
                rows_data = _parse_dataset_file(dataset_file)
            except (json_mod.JSONDecodeError, FileNotFoundError) as e:
                click.echo(f"❌ Cannot read dataset: {e}", err=True)
                sys.exit(2)
        else:
            try:
                rows_data = json_mod.loads(rows)
            except json_mod.JSONDecodeError as e:
                click.echo(f"❌ Invalid JSON in --rows: {e}", err=True)
                sys.exit(2)
            if not isinstance(rows_data, list):
                rows_data = [rows_data]

        try:
            result = await client.evaluate_sync(
                rows=rows_data,
                agent_url=agent,
                agent_format=agent_format,
                metrics=metrics_list,
                judge_model=judge_model,
                name=eval_name,
                thresholds=thresholds_dict if thresholds_dict else None,
                custom_evaluators=custom_evaluators,
            )
        except APIError as e:
            _handle_api_error(e)

        # Format output
        if output_format == "json":
            output = format_json_output(result, min_score)
            click.echo(output)
        elif output_format == "junit":
            output = format_junit(result, min_score)
            click.echo(output)
        else:
            format_table(result, min_score, resolved_url)

        # Exit code
        overall_score = result.get("overall_score", 0)
        if overall_score < min_score:
            sys.exit(1)

    _run_async(_eval())


def _handle_api_error(e: APIError):
    """Print API error and exit."""
    click.echo(f"❌ {e.message}", err=True)
    if e.detail:
        if isinstance(e.detail, dict):
            click.echo(json_mod.dumps(e.detail, indent=2), err=True)
        else:
            click.echo(str(e.detail)[:500], err=True)
    sys.exit(3 if e.status_code == 0 else 2)


# ═══════════════════════════════════════════════════════════════════
#  config
# ═══════════════════════════════════════════════════════════════════

@main.group()
def config():
    """Manage CLI configuration."""
    pass


@config.command("show")
def config_show():
    """Show current configuration."""
    cfg = get_all_config()
    if cfg:
        click.echo(json_mod.dumps(cfg, indent=2))
    else:
        click.echo("No configuration found. Run: aievaluator login")


@config.command("set")
@click.argument("key")
@click.argument("value")
def config_set(key: str, value: str):
    """Set a configuration value.

    \b
    Keys: engine-url, default-metrics, default-min-score
    """
    valid_keys = {"engine-url", "default-metrics", "default-min-score"}
    if key not in valid_keys:
        click.echo(f"❌ Invalid key: {key}. Valid keys: {', '.join(valid_keys)}", err=True)
        sys.exit(2)

    cfg = load_config()
    if key == "default-min-score":
        try:
            cfg[key] = float(value)
        except ValueError:
            click.echo(f"❌ default-min-score must be a number (0-1)", err=True)
            sys.exit(2)
    else:
        cfg[key] = value
    save_config(cfg)
    click.echo(f"✅ {key} = {value}")


@config.command("unset")
@click.argument("key")
def config_unset(key: str):
    """Remove a configuration value."""
    cfg = load_config()
    if key in cfg:
        del cfg[key]
        save_config(cfg)
        click.echo(f"✅ {key} removed")
    else:
        click.echo(f"{key} was not set")


# ═══════════════════════════════════════════════════════════════════
#  init
# ═══════════════════════════════════════════════════════════════════

_SMOKE_TEST_DATASET = [
    {"input": "What is 2+2?", "expected_output": "4"},
    {"input": "What is the capital of France?", "expected_output": "Paris"},
    {"input": "Say hello in Spanish", "expected_output": "Hola"},
]


@main.command()
def init():
    """Initialize a new AI Evaluator project in the current directory.

    Creates:
      - aievaluator.config.json (project-local config)
      - evals/smoke-test.json (example dataset)
      - Updates .gitignore
    """
    cwd = Path.cwd()

    # 1. Create aievaluator.config.json
    config_path = cwd / "aievaluator.config.json"
    if config_path.exists():
        click.echo(f"⏭️  aievaluator.config.json already exists, skipping")
    else:
        config_path.write_text(json_mod.dumps({
            "engine_url": "https://api.aievaluator.dev",
            "default_metrics": "faithfulness,g_eval",
            "default_min_score": 0.80,
        }, indent=2) + "\n")
        click.echo(f"✅ Created aievaluator.config.json")

    # 2. Create evals/ directory + smoke-test.json
    evals_dir = cwd / "evals"
    evals_dir.mkdir(exist_ok=True)
    smoke_path = evals_dir / "smoke-test.json"
    if smoke_path.exists():
        click.echo(f"⏭️  evals/smoke-test.json already exists, skipping")
    else:
        smoke_path.write_text(json_mod.dumps(_SMOKE_TEST_DATASET, indent=2) + "\n")
        click.echo(f"✅ Created evals/smoke-test.json (3 example queries)")

    # 3. Update .gitignore
    gitignore_path = cwd / ".gitignore"
    gitignore_lines = gitignore_path.read_text().split("\n") if gitignore_path.exists() else []
    entry = "aievaluator.config.json"
    if entry not in gitignore_lines:
        with open(gitignore_path, "a") as f:
            if gitignore_lines and gitignore_lines[-1].strip() != "":
                f.write("\n")
            f.write(f"{entry}\n")
        click.echo(f"✅ Added {entry} to .gitignore")

    click.echo()
    click.echo("Next steps:")
    click.echo("  aievaluator quick --dataset ./evals/smoke-test.json")
    click.echo("  aievaluator login    (for 100 free evals/month)")
    click.echo()


@main.command("generate-ci")
@click.option("--platform", type=click.Choice(["github", "gitlab"]), default="github", help="CI/CD platform")
@click.option("--dataset", default="./evals/regression.json", help="Dataset file path")
@click.option("--output", "output_file", default=None, help="Output file (default: stdout)")
def generate_ci(platform, dataset, output_file):
    """Generate a CI/CD workflow file for GitHub Actions or GitLab CI."""
    if platform == "gitlab":
        snippet = f"""# GitLab CI — AI Quality Gate
ai-quality-gate:
  stage: test
  image: python:3.12
  before_script:
    - pip install aievaluator
  script:
    - |
      aievaluator eval \\
        --agent ${{STAGING_AGENT_URL}} \\
        --dataset {dataset} \\
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
"""
    else:
        snippet = f"""# GitHub Actions — AI Quality Gate
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
            --dataset {dataset} \\
            --metrics faithfulness,g_eval \\
            --min-score 0.80 \\
            --ci \\
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: ${{{{ secrets.AI_EVALUATOR_API_KEY }}}}
      - name: Deploy
        if: success()
        run: ./deploy.sh
"""
    if output_file:
        with open(output_file, "w") as f:
            f.write(snippet)
        click.echo(f"✅ Workflow written to {output_file}")
    else:
        click.echo(snippet)


# ═══════════════════════════════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    main()
