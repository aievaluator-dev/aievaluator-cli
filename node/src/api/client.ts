/**
 * HTTP client for AI Evaluator Engine API.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

export class APIError extends Error {
  statusCode: number;
  detail: unknown;

  constructor(statusCode: number, message: string, detail?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.detail = detail;
    this.name = 'APIError';
  }
}

export class APIClient {
  private engineUrl: string;
  private apiKey?: string;
  private timeout: number;
  private http: AxiosInstance;

  constructor(engineUrl: string, apiKey?: string, timeout = 300) {
    this.engineUrl = engineUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeout = timeout;
    this.http = axios.create({ timeout: timeout * 1000 });
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    return h;
  }

  private async request(method: string, path: string, data?: unknown): Promise<unknown> {
    const url = `${this.engineUrl}${path}`;
    try {
      const resp = await this.http.request({ method, url, data, headers: this.headers() });
      return resp.data;
    } catch (e) {
      const err = e as AxiosError;
      if (err.response) {
        throw new APIError(err.response.status, `Engine returned HTTP ${err.response.status}`, err.response.data);
      }
      throw new APIError(0, `Cannot connect to ${this.engineUrl}: ${err.message}`);
    }
  }

  async getUsage(): Promise<Record<string, unknown>> {
    return (await this.request('GET', '/api/v1/tenants/me/usage')) as Record<string, unknown>;
  }

  async evaluateSync(
    rows: Record<string, unknown>[],
    agentUrl: string,
    agentFormat = 'openai',
    metrics?: string[],
    judgeModel?: string,
    name?: string,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      rows,
      agent: { url: agentUrl, format: agentFormat },
      metrics: metrics || ['faithfulness', 'g_eval'],
      custom_evaluators: [],
    };
    if (name) body.name = name;
    if (judgeModel) body.judge_model = judgeModel;
    return (await this.request('POST', '/api/v1/evaluations/sync', body)) as Record<string, unknown>;
  }

  async evaluateUpload(
    filePath: string,
    agentUrl: string,
    agentFormat = 'openai',
    metrics?: string,
  ): Promise<Record<string, unknown>> {
    const fs = require('fs');
    const FormData = require('form-data');
    const url = `${this.engineUrl}/api/v1/evaluations/sync/upload`;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('agent_endpoint', agentUrl);
    form.append('agent_format', agentFormat);
    form.append('metrics', metrics || 'faithfulness,g_eval');

    const headers = this.apiKey ? { ...form.getHeaders(), 'X-API-Key': this.apiKey } : form.getHeaders();
    try {
      const resp = await axios.post(url, form, { headers, timeout: this.timeout * 1000 });
      return resp.data;
    } catch (e) {
      const err = e as AxiosError;
      if (err.response) {
        throw new APIError(err.response.status, `Engine returned HTTP ${err.response.status}`, err.response.data);
      }
      throw new APIError(0, `Cannot connect to ${this.engineUrl}: ${err.message}`);
    }
  }

  async playgroundEvaluate(
    opts: {
      queries?: string[];
      rows?: Record<string, unknown>[];
      agentEndpoint?: string;
      agentConfig?: Record<string, unknown>;
      metrics?: string[];
      judge?: string;
    },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      metrics: opts.metrics || ['faithfulness', 'g_eval'],
    };
    if (opts.queries) body.queries = opts.queries;
    if (opts.rows) body.rows = opts.rows;
    if (opts.agentConfig) body.agent = opts.agentConfig;
    if (opts.agentEndpoint) body.agent_endpoint = opts.agentEndpoint;
    if (opts.judge) body.judge = opts.judge;
    return (await this.request('POST', '/api/v1/playground/evaluate', body)) as Record<string, unknown>;
  }

  async playgroundStatus(): Promise<Record<string, unknown>> {
    try {
      const resp = await this.http.get(`${this.engineUrl}/api/v1/playground/status`, { timeout: 10000 });
      return resp.data;
    } catch {
      return { used: 0, limit: 5, remaining: 5, resets_at: 'midnight UTC' };
    }
  }
}
