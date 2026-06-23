"""Table formatter using Rich."""

from rich.console import Console
from rich.table import Table


def format_table(data: dict, min_score: float, engine_url: str) -> None:
    """Print evaluation results as a Rich table."""
    console = Console()
    results = data.get("results", [])
    overall_score = data.get("overall_score", 0)
    total_rows = data.get("total_rows", len(results))
    failed = sum(1 for r in results if not r.get("passed", True))
    input_tokens = data.get("input_tokens", 0)
    output_tokens = data.get("output_tokens", 0)
    eval_id = data.get("evaluation_id", "")

    score_pct = overall_score * 100
    passed = overall_score >= min_score
    icon = "✅" if passed else "❌"

    console.print()
    console.print(f"  [bold]AI Evaluator — Results[/bold]")
    console.print(f"  Overall Score:  [bold]{score_pct:.1f}%[/bold]  {icon} {'above' if passed else 'below'} threshold ({min_score*100:.0f}%)")
    console.print(f"  Total rows:     {total_rows}")
    console.print(f"  Failed:         {failed}")
    console.print(f"  Tokens:         ↓{input_tokens:,} · ↑{output_tokens:,}")
    if eval_id:
        console.print(f"  Dashboard:      [link={engine_url}/evaluations/{eval_id}/report]{engine_url}/evaluations/{eval_id}/report[/link]")
    console.print()

    table = Table(show_header=True, header_style="bold")
    table.add_column("#", style="dim", width=4)
    table.add_column("Query", max_width=50)
    table.add_column("Score", justify="right", width=8)
    table.add_column("Pass", justify="center", width=6)

    for i, r in enumerate(results):
        query = r.get("query", "")[:50]
        scores = r.get("scores", {})
        first_score = list(scores.values())[0] if scores else 0
        score_str = f"{first_score * 100:.0f}%"
        passed_icon = "✅" if r.get("passed", True) else "❌"
        table.add_row(str(i + 1), query, score_str, passed_icon)

    console.print(table)
    console.print()

    if passed:
        console.print(f"[green]✅ Score {score_pct:.1f}% meets threshold {min_score}[/green]")
    else:
        console.print(f"[red]❌ Score {score_pct:.1f}% below threshold {min_score}[/red]")
    console.print()
