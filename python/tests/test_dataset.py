"""
Tests for AI Evaluator CLI — dataset parsing module.

Covers: JSON arrays, single objects, JSONL, error handling.
"""

import json
import tempfile
import os
from pathlib import Path

import pytest

# Import the standalone function from cli module
# In Python CLI, parsing is in cli.py, we test a replica here.
# The actual function is _parse_dataset_file in cli.py.
from aievaluator.cli import _parse_dataset_file


class TestParseJSONArray:
    def test_parse_json_array(self):
        """3.1: Parses JSON array of objects correctly."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(
                [
                    {"input": "Q1", "expected_output": "A1"},
                    {"input": "Q2", "expected_output": "A2"},
                    {"input": "Q3", "expected_output": "A3"},
                ],
                f,
            )
            path = f.name

        try:
            rows = _parse_dataset_file(path)
            assert len(rows) == 3
            assert rows[0]["input"] == "Q1"
            assert rows[2]["expected_output"] == "A3"
        finally:
            os.unlink(path)


class TestParseJSONSingleObject:
    def test_parse_json_single_object(self):
        """3.2: Single JSON object → wrapped in array."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"input": "Only one", "expected_output": "result"}, f)
            path = f.name

        try:
            rows = _parse_dataset_file(path)
            assert isinstance(rows, list)
            assert len(rows) == 1
            assert rows[0]["input"] == "Only one"
        finally:
            os.unlink(path)


class TestParseJSONL:
    def test_parse_jsonl(self):
        """3.3: Parses .jsonl line-by-line, skips empty lines."""
        content = (
            '{"input": "Q1", "expected_output": "A1"}\n'
            + "\n"  # empty line
            + '{"input": "Q2", "expected_output": "A2"}\n'
            + '{"input": "Q3", "expected_output": "A3"}\n'
        )
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write(content)
            path = f.name

        try:
            rows = _parse_dataset_file(path)
            assert len(rows) == 3  # empty line skipped
            assert rows[0]["input"] == "Q1"
            assert rows[1]["input"] == "Q2"
        finally:
            os.unlink(path)

    def test_parse_jsonl_all_empty(self):
        """3.3: All-empty JSONL returns empty list."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write("\n\n\n")
            path = f.name

        try:
            rows = _parse_dataset_file(path)
            assert rows == []
        finally:
            os.unlink(path)


class TestParseNonexistentFile:
    def test_parse_nonexistent_file(self):
        """3.4: Graceful error for missing file."""
        with pytest.raises(FileNotFoundError):
            _parse_dataset_file("/nonexistent/dataset.json")


class TestParseInvalidJSON:
    def test_parse_invalid_json(self):
        """3.5: Graceful error for malformed JSON."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("not valid json {{{")
            path = f.name

        try:
            with pytest.raises(json.JSONDecodeError):
                _parse_dataset_file(path)
        finally:
            os.unlink(path)
