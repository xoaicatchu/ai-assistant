import { describe, expect, it, vi } from 'vitest';
import {
  buildBackendUrl,
  proxyRequest,
  resolveBackendPath,
  type ProxyRequest,
  type ProxyResponse,
} from './proxy-handler';

describe('Vercel backend proxy URL', () => {
  it('keeps legacy gateway paths and restores the API prefix for application routes', () => {
    expect(resolveBackendPath('health')).toBe('health');
    expect(resolveBackendPath('v1/chat/completions')).toBe('v1/chat/completions');
    expect(resolveBackendPath('admin/session')).toBe('api/admin/session');
    expect(resolveBackendPath('conversations/example')).toBe('api/conversations/example');
  });

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
      createRequest('POST', '/api/index?path=v1/chat/completions&stream=true', 'request-body', 'Bearer sk-test'),
      response,
      'https://backend.example.com',
      'v1/chat/completions',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.com/v1/chat/completions?stream=true',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: 'Bearer sk-test',
        },
        body: expect.any(ArrayBuffer),
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.body).toBe('data: {"ok":true}\n\n');
  });

  it('forwards the admin session cookie in both directions', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': '__proxy_agent_admin=session; Path=/api/admin; HttpOnly; SameSite=Lax',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await proxyRequest(
      createRequest('GET', '/api/index?path=admin/session', '', undefined, '__proxy_agent_admin=session'),
      response,
      'https://backend.example.com',
      'admin/session',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.com/admin/session',
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: '__proxy_agent_admin=session' }),
      }),
    );
    expect(response.headers['set-cookie']).toContain('__proxy_agent_admin=session');
  });

  it('turns an upstream SSE read failure into a structured stream error', async () => {
    const read = vi.fn().mockRejectedValue(new Error('upstream socket closed'));
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: { getReader: () => ({ read }) },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await proxyRequest(
      createRequest('POST', '/api/index?path=v1/chat/completions', 'request-body'),
      response,
      'https://backend.example.com',
      'v1/chat/completions',
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('backend_stream_interrupted');
    expect(response.body).toContain('Backend stream was interrupted.');
  });
});

function createRequest(
  method: string,
  url: string,
  body = '',
  authorization?: string,
  cookie?: string,
): ProxyRequest {
  return {
    method,
    url,
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(authorization ? { authorization } : {}),
      ...(cookie ? { cookie } : {}),
    },
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
    setHeader(name: string, value: string | string[]) {
      this.headers[name] = Array.isArray(value) ? value.join('\n') : value;
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
