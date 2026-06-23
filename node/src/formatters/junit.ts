/**
 * JUnit XML formatter for CI/CD integration.
 */

export function formatJunit(data: Record<string, unknown>, minScore: number): string {
  const results = (data.results as Array<Record<string, unknown>>) || [];
  const total = results.length;
  const failures = results.filter((r) => !r.passed).length;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuite name="AI Evaluator" tests="${total}" failures="${failures}" errors="0" time="0">\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const query = String(r.query || '').substring(0, 80);
    if (r.passed) {
      xml += `  <testcase classname="AI Evaluator" name="Query ${i + 1}: ${escapeXml(query)}" time="0">\n`;
      xml += `  </testcase>\n`;
    } else {
      const scores = r.scores as Record<string, number> || {};
      const scoresStr = Object.entries(scores).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(', ');
      const expected = String(r.expected_output || '');
      const got = String(r.agent_response || '');

      xml += `  <testcase classname="AI Evaluator" name="Query ${i + 1}: ${escapeXml(query)}" time="0">\n`;
      xml += `    <failure message="Score below threshold ${minScore}">\n`;
      xml += `      Query: ${escapeXml(query)}\n`;
      xml += `      Expected: ${escapeXml(expected)}\n`;
      xml += `      Got: ${escapeXml(got)}\n`;
      xml += `      Scores: {${escapeXml(scoresStr)}}\n`;
      xml += `    </failure>\n`;
      xml += `  </testcase>\n`;
    }
  }

  xml += '</testsuite>\n';
  return xml;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
