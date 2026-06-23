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


def _run_async(coro):
    """Helper to run async coroutines from Click commands."""
    return asyncio.run(coro)


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
@click.option("--metrics", help="Metrics (comma-separated)", default=None)
@click.option("--judge", help="LLM judge model", default=None)
@click.option("--engine-url", help="Engine URL", default=None)
def quick(query, dataset_file, agent_url, expected, metrics, judge, engine_url):
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

    metrics_list = None
    if metrics:
        metrics_list = [m.strip() for m in metrics.split(",")]

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
            with open(dataset_file) as f:
                data = json_mod.load(f)
            rows = data if isinstance(data, list) else [data]

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

        format_table(result, 0.0, resolved_url)

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
@click.option("--min-score", help="Minimum score threshold (0-1)", type=float, default=None)
@click.option("--format", "output_format", help="Output format", type=click.Choice(["table", "json", "junit"]), default="table")
@click.option("--ci", is_flag=True, help="CI mode (no colors, no prompts)")
@click.option("--timeout", help="Timeout in seconds", type=int, default=300)
@click.option("--judge-model", help="LLM judge model", default=None)
@click.option("--name", "eval_name", help="Human-readable name for this evaluation", default=None)
@click.option("--api-key", help="API key (overrides config)", default=None)
@click.option("--engine-url", help="Engine URL", default=None)
def eval_cmd(agent, dataset_file, rows, metrics, agent_format, min_score, output_format, ci, timeout, judge_model, eval_name, api_key, engine_url):
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

    async def _eval():
        if dataset_file:
            try:
                result = await client.evaluate_upload(
                    file_path=dataset_file,
                    agent_url=agent,
                    agent_format=agent_format,
                    metrics=",".join(metrics_list),
                )
            except APIError as e:
                _handle_api_error(e)
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
#  Entry point
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    main()
