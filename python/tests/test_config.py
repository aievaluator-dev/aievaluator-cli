"""
Tests for AI Evaluator CLI — config module.

Covers: API key resolution, engine URL resolution, defaults, priority chain,
config save/load, merge, platform paths.
"""

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
    _global_config_path,
    save_config,
    load_config,
    get_all_config,
)


# ═══════════════════════════════════════════════════════════════════
#  API Key Resolution (1.1 - 1.5)
# ═══════════════════════════════════════════════════════════════════

class TestResolveAPIKey:
    def test_flag_takes_priority(self):
        """1.1: --api-key flag wins over env, local, and global config."""
        with mock.patch.dict(os.environ, {"AIEVALUATOR_API_KEY": "sk-env"}):
            with mock.patch("aievaluator.config._load_json", return_value={"api_key": "sk-file"}):
                result = resolve_api_key(flag_value="sk-flag")
                assert result == "sk-flag"

    def test_env_var_priority(self):
        """1.2: AIEVALUATOR_API_KEY env var wins over local/global config."""
        with mock.patch.dict(os.environ, {"AIEVALUATOR_API_KEY": "sk-env"}):
            with mock.patch("aievaluator.config._load_json", return_value={"api_key": "sk-file"}):
                result = resolve_api_key()
                assert result == "sk-env"

    def test_local_config_priority(self):
        """1.3: Project-local aievaluator.config.json wins over global."""
        local = {"api_key": "sk-local"}
        global_ = {"api_key": "sk-global"}

        def fake_load(path):
            if str(path) == str(Path("aievaluator.config.json")):
                return local
            return global_

        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", side_effect=fake_load):
                result = resolve_api_key()
                assert result == "sk-local"

    def test_global_config_fallback(self):
        """1.4: Falls back to ~/.config/aievaluator/config.json."""
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value={"api_key": "sk-global"}):
                result = resolve_api_key()
                assert result == "sk-global"

    def test_none_found(self):
        """1.5: Returns None when no key found anywhere."""
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value={}):
                result = resolve_api_key()
                assert result is None


# ═══════════════════════════════════════════════════════════════════
#  Engine URL Resolution (1.6 - 1.9)
# ═══════════════════════════════════════════════════════════════════

class TestResolveEngineURL:
    def test_flag_priority(self):
        """1.6: --engine-url flag takes priority."""
        with mock.patch.dict(os.environ, {"AIEVALUATOR_ENGINE_URL": "https://env.api.dev/"}):
            with mock.patch("aievaluator.config._load_json", return_value={"engine_url": "https://file.api.dev"}):
                result = resolve_engine_url("https://flag.api.dev")
                assert result == "https://flag.api.dev"

    def test_env_var_priority(self):
        """1.7: AIEVALUATOR_ENGINE_URL env var takes priority."""
        with mock.patch.dict(os.environ, {"AIEVALUATOR_ENGINE_URL": "https://env.api.dev/"}):
            with mock.patch("aievaluator.config._load_json", return_value={"engine_url": "https://file.api.dev"}):
                result = resolve_engine_url()
                assert result == "https://env.api.dev"

    def test_default(self):
        """1.8: Returns default when nothing configured."""
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config._load_json", return_value={}):
                result = resolve_engine_url()
                assert result == "https://api.aievaluator.dev"

    def test_trailing_slash_stripped(self):
        """1.9: All resolved URLs strip trailing /."""
        # Test flag
        result = resolve_engine_url("https://custom.api.dev/")
        assert result == "https://custom.api.dev"
        # Test env
        with mock.patch.dict(os.environ, {"AIEVALUATOR_ENGINE_URL": "https://env.api.dev/"}):
            with mock.patch("aievaluator.config._load_json", return_value={}):
                assert resolve_engine_url() == "https://env.api.dev"


# ═══════════════════════════════════════════════════════════════════
#  Defaults Resolution (1.10 - 1.11)
# ═══════════════════════════════════════════════════════════════════

class TestResolveDefaults:
    def test_default_metrics(self):
        """1.10: Returns faithfulness,g_eval from config or default."""
        with mock.patch("aievaluator.config._load_json", return_value={}):
            result = resolve_default_metrics()
            assert "faithfulness" in result
            assert "g_eval" in result

    def test_default_metrics_from_config(self):
        """1.10: Returns custom metrics when configured."""
        with mock.patch("aievaluator.config._load_json", return_value={"default_metrics": "g_eval,faithfulness"}):
            result = resolve_default_metrics()
            assert result == "g_eval,faithfulness"

    def test_default_min_score_unset(self):
        """1.11: Returns 0.0 when not set."""
        with mock.patch("aievaluator.config._load_json", return_value={}):
            result = resolve_default_min_score()
            assert result == 0.0

    def test_default_min_score_from_config(self):
        """1.11: Returns config value when set."""
        with mock.patch("aievaluator.config._load_json", return_value={"default_min_score": 0.80}):
            result = resolve_default_min_score()
            assert result == 0.80


# ═══════════════════════════════════════════════════════════════════
#  Save / Load (1.12 - 1.15)
# ═══════════════════════════════════════════════════════════════════

class TestSaveLoadConfig:
    def test_save_and_load_global(self):
        """1.12: Write → read round-trip preserves all fields."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config.json"
            data = {
                "api_key": "sk-test",
                "engine_url": "https://test.api.dev",
                "default_metrics": "faithfulness,g_eval",
                "default_min_score": 0.80,
            }
            _save_json(config_path, data)
            loaded = _load_json(config_path)
            assert loaded == data

    def test_save_and_load_local(self):
        """1.13: Project-local config round-trip."""
        with tempfile.TemporaryDirectory() as tmpdir:
            os.chdir(tmpdir)
            try:
                config_data = {"api_key": "sk-local-test", "engine_url": "https://local.api.dev"}
                save_config(config_data, global_=False)
                loaded = load_config(global_=False)
                assert loaded == config_data
            finally:
                os.chdir(Path(__file__).parent.parent.parent)

    def test_load_nonexistent_returns_empty(self):
        """1.14: Missing files return empty/zero config, never crash."""
        result = _load_json(Path("/nonexistent/path/config.json"))
        assert result == {}

    def test_load_invalid_json_returns_empty(self):
        """1.15: Corrupt JSON returns empty/zero config, never crash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "bad.json"
            path.write_text("not valid json {{{")
            result = _load_json(path)
            assert result == {}

    def test_get_all_config_merges_local_over_global(self):
        """1.16: Local keys override global, non-overlapping keys merged."""
        global_data = {"api_key": "sk-global", "engine_url": "https://global.api.dev"}
        local_data = {"api_key": "sk-local"}

        def fake_load(path):
            if str(path) == str(Path("aievaluator.config.json")):
                return local_data
            return global_data

        with mock.patch("aievaluator.config._load_json", side_effect=fake_load):
            merged = get_all_config()
            assert merged["api_key"] == "sk-local"  # local overrides
            assert merged["engine_url"] == "https://global.api.dev"  # global preserved

    def test_global_config_path_uses_xdg(self):
        """1.17: Path uses XDG_CONFIG_HOME on Linux."""
        with mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": "/custom/xdg"}):
            path = _global_config_path()
            assert str(path).startswith("/custom/xdg")
            assert str(path).endswith("aievaluator/config.json")

    def test_global_config_path_fallback_home(self):
        """1.17: Falls back to ~/.config when XDG_CONFIG_HOME not set."""
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch("aievaluator.config.Path.home", return_value=Path("/home/testuser")):
                path = _global_config_path()
                assert str(path) == "/home/testuser/.config/aievaluator/config.json"
