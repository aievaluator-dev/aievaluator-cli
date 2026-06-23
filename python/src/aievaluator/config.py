"""Config manager for AI Evaluator CLI.

Handles API key resolution with priority:
1. --api-key flag
2. AIEVALUATOR_API_KEY env var
3. ./aievaluator.config.json (project-local)
4. ~/.config/aievaluator/config.json (global)
"""

import json
import os
from pathlib import Path
from typing import Optional


def _global_config_path() -> Path:
    """Returns the global config path, platform-aware."""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif os.environ.get("XDG_CONFIG_HOME"):
        base = Path(os.environ["XDG_CONFIG_HOME"])
    else:
        base = Path.home() / ".config"
    return base / "aievaluator" / "config.json"


def _load_json(path: Path) -> dict:
    """Load a JSON file, returning {} if not found or invalid."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_json(path: Path, data: dict) -> None:
    """Save data as JSON, creating parent dirs."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def resolve_api_key(flag_value: Optional[str] = None) -> Optional[str]:
    """Resolve API key by priority order. Returns None if not found."""
    if flag_value:
        return flag_value
    env_value = os.environ.get("AIEVALUATOR_API_KEY")
    if env_value:
        return env_value
    local = _load_json(Path("aievaluator.config.json"))
    if local.get("api_key"):
        return local["api_key"]
    global_cfg = _load_json(_global_config_path())
    return global_cfg.get("api_key")


def resolve_engine_url(flag_value: Optional[str] = None) -> str:
    """Resolve engine URL by priority. Defaults to https://api.aievaluator.dev."""
    default = "https://api.aievaluator.dev"

    if flag_value:
        return flag_value.rstrip("/")

    env_value = os.environ.get("AIEVALUATOR_ENGINE_URL")
    if env_value:
        return env_value.rstrip("/")

    local = _load_json(Path("aievaluator.config.json"))
    if local.get("engine_url"):
        return local["engine_url"].rstrip("/")

    global_cfg = _load_json(_global_config_path())
    if global_cfg.get("engine_url"):
        return global_cfg["engine_url"].rstrip("/")

    return default


def resolve_default_metrics() -> str:
    """Resolve default metrics from config. Defaults to faithfulness,g_eval."""
    default = "faithfulness,g_eval"
    local = _load_json(Path("aievaluator.config.json"))
    if local.get("default_metrics"):
        return local["default_metrics"]
    global_cfg = _load_json(_global_config_path())
    return global_cfg.get("default_metrics", default)


def resolve_default_min_score() -> float:
    """Resolve default min_score from config. Defaults to 0.0."""
    local = _load_json(Path("aievaluator.config.json"))
    if "default_min_score" in local:
        return float(local["default_min_score"])
    global_cfg = _load_json(_global_config_path())
    return float(global_cfg.get("default_min_score", 0.0))


def save_config(data: dict, global_: bool = True) -> None:
    """Save config dict. If global_=False, saves to project-local."""
    path = _global_config_path() if global_ else Path("aievaluator.config.json")
    _save_json(path, data)


def load_config(global_: bool = True) -> dict:
    """Load config dict."""
    path = _global_config_path() if global_ else Path("aievaluator.config.json")
    return _load_json(path)


def get_all_config() -> dict:
    """Get merged config: global + project-local on top."""
    global_cfg = _load_json(_global_config_path())
    local = _load_json(Path("aievaluator.config.json"))
    merged = {**global_cfg, **local}
    return merged
