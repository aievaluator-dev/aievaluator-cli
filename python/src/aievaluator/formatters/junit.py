"""JUnit XML formatter for CI/CD integration."""

import xml.etree.ElementTree as ET
from xml.dom import minidom


def format_junit(data: dict, min_score: float = 0.0) -> str:
    """Return evaluation results as a JUnit XML string."""
    results = data.get("results", [])
    total = len(results)
    failures = sum(1 for r in results if not r.get("passed", True))

    testsuite = ET.Element("testsuite", {
        "name": "AI Evaluator",
        "tests": str(total),
        "failures": str(failures),
        "errors": "0",
        "time": "0",
    })

    for i, r in enumerate(results):
        query = r.get("query", "")[:80]
        testcase = ET.SubElement(testsuite, "testcase", {
            "classname": "AI Evaluator",
            "name": f"Query {i+1}: {query}",
            "time": "0",
        })

        if not r.get("passed", True):
            scores = r.get("scores", {})
            scores_str = ", ".join(f"{k}: {v:.2f}" for k, v in scores.items())
            expected = r.get("expected_output", "") or ""
            got = r.get("agent_response", "") or ""

            failure_text = (
                f"Query: {query}\n"
                f"Expected: {expected}\n"
                f"Got: {got}\n"
                f"Scores: {{{scores_str}}}"
            )
            ET.SubElement(testcase, "failure", {
                "message": f"Score below threshold {min_score}",
            }).text = failure_text

    xml_str = ET.tostring(testsuite, encoding="unicode")
    return minidom.parseString(xml_str).toprettyxml(indent="  ")
