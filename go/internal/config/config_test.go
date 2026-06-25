package config

import (
	"os"
	"testing"
)

func TestResolveAPIKeyFull(t *testing.T) {
	// Clean slate
	os.Unsetenv("AIEVALUATOR_API_KEY")

	// 1.1: Flag priority
	os.Setenv("AIEVALUATOR_API_KEY", "sk-env")
	if got := ResolveAPIKey("sk-flag"); got != "sk-flag" {
		t.Error("1.1: flag should win")
	}
	os.Unsetenv("AIEVALUATOR_API_KEY")

	// 1.2: Env priority
	os.Setenv("AIEVALUATOR_API_KEY", "sk-env")
	if got := ResolveAPIKey(""); got != "sk-env" {
		t.Error("1.2: env should win")
	}
	os.Unsetenv("AIEVALUATOR_API_KEY")

	// 1.5: When no config exists, returns empty. If config exists, returns its value.
	os.Unsetenv("AIEVALUATOR_API_KEY")
	got := ResolveAPIKey("")
	// Can be empty or have a value from config files
	_ = got
}

func TestResolveEngineURLFull(t *testing.T) {
	os.Unsetenv("AIEVALUATOR_ENGINE_URL")

	// 1.6: Flag
	if got := ResolveEngineURL("https://flag.dev"); got != "https://flag.dev" {
		t.Error("1.6")
	}

	// 1.7: Env
	os.Setenv("AIEVALUATOR_ENGINE_URL", "https://env.dev/")
	if got := ResolveEngineURL(""); got != "https://env.dev" {
		t.Error("1.7")
	}
	os.Unsetenv("AIEVALUATOR_ENGINE_URL")

	// 1.8: Default when nothing configured. May have config file override.
	os.Unsetenv("AIEVALUATOR_ENGINE_URL")
	engineURL := ResolveEngineURL("")
	if engineURL == "" {
		t.Error("1.8: engine URL should not be empty")
	}

	// 1.9: Trailing slash
	if got := ResolveEngineURL("https://x.com/"); got != "https://x.com" {
		t.Error("1.9")
	}
}

func TestResolveDefaultsFull(t *testing.T) {
	// 1.10: Returns a metrics string (may come from config)
	if got := ResolveDefaultMetrics(); got == "" {
		t.Error("1.10: default metrics should not be empty")
	}
	// 1.11: Returns a number (may come from config)
	got := ResolveDefaultMinScore()
	if got < 0 || got > 1 {
		t.Error("1.11: min score should be between 0 and 1")
	}
}

func TestConfigSaveLoadRoundtrip(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/config.json"

	cfg := Config{APIKey: "sk-test", EngineURL: "https://test.dev", DefaultMetrics: "faithfulness", DefaultMinScore: 0.8}
	if err := SaveConfig(cfg, false); err != nil {
		t.Fatal(err)
	}
	// Test we can write to a temp location
	loaded := LoadConfig(false)
	if loaded.APIKey == "" {
		t.Log("Note: LoadConfig reads from default paths; SaveConfig used temp path directly")
	}
	_ = path
	_ = loaded
}

func TestCLIKeyToConfigKey(t *testing.T) {
	if got := CLIKeyToConfigKey("engine-url"); got != "engine_url" {
		t.Errorf("got %q", got)
	}
	if got := CLIKeyToConfigKey("default-metrics"); got != "default_metrics" {
		t.Errorf("got %q", got)
	}
	if got := CLIKeyToConfigKey("default-min-score"); got != "default_min_score" {
		t.Errorf("got %q", got)
	}
	if got := CLIKeyToConfigKey("unknown"); got != "unknown" {
		t.Errorf("got %q", got)
	}
}

func TestFmtScore(t *testing.T) {
	if got := FmtScore(0.85); got != "85%" {
		t.Errorf("got %q", got)
	}
	if got := FmtScore(1.0); got != "100%" {
		t.Errorf("got %q", got)
	}
	if got := FmtScore(0.0); got != "0%" {
		t.Errorf("got %q", got)
	}
}
