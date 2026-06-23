"""Tests for AI Evaluator CLI config module."""

import os
import json
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from aievaluator.config import (
    resolve_api_key,
    resolve_engine_url,
    resolve_default_metrics,
    resolve_default_min_score,
    _load_json,
    _save_json,
)


class TestResolveAPIKey:
    def test_flag_takes_priority(self):
        result = resolve_api_key(flag_value="sk-flag-key")
        assert result == "sk-flag-key"

    def test_env_var(self):
        with mock.patch.dict(os.environ, {"AIEVALUATOR_API_KEY": "sk-env-key"}):
            result = resolve_api_key()
            assert result == "sk-env-key"

    def test_none_found(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value={}):
                result = resolve_api_key()
                assert result is None

    def test_config_file(self):
        config_data = {"api_key": "sk-config-key"}
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value=config_data):
                result = resolve_api_key()
                assert result == "sk-config-key"


class TestResolveEngineURL:
    def test_default(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value={}):
                result = resolve_engine_url()
                assert result == "https://api.aievaluator.dev"

    def test_flag(self):
        result = resolve_engine_url("https://custom.api.dev/")
        assert result == "https://custom.api.dev"

    def test_env_var(self):
        with mock.patch.dict(os.environ, {"AIEVALUATOR_ENGINE_URL": "https://env.api.dev/"}):
            result = resolve_engine_url()
            assert result == "https://env.api.dev"


class TestResolveDefaults:
    def test_default_metrics(self):
        with mock.patch("aievaluator.config._load_json", return_value={}):
            result = resolve_default_metrics()
            assert "faithfulness" in result
            assert "g_eval" in result

    def test_default_min_score(self):
        with mock.patch("aievaluator.config._load_json", return_value={}):
            result = resolve_default_min_score()
            assert result == 0.0


class TestLoadSaveJSON:
    def test_save_and_load(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "config.json"
            data = {"api_key": "test-key", "engine_url": "https://test.api.dev"}
            _save_json(path, data)
            loaded = _load_json(path)
            assert loaded == data

    def test_load_nonexistent(self):
        result = _load_json(Path("/nonexistent/path/config.json"))
        assert result == {}

    def test_load_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "bad.json"
            path.write_text("not json")
            result = _load_json(path)
            assert result == {}
