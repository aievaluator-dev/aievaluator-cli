/**
 * JSON formatter.
 */

export function formatJson(data: Record<string, unknown>, minScore: number): string {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  const overallScore = (data.overall_score as number) || 0;
  const totalRows = (data.total_rows as number) || results.length;
  const failed = results.filter((r) => !r.passed).length;
  const inputTokens = (data.input_tokens as number) || 0;
  const outputTokens = (data.output_tokens as number) || 0;
  const evalId = (data.evaluation_id as string) || '';

  return JSON.stringify(
    {
      evaluation_id: evalId,
      overall_score: overallScore,
      passed: overallScore >= minScore,
      min_score: minScore,
      total_rows: totalRows,
      failed_queries: failed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      results,
    },
    null,
    2,
  );
}
