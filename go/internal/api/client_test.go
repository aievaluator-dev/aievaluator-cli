package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient(t *testing.T) {
	// 2.1: Init with key
	c := NewClient("https://api.aievaluator.dev", "sk-test", 60)
	if c.EngineURL != "https://api.aievaluator.dev" {
		t.Error("2.1: wrong engine URL")
	}
	if c.APIKey != "sk-test" {
		t.Error("2.1: wrong API key")
	}

	// 2.2: Init without key
	c2 := NewClient("https://api.aievaluator.dev", "", 30)
	if c2.APIKey != "" {
		t.Error("2.2: API key should be empty")
	}
}

func TestAPIError(t *testing.T) {
	// 2.5: APIError creation
	err := &APIError{StatusCode: 429, Message: "Rate limited", Detail: map[string]interface{}{"retry_after": 60}}
	if err.Error() != "Rate limited" {
		t.Error("2.5: wrong error message")
	}
	if err.StatusCode != 429 {
		t.Error("2.5: wrong status code")
	}
}

func TestGetUsageEndpoint(t *testing.T) {
	// 2.10: Calls correct endpoint
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/tenants/me/usage" {
			t.Errorf("2.10: wrong path: %s", r.URL.Path)
		}
		if r.Method != "GET" {
			t.Errorf("2.10: wrong method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"tenant_name":"acme","tier":"pro"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL, "sk-test", 10)
	result, err := c.GetUsage()
	if err != nil {
		t.Fatalf("2.10: unexpected error: %v", err)
	}
	if result["tenant_name"] != "acme" {
		t.Error("2.10: wrong tenant")
	}
}

func TestEvaluateSyncEndpoint(t *testing.T) {
	// 2.11: Calls correct endpoint with body
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/evaluations/sync" {
			t.Errorf("2.11: wrong path: %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("2.11: wrong method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"overall_score":0.95}`))
	}))
	defer server.Close()

	c := NewClient(server.URL, "sk-test", 10)
	rows := []map[string]interface{}{{"input": "hello"}}
	result, err := c.EvaluateSync(rows, server.URL+"/chat", "openai", nil, "", "", nil, nil)
	if err != nil {
		t.Fatalf("2.11: unexpected error: %v", err)
	}
	if result["overall_score"] != 0.95 {
		t.Error("2.11: wrong score")
	}
}

func TestHTTP4xxError(t *testing.T) {
	// 2.6: HTTP 4xx returns APIError
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		w.Write([]byte(`{"error":"too many requests"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL, "sk-test", 10)
	_, err := c.GetUsage()
	if err == nil {
		t.Fatal("2.6: expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatal("2.6: expected APIError")
	}
	if apiErr.StatusCode != 429 {
		t.Error("2.6: wrong status code")
	}
}

func TestHTTP5xxError(t *testing.T) {
	// 2.7: HTTP 5xx returns APIError
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer server.Close()

	c := NewClient(server.URL, "sk-test", 10)
	_, err := c.GetUsage()
	if err == nil {
		t.Fatal("2.7: expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatal("2.7: expected APIError")
	}
	if apiErr.StatusCode != 500 {
		t.Error("2.7: wrong status code")
	}
}

func TestConnectionRefused(t *testing.T) {
	// 2.8: Connection refused returns APIError with status 0
	c := NewClient("http://127.0.0.1:19999", "sk-test", 1)
	_, err := c.GetUsage()
	if err == nil {
		t.Fatal("2.8: expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatal("2.8: expected APIError")
	}
	if apiErr.StatusCode != 0 {
		t.Error("2.8: expected status 0 for connection error")
	}
}

func TestPlaygroundStatusEndpoint(t *testing.T) {
	// 2.15: Playground status calls correct endpoint
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"used":1,"limit":5,"remaining":4,"resets_at":"midnight UTC"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL, "", 10)
	result, err := c.PlaygroundStatus()
	if err != nil {
		t.Fatalf("2.15: unexpected error: %v", err)
	}
	if result["remaining"].(float64) != 4 {
		t.Error("2.15: wrong remaining")
	}
}
