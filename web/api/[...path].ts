import { proxyRequest, type ProxyRequest, type ProxyResponse } from './proxy-handler';

interface VercelRequest extends ProxyRequest {
  query?: Record<string, string | string[] | undefined>;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request: VercelRequest, response: ProxyResponse): Promise<void> {
  const rawPath = request.query?.path;
  const requestPath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath ?? '';
  const processRef = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  await proxyRequest(request, response, processRef?.env?.PROXY_AGENT_BACKEND_URL ?? '', requestPath);
}
