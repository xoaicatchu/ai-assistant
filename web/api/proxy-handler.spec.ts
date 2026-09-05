import { describe, expect, it, vi } from 'vitest';
import { buildBackendUrl, proxyRequest, type ProxyRequest, type ProxyResponse } from './proxy-handler';

describe('Vercel backend proxy URL', () => {
  it('joins the configured backend with the API path and preserves query parameters', () => {
    expect(buildBackendUrl('https://backend.example.com///', '/v1/chat/completions', '?stream=true')).toBe(
      'https://backend.example.com/v1/chat/completions?stream=true',
    );
  });

  it('does not let a leading slash create a double slash', () => {
    expect(buildBackendUrl('https://backend.example.com/base', 'health')).toBe(
      'https://backend.example.com/base/health',
    );
  });

  it('returns a visible configuration error when the backend URL is missing', async () => {
    const response = createResponse();
    await proxyRequest(createRequest('GET', '/health'), response, '', 'health');

    expect(response.statusCode).toBe(503);
    expect(response.body).toContain('backend_not_configured');
  });

  it('forwards request bodies and streams the backend response', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('data: {"ok":true}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await proxyRequest(
      createRequest('POST', '/v1/chat/completions?stream=true', 'request-body'),
      response,
      'https://backend.example.com',
      'v1/chat/completions',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.com/v1/chat/completions?stream=true',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: expect.any(ArrayBuffer),
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.body).toBe('data: {"ok":true}\n\n');
  });
});

function createRequest(method: string, url: string, body = ''): ProxyRequest {
  return {
    method,
    url,
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    on(event, listener) {
      if (event === 'data' && body) {
        listener(body);
      }
      if (event === 'end') {
        listener();
      }
      return this;
    },
  };
}

function createResponse(): ProxyResponse & { body: string; headers: Record<string, string> } {
  const result = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    write(chunk: Uint8Array) {
      this.body += new TextDecoder().decode(chunk);
      return true;
    },
    end(chunk?: Uint8Array | string) {
      if (chunk) {
        this.body += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      }
    },
  };
  return result;
}
