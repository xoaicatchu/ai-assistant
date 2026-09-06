export interface ProxyRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (chunk?: Uint8Array | string | Error) => void): ProxyRequest;
}

export interface ProxyResponse {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  write(chunk: Uint8Array): boolean;
  end(chunk?: Uint8Array | string): void;
}

export function buildBackendUrl(baseUrl: string, requestPath: string, search = ''): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/u, '');
  if (!normalizedBase) {
    return '';
  }

  try {
    const parsedBase = new URL(`${normalizedBase}/`);
    if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
      return '';
    }

    const basePath = parsedBase.pathname.replace(/\/+$/u, '');
    const path = `/${requestPath.replace(/^\/+|\/+$/gu, '')}`;
    const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
    return `${parsedBase.origin}${basePath}${path === '/' ? '' : path}${query}`;
  } catch {
    return '';
  }
}

export function resolveBackendPath(requestPath: string): string {
  const normalizedPath = requestPath.replace(/^\/+|\/+$/gu, '');
  if (!normalizedPath || normalizedPath === 'health' || normalizedPath.startsWith('v1/')) {
    return normalizedPath;
  }

  return `api/${normalizedPath}`;
}

export async function proxyRequest(
  request: ProxyRequest,
  response: ProxyResponse,
  backendBaseUrl: string,
  requestPath: string,
): Promise<void> {
  const search = forwardedSearch(request.url);
  const targetUrl = buildBackendUrl(backendBaseUrl, requestPath, search);
  if (!targetUrl) {
    writeJson(response, 503, {
      error: {
        code: 'backend_not_configured',
        message: 'PROXY_AGENT_BACKEND_URL is not configured on Vercel.',
      },
    });
    return;
  }

  const method = (request.method ?? 'GET').toUpperCase();
  let body: Uint8Array | undefined;
  try {
    body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request);
  } catch {
    writeJson(response, 400, {
      error: { code: 'invalid_request_body', message: 'The request body could not be read.' },
    });
    return;
  }

  const headers: Record<string, string> = {};
  copyHeader(request.headers['content-type'], headers, 'content-type');
  copyHeader(request.headers.accept, headers, 'accept');
  copyHeader(request.headers.authorization, headers, 'authorization');
  copyHeader(request.headers.cookie, headers, 'cookie');

  let upstream: Response;
  try {
    const requestBody = body ? (body.slice().buffer as ArrayBuffer) : undefined;
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: requestBody,
    });
  } catch {
    writeJson(response, 502, {
      error: { code: 'backend_unavailable', message: 'The configured backend could not be reached.' },
    });
    return;
  }

  response.statusCode = upstream.status;
  for (const name of ['content-type', 'cache-control', 'location']) {
    const value = upstream.headers.get(name);
    if (value) {
      response.setHeader(name, value);
    }
  }
  const setCookieHeaders = getSetCookieHeaders(upstream.headers);
  if (setCookieHeaders.length > 0) {
    response.setHeader('set-cookie', setCookieHeaders.length === 1 ? setCookieHeaders[0] : setCookieHeaders);
  }

  if (!upstream.body) {
    response.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      response.write(chunk.value);
    }
  } finally {
    response.end();
  }
}

function forwardedSearch(requestUrl: string | undefined): string {
  if (!requestUrl?.includes('?')) {
    return '';
  }

  try {
    const parsed = new URL(requestUrl, 'http://vercel-proxy.internal');
    parsed.searchParams.delete('path');
    return parsed.search;
  } catch {
    return '';
  }
}

function copyHeader(
  value: string | string[] | undefined,
  target: Record<string, string>,
  name: string,
): void {
  if (typeof value === 'string') {
    target[name] = value;
  } else if (Array.isArray(value) && value.length > 0) {
    target[name] = value.join(', ');
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie();
  }

  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

function readRequestBody(request: ProxyRequest): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  return new Promise((resolve, reject) => {
    request.on('data', (chunk) => {
      if (chunk instanceof Error) {
        reject(chunk);
        return;
      }
      if (typeof chunk === 'string') {
        chunks.push(new TextEncoder().encode(chunk));
      } else if (chunk) {
        chunks.push(chunk);
      }
    });
    request.on('end', () => resolve(joinChunks(chunks)));
    request.on('error', (error) => reject(error instanceof Error ? error : new Error('Request stream failed.')));
  });
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function writeJson(response: ProxyResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}
