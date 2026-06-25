"""
Tests for AI Evaluator CLI — init command.

Covers: creates config, evals dir + dataset, gitignore update,
idempotent behavior, no duplicate gitignore entries.
"""

import os
import json
import tempfile
from pathlib import Path
from unittest import mock

import pytest
from click.testing import CliRunner

from aievaluator.cli import main


@pytest.fixture
def runner():
    return CliRunner()


class TestInit:
    def test_init_creates_config(self, runner):
        """12.1: Creates aievaluator.config.json with defaults."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                result = runner.invoke(main, ["init"])
                assert result.exit_code == 0
                assert Path("aievaluator.config.json").exists()

                content = json.loads(Path("aievaluator.config.json").read_text())
                assert content["engine_url"] == "https://api.aievaluator.dev"
                assert content["default_metrics"] == "faithfulness,g_eval"
                assert content["default_min_score"] == 0.80
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_init_creates_evals_dir_and_dataset(self, runner):
        """12.2: Creates evals/smoke-test.json with 3 example queries."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                result = runner.invoke(main, ["init"])
                assert result.exit_code == 0
                assert Path("evals").is_dir()
                assert Path("evals/smoke-test.json").exists()

                content = json.loads(Path("evals/smoke-test.json").read_text())
                assert len(content) == 3
                assert content[0]["input"] == "What is 2+2?"
                assert content[1]["input"] == "What is the capital of France?"
                assert content[2]["input"] == "Say hello in Spanish"
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_init_updates_gitignore(self, runner):
        """12.3: Adds aievaluator.config.json to .gitignore."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                result = runner.invoke(main, ["init"])
                assert result.exit_code == 0
                assert Path(".gitignore").exists()

                gitignore_content = Path(".gitignore").read_text()
                assert "aievaluator.config.json" in gitignore_content
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_init_idempotent_config(self, runner):
        """12.4: Second run → "already exists, skipping" for config."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                # First run
                runner.invoke(main, ["init"])
                # Second run
                result = runner.invoke(main, ["init"])
                assert result.exit_code == 0
                assert "already exists" in result.output
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_init_idempotent_dataset(self, runner):
        """12.5: Second run → "already exists, skipping" for dataset."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                # First run creates dataset
                runner.invoke(main, ["init"])
                # Second run should skip
                result = runner.invoke(main, ["init"])
                assert result.exit_code == 0
                assert "already exists" in result.output
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_init_no_duplicate_gitignore(self, runner):
        """12.6: Second run → doesn't add duplicate .gitignore entry."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                runner.invoke(main, ["init"])
                runner.invoke(main, ["init"])

                gitignore_content = Path(".gitignore").read_text()
                # Count occurrences
                count = gitignore_content.count("aievaluator.config.json")
                assert count == 1, f"Expected 1 occurrence, found {count}"
            finally:
                os.chdir(Path(__file__).parent.parent.parent)
