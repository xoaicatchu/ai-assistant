import { normalizeGatewayBaseUrl } from './setup-storage';

export interface RuntimeConfig {
  apiBaseUrl: string;
  isVercel: boolean;
}

declare global {
  var __PROXY_AGENT_CONFIG__: Partial<RuntimeConfig> | undefined;
}

const configured = globalThis.__PROXY_AGENT_CONFIG__ ?? {};
const generatedIsVercel = configured.isVercel === true;
const generatedApiBaseUrl = generatedIsVercel
  ? '/api'
  : normalizeGatewayBaseUrl(configured.apiBaseUrl) || '/api';

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: generatedApiBaseUrl,
  isVercel: generatedIsVercel,
};

export function setRuntimeApiBaseUrl(value: string): void {
  runtimeConfig.apiBaseUrl = normalizeGatewayBaseUrl(value) || '/api';
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${runtimeConfig.apiBaseUrl}${normalizedPath}`;
}

export function serverApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = runtimeConfig.apiBaseUrl.replace(/\/+$/u, '');
  if (baseUrl === '') {
    return `/api${normalizedPath}`;
  }

  return baseUrl === '/api' || baseUrl.endsWith('/api')
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}/api${normalizedPath}`;
}
