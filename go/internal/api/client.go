package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type APIError struct {
	StatusCode int
	Message    string
	Detail     interface{}
}

func (e *APIError) Error() string {
	return e.Message
}

type Client struct {
	EngineURL string
	APIKey    string
	Timeout   time.Duration
}

func NewClient(engineURL, apiKey string, timeoutSec int) *Client {
	return &Client{
		EngineURL: engineURL,
		APIKey:    apiKey,
		Timeout:   time.Duration(timeoutSec) * time.Second,
	}
}

func (c *Client) headers() map[string]string {
	h := map[string]string{"Content-Type": "application/json"}
	if c.APIKey != "" {
		h["X-API-Key"] = c.APIKey
	}
	return h
}

func (c *Client) request(method, path string, body interface{}) (map[string]interface{}, error) {
	url := c.EngineURL + path
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, &APIError{0, fmt.Sprintf("JSON marshal error: %v", err), nil}
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, &APIError{0, fmt.Sprintf("Request error: %v", err), nil}
	}
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: c.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &APIError{0, fmt.Sprintf("Cannot connect to %s: %v", c.EngineURL, err), nil}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		var detail interface{}
		json.Unmarshal(respBody, &detail)
		return nil, &APIError{resp.StatusCode, fmt.Sprintf("Engine returned HTTP %d", resp.StatusCode), detail}
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, &APIError{0, fmt.Sprintf("JSON parse error: %v", err), nil}
	}
	return result, nil
}

func (c *Client) GetUsage() (map[string]interface{}, error) {
	return c.request("GET", "/api/v1/tenants/me/usage", nil)
}

func (c *Client) EvaluateSync(rows []map[string]interface{}, agentURL, agentFormat string, metrics []string, judgeModel, name string) (map[string]interface{}, error) {
	if metrics == nil {
		metrics = []string{"faithfulness", "g_eval"}
	}
	body := map[string]interface{}{
		"rows": rows,
		"agent": map[string]interface{}{
			"url":    agentURL,
			"format": agentFormat,
		},
		"metrics":           metrics,
		"custom_evaluators": []interface{}{},
	}
	if name != "" {
		body["name"] = name
	}
	if judgeModel != "" {
		body["judge_model"] = judgeModel
	}
	return c.request("POST", "/api/v1/evaluations/sync", body)
}

func (c *Client) EvaluateUpload(filePath, agentURL, agentFormat, metrics string) (map[string]interface{}, error) {
	if metrics == "" {
		metrics = "faithfulness,g_eval"
	}
	url := c.EngineURL + "/api/v1/evaluations/sync/upload"

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	f, err := os.Open(filePath)
	if err != nil {
		return nil, &APIError{0, fmt.Sprintf("Cannot open file: %v", err), nil}
	}
	defer f.Close()

	fw, _ := w.CreateFormFile("file", filepath.Base(filePath))
	io.Copy(fw, f)
	w.WriteField("agent_endpoint", agentURL)
	w.WriteField("agent_format", agentFormat)
	w.WriteField("metrics", metrics)
	w.Close()

	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return nil, &APIError{0, fmt.Sprintf("Request error: %v", err), nil}
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if c.APIKey != "" {
		req.Header.Set("X-API-Key", c.APIKey)
	}

	client := &http.Client{Timeout: c.Timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &APIError{0, fmt.Sprintf("Cannot connect: %v", err), nil}
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		var detail interface{}
		json.Unmarshal(respBody, &detail)
		return nil, &APIError{resp.StatusCode, fmt.Sprintf("Engine returned HTTP %d", resp.StatusCode), detail}
	}
	var result map[string]interface{}
	json.Unmarshal(respBody, &result)
	return result, nil
}

func (c *Client) PlaygroundEvaluate(queries []string, rows []map[string]interface{}, agentEndpoint string, metrics []string, judge string) (map[string]interface{}, error) {
	if metrics == nil {
		metrics = []string{"faithfulness", "g_eval"}
	}
	body := map[string]interface{}{
		"metrics": metrics,
	}
	if len(queries) > 0 {
		body["queries"] = queries
	}
	if len(rows) > 0 {
		body["rows"] = rows
	}
	if agentEndpoint != "" {
		body["agent_endpoint"] = agentEndpoint
	}
	if judge != "" {
		body["judge"] = judge
	}
	return c.request("POST", "/api/v1/playground/evaluate", body)
}

func (c *Client) PlaygroundStatus() (map[string]interface{}, error) {
	url := c.EngineURL + "/api/v1/playground/status"
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return map[string]interface{}{"used": float64(0), "limit": float64(5), "remaining": float64(5), "resets_at": "midnight UTC"}, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return result, nil
}
