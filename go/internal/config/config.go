package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	APIKey          string  `json:"api_key,omitempty"`
	EngineURL       string  `json:"engine_url,omitempty"`
	DefaultMetrics  string  `json:"default_metrics,omitempty"`
	DefaultMinScore float64 `json:"default_min_score,omitempty"`
}

func globalConfigPath() string {
	xdg := os.Getenv("XDG_CONFIG_HOME")
	if xdg == "" {
		home, _ := os.UserHomeDir()
		xdg = filepath.Join(home, ".config")
	}
	return filepath.Join(xdg, "aievaluator", "config.json")
}

func loadJSON(path string) map[string]interface{} {
	data, err := os.ReadFile(path)
	if err != nil {
		return map[string]interface{}{}
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return map[string]interface{}{}
	}
	return m
}

func saveJSON(path string, data interface{}) error {
	dir := filepath.Dir(path)
	os.MkdirAll(dir, 0755)
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}

func LoadConfig(isGlobal bool) Config {
	var path string
	if isGlobal {
		path = globalConfigPath()
	} else {
		path = "aievaluator.config.json"
	}
	m := loadJSON(path)
	cfg := Config{}
	if v, ok := m["api_key"].(string); ok {
		cfg.APIKey = v
	}
	if v, ok := m["engine_url"].(string); ok {
		cfg.EngineURL = v
	}
	if v, ok := m["default_metrics"].(string); ok {
		cfg.DefaultMetrics = v
	}
	if v, ok := m["default_min_score"].(float64); ok {
		cfg.DefaultMinScore = v
	}
	return cfg
}

func SaveConfig(cfg Config, isGlobal bool) error {
	var path string
	if isGlobal {
		path = globalConfigPath()
	} else {
		path = "aievaluator.config.json"
	}
	return saveJSON(path, cfg)
}

func ResolveAPIKey(flagValue string) string {
	if flagValue != "" {
		return flagValue
	}
	if v := os.Getenv("AIEVALUATOR_API_KEY"); v != "" {
		return v
	}
	if cfg := LoadConfig(false); cfg.APIKey != "" {
		return cfg.APIKey
	}
	return LoadConfig(true).APIKey
}

func ResolveEngineURL(flagValue string) string {
	def := "https://api.aievaluator.dev"
	resolve := func(s string) string {
		return strings.TrimRight(s, "/")
	}
	if v := resolve(flagValue); v != "" {
		return v
	}
	if v := resolve(os.Getenv("AIEVALUATOR_ENGINE_URL")); v != "" {
		return v
	}
	if cfg := LoadConfig(false); cfg.EngineURL != "" {
		return resolve(cfg.EngineURL)
	}
	if cfg := LoadConfig(true); cfg.EngineURL != "" {
		return resolve(cfg.EngineURL)
	}
	return def
}

func ResolveDefaultMetrics() string {
	if cfg := LoadConfig(false); cfg.DefaultMetrics != "" {
		return cfg.DefaultMetrics
	}
	if cfg := LoadConfig(true); cfg.DefaultMetrics != "" {
		return cfg.DefaultMetrics
	}
	return "faithfulness,g_eval"
}

func ResolveDefaultMinScore() float64 {
	if cfg := LoadConfig(false); cfg.DefaultMinScore > 0 {
		return cfg.DefaultMinScore
	}
	if cfg := LoadConfig(true); cfg.DefaultMinScore > 0 {
		return cfg.DefaultMinScore
	}
	return 0.0
}

func GetAllConfig() Config {
	g := LoadConfig(true)
	l := LoadConfig(false)
	if l.APIKey != "" {
		g.APIKey = l.APIKey
	}
	if l.EngineURL != "" {
		g.EngineURL = l.EngineURL
	}
	if l.DefaultMetrics != "" {
		g.DefaultMetrics = l.DefaultMetrics
	}
	if l.DefaultMinScore > 0 {
		g.DefaultMinScore = l.DefaultMinScore
	}
	return g
}

func CLIKeyToConfigKey(key string) string {
	switch key {
	case "engine-url":
		return "engine_url"
	case "default-metrics":
		return "default_metrics"
	case "default-min-score":
		return "default_min_score"
	}
	return key
}

func FmtScore(score float64) string {
	return fmt.Sprintf("%.0f%%", score*100)
}

func ParseFloat(s string) (float64, error) {
	return strconv.ParseFloat(s, 64)
}
