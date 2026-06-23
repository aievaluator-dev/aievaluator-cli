/**
 * Table formatter — ASCII table for terminal output.
 */

export function formatTable(data: Record<string, unknown>, minScore: number, engineUrl: string): void {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  const overallScore = (data.overall_score as number) || 0;
  const totalRows = (data.total_rows as number) || results.length;
  const failed = results.filter((r) => !r.passed).length;
  const inputTokens = (data.input_tokens as number) || 0;
  const outputTokens = (data.output_tokens as number) || 0;
  const evalId = (data.evaluation_id as string) || '';

  const scorePct = (overallScore * 100).toFixed(1);
  const passed = overallScore >= minScore;
  const icon = passed ? '✅' : '❌';
  const thresholdPct = (minScore * 100).toFixed(0);

  console.log();
  console.log(`  AI Evaluator — Results`);
  console.log(`  Overall Score:  ${scorePct}%  ${icon} ${passed ? 'above' : 'below'} threshold (${thresholdPct}%)`);
  console.log(`  Total rows:     ${totalRows}`);
  console.log(`  Failed:         ${failed}`);
  console.log(`  Tokens:         ↓${inputTokens.toLocaleString()} · ↑${outputTokens.toLocaleString()}`);
  if (evalId) {
    console.log(`  Dashboard:      ${engineUrl}/evaluations/${evalId}/report`);
  }
  console.log();

  // Header
  const sep = '─'.repeat(64);
  console.log(`┌────┬${sep}┬──────────┬──────┐`);
  console.log(`│  # │ Query${' '.repeat(46)}│ Score    │ Pass │`);
  console.log(`├────┼${sep}┼──────────┼──────┤`);

  // Rows
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const query = String(r.query || '').substring(0, 46).padEnd(46);
    const scores = (r.scores as Record<string, number>) || {};
    const firstScore = Object.values(scores)[0] || 0;
    const scoreStr = `${Math.floor(firstScore * 100)}%`.padEnd(9);
    const passIcon = r.passed ? '✅' : '❌';
    console.log(`│ ${String(i + 1).padEnd(3)}│ ${query}│ ${scoreStr}│ ${passIcon}   │`);
  }

  console.log(`└────┴${sep}┴──────────┴──────┘`);
  console.log();

  if (passed) {
    console.log(`✅ Score ${scorePct}% meets threshold ${minScore}`);
  } else {
    console.log(`❌ Score ${scorePct}% below threshold ${minScore}`);
  }
  console.log();
}
